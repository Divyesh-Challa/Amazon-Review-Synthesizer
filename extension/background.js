/**
 * Amazon Review Synthesizer - Background Service Worker
 * Handles communication with the local backend API to bypass CORS/mixed-content restrictions.
 */

const API_ENDPOINT = "http://127.0.0.1:8000/api/v1/analyze";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ANALYZE_REVIEWS") {
    fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request.payload)
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error (${response.status}): ${errorText}`);
        }
        return response.json();
      })
      .then((data) => {
        sendResponse({ success: true, data: data });
      })
      .catch((err) => {
        console.error("Backend fetch error:", err);
        sendResponse({
          success: false,
          error: err.message || "Failed to reach backend API at http://127.0.0.1:8000"
        });
      });

    return true; // Keep message channel open for async response
  }
});
