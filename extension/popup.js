/**
 * Amazon Review Synthesizer - Popup Controller
 */

// State Elements
const readyState = document.getElementById("readyState");
const loadingState = document.getElementById("loadingState");
const successProductState = document.getElementById("successProductState");
const successSearchState = document.getElementById("successSearchState");
const errorState = document.getElementById("errorState");

const statusIndicator = document.getElementById("statusIndicator");
const previewLabel = document.getElementById("previewLabel");
const productTitlePreview = document.getElementById("productTitlePreview");
const analyzeBtn = document.getElementById("analyzeBtn");
const analyzeBtnText = document.getElementById("analyzeBtnText");
const loadingCaption = document.getElementById("loadingCaption");

const reanalyzeProductBtn = document.getElementById("reanalyzeProductBtn");
const reanalyzeSearchBtn = document.getElementById("reanalyzeSearchBtn");

const errorTitle = document.getElementById("errorTitle");
const errorMessage = document.getElementById("errorMessage");

// Product View Elements
const resProductName = document.getElementById("resProductName");
const resScoreBadge = document.getElementById("resScoreBadge");
const resScoreValue = document.getElementById("resScoreValue");
const resProsList = document.getElementById("resProsList");
const resConsList = document.getElementById("resConsList");
const resPositivesList = document.getElementById("resPositivesList");
const resNegativesList = document.getElementById("resNegativesList");

// Search View Elements
const searchSummaryText = document.getElementById("searchSummaryText");
const searchPicksContainer = document.getElementById("searchPicksContainer");

let currentPageType = "unknown"; // "product", "search", "other"

function showState(state) {
  readyState.classList.add("hidden");
  loadingState.classList.add("hidden");
  successProductState.classList.add("hidden");
  successSearchState.classList.add("hidden");
  errorState.classList.add("hidden");

  if (state === "ready") {
    readyState.classList.remove("hidden");
    statusIndicator.textContent = "Ready";
    statusIndicator.className = "status-indicator";
  } else if (state === "loading") {
    loadingState.classList.remove("hidden");
    statusIndicator.textContent = "Synthesizing...";
    statusIndicator.className = "status-indicator";
  } else if (state === "success-product") {
    successProductState.classList.remove("hidden");
    statusIndicator.textContent = "Complete";
    statusIndicator.className = "status-indicator live";
  } else if (state === "success-search") {
    successSearchState.classList.remove("hidden");
    statusIndicator.textContent = "Complete";
    statusIndicator.className = "status-indicator live";
  } else if (state === "error") {
    errorState.classList.remove("hidden");
    statusIndicator.textContent = "Notice";
    statusIndicator.className = "status-indicator";
  }
}

function showError(title, msg) {
  errorTitle.textContent = title;
  errorMessage.textContent = msg;
  showState("error");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isAmazonDomain(url) {
  if (!url) return false;
  return /amazon\.(com|ca|co\.uk|de|fr|it|es|co\.jp|in|com\.au|com\.mx)/i.test(url);
}

function isAmazonProductPage(url) {
  if (!isAmazonDomain(url)) return false;
  return /\/(dp|gp\/product)\/[A-Z0-9]+/i.test(url);
}

function isAmazonSearchPage(url) {
  if (!isAmazonDomain(url)) return false;
  return /\/s(\?|\/)|[?&]k=/i.test(url);
}

// Initialize popup on open
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.url || !isAmazonDomain(tab.url)) {
      showError(
        "Not an Amazon Page",
        "Please navigate to an Amazon product detail page or search page to use the synthesizer."
      );
      return;
    }

    if (isAmazonProductPage(tab.url)) {
      currentPageType = "product";
      previewLabel.textContent = "Detected Product";
      const cleanTitle = tab.title ? tab.title.replace(/amazon(\.ca|\.com)?\s*:\s*/i, "").split(":")[0].trim() : "Amazon Product";
      productTitlePreview.textContent = cleanTitle;
      analyzeBtnText.textContent = "Analyze Reviews";
      showState("ready");
    } else if (isAmazonSearchPage(tab.url)) {
      currentPageType = "search";
      previewLabel.textContent = "Detected Search Results";
      const urlParams = new URLSearchParams(new URL(tab.url).search);
      const query = urlParams.get("k") || "Amazon Search";
      productTitlePreview.textContent = `Search Query: "${query}"`;
      analyzeBtnText.textContent = "Synthesize Top Products";
      showState("ready");
    } else {
      showError(
        "Navigate to a Product or Search",
        "Open a specific Amazon product listing or search for products (e.g. 'speakers', 'keyboards') to run synthesis."
      );
    }
  } catch (err) {
    showError("Extension Initialization Error", err.message);
  }
});

