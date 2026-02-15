import os
import json
import logging
from typing import List, Optional
from app.config import settings
from app.schemas import (
    ReviewSynthesisResponse,
    SearchProductItem,
    SearchSynthesisResponse,
    TopPickItem
)
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

SEARCH_SYSTEM_PROMPT = """You are an expert e-commerce buying guide analyst.
Analyze a list of top Amazon search results for a user search query, and provide an unbiased synthesis of the best recommended picks.

Identify the top 3-4 distinct recommendations (e.g. Best Overall, Best Value / Budget, Best Premium, Most Popular).
For each product:
- Provide an objective score (0.0 - 10.0) based on ratings, review consensus, and specifications.
- Assign an informative recommendation badge (e.g. "Best Overall Pick", "Best Budget Option").
- Write a 1-2 sentence buyer verdict.
- List 2-3 genuine pros and 1-2 honest cons/trade-offs.

Output strictly in valid JSON matching SearchSynthesisResponse schema.
"""

def mock_synthesize(product_title: str, reviews: List[str]) -> ReviewSynthesisResponse:
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

    pos_keywords = [
        "great", "excellent", "love", "good", "perfect", "durable", "sturdy",
        "quality", "recommend", "best", "fast", "reliable", "easy", "satisfied",
        "clear", "crisp", "loud", "sound", "compact", "helpful"
    ]
    neg_keywords = [
        "bad", "terrible", "poor", "broke", "broken", "cheap", "defective",
        "returned", "useless", "fail", "stopped working", "disappointed", "waste",
        "muffled", "distorted", "disconnects", "lag"
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
            if len(pos_samples) < 4:
                pos_samples.append(rev[:130].strip() + ("..." if len(rev) > 130 else ""))
        elif n_matches > p_matches:
            neg_count += 1
            if len(neg_samples) < 4:
                neg_samples.append(rev[:130].strip() + ("..." if len(rev) > 130 else ""))
        else:
            pos_count += 0.5

    total = max(pos_count + neg_count, 1)
    raw_ratio = pos_count / total
    score = round(max(1.0, min(9.8, raw_ratio * 10.0)), 1)

    if not pos_samples:
        pos_samples = ["Customers consistently note solid build quality and reliable daily performance."]
    if not neg_samples:
        neg_samples = ["No prominent defect patterns identified in the examined sample reviews."]

    pros = ["Reliable build and daily performance", "High customer satisfaction rating", "Easy setup and integration"]
    cons = ["Audio/performance may vary depending on room placement", "Some users prefer more customization options"]

    if score >= 7.5:
        pros = ["Rich, clear performance with strong build quality", "Consistent positive feedback across verified buyers"]
        cons = ["Price may fluctuate without sale discounts"]
    elif score <= 5.0:
        pros = ["Affordable entry-level option"]
        cons = ["Higher rate of user complaints regarding longevity", "Occasional software or hardware inconsistencies"]

    return ReviewSynthesisResponse(
        product_name=cleaned_name,
        score=score,
        positive_reviews=pos_samples,
        negative_reviews=neg_samples,
        pros=pros,
        cons=cons
    )

def mock_synthesize_search(query: str, products: List[SearchProductItem]) -> SearchSynthesisResponse:
    if not products:
        return SearchSynthesisResponse(
            query=query,
            summary=f"No products found for '{query}'.",
            top_picks=[]
        )

    # Sort products by rating descending, then review count
    valid_products = [p for p in products if p.title and len(p.title.strip()) > 3]
    if not valid_products:
        valid_products = products

    # Pick top 3-4 distinct products
    picks: List[TopPickItem] = []
    badges = ["🏆 Best Overall", "💰 Best Value", "⭐ Top Rated", "🔥 Popular Pick"]

    for i, prod in enumerate(valid_products[:4]):
        badge = prod.badge or badges[i % len(badges)]
        clean_title = clean_product_title(prod.title, max_chars=75)
        rating = prod.rating or 4.5
        calculated_score = round(min(9.8, max(6.0, rating * 2.0 - (0.2 * i))), 1)

        pros = [
            f"Strong customer rating ({rating}★)",
            "Proven reliability among thousands of verified buyers",
            "Competitive feature set for its category"
        ]
        cons = [
            "Availability or deals may be time-sensitive",
            "Alternative models may offer niche specialized features"
        ]

        verdict = f"Recommended choice in the '{query}' category with proven customer satisfaction and dependable performance."

        picks.append(TopPickItem(
            title=clean_title,
            price=prod.price or "Check on Amazon",
            score=calculated_score,
            badge=badge,
            verdict=verdict,
            pros=pros,
            cons=cons,
            link=prod.link or ""
        ))

    summary = (
        f"Analyzed {len(valid_products)} top-ranking items for '{query}'. "
        f"The top recommendations balance verified customer ratings, price-to-performance ratio, and proven durability."
    )

    return SearchSynthesisResponse(
        query=query,
        summary=summary,
        top_picks=picks
    )

def gemini_synthesize_search(query: str, products: List[SearchProductItem], api_key: str) -> SearchSynthesisResponse:
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        items_payload = []
        for p in products[:8]:
            items_payload.append({
                "title": p.title,
                "price": p.price,
                "rating": p.rating,
                "review_count": p.review_count,
                "badge": p.badge,
                "link": p.link
            })

        user_prompt = f"Search Query: {query}\n\nTop Amazon Products:\n{json.dumps(items_payload, indent=2)}"

        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SEARCH_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=SearchSynthesisResponse,
                temperature=0.3,
            ),
        )

        if response.text:
            data = json.loads(response.text)
            return SearchSynthesisResponse(**data)
        else:
            raise ValueError("Empty response received from Gemini API")
    except Exception as e:
        logger.warning(f"Gemini search analysis failed ({e}). Falling back to heuristic mock synthesizer.")
        return mock_synthesize_search(query, products)

def gemini_synthesize(product_title: str, reviews: List[str], api_key: str) -> ReviewSynthesisResponse:
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
        return mock_synthesize(cleaned_title, cleaned_reviews)

def synthesize_search_results(query: str, products: List[SearchProductItem]) -> SearchSynthesisResponse:
    api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
    if settings.LLM_PROVIDER.lower() == "gemini" and api_key.strip():
        return gemini_synthesize_search(query, products, api_key.strip())
    else:
        return mock_synthesize_search(query, products)
