import json
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.sanitizer import sanitize_text, prepare_reviews, clean_product_title
from app.schemas import AnalyzeRequest, ReviewSynthesisResponse
from app.synthesizer import synthesize, mock_synthesize

def test_sanitizer_removes_emojis_and_pii():
    raw_text = "Great sound! 🎧🔥 Contact me at test@example.com or 555-123-4567. Visit https://amazon.com for info."
    cleaned = sanitize_text(raw_text)
    assert "🎧" not in cleaned
    assert "🔥" not in cleaned
    assert "test@example.com" not in cleaned
    assert "[REDACTED_EMAIL]" in cleaned
    assert "555-123-4567" not in cleaned
    assert "[REDACTED_PHONE]" in cleaned
    assert "https://amazon.com" not in cleaned
    assert "Great sound!" in cleaned

def test_sanitizer_deduplication():
    reviews = [
        "Identical review text about build quality.",
        "Identical review text about build quality.",
        "Another unique review about battery life."
    ]
    prepared = prepare_reviews(reviews, max_reviews=10)
    assert len(prepared) == 2
    assert prepared[0].startswith("Identical review text")
    assert prepared[1].startswith("Another unique review")

def test_clean_product_title():
    raw_title = "   <b>Apple AirPods Pro</b> (2nd Generation) Wireless Ear Buds with USB-C Charging  "
    cleaned = clean_product_title(raw_title)
    assert "<b>" not in cleaned
    assert cleaned.startswith("Apple AirPods Pro")

def test_mock_synthesizer_contract():
    fixture_path = os.path.join(os.path.dirname(__file__), "sample_reviews.json")
    with open(fixture_path, "r", encoding="utf-8") as f:
        sample_data = json.load(f)

    result = mock_synthesize(sample_data["product_title"], sample_data["reviews"])
    assert isinstance(result, ReviewSynthesisResponse)
    assert 0.0 <= result.score <= 10.0
    assert len(result.positive_reviews) > 0
    assert len(result.negative_reviews) > 0
    assert len(result.pros) > 0
    assert len(result.cons) > 0
    assert isinstance(result.product_name, str)

def test_empty_reviews_graceful_handling():
    result = synthesize("Brand New Headphones", [])
    assert isinstance(result, ReviewSynthesisResponse)
    assert result.score == 5.0
    assert len(result.positive_reviews) > 0
    assert "No verified review text" in result.positive_reviews[0]

if __name__ == "__main__":
    print("Running backend tests directly...")
    test_sanitizer_removes_emojis_and_pii()
    test_sanitizer_deduplication()
    test_clean_product_title()
    test_mock_synthesizer_contract()
    test_empty_reviews_graceful_handling()
    print("All backend tests passed successfully!")
