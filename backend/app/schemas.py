from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, EmailStr

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
