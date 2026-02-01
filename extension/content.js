/**
 * Amazon Review Synthesizer - Content Script
 * Scrapes product title and customer reviews from Amazon Product Detail Pages (PDP).
 */

function isAmazonPDP() {
  const url = window.location.href;
  return /amazon\.(com|ca|co\.uk|de|fr|it|es|co\.jp|in|com\.au|com\.mx)/i.test(url) && 
         /\/(dp|gp\/product)\/[A-Z0-9]+/i.test(url);
}

function extractProductTitle() {
  const titleEl = document.querySelector("#productTitle") || 
                  document.querySelector("#title span") ||
                  document.querySelector("h1.product-title-word-break");
  return titleEl ? titleEl.textContent.trim() : document.title.replace(/amazon(\.com|\.ca)?\s*:/i, "").trim();
}

function extractReviews(maxCount = 20) {
  const reviews = [];
  // Standard desktop review card selectors
  const reviewCards = document.querySelectorAll('div[data-hook="review"]');

  if (reviewCards && reviewCards.length > 0) {
    reviewCards.forEach((card, index) => {
      if (reviews.length >= maxCount) return;

      const bodyEl = card.querySelector('span[data-hook="review-body"]') || 
                     card.querySelector('.review-text-content span') ||
                     card.querySelector('.review-text');

      if (!bodyEl) return;
      const text = bodyEl.innerText.trim();
      if (text.length > 10) {
        reviews.push(text);
      }
    });
  }

  // Fallback: If no data-hook="review" was found (e.g. mobile or modified layout)
  if (reviews.length === 0) {
    const fallbackBodies = document.querySelectorAll('.review-text-content');
    fallbackBodies.forEach((el) => {
      if (reviews.length >= maxCount) return;
      const text = el.innerText.trim();
      if (text.length > 10) {
        reviews.push(text);
      }
    });
  }

  return reviews;
}

// Listen for scrape requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "EXTRACT_REVIEWS") {
    if (!isAmazonPDP()) {
      sendResponse({
        success: false,
        error: "NOT_AMAZON_PDP",
        message: "Please open an Amazon Product Detail Page (e.g., /dp/ or /gp/product/)."
      });
      return true;
    }

    const title = extractProductTitle();
    const reviews = extractReviews(20);

    if (reviews.length === 0) {
      sendResponse({
        success: true,
        emptyState: true,
        title: title,
        reviews: [],
        message: "No customer reviews were detected on this page."
      });
      return true;
    }

    sendResponse({
      success: true,
      emptyState: false,
      title: title,
      reviews: reviews,
      count: reviews.length
    });
    return true;
  }
});
