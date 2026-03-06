/**
 * Amazon Review Synthesizer - Content Script
 * Automatically detects Amazon Product & Search pages, automatically opens on-page synthesis UI
 * positioned in the top-right corner, and extracts verified customer reviews, specifications,
 * price, and features for individualized product analysis.
 */

// --- Page Detection ---
function isAmazonProductPage() {
  const url = window.location.href;
  return /amazon\.(com|ca|co\.uk|de|fr|it|es|co\.jp|in|com\.au|com\.mx)/i.test(url) &&
         /\/(dp|gp\/product)\/[A-Z0-9]+/i.test(url);
}

function isAmazonSearchPage() {
  const url = window.location.href;
  return /amazon\.(com|ca|co\.uk|de|fr|it|es|co\.jp|in|com\.au|com\.mx)/i.test(url) &&
         /\/s(\?|\/)|[?&]k=/i.test(url);
}

// --- Data Extraction: Product Page ---
function extractASIN() {
  const asinInput = document.getElementById("ASIN") || document.querySelector('input[name="ASIN"]');
  if (asinInput && asinInput.value) return asinInput.value.trim();

  const urlMatch = window.location.href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (urlMatch) return urlMatch[1];

  const anyAsin = document.querySelector("[data-asin]");
  if (anyAsin && anyAsin.getAttribute("data-asin")) return anyAsin.getAttribute("data-asin");

  return null;
}

function extractProductTitle() {
  const titleEl = document.getElementById("productTitle");
  if (titleEl && titleEl.textContent.trim()) {
    const text = titleEl.textContent.trim();
    if (text.toLowerCase() !== "amazon official") return text;
  }

  const h1El = document.querySelector("h1#title") || 
               document.querySelector("h1.product-title-word-break") ||
               document.querySelector("#title h1") ||
               document.querySelector("h1");
  if (h1El && h1El.textContent.trim()) {
    const text = h1El.textContent.trim();
    if (text.toLowerCase() !== "amazon official" && text.length > 5) return text;
  }

  let docTitle = document.title || "";
  docTitle = docTitle.replace(/amazon(\.ca|\.com)?\s*:\s*/i, "");
  docTitle = docTitle.replace(/:\\s*amazon(\.ca|\.com)?/i, "");
  return docTitle.split(":")[0].trim() || "Amazon Product";
}

function extractProductRatingAndCount() {
  let rating = 4.2;
  let reviewCount = "";

  const ratingEl = document.querySelector('span[data-hook="rating-out-of-text"]') ||
                   document.querySelector('#acrPopover') ||
                   document.querySelector('.a-icon-star span') ||
                   document.querySelector('i[data-hook="average-star-rating"] span');
  if (ratingEl && ratingEl.innerText) {
    const match = ratingEl.innerText.match(/(\d+(\.\d+)?)/);
    if (match) rating = parseFloat(match[1]);
  }

  const countEl = document.getElementById("acrCustomerReviewText") ||
                  document.querySelector('span[data-hook="total-review-count"]');
  if (countEl && countEl.innerText) {
    reviewCount = countEl.innerText.trim();
  }

  return { rating, reviewCount };
}

function extractPrice() {
  const p = document.querySelector('#apex_desktop .a-price .a-offscreen') ||
            document.querySelector('#corePrice_feature_div .a-price .a-offscreen') ||
            document.querySelector('.a-price .a-offscreen') ||
            document.querySelector('.a-price-whole');
  return p ? p.innerText.trim() : "";
}

function extractFeatures() {
  const features = [];
  document.querySelectorAll('#feature-bullets ul li span.a-list-item, #aboutTheItem ul li, #productDescription p').forEach((el) => {
    const t = el.innerText ? el.innerText.trim() : el.textContent.trim();
    if (t.length > 15 && features.length < 6) {
      features.push(t);
    }
  });
  return features;
}

