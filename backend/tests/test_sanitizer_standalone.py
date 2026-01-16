import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.sanitizer import sanitize_text, prepare_reviews, clean_product_title

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
    print("✓ test_sanitizer_removes_emojis_and_pii passed")

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
    print("✓ test_sanitizer_deduplication passed")

def test_clean_product_title():
    raw_title = "   <b>Apple AirPods Pro</b> (2nd Generation) Wireless Ear Buds with USB-C Charging  "
    cleaned = clean_product_title(raw_title)
    assert "<b>" not in cleaned
    assert cleaned.startswith("Apple AirPods Pro")
    print("✓ test_clean_product_title passed")

if __name__ == "__main__":
    print("Running standard library sanitizer tests...")
    test_sanitizer_removes_emojis_and_pii()
    test_sanitizer_deduplication()
    test_clean_product_title()
    print("All standard library tests passed!")
