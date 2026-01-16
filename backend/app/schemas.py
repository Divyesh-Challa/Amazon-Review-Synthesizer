from typing import List
from pydantic import BaseModel, Field

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