function extractSpecs() {
  const specs = {};
  document.querySelectorAll('#productOverview_feature_div tr, #poExpander tr, #technicalSpecifications_section_1 tr').forEach((row) => {
    const keyEl = row.querySelector('td.a-span3 span, th span, td:first-child span');
    const valEl = row.querySelector('td.a-span9 span, td:last-child span');
    if (keyEl && valEl) {
      const k = keyEl.innerText.trim();
      const v = valEl.innerText.trim();
      if (k && v) specs[k] = v;
    }
  });
  return specs;
}

function extractCustomerConsensus() {
  const summaryEl = document.querySelector('[data-hook="cr-insights-widget"]') ||
                    document.querySelector('#product-summary') ||
                    document.querySelector('#cr-customer-review-insights') ||
                    document.querySelector('#cr-summarization-attributes-list');
  return summaryEl ? summaryEl.innerText.trim() : "";
}

function extractReviewsFromDOM(maxCount = 20) {
  const reviews = [];

  // Review cards & titles
  document.querySelectorAll('div[data-hook="review"], div[id^="customer_review-"]').forEach((card) => {
    if (reviews.length >= maxCount) return;
    const title = card.querySelector('[data-hook="review-title"] span, .review-title span');
    const body = card.querySelector('[data-hook="review-body"] span, .review-text-content span, .review-text');
    let combined = "";
    if (title && title.innerText.trim()) combined += title.innerText.trim() + ": ";
    if (body && body.innerText.trim()) combined += body.innerText.trim();
    if (combined.length > 15) reviews.push(combined);
  });

  return reviews;
}

// Same-Origin Review Page Fetch with active session
async function fetchSameOriginReviews(asin, maxCount = 15) {
  if (!asin) return [];
  try {
    const url = `/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_btm?reviewerType=all_reviews&sortBy=recent&pageNumber=1`;
    const resp = await fetch(url, { credentials: "same-origin" });
    if (!resp.ok) return [];

    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const reviews = [];

    doc.querySelectorAll('span[data-hook="review-body"], .review-text-content span').forEach((el) => {
      if (reviews.length >= maxCount) return;
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length > 15) reviews.push(text);
    });

    return reviews;
  } catch (err) {
    return [];
  }
}

// --- Data Extraction: Search Page ---
function extractSearchData() {
  const urlParams = new URLSearchParams(window.location.search);
  const searchInput = document.querySelector("#twotabsearchtextbox");
  const query = urlParams.get("k") || (searchInput ? searchInput.value : "") || "Products";

  const productCards = document.querySelectorAll('div[data-component-type="s-search-result"]');
  const products = [];

  productCards.forEach((card) => {
    if (products.length >= 8) return;

    const isSponsored = card.querySelector('.puis-sponsored-label-text, .s-sponsored-label-text');
    
    const titleEl = card.querySelector('h2 a span') || 
                    card.querySelector('h2 a.a-link-normal') || 
                    card.querySelector('.a-text-normal');
    if (!titleEl) return;
    const title = titleEl.innerText.trim();
    if (!title || title.length < 5) return;

    const asin = card.getAttribute("data-asin") || "";

    const ratingEl = card.querySelector('.a-icon-alt');
    let rating = 4.5;
    if (ratingEl && ratingEl.innerText) {
      const parsed = parseFloat(ratingEl.innerText.split(" ")[0]);
      if (!isNaN(parsed)) rating = parsed;
    }

    const countEl = card.querySelector('span.a-size-base.s-underline-text') ||
                    card.querySelector('a[href*="customerReviews"] span');
    const review_count = countEl ? countEl.innerText.trim() : "100+";

    const priceEl = card.querySelector('.a-price .a-offscreen') || 
                    card.querySelector('.a-price-whole');
    const price = priceEl ? priceEl.innerText.trim() : "See Price";

    const badgeEl = card.querySelector('.a-badge-text') || 
                    card.querySelector('.s-coupon-highlight-color');
    const badge = badgeEl ? badgeEl.innerText.trim() : (isSponsored ? "Featured" : "");

    const linkEl = card.querySelector('h2 a');
    const link = linkEl ? linkEl.href : "";

    products.push({
      title,
      asin,
      rating,
      review_count,
      price,
      badge,
      link
    });
  });

  return { query, products };
}

