import os
import time
from fastapi import APIRouter, HTTPException, status, Depends
from typing import List, Dict, Any
from app.database import get_connection, DB_PATH
from app.auth import get_current_admin_user
from app.config import settings
from app.schemas import AdminMetricsResponse, AdminUserItem

router = APIRouter(prefix="/api/v1/admin", tags=["Admin Dashboard"])

SERVER_START_TIME = time.time()

@router.get("/metrics", response_model=AdminMetricsResponse)
async def get_admin_metrics(admin: dict = Depends(get_current_admin_user)):
    with get_connection() as conn:
        cursor = conn.cursor()

        # 1. Total users
        cursor.execute("SELECT COUNT(*) AS cnt FROM users;")
        total_users = cursor.fetchone()["cnt"]

        # 2. Active sessions
        cursor.execute("SELECT COUNT(DISTINCT user_id) AS cnt FROM sessions WHERE expires_at > datetime('now');")
        total_active_sessions = cursor.fetchone()["cnt"]

        # 3. Total favorites
        cursor.execute("SELECT COUNT(*) AS cnt FROM favorites;")
        total_favorites = cursor.fetchone()["cnt"]

        # 4. Total saved searches
        cursor.execute("SELECT COUNT(*) AS cnt FROM saved_searches;")
        total_saved_searches = cursor.fetchone()["cnt"]

        # 5. Total search syntheses
        cursor.execute("SELECT COUNT(*) AS cnt FROM search_metrics;")
        total_search_syntheses = cursor.fetchone()["cnt"]

        # 6. Popular search queries
        cursor.execute("""
            SELECT query, COUNT(*) as count, MAX(created_at) as last_searched
            FROM search_metrics
            GROUP BY LOWER(query)
            ORDER BY count DESC
            LIMIT 8;
        """)
        popular_queries = [dict(r) for r in cursor.fetchall()]

        # 7. Top favorited products
        cursor.execute("""
            SELECT title, asin, price, COUNT(*) as favorite_count
            FROM favorites
            GROUP BY COALESCE(NULLIF(asin, ''), title)
            ORDER BY favorite_count DESC
            LIMIT 8;
        """)
        top_favorited_products = [dict(r) for r in cursor.fetchall()]

        # 8. All registered users with individual activity counts
        cursor.execute("""
            SELECT 
                u.id, 
                u.email, 
                u.name, 
                u.is_admin, 
                u.created_at, 
                u.last_login,
                (SELECT COUNT(*) FROM favorites f WHERE f.user_id = u.id) AS favorites_count,
                (SELECT COUNT(*) FROM saved_searches s WHERE s.user_id = u.id) AS saved_searches_count
            FROM users u
            ORDER BY u.created_at DESC;
        """)
        user_rows = cursor.fetchall()

    recent_users = [
        AdminUserItem(
            id=r["id"],
            email=r["email"],
            name=r["name"],
            is_admin=bool(r["is_admin"]),
            created_at=r["created_at"] or "",
            last_login=r["last_login"],
            favorites_count=r["favorites_count"],
            saved_searches_count=r["saved_searches_count"]
        ) for r in user_rows
    ]

    db_size_kb = 0
    if os.path.exists(DB_PATH):
        db_size_kb = round(os.path.getsize(DB_PATH) / 1024, 1)

    system_status = {
        "status": "healthy",
        "uptime_seconds": round(time.time() - SERVER_START_TIME, 1),
        "llm_provider": settings.LLM_PROVIDER,
        "database": f"SQLite ({db_size_kb} KB)",
        "version": "1.3.0"
    }

    return AdminMetricsResponse(
        total_users=total_users,
        total_active_sessions=total_active_sessions,
        total_favorites=total_favorites,
        total_saved_searches=total_saved_searches,
        total_search_syntheses=total_search_syntheses,
        popular_queries=popular_queries,
        top_favorited_products=top_favorited_products,
        recent_users=recent_users,
        system_status=system_status
    )

@router.get("/users", response_model=List[AdminUserItem])
async def list_admin_users(admin: dict = Depends(get_current_admin_user)):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                u.id, 
                u.email, 
                u.name, 
                u.is_admin, 
                u.created_at, 
                u.last_login,
                (SELECT COUNT(*) FROM favorites f WHERE f.user_id = u.id) AS favorites_count,
                (SELECT COUNT(*) FROM saved_searches s WHERE s.user_id = u.id) AS saved_searches_count
            FROM users u
            ORDER BY u.created_at DESC;
        """)
        rows = cursor.fetchall()

    return [
        AdminUserItem(
            id=r["id"],
            email=r["email"],
            name=r["name"],
            is_admin=bool(r["is_admin"]),
            created_at=r["created_at"] or "",
            last_login=r["last_login"],
            favorites_count=r["favorites_count"],
            saved_searches_count=r["saved_searches_count"]
        ) for r in rows
    ]

@router.delete("/users/{user_id}")
async def delete_user(user_id: int, admin: dict = Depends(get_current_admin_user)):
    if user_id == admin["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot delete their own account."
        )

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = ?;", (user_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    return {"message": f"User {user_id} deleted successfully."}

@router.post("/users/{user_id}/toggle-admin")
async def toggle_admin_status(user_id: int, admin: dict = Depends(get_current_admin_user)):
    if user_id == admin["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change administrator status of your own account."
        )

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT is_admin FROM users WHERE id = ?;", (user_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        
        new_status = 0 if row["is_admin"] else 1
        cursor.execute("UPDATE users SET is_admin = ? WHERE id = ?;", (new_status, user_id))
        conn.commit()

    return {"message": "Admin status updated.", "is_admin": bool(new_status)}
