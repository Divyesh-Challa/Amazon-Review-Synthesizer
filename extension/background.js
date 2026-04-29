/**
 * AZ-Scout - Background Service Worker
 * Handles API communication with local FastAPI backend, user authentication, favorites,
 * saved searches, admin metrics, and tab navigation events.
 */

const API_BASE = "http://127.0.0.1:8000";

// Helper for authenticated requests
async function authFetch(url, options = {}, token = null) {
  const headers = options.headers || {};
  headers["Content-Type"] = "application/json";
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

// Watch tab updates for Amazon navigation (e.g. Page 1 -> Page 2)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && /amazon\.(com|ca|co\.uk|de|fr|it|es|co\.jp|in|com\.au|com\.mx)/i.test(tab.url)) {
    chrome.tabs.sendMessage(tabId, { action: "PAGE_NAVIGATED", url: tab.url }).catch(() => {
      // Ignore if content script is not yet mounted
    });
  }
});

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

    if (!response.ok) return [];

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
            reviews: reviews,
            rating: request.payload.rating,
            review_count: request.payload.review_count,
            customer_consensus: request.payload.customer_consensus,
            features: request.payload.features || [],
            specs: request.payload.specs || {},
            price: request.payload.price || ""
          })
        });

        if (!res.ok) {
          const errorText = await res.text();
          sendResponse({ success: false, error: `API error (${res.status}): ${errorText}` });
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
    return true;
  }

  // 2. Search Results Multi-Product Analysis
  if (request.action === "ANALYZE_SEARCH") {
    (async () => {
      try {
        const headers = { "Content-Type": "application/json" };
        if (request.token) {
          headers["Authorization"] = `Bearer ${request.token}`;
        }

        const res = await fetch(`${API_BASE}/api/v1/analyze-search`, {
          method: "POST",
          headers: headers,
          body: JSON.stringify({
            query: request.payload.query,
            products: request.payload.products
          })
        });

        if (!res.ok) {
          const errorText = await res.text();
          sendResponse({ success: false, error: `API error (${res.status}): ${errorText}` });
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
    return true;
  }

  // 3. User Authentication
  if (request.action === "AUTH_REGISTER") {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload)
        });
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Registration failed." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  if (request.action === "AUTH_LOGIN") {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload)
        });
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Login failed." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  if (request.action === "AUTH_ME") {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/v1/auth/me`, { method: "GET" }, request.token);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Session expired." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  // 4. Favorites Actions
  if (request.action === "FAVORITES_GET") {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/v1/favorites`, { method: "GET" }, request.token);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Failed to load favorites." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  if (request.action === "FAVORITES_ADD") {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/v1/favorites`, {
          method: "POST",
          body: JSON.stringify(request.payload)
        }, request.token);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Failed to add favorite." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  if (request.action === "FAVORITES_DELETE") {
    (async () => {
      try {
        let endpoint = `${API_BASE}/api/v1/favorites/${request.favorite_id}`;
        if (request.asin) {
          endpoint = `${API_BASE}/api/v1/favorites/by-asin/${encodeURIComponent(request.asin)}`;
        }
        const res = await authFetch(endpoint, { method: "DELETE" }, request.token);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Failed to remove favorite." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  // 5. Saved Searches
  if (request.action === "SAVED_SEARCHES_GET") {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/v1/saved-searches`, { method: "GET" }, request.token);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Failed to load saved searches." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  if (request.action === "SAVED_SEARCHES_ADD") {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/v1/saved-searches`, {
          method: "POST",
          body: JSON.stringify(request.payload)
        }, request.token);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Failed to save search." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  if (request.action === "SAVED_SEARCHES_DELETE") {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/v1/saved-searches/${request.search_id}`, { method: "DELETE" }, request.token);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Failed to delete saved search." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  // 6. Admin Actions (Strictly Admin Only)
  if (request.action === "ADMIN_GET_METRICS") {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/v1/admin/metrics`, { method: "GET" }, request.token);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Admin access denied." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  if (request.action === "ADMIN_GET_USERS") {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/v1/admin/users`, { method: "GET" }, request.token);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Admin access denied." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  if (request.action === "ADMIN_DELETE_USER") {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/v1/admin/users/${request.user_id}`, { method: "DELETE" }, request.token);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Failed to delete user." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  if (request.action === "ADMIN_TOGGLE_USER") {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/v1/admin/users/${request.user_id}/toggle-admin`, { method: "POST" }, request.token);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Failed to toggle admin status." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  // 7. Conversational Product RAG ("Ask the Reviews")
  if (request.action === "ASK_REVIEWS") {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/ask-reviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload)
        });
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Failed to query reviews." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  // 8. Head-to-Head Comparison ("VS Mode")
  if (request.action === "COMPARE_PRODUCTS") {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/compare-products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload)
        });
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Failed to compare products." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error." });
      }
    })();
    return true;
  }

  // 9. Price Tracking & History
  if (request.action === "RECORD_PRICE") {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/price-history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload)
        });
        const data = await res.json();
        sendResponse({ success: res.ok, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (request.action === "GET_PRICE_HISTORY") {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/price-history/${encodeURIComponent(request.asin)}`);
        const data = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: data.detail || "Failed to get price history." });
          return;
        }
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // 10. Open Amazon Tabs Discovery (for Comparison)
  if (request.action === "GET_OPEN_AMAZON_TABS") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: "*://*.amazon.*/*" });
        const currentTabId = sender.tab ? sender.tab.id : null;
        const validTabs = tabs
          .filter(t => t.id !== currentTabId && t.url && (t.url.includes("/dp/") || t.url.includes("/gp/product/")))
          .map(t => ({
            id: t.id,
            title: t.title,
            url: t.url
          }));
        sendResponse({ success: true, tabs: validTabs });
      } catch (err) {
        sendResponse({ success: false, error: err.message, tabs: [] });
      }
    })();
    return true;
  }

  if (request.action === "EXTRACT_TAB_DATA") {
    (async () => {
      try {
        chrome.tabs.sendMessage(request.tabId, { action: "EXTRACT_REVIEWS" }, (res) => {
          if (chrome.runtime.lastError || !res) {
            sendResponse({ success: false, error: "Failed to extract product data from target tab." });
          } else {
            sendResponse(res);
          }
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
