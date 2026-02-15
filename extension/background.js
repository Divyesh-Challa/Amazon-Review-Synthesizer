/**
 * Amazon Review Synthesizer - Background Service Worker
 * Handles API communication and reliable server-side review extraction for Amazon ASINs.
 */

const API_BASE = "http://127.0.0.1:8000";

// Fetches Amazon's dedicated /product-reviews/ page for the ASIN to get verified reviews directly
async function fetchReviewsByAsin(domain, asin) {
  if (!asin) return [];
  try {
    const targetUrl = `https://${domain}/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_btm?reviewerType=all_reviews&sortBy=recent&pageNumber=1`;
    console.log("Fetching reviews from dedicated reviews page:", targetUrl);
    
    const response = await fetch(targetUrl, {
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!response.ok) {
      console.warn("Failed to fetch product-reviews page, HTTP status:", response.status);
      return [];
    }

    const html = await response.text();
    const reviews = [];

    // Extract text inside span[data-hook="review-body"]
    const bodyRegex = /<span\s+data-hook="review-body"[^>]*>([\s\S]*?)<\/span>/gi;
    let match;
    while ((match = bodyRegex.exec(html)) !== null && reviews.length < 15) {
      let rawText = match[1]
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

      if (rawText.length > 15) {
        reviews.push(rawText);
      }
    }

    console.log(`Extracted ${reviews.length} reviews from ASIN ${asin}`);
    return reviews;
  } catch (err) {
    console.error("Error fetching reviews by ASIN:", err);
    return [];
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Single Product Review Analysis
  if (request.action === "ANALYZE_REVIEWS") {
    (async () => {
      try {
        let reviews = request.payload.reviews || [];
        const domain = request.payload.domain || "www.amazon.ca";
        const asin = request.payload.asin;

        // If DOM review extraction was empty (lazy-loaded), fetch directly by ASIN
        if (reviews.length < 2 && asin) {
          const directReviews = await fetchReviewsByAsin(domain, asin);
          if (directReviews.length > 0) {
            reviews = directReviews;
          }
        }

        const res = await fetch(`${API_BASE}/api/v1/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_title: request.payload.product_title,
            reviews: reviews
          })
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`API returned ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        sendResponse({ success: true, data: data });
      } catch (err) {
        console.error("Analysis error in background worker:", err);
        sendResponse({
          success: false,
          error: err.message || "Failed to reach backend API at http://127.0.0.1:8000"
        });
      }
    })();
    return true; // Keep channel open for async response
  }

  // 2. Search Results Multi-Product Analysis
  if (request.action === "ANALYZE_SEARCH") {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/analyze-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: request.payload.query,
            products: request.payload.products
          })
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`API returned ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        sendResponse({ success: true, data: data });
      } catch (err) {
        console.error("Search analysis error in background worker:", err);
        sendResponse({
          success: false,
          error: err.message || "Failed to reach backend API at http://127.0.0.1:8000"
        });
      }
    })();
    return true; // Keep channel open
  }
});
