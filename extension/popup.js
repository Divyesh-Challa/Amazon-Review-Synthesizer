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

const popupReviewFilterInput = document.getElementById("popupReviewFilterInput");
const productFilterChips = document.querySelectorAll("#successProductState .filter-chip");

// Search View Elements
const searchSummaryText = document.getElementById("searchSummaryText");
const searchPicksContainer = document.getElementById("searchPicksContainer");
const popupMaxPrice = document.getElementById("popupMaxPrice");
const popupMinRating = document.getElementById("popupMinRating");
const popupMinReviews = document.getElementById("popupMinReviews");
const popupKeyword = document.getElementById("popupKeyword");
const popupFilterCount = document.getElementById("popupFilterCount");

let currentPageType = "unknown"; // "product", "search", "other"
let currentProductData = null;
let currentSearchPicks = [];
let allScrapedSearchProducts = [];

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
            domain: extractionResponse.domain,
            rating: extractionResponse.rating,
            review_count: extractionResponse.review_count,
            customer_consensus: extractionResponse.customer_consensus,
            features: extractionResponse.features || [],
            specs: extractionResponse.specs || {},
            price: extractionResponse.price || ""
          }
        },
        (res) => {
          if (!res || !res.success) {
            showError("Backend Error", res ? res.error : "Backend offline at http://127.0.0.1:8000");
            return;
          }
          currentProductData = res.data;
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

      allScrapedSearchProducts = searchResponse.products || [];

      chrome.runtime.sendMessage(
        {
          action: "ANALYZE_SEARCH",
          payload: {
            query: searchResponse.query,
            products: allScrapedSearchProducts
          }
        },
        (res) => {
          if (!res || !res.success) {
            showError("Backend Error", res ? res.error : "Backend offline at http://127.0.0.1:8000");
            return;
          }
          currentSearchPicks = res.data.top_picks || [];
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

  updateProductReviewLists();
}

function updateProductReviewLists(keyword = "", topic = "all") {
  if (!currentProductData) return;
  const kw = keyword.toLowerCase().trim();

  function matches(text) {
    if (!text) return false;
    const t = text.toLowerCase();
    if (kw && !t.includes(kw)) return false;
    if (topic === "quality" && !t.includes("quality") && !t.includes("build") && !t.includes("material") && !t.includes("stand") && !t.includes("durab")) return false;
    if (topic === "performance" && !t.includes("perform") && !t.includes("speed") && !t.includes("sound") && !t.includes("screen") && !t.includes("hz") && !t.includes("display")) return false;
    if (topic === "price" && !t.includes("price") && !t.includes("cost") && !t.includes("value") && !t.includes("budget") && !t.includes("dollar")) return false;
    return true;
  }

  const pPros = (currentProductData.pros || []).filter(matches);
  const pCons = (currentProductData.cons || []).filter(matches);
  const pPos = (currentProductData.positive_reviews || []).filter(matches);
  const pNeg = (currentProductData.negative_reviews || []).filter(matches);

  resProsList.innerHTML = (pPros.length ? pPros : currentProductData.pros || []).map(p => `<li>${p}</li>`).join("");
  resConsList.innerHTML = (pCons.length ? pCons : currentProductData.cons || []).map(c => `<li>${c}</li>`).join("");
  resPositivesList.innerHTML = (pPos.length ? pPos : currentProductData.positive_reviews || []).map(r => `<li>${r}</li>`).join("");
  resNegativesList.innerHTML = (pNeg.length ? pNeg : currentProductData.negative_reviews || []).map(r => `<li>${r}</li>`).join("");
}

// Wire product review filter inputs
if (popupReviewFilterInput) {
  popupReviewFilterInput.addEventListener("input", (e) => {
    const activeChip = document.querySelector("#successProductState .filter-chip.active");
    const topic = activeChip ? activeChip.getAttribute("data-topic") : "all";
    updateProductReviewLists(e.target.value, topic);
  });
}

productFilterChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    productFilterChips.forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    const topic = chip.getAttribute("data-topic");
    const kw = popupReviewFilterInput ? popupReviewFilterInput.value : "";
    updateProductReviewLists(kw, topic);
  });
});

function renderSearchResults(data) {
  searchSummaryText.textContent = data.summary || "";
  renderFilteredPicks(data.top_picks || []);
}

function renderFilteredPicks(picks) {
  searchPicksContainer.innerHTML = "";
  if (!picks || picks.length === 0) {
    searchPicksContainer.innerHTML = `
      <div style="font-size:11px; color:#94a3b8; text-align:center; padding:12px;">
        No picks match your filter criteria. Try adjusting the price or rating thresholds.
      </div>
    `;
    return;
  }

  picks.forEach(pick => {
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

function applySearchFilters() {
  const maxPrice = parseFloat(popupMaxPrice.value) || Infinity;
  const minRating = parseFloat(popupMinRating.value) || 0;
  const minReviews = parseInt(popupMinReviews.value) || 0;
  const rawKw = (popupKeyword.value || "").toLowerCase().trim();
  const kwTerms = rawKw.split(/\s+/).filter(t => t.length > 0);

  const filtered = currentSearchPicks.filter(p => {
    // Check price
    if (maxPrice < Infinity && p.price) {
      const match = p.price.replace(/,/g, "").match(/(\d+(\.\d+)?)/);
      if (match && parseFloat(match[1]) > maxPrice) return false;
    }
    // Check score / rating
    if (minRating > 0 && p.score < (minRating * 2.0 - 0.5)) return false;
    // Check keyword
    if (kwTerms.length > 0) {
      const searchable = `${p.title || ""} ${p.badge || ""} ${p.verdict || ""} ${(p.pros || []).join(" ")}`.toLowerCase();
      const matchesAll = kwTerms.every(term => {
        if (searchable.includes(term)) return true;
        if (term === "anki" && searchable.includes("anker")) return true;
        return false;
      });
      if (!matchesAll) return false;
    }
    return true;
  });

  popupFilterCount.textContent = `${filtered.length} of ${currentSearchPicks.length} picks`;
  renderFilteredPicks(filtered);
}

[popupMaxPrice, popupMinRating, popupMinReviews, popupKeyword].forEach(input => {
  if (input) {
    input.addEventListener("input", applySearchFilters);
    input.addEventListener("change", applySearchFilters);
  }
});

analyzeBtn.addEventListener("click", runAnalysis);
reanalyzeProductBtn.addEventListener("click", runAnalysis);
reanalyzeSearchBtn.addEventListener("click", runAnalysis);
