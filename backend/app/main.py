import time
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, status, Header
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db, get_connection
from app.auth import get_current_user_optional
from app.schemas import (
    AnalyzeRequest,
    ReviewSynthesisResponse,
    SearchAnalyzeRequest,
    SearchSynthesisResponse
)
from app.synthesizer import synthesize, synthesize_search_results
from app.routes.auth_routes import router as auth_router
from app.routes.favorites_routes import router as favorites_router
from app.routes.saved_searches_routes import router as saved_searches_router
from app.routes.admin_routes import router as admin_router
from app.routes.intelligence_routes import router as intelligence_router

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("az_scout")

app = FastAPI(
    title="AZ-Scout API",
    version="1.5.0",
    description="Backend service for AZ-Scout: AI shopping intelligence, verified review synthesis, conversational Q&A, and product comparisons."
)

# Enable CORS for Chrome Extensions and local clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(auth_router)
app.include_router(favorites_router)
app.include_router(saved_searches_router)
app.include_router(admin_router)
app.include_router(intelligence_router)

@app.on_event("startup")
async def on_startup():
    logger.info("Initializing database...")
    init_db()

@app.get("/", tags=["Health"])
async def root():
    return {
        "status": "online",
        "service": "AZ-Scout API",
        "version": "1.5.0",
        "provider": settings.LLM_PROVIDER
    }

@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "provider": settings.LLM_PROVIDER
    }

@app.post(
    "/api/v1/analyze",
    response_model=ReviewSynthesisResponse,
    status_code=status.HTTP_200_OK,
    tags=["Analysis"]
)
async def analyze_reviews(payload: AnalyzeRequest):
    """
    Ingests product title, raw review strings, ratings, features, specs, and customer consensus,
    sanitizes content, runs LLM synthesis with guardrails,
    and returns an objective, tailored breakdown including authenticity, durability, and deal quality.
    """
    start_time = time.perf_counter()
    logger.info(f"Incoming product analysis for: {payload.product_title[:60]}... ({len(payload.reviews)} reviews, rating={payload.rating}, price={payload.price})")

    if not payload.product_title.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="product_title cannot be empty"
        )

    try:
        result = synthesize(
            product_title=payload.product_title,
            reviews=payload.reviews,
            rating=payload.rating,
            review_count=payload.review_count,
            customer_consensus=payload.customer_consensus,
            features=payload.features,
            specs=payload.specs,
            price=payload.price,
            asin=payload.asin
        )
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.info(f"Product synthesis completed in {duration_ms}ms with score: {result.score}")
        return result
    except Exception as e:
        logger.error(f"Error during review synthesis: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Review synthesis failed: {str(e)}"
        )

@app.post(
    "/api/v1/analyze-search",
    response_model=SearchSynthesisResponse,
    status_code=status.HTTP_200_OK,
    tags=["Analysis"]
)
async def analyze_search_page(payload: SearchAnalyzeRequest, authorization: Optional[str] = Header(None)):
    """
    Ingests search query and top products scraped from Amazon search page,
    synthesizes comparative pros/cons, and recommends top picks.
    Also logs metrics for the admin dashboard.
    """
    start_time = time.perf_counter()
    logger.info(f"Incoming search analysis for query '{payload.query}' ({len(payload.products)} products)")

    if not payload.query.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="query cannot be empty"
        )

    # Record search metric for admin visibility
    user = get_current_user_optional(authorization)
    user_id = user["id"] if user else None
    try:
        with get_connection() as conn:
            conn.execute(
                "INSERT INTO search_metrics (query, user_id, products_count) VALUES (?, ?, ?);",
                (payload.query.strip(), user_id, len(payload.products))
            )
            conn.commit()
    except Exception as e:
        logger.warning(f"Failed to record search metric: {e}")

    try:
        result = synthesize_search_results(payload.query, payload.products)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.info(f"Search synthesis completed in {duration_ms}ms with {len(result.top_picks)} top picks")
        return result
    except Exception as e:
        logger.error(f"Error during search synthesis: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search synthesis failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
