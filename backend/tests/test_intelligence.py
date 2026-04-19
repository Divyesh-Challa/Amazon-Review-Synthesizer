import os
import sys
import json
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.synthesizer import (
    synthesize,
    detect_listing_hijack_and_authenticity,
    analyze_durability_and_failure,
    ask_product_reviews,
    compare_two_products
)
from app.schemas import (
    AskReviewsRequest,
    CompareProductsRequest,
    CompareProductInput
)

client = TestClient(app)

def test_authenticity_and_hijack_detection():
    # Normal product: monitor with monitor reviews
    normal_reviews = [
        "Great 144Hz refresh rate, smooth for gaming on my PC.",
        "Color calibration out of the box was decent, stand tilts easily.",
        "Clear IPS panel, no dead pixels noticed."
    ]
    norm_res = detect_listing_hijack_and_authenticity("27-inch IPS Gaming Monitor", normal_reviews)
    assert not norm_res.is_hijacked
    assert norm_res.authenticity_score > 7.0

    # Hijacked listing: monitor title but socks reviews
    hijacked_reviews = [
        "Very soft cotton socks, fit my shoes nicely.",
        "Comfortable socks for running in cold weather.",
        "Good wash and wear socks, feet stay warm."
    ]
    hijack_res = detect_listing_hijack_and_authenticity("27-inch IPS Gaming Monitor", hijacked_reviews)
    assert hijack_res.is_hijacked
    assert hijack_res.authenticity_score < 5.0
    assert "socks" in (hijack_res.hijack_warning or "").lower()

def test_durability_analysis():
    # Long term breakdown
    dur_reviews = [
        "Sound was good initially, but the left earbud broke after 3 months of gym use.",
        "Battery completely died after 4 months and customer service refused warranty.",
        "Plastic hinges cracked within 5 months."
    ]
    dur_info = analyze_durability_and_failure(dur_reviews)
    assert dur_info.durability_score < 7.0
    assert len(dur_info.longevity_insights) > 0
    assert "month" in dur_info.typical_failure_timeframe.lower()

def test_ask_reviews_endpoint():
    req_payload = {
        "product_title": "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
        "reviews": [
            "The battery easily lasted me 30 hours on a cross-country flight with ANC active.",
            "Microphone quality is clear on Zoom meetings, very comfortable earcups."
        ],
        "question": "How long does the battery last with noise cancellation?"
    }
    resp = client.post("/api/v1/ask-reviews", json=req_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "battery" in data["answer"].lower() or "30 hours" in data["answer"].lower()
    assert len(data["citations"]) > 0

def test_compare_products_endpoint():
    payload = {
        "product_a": {
            "title": "Anker Soundcore Motion+ Bluetooth Speaker",
            "price": "$99.99",
            "score": 9.2,
            "rating": 4.6,
            "review_count": "14,000",
            "features": ["30W Audio", "Hi-Res Audio", "12H Playtime", "IPX7 Waterproof"]
        },
        "product_b": {
            "title": "JBL Flip 6 Portable Bluetooth Speaker",
            "price": "$129.95",
            "score": 8.8,
            "rating": 4.7,
            "review_count": "15,000",
            "features": ["2-Way Speaker System", "IP67 Waterproof", "12H Playtime"]
        }
    }
    resp = client.post("/api/v1/compare-products", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["winner_product"] in ["A", "B", "Tie"]
    assert len(data["categories"]) >= 3
    assert len(data["product_a_advantages"]) > 0
    assert len(data["product_b_advantages"]) > 0

def test_price_history_recording_and_retrieval():
    asin = "B0TESTPRICE12"
    # Record snapshot
    rec_resp = client.post("/api/v1/price-history", json={"asin": asin, "price_raw": "$49.99"})
    assert rec_resp.status_code == 200
    assert rec_resp.json()["recorded_price"] == 49.99

    # Retrieve history
    hist_resp = client.get(f"/api/v1/price-history/{asin}")
    assert hist_resp.status_code == 200
    h_data = hist_resp.json()
    assert h_data["asin"] == asin
    assert len(h_data["points"]) >= 1
    assert h_data["current_price"] == 49.99
