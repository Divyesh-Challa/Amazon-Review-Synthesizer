import logging
from fastapi import APIRouter, HTTPException, status
from typing import Dict, Any
from app.schemas import (
    AskReviewsRequest,
    AskReviewsResponse,
    CompareProductsRequest,
    CompareProductsResponse,
    PriceRecordRequest,
    PriceHistoryResponse,
    PricePoint
)
from app.synthesizer import ask_product_reviews, compare_two_products
from app.database import record_price_snapshot, get_price_history_for_asin

logger = logging.getLogger("amazon_synthesizer.intelligence")

router = APIRouter(prefix="/api/v1", tags=["Shopping Intelligence"])

@router.post(
    "/ask-reviews",
    response_model=AskReviewsResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask specific questions to verified customer reviews"
)
async def ask_reviews_endpoint(payload: AskReviewsRequest):
    """
    RAG engine: Answers user questions about a product by retrieving and synthesizing
    evidence from verified buyer reviews and technical specifications.
    """
    if not payload.question.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question cannot be empty."
        )

    try:
        response = ask_product_reviews(payload)
        return response
    except Exception as e:
        logger.error(f"Error in ask-reviews: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process review Q&A: {str(e)}"
        )

@router.post(
    "/compare-products",
    response_model=CompareProductsResponse,
    status_code=status.HTTP_200_OK,
    summary="Compare two Amazon products head-to-head"
)
async def compare_products_endpoint(payload: CompareProductsRequest):
    """
    Head-to-head comparison engine: compares Product A and Product B across
    value for money, verified customer reliability, durability, and feature advantages.
    """
    if not payload.product_a.title.strip() or not payload.product_b.title.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both product titles are required for comparison."
        )

    try:
        response = compare_two_products(payload)
        return response
    except Exception as e:
        logger.error(f"Error in compare-products: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compare products: {str(e)}"
        )

@router.post(
    "/price-history",
    status_code=status.HTTP_200_OK,
    summary="Record a price snapshot for an ASIN"
)
async def record_price(payload: PriceRecordRequest):
    """
    Records a historical price point snapshot for an ASIN when users browse products.
    """
    if not payload.asin.strip() or not payload.price_raw.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ASIN and price_raw are required."
        )

    parsed = record_price_snapshot(payload.asin.strip(), payload.price_raw.strip())
    return {
        "asin": payload.asin.strip(),
        "recorded_price": parsed,
        "status": "success"
    }

@router.get(
    "/price-history/{asin}",
    response_model=PriceHistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve price history trajectory for an ASIN"
)
async def get_price_history(asin: str):
    """
    Retrieves historical price trend, lowest recorded price, highest recorded price,
    and a deal quality verdict.
    """
    if not asin.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ASIN is required."
        )

    data = get_price_history_for_asin(asin.strip())
    points = [PricePoint(**p) for p in data.get("points", [])]
    return PriceHistoryResponse(
        asin=asin,
        points=points,
        current_price=data.get("current_price"),
        lowest_price=data.get("lowest_price"),
        highest_price=data.get("highest_price"),
        average_price=data.get("average_price"),
        deal_verdict=data.get("deal_verdict", "Standard Price")
    )
