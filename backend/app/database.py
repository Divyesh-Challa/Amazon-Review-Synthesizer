import sqlite3
import os
import hashlib
import secrets
import logging
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
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                is_admin BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            );
        """)

        # User Sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT UNIQUE NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            );
        """)

        # Favorites table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                asin TEXT,
                title TEXT NOT NULL,
                price TEXT,
                rating REAL,
                score REAL,
                link TEXT,
                badge TEXT,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, asin)
            );
        """)

        # Saved Searches table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS saved_searches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                query TEXT NOT NULL,
                filters_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Search Metrics for Admin Dashboard
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS search_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                products_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Check for default admin user
        cursor.execute("SELECT id FROM users WHERE is_admin = 1 LIMIT 1;")
        admin = cursor.fetchone()
        if not admin:
            admin_email = os.environ.get("ADMIN_EMAIL", "admin@synthesizer.local")
            admin_pass = os.environ.get("ADMIN_PASSWORD", "admin123")
            admin_name = "System Administrator"
            pwd_hash, salt = hash_password(admin_pass)
            cursor.execute("""
                INSERT INTO users (email, name, password_hash, salt, is_admin)
                VALUES (?, ?, ?, ?, 1)
            """, (admin_email.lower(), admin_name, pwd_hash, salt))
            conn.commit()
            logger.info(f"Initialized default administrator account: {admin_email}")

        conn.commit()
    logger.info("Database initialized successfully at " + DB_PATH)