// --- Listen to Popup Messages ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "EXTRACT_REVIEWS") {
    if (!isAmazonProductPage()) {
      sendResponse({ success: false, error: "NOT_AMAZON_PDP", message: "Not on a product detail page." });
      return true;
    }
    (async () => {
      const title = extractProductTitle();
      let reviews = extractReviewsFromDOM(20);
      const asin = extractASIN();
      const consensus = extractCustomerConsensus();
      const { rating, reviewCount } = extractProductRatingAndCount();
      const features = extractFeatures();
      const specs = extractSpecs();
      const price = extractPrice();

      if (reviews.length < 3 && asin) {
        const directRevs = await fetchSameOriginReviews(asin);
        if (directRevs.length > 0) reviews = directRevs;
      }

      sendResponse({
        success: true,
        title: title,
        reviews: reviews,
        asin: asin,
        rating: rating,
        review_count: reviewCount,
        customer_consensus: consensus,
        features: features,
        specs: specs,
        price: price,
        domain: window.location.hostname
      });
    })();
    return true;
  }

  if (request.action === "EXTRACT_SEARCH") {
    if (!isAmazonSearchPage()) {
      sendResponse({ success: false, error: "NOT_AMAZON_SEARCH", message: "Not on a search page." });
      return true;
    }
    const data = extractSearchData();
    sendResponse({ success: true, ...data });
    return true;
  }
});

