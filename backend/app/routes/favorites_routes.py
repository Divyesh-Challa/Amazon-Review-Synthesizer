from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from app.database import get_connection
from app.auth import get_current_user
from app.schemas import FavoriteCreateRequest, FavoriteItemResponse

router = APIRouter(prefix="/api/v1/favorites", tags=["Favorites"])

@router.get("", response_model=List[FavoriteItemResponse])
async def list_favorites(user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, asin, title, price, rating, score, link, badge, image_url, target_price, created_at
            FROM favorites
            WHERE user_id = ?
            ORDER BY created_at DESC;
        """, (user["id"],))
        rows = cursor.fetchall()

    return [
        FavoriteItemResponse(
            id=r["id"],
            asin=r["asin"],
            title=r["title"],
            price=r["price"],
            rating=r["rating"],
            score=r["score"],
            link=r["link"],
            badge=r["badge"],
            image_url=r["image_url"],
            target_price=r["target_price"],
            created_at=r["created_at"]
        ) for r in rows
    ]

@router.post("", response_model=FavoriteItemResponse, status_code=status.HTTP_201_CREATED)
async def add_favorite(payload: FavoriteCreateRequest, user: dict = Depends(get_current_user)):
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Product title is required.")

    asin = (payload.asin or "").strip()
    with get_connection() as conn:
        cursor = conn.cursor()
        if asin:
            cursor.execute("SELECT id FROM favorites WHERE user_id = ? AND asin = ?;", (user["id"], asin))
            existing = cursor.fetchone()
            if existing:
                cursor.execute("""
                    UPDATE favorites SET title = ?, price = ?, rating = ?, score = ?, link = ?, badge = ?, image_url = ?, target_price = ?
                    WHERE id = ?;
                """, (title, payload.price, payload.rating, payload.score, payload.link, payload.badge, payload.image_url, payload.target_price, existing["id"]))
                conn.commit()
                fav_id = existing["id"]
            else:
                cursor.execute("""
                    INSERT INTO favorites (user_id, asin, title, price, rating, score, link, badge, image_url, target_price)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (user["id"], asin, title, payload.price, payload.rating, payload.score, payload.link, payload.badge, payload.image_url, payload.target_price))
                conn.commit()
                fav_id = cursor.lastrowid
        else:
            cursor.execute("""
                INSERT INTO favorites (user_id, asin, title, price, rating, score, link, badge, image_url, target_price)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (user["id"], asin, title, payload.price, payload.rating, payload.score, payload.link, payload.badge, payload.image_url, payload.target_price))
            conn.commit()
            fav_id = cursor.lastrowid

        cursor.execute("SELECT id, asin, title, price, rating, score, link, badge, image_url, target_price, created_at FROM favorites WHERE id = ?;", (fav_id,))
        row = cursor.fetchone()

    return FavoriteItemResponse(
        id=row["id"],
        asin=row["asin"],
        title=row["title"],
        price=row["price"],
        rating=row["rating"],
        score=row["score"],
        link=row["link"],
        badge=row["badge"],
        image_url=row["image_url"],
        target_price=row["target_price"],
        created_at=row["created_at"]
    )

@router.delete("/{favorite_id}")
async def delete_favorite(favorite_id: int, user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM favorites WHERE id = ? AND user_id = ?;", (favorite_id, user["id"]))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Favorite not found.")
    return {"message": "Favorite removed successfully."}

@router.delete("/by-asin/{asin}")
async def delete_favorite_by_asin(asin: str, user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM favorites WHERE asin = ? AND user_id = ?;", (asin, user["id"]))
        conn.commit()
    return {"message": "Favorite removed successfully."}
