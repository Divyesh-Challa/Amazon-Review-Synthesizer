import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, status, Header, Depends
from app.database import get_connection, hash_password, verify_password

SESSION_DURATION_DAYS = 30

def create_session(user_id: int) -> str:
    token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(days=SESSION_DURATION_DAYS)
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?);",
            (token, user_id, expires_at.isoformat())
        )
        conn.commit()
    return token

def delete_session(token: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?;", (token,))
        conn.commit()

def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    if not authorization:
        return None
    
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.email, u.name, u.is_admin, u.created_at, s.expires_at
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ?;
        """, (token,))
        row = cursor.fetchone()
        if not row:
            return None
        
        # Check expiry
        expires_at = datetime.fromisoformat(row["expires_at"])
        if datetime.utcnow() > expires_at:
            cursor.execute("DELETE FROM sessions WHERE token = ?;", (token,))
            conn.commit()
            return None

        return {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "is_admin": bool(row["is_admin"]),
            "created_at": row["created_at"],
            "token": token
        }

def get_current_user(user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)) -> Dict[str, Any]:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

def get_current_admin_user(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if not user.get("is_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required.",
        )
    return user
