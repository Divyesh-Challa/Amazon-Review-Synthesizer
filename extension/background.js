/**
 * Amazon Review Synthesizer - Background Service Worker
 * Handles API communication with local FastAPI backend cleanly without triggering extension errors.
 */

const API_BASE = "http://127.0.0.1:8000";

// Optional fallback: attempt fetching reviews if DOM was not hydrated
async function fetchReviewsByAsin(domain, asin) {
  if (!asin) return [];
  try {
    const targetUrl = `https://${domain}/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_btm?reviewerType=all_reviews&sortBy=recent&pageNumber=1`;
    const response = await fetch(targetUrl, {
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const reviews = [];

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

    return reviews;
  } catch (err) {
    // Silently return empty without triggering Chrome extension error logs
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

        // If DOM reviews were empty, try direct ASIN review page fetch
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
          sendResponse({
            success: false,
            error: `API error (${res.status}): ${errorText}`
          });
          return;
        }

        const data = await res.json();
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message || "Could not connect to FastAPI backend at http://127.0.0.1:8000"
        });
      }
    })();
    return true; // Keep channel open
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
          sendResponse({
            success: false,
            error: `API error (${res.status}): ${errorText}`
          });
          return;
        }

        const data = await res.json();
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message || "Could not connect to FastAPI backend at http://127.0.0.1:8000"
        });
      }
    })();
    return true; // Keep channel open
  }
});
