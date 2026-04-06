from fastapi import APIRouter, HTTPException, status, Depends
from datetime import datetime
from app.database import get_connection, hash_password, verify_password
from app.auth import create_session, delete_session, get_current_user
from app.schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    AuthResponse,
    UserProfile
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegisterRequest):
    email = payload.email.strip().lower()
    name = payload.name.strip()
    password = payload.password

    if not email or "@" not in email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Valid email required.")
    if len(password) < 6:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password must be at least 6 characters.")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?;", (email,))
        if cursor.fetchone():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

        pwd_hash, salt = hash_password(password)
        cursor.execute("""
            INSERT INTO users (email, name, password_hash, salt, is_admin, last_login)
            VALUES (?, ?, ?, ?, 0, ?);
        """, (email, name, pwd_hash, salt, datetime.utcnow().isoformat()))
        user_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT id, email, name, is_admin, created_at FROM users WHERE id = ?;", (user_id,))
        row = cursor.fetchone()

    token = create_session(user_id)
    return AuthResponse(
        token=token,
        user=UserProfile(
            id=row["id"],
            email=row["email"],
            name=row["name"],
            is_admin=bool(row["is_admin"]),
            created_at=row["created_at"]
        )
    )

@router.post("/login", response_model=AuthResponse)
async def login(payload: UserLoginRequest):
    email = payload.email.strip().lower()
    password = payload.password

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, name, password_hash, salt, is_admin, created_at FROM users WHERE email = ?;", (email,))
        user = cursor.fetchone()

        if not user or not verify_password(password, user["password_hash"], user["salt"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password."
            )

        cursor.execute("UPDATE users SET last_login = ? WHERE id = ?;", (datetime.utcnow().isoformat(), user["id"]))
        conn.commit()

    token = create_session(user["id"])
    return AuthResponse(
        token=token,
        user=UserProfile(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            is_admin=bool(user["is_admin"]),
            created_at=user["created_at"]
        )
    )

@router.get("/me", response_model=UserProfile)
async def get_me(user: dict = Depends(get_current_user)):
    return UserProfile(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        is_admin=user["is_admin"],
        created_at=user["created_at"]
    )

@router.post("/logout")
async def logout(user: dict = Depends(get_current_user)):
    delete_session(user["token"])
    return {"message": "Logged out successfully."}
