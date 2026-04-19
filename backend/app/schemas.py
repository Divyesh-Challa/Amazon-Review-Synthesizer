from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, EmailStr

# --- Authenticity, Durability & Deal Analysis ---
class AuthenticityInfo(BaseModel):
    authenticity_score: float = Field(default=9.2, ge=0.0, le=10.0, description="Estimated percentage of authentic, genuine customer reviews out of 10")
    is_hijacked: bool = Field(default=False, description="Whether reviews mention entirely different products indicating a hijacked listing")
    hijack_warning: Optional[str] = Field(default=None, description="Detailed explanation if reviews mismatch the current product")
    adjusted_rating: Optional[float] = Field(default=None, description="Star rating recalculated excluding suspicious/incentivized reviews")
    suspicious_patterns: List[str] = Field(default_factory=list, description="Specific red flags observed, e.g. review velocity spike or unverified clusters")

class DurabilityInfo(BaseModel):
    durability_score: float = Field(default=8.5, ge=0.0, le=10.0, description="Long-term durability score out of 10")
    failure_rate_verdict: str = Field(default="Low Defect Rate", description="Verdict on failure rate after extended usage (3-12 months)")
    longevity_insights: List[str] = Field(default_factory=list, description="Feedback from buyers who owned the item for 3+ months")
    typical_failure_timeframe: Optional[str] = Field(default=None, description="e.g. '3-6 months' if noticeable failure spike exists, else 'Minimal defects reported'")

class DealVerdictInfo(BaseModel):
    deal_quality: str = Field(default="Standard Price", description="'Genuine Deal', 'Inflated List Price', 'Standard Price', or 'Price Hike'")
    deal_detail: str = Field(default="Priced in line with historical baseline.", description="Detailed analysis of whether discount is genuine")
    is_genuine_discount: bool = Field(default=True)

# Single Product Review Analysis
class AnalyzeRequest(BaseModel):
    product_title: str = Field(..., description="Title of the Amazon product")
    reviews: List[str] = Field(default_factory=list, description="List of scraped review text strings")
    rating: Optional[float] = Field(None, description="Average star rating, e.g. 4.8")
    review_count: Optional[str] = Field(None, description="Total review count, e.g. '21' or '2,081'")
    customer_consensus: Optional[str] = Field(None, description="Amazon AI customer insights summary")
    features: List[str] = Field(default_factory=list, description="About this item feature bullets")
    specs: Dict[str, Any] = Field(default_factory=dict, description="Technical specifications (brand, resolution, etc.)")
    price: Optional[str] = Field(None, description="Current price, e.g. '$87.99'")
    asin: Optional[str] = Field(None, description="Amazon standard identification number")

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
    authenticity: Optional[AuthenticityInfo] = Field(default_factory=AuthenticityInfo)
    durability: Optional[DurabilityInfo] = Field(default_factory=DurabilityInfo)
    deal_verdict: Optional[DealVerdictInfo] = Field(default_factory=DealVerdictInfo)
    better_alternative_advice: Optional[str] = Field(default=None, description="Advice if item is sub-optimal or high risk")

# --- Conversational "Ask the Reviews" (RAG) Schemas ---
class AskReviewsCitation(BaseModel):
    quote: str
    context: Optional[str] = ""

class AskReviewsRequest(BaseModel):
    product_title: str
    reviews: List[str]
    question: str
    specs: Optional[Dict[str, Any]] = None
    features: Optional[List[str]] = None

class AskReviewsResponse(BaseModel):
    question: str
    answer: str
    confidence: str = "high"  # high, medium, low
    citations: List[AskReviewsCitation] = Field(default_factory=list)
    direct_verdict: Optional[str] = None  # e.g. "Yes", "No", "Depends on model"

# --- Head-to-Head Comparison ("VS Mode") Schemas ---
class CompareProductInput(BaseModel):
    title: str
    price: Optional[str] = "N/A"
    score: Optional[float] = 0.0
    rating: Optional[float] = 0.0
    review_count: Optional[str] = "0"
    reviews: Optional[List[str]] = Field(default_factory=list)
    features: Optional[List[str]] = Field(default_factory=list)
    specs: Optional[Dict[str, Any]] = Field(default_factory=dict)
    asin: Optional[str] = ""
    link: Optional[str] = ""

class CompareProductsRequest(BaseModel):
    product_a: CompareProductInput
    product_b: CompareProductInput

class ComparisonCategory(BaseModel):
    category: str
    winner: str  # "A", "B", or "Tie"
    detail: str

class CompareProductsResponse(BaseModel):
    winner_product: str  # "A", "B", or "Tie"
    verdict: str
    summary: str
    product_a_advantages: List[str] = Field(default_factory=list)
    product_b_advantages: List[str] = Field(default_factory=list)
    categories: List[ComparisonCategory] = Field(default_factory=list)

# --- Price Tracking Schemas ---
class PriceRecordRequest(BaseModel):
    asin: str
    price_raw: str

class PricePoint(BaseModel):
    price: float
    price_raw: str
    created_at: str

class PriceHistoryResponse(BaseModel):
    asin: str
    points: List[PricePoint] = Field(default_factory=list)
    current_price: Optional[float] = None
    lowest_price: Optional[float] = None
    highest_price: Optional[float] = None
    average_price: Optional[float] = None
    deal_verdict: str = "Standard Price"

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

# --- User & Auth Schemas ---
class UserRegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)
    name: str = Field(..., min_length=2, max_length=80)

class UserLoginRequest(BaseModel):
    email: str
    password: str

class UserProfile(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool
    created_at: str

class AuthResponse(BaseModel):
    token: str
    user: UserProfile

# --- Favorites Schemas ---
class FavoriteCreateRequest(BaseModel):
    asin: Optional[str] = ""
    title: str
    price: Optional[str] = ""
    rating: Optional[float] = None
    score: Optional[float] = None
    link: Optional[str] = ""
    badge: Optional[str] = ""
    image_url: Optional[str] = ""
    target_price: Optional[float] = None

class FavoriteItemResponse(BaseModel):
    id: int
    asin: Optional[str]
    title: str
    price: Optional[str]
    rating: Optional[float]
    score: Optional[float]
    link: Optional[str]
    badge: Optional[str]
    image_url: Optional[str]
    target_price: Optional[float] = None
    created_at: str

# --- Saved Search Schemas ---
class SavedSearchCreateRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, Any]] = None

class SavedSearchResponse(BaseModel):
    id: int
    query: str
    filters: Optional[Dict[str, Any]]
    created_at: str

# --- Admin Metrics Schemas ---
class AdminUserItem(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool
    created_at: str
    last_login: Optional[str] = None
    favorites_count: int = 0
    saved_searches_count: int = 0

class AdminMetricsResponse(BaseModel):
    total_users: int
    total_active_sessions: int
    total_favorites: int
    total_saved_searches: int
    total_search_syntheses: int
    popular_queries: List[Dict[str, Any]]
    top_favorited_products: List[Dict[str, Any]]
    recent_users: List[AdminUserItem]
    system_status: Dict[str, Any]

class AdminUserUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None
