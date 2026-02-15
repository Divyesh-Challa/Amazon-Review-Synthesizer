import time
import logging
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.schemas import (
    AnalyzeRequest,
    ReviewSynthesisResponse,
    SearchAnalyzeRequest,
    SearchSynthesisResponse
)
from app.synthesizer import synthesize, synthesize_search_results

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("amazon_synthesizer")

app = FastAPI(
    title="Amazon Review Synthesizer API",
    version="1.1.0",
    description="Backend service for synthesizing Amazon product reviews and search results with structured LLM output."
)

# Enable CORS for Chrome Extensions and local clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", tags=["Health"])
async def root():
    return {
        "status": "online",
        "service": "Amazon Review Synthesizer API",
        "version": "1.1.0",
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
    Ingests product title and raw review strings,
    sanitizes content, runs LLM synthesis with guardrails,
    and returns an objective breakdown.
    """
    start_time = time.perf_counter()
    logger.info(f"Incoming product analysis for: {payload.product_title[:60]}... ({len(payload.reviews)} reviews)")

    if not payload.product_title.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="product_title cannot be empty"
        )

    try:
        result = synthesize(payload.product_title, payload.reviews)
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
async def analyze_search_page(payload: SearchAnalyzeRequest):
    """
    Ingests search query and top products scraped from Amazon search page,
    synthesizes comparative pros/cons, and recommends top picks.
    """
    start_time = time.perf_counter()
    logger.info(f"Incoming search analysis for query '{payload.query}' ({len(payload.products)} products)")

    if not payload.query.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="query cannot be empty"
        )

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
