/**
 * Amazon Review Synthesizer - Content Script
 * Scrapes product title and customer reviews from Amazon Product Detail Pages (PDP),
 * and provides an embedded on-page trigger button and slide-out synthesis panel.
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
  const reviewCards = document.querySelectorAll('div[data-hook="review"]');

  if (reviewCards && reviewCards.length > 0) {
    reviewCards.forEach((card) => {
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

  // Fallback: search general review text containers
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

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "EXTRACT_REVIEWS") {
    if (!isAmazonPDP()) {
      sendResponse({
        success: false,
        error: "NOT_AMAZON_PDP",
        message: "Please navigate to an Amazon product detail page."
      });
      return true;
    }

    const title = extractProductTitle();
    const reviews = extractReviews(20);

    sendResponse({
      success: true,
      emptyState: reviews.length === 0,
      title: title,
      reviews: reviews,
      count: reviews.length
    });
    return true;
  }
});

// Inject Embedded In-Page Floating Widget
function injectEmbeddedUI() {
  if (!isAmazonPDP() || document.getElementById("amz-synth-root")) {
    return;
  }

  const container = document.createElement("div");
  container.id = "amz-synth-root";
  document.body.appendChild(container);

  const shadow = container.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    
    /* Floating Trigger Button */
    .floating-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      color: #38bdf8;
      border: 1px solid #38bdf8;
      border-radius: 50px;
      padding: 12px 20px;
      font-size: 13px;
      font-weight: 700;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.3);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .floating-btn:hover {
      transform: translateY(-2px) scale(1.03);
      background: #0f172a;
      box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.5);
    }
    .btn-icon {
      font-size: 16px;
    }

    /* Modal / Slide-out Panel */
    .drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 1000000;
      display: flex;
      justify-content: flex-end;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }
    .drawer-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .drawer {
      width: 440px;
      max-width: 90vw;
      height: 100vh;
      background: #0f172a;
      color: #f8fafc;
      box-shadow: -10px 0 35px rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      border-left: 1px solid #1e293b;
    }
    .drawer-overlay.active .drawer {
      transform: translateX(0);
    }

    /* Drawer Header */
    .drawer-header {
      padding: 18px 20px;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0f172a;
    }
    .drawer-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .drawer-title {
      font-size: 16px;
      font-weight: 700;
      color: #f8fafc;
    }
    .close-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #94a3b8;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.15s ease;
    }
    .close-btn:hover {
      background: #334155;
      color: #ffffff;
    }

    /* Drawer Body */
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Score Card */
    .product-score-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
    }
    .product-name-heading {
      font-size: 13.5px;
      font-weight: 600;
      color: #e2e8f0;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .score-badge {
      padding: 8px 12px;
      border-radius: 10px;
      display: flex;
      align-items: baseline;
      font-weight: 800;
      font-size: 22px;
      line-height: 1;
      white-space: nowrap;
    }
    .score-badge.high { background: #064e3b; border: 1px solid #10b981; color: #34d399; }
    .score-badge.medium { background: #451a03; border: 1px solid #d97706; color: #fbbf24; }
    .score-badge.low { background: #4c0519; border: 1px solid #e11d48; color: #fb7185; }
    .score-scale { font-size: 12px; font-weight: 600; opacity: 0.8; margin-left: 2px; }

    /* Matrix */
    .matrix-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .matrix-card {
      background: #1e293b;
      border-radius: 10px;
      padding: 12px;
      border: 1px solid #334155;
    }
    .pros-card { border-top: 3px solid #10b981; }
    .cons-card { border-top: 3px solid #f43f5e; }
    .matrix-title {
      font-size: 12.5px;
      font-weight: 700;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pros-card .matrix-title { color: #34d399; }
    .cons-card .matrix-title { color: #fb7185; }
    .matrix-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .matrix-list li {
      font-size: 11.5px;
      color: #cbd5e1;
      position: relative;
      padding-left: 10px;
      line-height: 1.35;
    }
    .matrix-list li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #64748b;
    }

    /* Bullet Sections */
    .section-box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 14px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #f1f5f9;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bullet-dot { width: 8px; height: 8px; border-radius: 50%; }
    .green-dot { background: #10b981; }
    .red-dot { background: #f43f5e; }
    .review-bullets {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .review-bullets li {
      font-size: 12px;
      color: #cbd5e1;
      position: relative;
      padding-left: 14px;
      line-height: 1.45;
    }
    .review-bullets li::before {
      content: "–";
      position: absolute;
      left: 0;
      color: #64748b;
    }

    /* Skeleton Loader */
    .skeleton-box {
      background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 8px;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .sk-header { height: 75px; margin-bottom: 14px; }
    .sk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; height: 90px; margin-bottom: 14px; }
    .sk-list { height: 110px; margin-bottom: 14px; }

    /* Alert / Error Box */
    .alert-box {
      background: #2a1215;
      border: 1px solid #881337;
      color: #fecdd3;
      padding: 14px;
      border-radius: 10px;
      font-size: 12.5px;
      line-height: 1.4;
    }
  `;

  shadow.appendChild(style);

  // Floating trigger button
  const floatBtn = document.createElement("button");
  floatBtn.className = "floating-btn";
  floatBtn.innerHTML = `
    <span class="btn-icon">✨</span>
    <span>Synthesize Reviews</span>
  `;
  shadow.appendChild(floatBtn);

  // Slide-out Drawer
  const overlay = document.createElement("div");
  overlay.className = "drawer-overlay";
  overlay.innerHTML = `
    <div class="drawer">
      <div class="drawer-header">
        <div class="drawer-title-group">
          <span style="font-size: 20px;">✨</span>
          <h3 class="drawer-title">Review Synthesizer</h3>
        </div>
        <button class="close-btn" id="closeDrawerBtn">✕</button>
      </div>
      <div class="drawer-body" id="drawerBody">
        <!-- Rendered dynamically -->
      </div>
    </div>
  `;
  shadow.appendChild(overlay);

  const drawerBody = overlay.querySelector("#drawerBody");
  const closeBtn = overlay.querySelector("#closeDrawerBtn");

  function closeDrawer() {
    overlay.classList.remove("active");
  }

  closeBtn.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDrawer();
  });

  floatBtn.addEventListener("click", async () => {
    overlay.classList.add("active");
    drawerBody.innerHTML = `
      <div class="skeleton-box sk-header"></div>
      <div class="sk-grid">
        <div class="skeleton-box"></div>
        <div class="skeleton-box"></div>
      </div>
      <div class="skeleton-box sk-list"></div>
      <p style="text-align:center; color:#94a3b8; font-size:12px; margin-top:8px;">
        Extracting verified reviews & analyzing with AI backend...
      </p>
    `;

    const title = extractProductTitle();
    const reviews = extractReviews(20);

    if (reviews.length === 0) {
      drawerBody.innerHTML = `
        <div class="alert-box">
          <strong>No Reviews Found:</strong> This product listing does not appear to have customer review text available on this page.
        </div>
      `;
      return;
    }

    // Call background service worker
    chrome.runtime.sendMessage(
      {
        action: "ANALYZE_REVIEWS",
        payload: { product_title: title, reviews: reviews }
      },
      (res) => {
        if (!res || !res.success) {
          const errDetail = res ? res.error : "Backend connection error";
          drawerBody.innerHTML = `
            <div class="alert-box">
              <strong>Backend Offline:</strong><br>
              ${errDetail}<br><br>
              Make sure your FastAPI server is running:<br>
              <code>uvicorn app.main:app --reload</code>
            </div>
          `;
          return;
        }

        const data = res.data;
        const score = parseFloat(data.score) || 0.0;
        let scoreClass = "high";
        if (score < 5.0) scoreClass = "low";
        else if (score < 7.5) scoreClass = "medium";

        drawerBody.innerHTML = `
          <div class="product-score-card">
            <div>
              <span style="font-size:10px; font-weight:700; color:#38bdf8; text-transform:uppercase;">Product Analysis</span>
              <div class="product-name-heading">${data.product_name || title}</div>
            </div>
            <div style="text-align:right;">
              <div class="score-badge ${scoreClass}">
                <span>${score.toFixed(1)}</span>
                <span class="score-scale">/10</span>
              </div>
              <span style="font-size:10px; color:#94a3b8; text-transform:uppercase;">Reliability</span>
            </div>
          </div>

          <div class="matrix-grid">
            <div class="matrix-card pros-card">
              <div class="matrix-title"><span>✓</span> Pros</div>
              <ul class="matrix-list">
                ${(data.pros || []).map(p => `<li>${p}</li>`).join("")}
              </ul>
            </div>
            <div class="matrix-card cons-card">
              <div class="matrix-title"><span>✕</span> Cons</div>
              <ul class="matrix-list">
                ${(data.cons || []).map(c => `<li>${c}</li>`).join("")}
              </ul>
            </div>
          </div>

          <div class="section-box">
            <div class="section-title">
              <span class="bullet-dot green-dot"></span> Positive Reviews
            </div>
            <ul class="review-bullets">
              ${(data.positive_reviews || []).map(r => `<li>${r}</li>`).join("")}
            </ul>
          </div>

          <div class="section-box">
            <div class="section-title">
              <span class="bullet-dot red-dot"></span> Negative Reviews & Issues
            </div>
            <ul class="review-bullets">
              ${(data.negative_reviews || []).map(r => `<li>${r}</li>`).join("")}
            </ul>
          </div>
        `;
      }
    );
  });
}

// Automatically inject on page load if on PDP
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectEmbeddedUI);
} else {
  injectEmbeddedUI();
}

// Fallback in case of dynamic SPA navigation
setTimeout(injectEmbeddedUI, 1500);
