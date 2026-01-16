import os
import json
import logging
from typing import List, Optional
from app.config import settings
from app.schemas import ReviewSynthesisResponse
from app.sanitizer import prepare_reviews, clean_product_title

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert e-commerce product analyst.
Your task is to analyze verified customer reviews for an Amazon product and provide an objective, data-backed synthesis.

STRICT GUARDRAILS:
1. Disregard non-product feedback entirely (e.g., shipping delays, crushed outer shipping boxes, carrier complaints, packaging tape).
2. Focus strictly on actual product quality, build integrity, physical/functional defects, battery life, usability, and durability.
3. Calculate a normalized reliability score from 0.0 to 10.0 representing genuine product satisfaction and defect-free rate.
4. Provide 2-4 concise positive bullet points (quoting or summarizing authentic customer praise).
5. Provide 2-4 concise negative bullet points (highlighting recurring issues, flaws, or disappointments).
6. Provide a high-level list of Pros and Cons.

OUTPUT FORMAT:
You MUST output ONLY valid JSON matching this exact schema:
{
  "product_name": "string",
  "score": 0.0,
  "positive_reviews": ["string"],
  "negative_reviews": ["string"],
  "pros": ["string"],
  "cons": ["string"]
}
"""

def mock_synthesize(product_title: str, reviews: List[str]) -> ReviewSynthesisResponse:
    """
    Intelligent offline synthesis fallback when no API key is provided.
    Performs heuristic review evaluation so the Chrome extension can be tested immediately.
    """
    cleaned_name = clean_product_title(product_title, max_chars=80)
    if not reviews:
        return ReviewSynthesisResponse(
            product_name=cleaned_name,
            score=5.0,
            positive_reviews=["No verified review text was available for this product listing."],
            negative_reviews=["Unable to find detailed negative feedback."],
            pros=["Listing detected"],
            cons=["Insufficient review sample size"]
        )

    # Heuristic sentiment scoring
    pos_keywords = [
        "great", "excellent", "love", "good", "perfect", "durable", "sturdy",
        "quality", "recommend", "best", "fast", "reliable", "easy", "satisfied"
    ]
    neg_keywords = [
        "bad", "terrible", "poor", "broke", "broken", "cheap", "defective",
        "returned", "useless", "fail", "stopped working", "disappointed", "waste"
    ]

    pos_samples = []
    neg_samples = []
    pos_count = 0
    neg_count = 0

    for rev in reviews:
        rev_lower = rev.lower()
        p_matches = sum(1 for k in pos_keywords if k in rev_lower)
        n_matches = sum(1 for k in neg_keywords if k in rev_lower)

        if p_matches > n_matches:
            pos_count += 1
            if len(pos_samples) < 3:
                pos_samples.append(rev[:120].strip() + ("..." if len(rev) > 120 else ""))
        elif n_matches > p_matches:
            neg_count += 1
            if len(neg_samples) < 3:
                neg_samples.append(rev[:120].strip() + ("..." if len(rev) > 120 else ""))
        else:
            pos_count += 0.5

    total = max(pos_count + neg_count, 1)
    raw_ratio = pos_count / total
    score = round(max(1.0, min(9.8, raw_ratio * 10.0)), 1)

    if not pos_samples:
        pos_samples = ["Customers noted acceptable build quality and standard functionality."]
    if not neg_samples:
        neg_samples = ["No prominent or recurring defect patterns identified in the sample reviews."]

    pros = ["Reliable general performance", "Build quality aligns with customer expectations"]
    cons = ["Minor variations in customer satisfaction", "Some users report preference differences"]

    if score >= 7.5:
        pros = ["Consistently high customer praise", "Durable materials and dependable build"]
        cons = ["Price may fluctuate relative to alternatives"]
    elif score <= 5.0:
        pros = ["Affordable entry point"]
        cons = ["Recurring user complaints regarding longevity", "Higher than average return/dissatisfaction rate"]

    return ReviewSynthesisResponse(
        product_name=cleaned_name,
        score=score,
        positive_reviews=pos_samples,
        negative_reviews=neg_samples,
        pros=pros,
        cons=cons
    )

def gemini_synthesize(product_title: str, reviews: List[str], api_key: str) -> ReviewSynthesisResponse:
    """
    Invokes Google Gemini 1.5 Flash via official SDK with structured JSON output.
    """
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        user_prompt = f"Product Title: {product_title}\n\nCustomer Reviews ({len(reviews)} items):\n"
        for i, rev in enumerate(reviews, 1):
            user_prompt += f"Review {i}: {rev}\n\n"

        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=ReviewSynthesisResponse,
                temperature=0.2,
            ),
        )

        if response.text:
            data = json.loads(response.text)
            return ReviewSynthesisResponse(**data)
        else:
            raise ValueError("Empty response received from Gemini API")
    except Exception as e:
        logger.warning(f"Gemini API call failed ({e}). Falling back to heuristic mock synthesizer.")
        return mock_synthesize(product_title, reviews)

def synthesize(product_title: str, raw_reviews: List[str]) -> ReviewSynthesisResponse:
    """
    Main entry point for review synthesis:
    1. Sanitizes, deduplicates, and limits review input.
    2. Routes to Gemini 1.5 Flash (or Mock mode if no key configured).
    """
    cleaned_reviews = prepare_reviews(
        raw_reviews,
        max_reviews=settings.MAX_REVIEWS,
        max_chars=settings.MAX_CHARS_PER_REVIEW
    )
    cleaned_title = clean_product_title(product_title)

    api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")

    if settings.LLM_PROVIDER.lower() == "gemini" and api_key.strip():
        return gemini_synthesize(cleaned_title, cleaned_reviews, api_key.strip())
    else:
        # Use intelligent offline synthesis
        return mock_synthesize(cleaned_title, cleaned_reviews)