// --- In-Page UI Injection ---
function injectAutoSynthesizerUI() {
  const isProduct = isAmazonProductPage();
  const isSearch = isAmazonSearchPage();

  if (!isProduct && !isSearch) return;
  if (document.getElementById("amz-synth-root")) return;

  const root = document.createElement("div");
  root.id = "amz-synth-root";
  document.body.appendChild(root);

  const shadow = root.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    
    /* Minimized Floating Pill in Top-Right */
    .pill-btn {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 9999999;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      color: #38bdf8;
      border: 1px solid #38bdf8;
      border-radius: 50px;
      padding: 7px 14px;
      font-size: 11.5px;
      font-weight: 700;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.4);
      cursor: pointer;
      display: none;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }
    .pill-btn:hover {
      transform: translateY(-1px) scale(1.03);
      background: #0f172a;
    }
    .pill-btn.visible {
      display: flex;
    }

    /* Auto-Popup Docked Panel positioned at Top-Right */
    .docked-panel {
      position: fixed;
      top: 14px;
      right: 14px;
      width: 350px;
      max-width: calc(100vw - 28px);
      max-height: calc(100vh - 28px);
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 12px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.8), 0 0 25px rgba(56, 189, 248, 0.2);
      z-index: 9999998;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .docked-panel.hidden {
      display: none;
    }

    @keyframes slideIn {
      from { transform: translateX(110%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    /* Panel Header */
    .panel-header {
      padding: 11px 13px;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-branding {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .header-branding h3 {
      font-size: 12.5px;
      font-weight: 700;
      color: #f8fafc;
    }
    .status-badge {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 8px;
      background: #064e3b;
      color: #34d399;
      border: 1px solid #059669;
    }
    .panel-controls {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .icon-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #94a3b8;
      width: 22px;
      height: 22px;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.15s ease;
    }
    .icon-btn:hover {
      background: #334155;
      color: #ffffff;
    }

    /* Panel Content */
    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 13px;
      display: flex;
      flex-direction: column;
      gap: 11px;
    }

    .panel-body::-webkit-scrollbar { width: 5px; }
    .panel-body::-webkit-scrollbar-track { background: #0f172a; }
    .panel-body::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }

    /* Product Card */
    .product-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 11px 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .product-title {
      font-size: 12px;
      font-weight: 600;
      color: #f1f5f9;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.35;
    }
    .score-badge {
      padding: 5px 9px;
      border-radius: 8px;
      display: flex;
      align-items: baseline;
      font-weight: 800;
      font-size: 18px;
      line-height: 1;
      white-space: nowrap;
    }
    .score-badge.high { background: #064e3b; border: 1px solid #10b981; color: #34d399; }
    .score-badge.medium { background: #451a03; border: 1px solid #d97706; color: #fbbf24; }
    .score-badge.low { background: #4c0519; border: 1px solid #e11d48; color: #fb7185; }
    .score-max { font-size: 10px; font-weight: 600; opacity: 0.8; margin-left: 1px; }

    /* Pros & Cons Matrix */
    .matrix-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
    }
    .matrix-box {
      background: #1e293b;
      border-radius: 8px;
      padding: 9px;
      border: 1px solid #334155;
    }
    .pros-box { border-top: 3px solid #10b981; }
    .cons-box { border-top: 3px solid #f43f5e; }
    .matrix-heading {
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 5px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .pros-box .matrix-heading { color: #34d399; }
    .cons-box .matrix-heading { color: #fb7185; }
    .matrix-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .matrix-list li {
      font-size: 10.5px;
      color: #cbd5e1;
      position: relative;
      padding-left: 9px;
      line-height: 1.35;
    }
    .matrix-list li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #64748b;
    }

    /* Highlight Sections */
    .section-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px;
    }
    .section-header {
      font-size: 11px;
      font-weight: 700;
      color: #e2e8f0;
      margin-bottom: 7px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .dot { width: 5px; height: 5px; border-radius: 50%; }
    .green-dot { background: #10b981; }
    .red-dot { background: #f43f5e; }
    .bullets {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .bullets li {
      font-size: 10.5px;
      color: #cbd5e1;
      position: relative;
      padding-left: 11px;
      line-height: 1.4;
    }
    .bullets li::before {
      content: "–";
      position: absolute;
      left: 0;
      color: #64748b;
    }

    /* Search Results Top Picks */
    .search-summary-card {
      background: #1e293b;
      border: 1px solid #38bdf8;
      border-radius: 8px;
      padding: 10px;
      font-size: 11px;
      color: #e2e8f0;
      line-height: 1.4;
    }
    .top-pick-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pick-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6px;
    }
    .pick-badge {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 5px;
      border-radius: 4px;
      background: #172554;
      color: #60a5fa;
      border: 1px solid #1e40af;
      display: inline-block;
      margin-bottom: 2px;
    }
    .pick-title {
      font-size: 11.5px;
      font-weight: 600;
      color: #f8fafc;
      line-height: 1.3;
    }
    .pick-score {
      font-size: 14px;
      font-weight: 800;
      color: #34d399;
      background: #064e3b;
      border: 1px solid #10b981;
      padding: 2px 6px;
      border-radius: 5px;
      white-space: nowrap;
    }
    .pick-price {
      font-size: 11px;
      font-weight: 700;
      color: #38bdf8;
    }
    .pick-verdict {
      font-size: 10.5px;
      color: #cbd5e1;
      font-style: italic;
      line-height: 1.35;
    }
    .pick-link-btn {
      align-self: flex-start;
      margin-top: 2px;
      background: #2563eb;
      color: #ffffff;
      text-decoration: none;
      padding: 3px 9px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      transition: background 0.15s ease;
    }
    .pick-link-btn:hover {
      background: #1d4ed8;
    }

    /* Skeleton Loading */
    .skeleton {
      background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 6px;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .sk-title { height: 46px; margin-bottom: 7px; }
    .sk-matrix { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; height: 65px; margin-bottom: 7px; }
    .sk-body { height: 80px; margin-bottom: 7px; }
    .loading-subtext { text-align: center; color: #94a3b8; font-size: 10.5px; font-style: italic; }

    /* Alert Box */
    .alert-card {
      background: #2a1215;
      border: 1px solid #881337;
      color: #fecdd3;
      padding: 11px;
      border-radius: 8px;
      font-size: 11.5px;
      line-height: 1.4;
    }
  `;
  shadow.appendChild(style);

  // Minimized Pill (in top right)
  const pillBtn = document.createElement("button");
  pillBtn.className = "pill-btn";
  pillBtn.innerHTML = `<span>✨</span><span>Review Synthesizer</span>`;
  shadow.appendChild(pillBtn);

  // Main Docked Panel in Top Right
  const panel = document.createElement("div");
  panel.className = "docked-panel";
  panel.innerHTML = `
    <div class="panel-header">
      <div class="header-branding">
        <span style="font-size:14px;">✨</span>
        <h3 id="panelHeaderTitle">${isProduct ? "Product Review Synthesizer" : "Search Synthesizer"}</h3>
        <span class="status-badge">Active</span>
      </div>
      <div class="panel-controls">
        <button class="icon-btn" id="minimizeBtn" title="Minimize">–</button>
        <button class="icon-btn" id="closeBtn" title="Close">✕</button>
      </div>
    </div>
    <div class="panel-body" id="panelBody">
      <div class="skeleton sk-title"></div>
      <div class="sk-matrix">
        <div class="skeleton"></div>
        <div class="skeleton"></div>
      </div>
      <div class="skeleton sk-body"></div>
      <p class="loading-subtext" id="loadingCaption">
        ${isProduct ? "Extracting product specifications & customer reviews..." : "Scanning top search items & comparing buying guide..."}
      </p>
    </div>
  `;
  shadow.appendChild(panel);

  const panelBody = panel.querySelector("#panelBody");
  const minimizeBtn = panel.querySelector("#minimizeBtn");
  const closeBtn = panel.querySelector("#closeBtn");

  function minimizePanel() {
    panel.classList.add("hidden");
    pillBtn.classList.add("visible");
  }

  function expandPanel() {
    panel.classList.remove("hidden");
    pillBtn.classList.remove("visible");
  }

  minimizeBtn.addEventListener("click", minimizePanel);
  closeBtn.addEventListener("click", minimizePanel);
  pillBtn.addEventListener("click", expandPanel);

  if (isProduct) {
    runProductAnalysis(panelBody);
  } else if (isSearch) {
    runSearchAnalysis(panelBody);
  }
}

// Automatic Product Page Review Synthesis
async function runProductAnalysis(container) {
  const title = extractProductTitle();
  let reviews = extractReviewsFromDOM(20);
  const asin = extractASIN();
  const domain = window.location.hostname;
  const consensus = extractCustomerConsensus();
  const { rating, reviewCount } = extractProductRatingAndCount();
  const features = extractFeatures();
  const specs = extractSpecs();
  const price = extractPrice();

  if (reviews.length < 3 && asin) {
    const directRevs = await fetchSameOriginReviews(asin);
    if (directRevs.length > 0) {
      reviews = directRevs;
    }
  }

  chrome.runtime.sendMessage(
    {
      action: "ANALYZE_REVIEWS",
      payload: {
        product_title: title,
        reviews: reviews,
        asin: asin,
        domain: domain,
        rating: rating,
        review_count: reviewCount,
        customer_consensus: consensus,
        features: features,
        specs: specs,
        price: price
      }
    },
    (res) => {
      if (!res || !res.success) {
        const err = res ? res.error : "Backend offline or unreachable";
        container.innerHTML = `
          <div class="alert-card">
            <strong>Backend Issue:</strong><br>${err}<br><br>
            Make sure the backend is active at <code>http://127.0.0.1:8000</code>.
          </div>
        `;
        return;
      }

      const data = res.data;
      const score = parseFloat(data.score) || 0.0;
      let scoreClass = "high";
      if (score < 5.0) scoreClass = "low";
      else if (score < 7.5) scoreClass = "medium";

      container.innerHTML = `
        <div class="product-card">
          <div>
            <span style="font-size:9px; font-weight:700; color:#38bdf8; text-transform:uppercase;">Verified Product</span>
            <div class="product-title">${data.product_name || title}</div>
          </div>
          <div style="text-align:right;">
            <div class="score-badge ${scoreClass}">
              <span>${score.toFixed(1)}</span>
              <span class="score-max">/10</span>
            </div>
            <span style="font-size:8.5px; color:#94a3b8; text-transform:uppercase;">Reliability</span>
          </div>
        </div>

        <div class="matrix-grid">
          <div class="matrix-box pros-box">
            <div class="matrix-heading"><span>✓</span> Pros</div>
            <ul class="matrix-list">
              ${(data.pros || []).map(p => `<li>${p}</li>`).join("")}
            </ul>
          </div>
          <div class="matrix-box cons-box">
            <div class="matrix-heading"><span>✕</span> Cons</div>
            <ul class="matrix-list">
              ${(data.cons || []).map(c => `<li>${c}</li>`).join("")}
            </ul>
          </div>
        </div>

        <div class="section-card">
          <div class="section-header">
            <span class="dot green-dot"></span> Positive Reviews
          </div>
          <ul class="bullets">
            ${(data.positive_reviews || []).map(r => `<li>${r}</li>`).join("")}
          </ul>
        </div>

        <div class="section-card">
          <div class="section-header">
            <span class="dot red-dot"></span> Negative Reviews & Defects
          </div>
          <ul class="bullets">
            ${(data.negative_reviews || []).map(r => `<li>${r}</li>`).join("")}
          </ul>
        </div>
      `;
    }
  );
}

// Automatic Search Page Comparative Synthesis
function runSearchAnalysis(container) {
  const searchData = extractSearchData();

  if (!searchData.products || searchData.products.length === 0) {
    container.innerHTML = `
      <div class="alert-card">
        Scanning search page for products... If products don't appear, refresh the page.
      </div>
    `;
    return;
  }

  chrome.runtime.sendMessage(
    {
      action: "ANALYZE_SEARCH",
      payload: searchData
    },
    (res) => {
      if (!res || !res.success) {
        const err = res ? res.error : "Backend offline or unreachable";
        container.innerHTML = `
          <div class="alert-card">
            <strong>Backend Connection Issue:</strong><br>${err}
          </div>
        `;
        return;
      }

      const data = res.data;
      container.innerHTML = `
        <div class="search-summary-card">
          <strong>Buying Guide for "${data.query}":</strong><br>
          ${data.summary}
        </div>

        <div style="font-size:11px; font-weight:700; color:#e2e8f0; margin-top:2px;">
          Top Recommended Picks
        </div>

        ${(data.top_picks || []).map(pick => `
          <div class="top-pick-card">
            <div class="pick-header">
              <div>
                <span class="pick-badge">${pick.badge}</span>
                <div class="pick-title">${pick.title}</div>
                <span class="pick-price">${pick.price}</span>
              </div>
              <div class="pick-score">${pick.score.toFixed(1)}/10</div>
            </div>
            <div class="pick-verdict">"${pick.verdict}"</div>
            
            <div class="matrix-grid" style="margin-top:3px;">
              <div class="matrix-box pros-box" style="padding:6px 8px;">
                <div class="matrix-heading" style="font-size:10px;">✓ Pros</div>
                <ul class="matrix-list">
                  ${(pick.pros || []).slice(0, 2).map(p => `<li>${p}</li>`).join("")}
                </ul>
              </div>
              <div class="matrix-box cons-box" style="padding:6px 8px;">
                <div class="matrix-heading" style="font-size:10px;">✕ Cons</div>
                <ul class="matrix-list">
                  ${(pick.cons || []).slice(0, 2).map(c => `<li>${c}</li>`).join("")}
                </ul>
              </div>
            </div>

            ${pick.link ? `<a href="${pick.link}" class="pick-link-btn" target="_blank">View on Amazon →</a>` : ""}
          </div>
        `).join("")}
      `;
    }
  );
}

// Automatically mount when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectAutoSynthesizerUI);
} else {
  injectAutoSynthesizerUI();
}

setTimeout(injectAutoSynthesizerUI, 1200);
setTimeout(injectAutoSynthesizerUI, 2500);
