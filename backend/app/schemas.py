from typing import List, Optional
from pydantic import BaseModel, Field

# Single Product Review Analysis
class AnalyzeRequest(BaseModel):
    product_title: str = Field(..., description="Title of the Amazon product")
    reviews: List[str] = Field(..., description="List of scraped review text strings")

class ReviewSynthesisResponse(BaseModel):
    product_name: str = Field(..., description="Sanitized and readable product name")
    score: float = Field(..., ge=0.0, le=10.0, description="Normalized reliability score out of 10")
    positive_reviews: List[str] = Field(
        default_factory=list,
        description="Bulleted summaries/quotes highlighting genuine product strengths"
    )
    negative_reviews: List[str] = Field(
        default_factory=list,
        description="Bulleted summaries/quotes detailing genuine product flaws or defects"
    )
    pros: List[str] = Field(
        default_factory=list,
        description="High-level product pros"
    )
    cons: List[str] = Field(
        default_factory=list,
        description="High-level product cons"
    )

# Search Page Multi-Product Analysis
class SearchProductItem(BaseModel):
    title: str
    price: Optional[str] = "N/A"
    rating: Optional[float] = 0.0
    review_count: Optional[str] = "0"
    badge: Optional[str] = ""
    asin: Optional[str] = ""
    link: Optional[str] = ""
    image_url: Optional[str] = ""

class SearchAnalyzeRequest(BaseModel):
    query: str = Field(..., description="Search query term, e.g., 'speakers'")
    products: List[SearchProductItem] = Field(..., description="List of top search results from Amazon")

class TopPickItem(BaseModel):
    title: str
    price: str
    score: float
    badge: str
    verdict: str
    pros: List[str]
    cons: List[str]
    link: Optional[str] = ""

class SearchSynthesisResponse(BaseModel):
    query: str
    summary: str
    top_picks: List[TopPickItem]
