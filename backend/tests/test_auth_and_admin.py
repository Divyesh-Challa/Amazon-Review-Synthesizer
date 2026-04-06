import pytest
import os
from fastapi.testclient import TestClient
from app.main import app
from app.database import init_db, get_connection

@pytest.fixture(autouse=True)
def setup_database():
    init_db()
    with get_connection() as conn:
        conn.execute("DELETE FROM favorites;")
        conn.execute("DELETE FROM saved_searches;")
        conn.execute("DELETE FROM sessions;")
        conn.execute("DELETE FROM users WHERE email != 'admin@synthesizer.local';")
        conn.commit()
    yield

def test_auth_registration_and_login():
    client = TestClient(app)

    # 1. Register new user
    reg_resp = client.post("/api/v1/auth/register", json={
        "email": "testuser@example.com",
        "password": "password123",
        "name": "Test User"
    })
    assert reg_resp.status_code == 201
    data = reg_resp.json()
    assert "token" in data
    assert data["user"]["email"] == "testuser@example.com"
    token = data["token"]

    # 2. Duplicate registration fails
    dup_resp = client.post("/api/v1/auth/register", json={
        "email": "testuser@example.com",
        "password": "password123",
        "name": "Test User 2"
    })
    assert dup_resp.status_code == 409

    # 3. Login with correct credentials
    login_resp = client.post("/api/v1/auth/login", json={
        "email": "testuser@example.com",
        "password": "password123"
    })
    assert login_resp.status_code == 200
    login_token = login_resp.json()["token"]

    # 4. Get me profile
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {login_token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["name"] == "Test User"
    assert me_resp.json()["is_admin"] is False

def test_favorites_and_saved_searches():
    client = TestClient(app)

    # Register user
    reg_resp = client.post("/api/v1/auth/register", json={
        "email": "shopper@example.com",
        "password": "password123",
        "name": "Shopper"
    })
    token = reg_resp.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Add favorite
    fav_resp = client.post("/api/v1/favorites", json={
        "asin": "B08TEST123",
        "title": "Anker Soundcore Bluetooth Speaker",
        "price": "$30.99",
        "rating": 4.5,
        "score": 9.4,
        "link": "https://amazon.ca/dp/B08TEST123",
        "badge": "🏆 Best Overall"
    }, headers=headers)
    assert fav_resp.status_code == 201
    fav_id = fav_resp.json()["id"]

    # List favorites
    list_fav = client.get("/api/v1/favorites", headers=headers)
    assert list_fav.status_code == 200
    assert len(list_fav.json()) == 1
    assert list_fav.json()[0]["asin"] == "B08TEST123"

    # Add saved search
    search_resp = client.post("/api/v1/saved-searches", json={
        "query": "speakers",
        "filters": {"minRating": 4.0, "minReviews": 1000}
    }, headers=headers)
    assert search_resp.status_code == 201

    # List saved searches
    list_searches = client.get("/api/v1/saved-searches", headers=headers)
    assert list_searches.status_code == 200
    assert len(list_searches.json()) == 1
    assert list_searches.json()[0]["query"] == "speakers"

    # Delete favorite
    del_fav = client.delete(f"/api/v1/favorites/{fav_id}", headers=headers)
    assert del_fav.status_code == 200

    # Verify deleted
    list_fav_after = client.get("/api/v1/favorites", headers=headers)
    assert len(list_fav_after.json()) == 0

def test_admin_metrics_access_control():
    client = TestClient(app)

    # 1. Non-admin user cannot access admin metrics
    user_resp = client.post("/api/v1/auth/register", json={
        "email": "regular@example.com",
        "password": "password123",
        "name": "Regular User"
    })
    user_token = user_resp.json()["token"]

    forbidden_resp = client.get("/api/v1/admin/metrics", headers={"Authorization": f"Bearer {user_token}"})
    assert forbidden_resp.status_code == 403

    # 2. Admin user CAN access admin metrics
    admin_login = client.post("/api/v1/auth/login", json={
        "email": "admin@synthesizer.local",
        "password": "admin123"
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["token"]
    assert admin_login.json()["user"]["is_admin"] is True

    admin_metrics = client.get("/api/v1/admin/metrics", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_metrics.status_code == 200
    data = admin_metrics.json()
    assert data["total_users"] >= 1
    assert "system_status" in data
    assert "recent_users" in data
    assert isinstance(data["recent_users"], list)
