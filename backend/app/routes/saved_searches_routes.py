import json
from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from app.database import get_connection
from app.auth import get_current_user
from app.schemas import SavedSearchCreateRequest, SavedSearchResponse

router = APIRouter(prefix="/api/v1/saved-searches", tags=["Saved Searches"])

@router.get("", response_model=List[SavedSearchResponse])
async def list_saved_searches(user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, query, filters_json, created_at
            FROM saved_searches
            WHERE user_id = ?
            ORDER BY created_at DESC;
        """, (user["id"],))
        rows = cursor.fetchall()

    results = []
    for r in rows:
        filters = None
        if r["filters_json"]:
            try:
                filters = json.loads(r["filters_json"])
            except Exception:
                filters = {}
        results.append(SavedSearchResponse(
            id=r["id"],
            query=r["query"],
            filters=filters,
            created_at=r["created_at"]
        ))
    return results

@router.post("", response_model=SavedSearchResponse, status_code=status.HTTP_201_CREATED)
async def create_saved_search(payload: SavedSearchCreateRequest, user: dict = Depends(get_current_user)):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Search query is required.")

    filters_str = json.dumps(payload.filters or {})
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO saved_searches (user_id, query, filters_json)
            VALUES (?, ?, ?);
        """, (user["id"], query, filters_str))
        conn.commit()
        search_id = cursor.lastrowid

        cursor.execute("SELECT id, query, filters_json, created_at FROM saved_searches WHERE id = ?;", (search_id,))
        row = cursor.fetchone()

    return SavedSearchResponse(
        id=row["id"],
        query=row["query"],
        filters=payload.filters or {},
        created_at=row["created_at"]
    )

@router.delete("/{search_id}")
async def delete_saved_search(search_id: int, user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM saved_searches WHERE id = ? AND user_id = ?;", (search_id, user["id"]))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved search not found.")
    return {"message": "Saved search deleted successfully."}
