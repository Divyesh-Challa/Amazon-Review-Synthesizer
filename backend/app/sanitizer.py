import re
from typing import List

# Regex patterns for sanitization
EMAIL_PATTERN = re.compile(r'[\w\.-]+@[\w\.-]+\.\w+')
PHONE_PATTERN = re.compile(r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}')
URL_PATTERN = re.compile(r'https?://\S+|www\.\S+')
HTML_TAG_PATTERN = re.compile(r'<[^>]+>')
# Match emojis and decorative unicode symbols outside basic Latin, Latin-1 supplement, and standard punctuation
EMOJI_PATTERN = re.compile(
    "["
    "\U00010000-\U0010ffff"
    "\U00002600-\U000027BF"
    "\U00002300-\U000023FF"
    "\U00002B50-\U00002B55"
    "\U0000200D"
    "\U0000FE0F"
    "]+",
    flags=re.UNICODE
)
WHITESPACE_PATTERN = re.compile(r'\s+')

def sanitize_text(text: str, max_chars: int = 600) -> str:
    """
    Cleans raw review text:
    - Strips HTML tags
    - Strips URLs and PII (emails, phone numbers)
    - Strips emojis and decorative symbols
    - Normalizes multiple spaces/newlines
    - Truncates to max_chars to optimize tokens and latency
    """
    if not text:
        return ""

    # Remove HTML tags
    cleaned = HTML_TAG_PATTERN.sub(" ", text)

    # Remove URLs
    cleaned = URL_PATTERN.sub("", cleaned)

    # Remove Emails & Phone Numbers
    cleaned = EMAIL_PATTERN.sub("[REDACTED_EMAIL]", cleaned)
    cleaned = PHONE_PATTERN.sub("[REDACTED_PHONE]", cleaned)

    # Remove Emojis
    cleaned = EMOJI_PATTERN.sub("", cleaned)

    # Normalize whitespace
    cleaned = WHITESPACE_PATTERN.sub(" ", cleaned).strip()

    # Truncate
    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars].rstrip() + "..."

    return cleaned

def clean_product_title(title: str, max_chars: int = 150) -> str:
    """
    Sanitizes product title by stripping excessive marketing noise or whitespace.
    """
    if not title:
        return "Unknown Product"
    cleaned = HTML_TAG_PATTERN.sub(" ", title)
    cleaned = WHITESPACE_PATTERN.sub(" ", cleaned).strip()
    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars].rstrip() + "..."
    return cleaned

def prepare_reviews(reviews: List[str], max_reviews: int = 15, max_chars: int = 600) -> List[str]:
    """
    Deduplicates, sanitizes, and limits reviews to the top N entries.
    """
    seen = set()
    cleaned_reviews: List[str] = []

    for rev in reviews:
        sanitized = sanitize_text(rev, max_chars=max_chars)
        # Filter out trivial/empty reviews
        if len(sanitized) < 10:
            continue
        # Deduplication check (lowercased)
        dedup_key = sanitized.lower()
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        cleaned_reviews.append(sanitized)

        if len(cleaned_reviews) >= max_reviews:
            break

    return cleaned_reviews