// Run Analysis Trigger
async function runAnalysis() {
  showState("loading");

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      throw new Error("Unable to identify active browser tab.");
    }

    // Product Page Analysis
    if (currentPageType === "product") {
      loadingCaption.textContent = "Extracting verified customer reviews & analyzing...";

      let extractionResponse;
      try {
        extractionResponse = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_REVIEWS" });
      } catch (e) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        extractionResponse = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_REVIEWS" });
      }

      if (!extractionResponse || !extractionResponse.success) {
        throw new Error(extractionResponse ? extractionResponse.message : "Failed to extract product data.");
      }

      chrome.runtime.sendMessage(
        {
          action: "ANALYZE_REVIEWS",
          payload: {
            product_title: extractionResponse.title,
            reviews: extractionResponse.reviews,
            asin: extractionResponse.asin,
            domain: extractionResponse.domain
          }
        },
        (res) => {
          if (!res || !res.success) {
            showError("Backend Error", res ? res.error : "Backend offline at http://127.0.0.1:8000");
            return;
          }
          renderProductResults(res.data);
          showState("success-product");
        }
      );
    } 
    // Search Page Analysis
    else if (currentPageType === "search") {
      loadingCaption.textContent = "Analyzing top search products and comparing customer consensus...";

      let searchResponse;
      try {
        searchResponse = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_SEARCH" });
      } catch (e) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        searchResponse = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_SEARCH" });
      }

      if (!searchResponse || !searchResponse.success) {
        throw new Error(searchResponse ? searchResponse.message : "Failed to scan search products.");
      }

      chrome.runtime.sendMessage(
        {
          action: "ANALYZE_SEARCH",
          payload: {
            query: searchResponse.query,
            products: searchResponse.products
          }
        },
        (res) => {
          if (!res || !res.success) {
            showError("Backend Error", res ? res.error : "Backend offline at http://127.0.0.1:8000");
            return;
          }
          renderSearchResults(res.data);
          showState("success-search");
        }
      );
    }
  } catch (err) {
    showError("Analysis Notice", err.message || "An unexpected error occurred.");
  }
}

function renderProductResults(data) {
  resProductName.textContent = data.product_name || "Product Analysis";
  
  const score = parseFloat(data.score) || 0.0;
  resScoreValue.textContent = score.toFixed(1);
  
  resScoreBadge.className = "score-badge";
  if (score >= 7.5) {
    resScoreBadge.classList.add("high");
  } else if (score >= 5.0) {
    resScoreBadge.classList.add("medium");
  } else {
    resScoreBadge.classList.add("low");
  }

  // Pros
  resProsList.innerHTML = "";
  (data.pros || []).forEach(pro => {
    const li = document.createElement("li");
    li.textContent = pro;
    resProsList.appendChild(li);
  });

  // Cons
  resConsList.innerHTML = "";
  (data.cons || []).forEach(con => {
    const li = document.createElement("li");
    li.textContent = con;
    resConsList.appendChild(li);
  });

  // Positive Reviews
  resPositivesList.innerHTML = "";
  (data.positive_reviews || []).forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    resPositivesList.appendChild(li);
  });

  // Negative Reviews
  resNegativesList.innerHTML = "";
  (data.negative_reviews || []).forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    resNegativesList.appendChild(li);
  });
}

function renderSearchResults(data) {
  searchSummaryText.textContent = data.summary || "";
  searchPicksContainer.innerHTML = "";

  (data.top_picks || []).forEach(pick => {
    const card = document.createElement("div");
    card.className = "product-preview";
    card.style.background = "#1e293b";
    card.style.border = "1px solid #334155";
    card.style.padding = "10px";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "6px";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div>
          <span class="preview-tag" style="color:#60a5fa;">${pick.badge}</span>
          <div style="font-size:12px; font-weight:700; color:#f1f5f9; line-height:1.3;">${pick.title}</div>
          <span style="font-size:11px; font-weight:700; color:#38bdf8;">${pick.price}</span>
        </div>
        <div style="font-size:15px; font-weight:800; color:#34d399; background:#064e3b; border:1px solid #10b981; padding:3px 7px; border-radius:6px; white-space:nowrap;">
          ${pick.score.toFixed(1)}/10
        </div>
      </div>
      <div style="font-size:11px; color:#cbd5e1; font-style:italic;">"${pick.verdict}"</div>
      ${pick.link ? `<a href="${pick.link}" target="_blank" style="align-self:flex-start; background:#2563eb; color:#fff; text-decoration:none; padding:4px 10px; border-radius:4px; font-size:10.5px; font-weight:600; margin-top:3px;">View on Amazon →</a>` : ""}
    `;
    searchPicksContainer.appendChild(card);
  });
}

analyzeBtn.addEventListener("click", runAnalysis);
reanalyzeProductBtn.addEventListener("click", runAnalysis);
reanalyzeSearchBtn.addEventListener("click", runAnalysis);
