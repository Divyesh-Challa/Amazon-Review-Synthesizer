import sqlite3
import os
import hashlib
import secrets
import logging
import re
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

logger = logging.getLogger("amazon_synthesizer.db")

DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
DB_PATH = os.path.join(DB_DIR, "synthesizer.db")

def get_connection() -> sqlite3.Connection:
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return hashed, salt

def verify_password(password: str, hashed: str, salt: str) -> bool:
    check_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(check_hash, hashed)

def init_db():
    os.makedirs(DB_DIR, exist_ok=True)
    with get_connection() as conn:
        cursor = conn.cursor()

        # Users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (\
                id INTEGER PRIMARY KEY AUTOINCREMENT,\
                email TEXT UNIQUE NOT NULL,\
                name TEXT NOT NULL,\
                password_hash TEXT NOT NULL,\
                salt TEXT NOT NULL,\
                is_admin BOOLEAN DEFAULT 0,\
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\
                last_login TIMESTAMP\
            );
        """)

        # User Sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (\
                id INTEGER PRIMARY KEY AUTOINCREMENT,\
                token TEXT UNIQUE NOT NULL,\
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\
                expires_at TIMESTAMP NOT NULL\
            );
        """)

        # Favorites table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS favorites (\
                id INTEGER PRIMARY KEY AUTOINCREMENT,\
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\
                asin TEXT,\
                title TEXT NOT NULL,\
                price TEXT,\
                rating REAL,\
                score REAL,\
                link TEXT,\
                badge TEXT,\
                image_url TEXT,\
                target_price REAL,\
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\
                UNIQUE(user_id, asin)\
            );
        """)

        # Saved Searches table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS saved_searches (\
                id INTEGER PRIMARY KEY AUTOINCREMENT,\
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\
                query TEXT NOT NULL,\
                filters_json TEXT,\
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\
            );
        """)

        # Search Metrics for Admin Dashboard
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS search_metrics (\
                id INTEGER PRIMARY KEY AUTOINCREMENT,\
                query TEXT NOT NULL,\
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,\
                products_count INTEGER DEFAULT 0,\
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\
            );
        """)

        # Price History Snapshots Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS price_history (\
                id INTEGER PRIMARY KEY AUTOINCREMENT,\
                asin TEXT NOT NULL,\
                price REAL NOT NULL,\
                price_raw TEXT,\
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_price_history_asin ON price_history(asin);")

        # Migration: ensure target_price exists in favorites
        cursor.execute("PRAGMA table_info(favorites);")
        columns = [c["name"] for c in cursor.fetchall()]
        if "target_price" not in columns:
            cursor.execute("ALTER TABLE favorites ADD COLUMN target_price REAL;")

        # Check for default admin user
        cursor.execute("SELECT id FROM users WHERE is_admin = 1 LIMIT 1;")
        admin = cursor.fetchone()
        if not admin:
            admin_email = os.environ.get("ADMIN_EMAIL", "admin@synthesizer.local")
            admin_pass = os.environ.get("ADMIN_PASSWORD", "admin123")
            admin_name = "System Administrator"
            pwd_hash, salt = hash_password(admin_pass)
            cursor.execute("""
                INSERT INTO users (email, name, password_hash, salt, is_admin)\
                VALUES (?, ?, ?, ?, 1)\
            """, (admin_email.lower(), admin_name, pwd_hash, salt))
            conn.commit()
            logger.info(f"Initialized default administrator account: {admin_email}")

        conn.commit()
    logger.info("Database initialized successfully at " + DB_PATH)

def parse_price_value(price_raw: Optional[str]) -> Optional[float]:
    if not price_raw:
        return None
    cleaned = price_raw.replace(",", "").replace("$", "").replace("CDN", "").strip()
    match = re.search(r"(\d+(\.\d+)?)", cleaned)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None

def record_price_snapshot(asin: str, price_raw: str) -> Optional[float]:
    if not asin:
        return None
    price_val = parse_price_value(price_raw)
    if price_val is None or price_val <= 0:
        return None

    with get_connection() as conn:
        cursor = conn.cursor()
        # Avoid duplicate recordings within the last 15 minutes
        cursor.execute("""
            SELECT id FROM price_history
            WHERE asin = ? AND price = ? AND created_at > datetime('now', '-15 minutes')
            LIMIT 1;
        """, (asin, price_val))
        if cursor.fetchone():
            return price_val

        cursor.execute("""
            INSERT INTO price_history (asin, price, price_raw)
            VALUES (?, ?, ?);
        """, (asin, price_val, price_raw.strip()))
        conn.commit()
    return price_val

def get_price_history_for_asin(asin: str, limit: int = 50) -> Dict[str, Any]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT price, price_raw, created_at
            FROM price_history
            WHERE asin = ?
            ORDER BY created_at ASC
            LIMIT ?;
        """, (asin, limit))
        rows = cursor.fetchall()

    points = [
        {"price": r["price"], "price_raw": r["price_raw"], "created_at": r["created_at"]}
        for r in rows
    ]

    if not points:
        return {
            "asin": asin,
            "points": [],
            "current_price": None,
            "lowest_price": None,
            "highest_price": None,
            "average_price": None,
            "deal_verdict": "Standard Price"
        }

    prices = [p["price"] for p in points]
    current = prices[-1]
    lowest = min(prices)
    highest = max(prices)
    avg = round(sum(prices) / len(prices), 2)

    if len(prices) > 1 and current <= lowest:
        verdict = "Lowest Price Recorded"
    elif len(prices) > 1 and current < avg * 0.92:
        verdict = "Genuine Deal"
    elif len(prices) > 1 and current > avg * 1.15:
        verdict = "Price Peak"
    else:
        verdict = "Standard Price"

    return {
        "asin": asin,
        "points": points,
        "current_price": current,
        "lowest_price": lowest,
        "highest_price": highest,
        "average_price": avg,
        "deal_verdict": verdict
    }
