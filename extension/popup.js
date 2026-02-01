/**
 * Amazon Review Synthesizer - Popup Controller
 */

const API_ENDPOINT = "http://127.0.0.1:8000/api/v1/analyze";

// Elements
const readyState = document.getElementById("readyState");
const loadingState = document.getElementById("loadingState");
const successState = document.getElementById("successState");
const errorState = document.getElementById("errorState");

const statusIndicator = document.getElementById("statusIndicator");
const productTitlePreview = document.getElementById("productTitlePreview");
const analyzeBtn = document.getElementById("analyzeBtn");
const reanalyzeBtn = document.getElementById("reanalyzeBtn");

const errorTitle = document.getElementById("errorTitle");
const errorMessage = document.getElementById("errorMessage");

const resProductName = document.getElementById("resProductName");
const resScoreBadge = document.getElementById("resScoreBadge");
const resScoreValue = document.getElementById("resScoreValue");
const resProsList = document.getElementById("resProsList");
const resConsList = document.getElementById("resConsList");
const resPositivesList = document.getElementById("resPositivesList");
const resNegativesList = document.getElementById("resNegativesList");

function showState(state) {
  readyState.classList.add("hidden");
  loadingState.classList.add("hidden");
  successState.classList.add("hidden");
  errorState.classList.add("hidden");

  if (state === "ready") {
    readyState.classList.remove("hidden");
    statusIndicator.textContent = "Ready";
    statusIndicator.className = "status-indicator";
  } else if (state === "loading") {
    loadingState.classList.remove("hidden");
    statusIndicator.textContent = "Synthesizing...";
    statusIndicator.className = "status-indicator";
  } else if (state === "success") {
    successState.classList.remove("hidden");
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
  return /\/s(\?|\/)/i.test(url);
}

// Initialize popup on open
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.url) {
      showError("Browser Error", "Unable to detect active tab URL.");
      return;
    }

    if (isAmazonSearchPage(tab.url)) {
      showError(
        "Search Results Page Detected",
        "You are currently viewing Amazon search results. Please click into any specific product (such as one of the keyboards on the page) to open its product page, then click this extension again to synthesize its reviews."
      );
      return;
    }

    if (!isAmazonProductPage(tab.url)) {
      showError(
        "Not an Amazon Product Page",
        "Please navigate to an individual Amazon product detail page (e.g. /dp/... or /gp/product/...) to synthesize its reviews."
      );
      return;
    }

    // Try reading title from tab or clean up preview
    const cleanTitle = tab.title ? tab.title.replace(/amazon(\.ca|\.com)?\s*:\s*/i, "").split(":")[0].trim() : "Amazon Product";
    productTitlePreview.textContent = cleanTitle;
    showState("ready");
  } catch (err) {
    showError("Extension Initialization Error", err.message);
  }
});

// Trigger review extraction and API synthesis
async function runAnalysis() {
  showState("loading");

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      throw new Error("Unable to identify active browser tab.");
    }

    // Request review extraction from content script
    let extractionResponse;
    try {
      extractionResponse = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_REVIEWS" });
    } catch (e) {
      // In case content script hasn't injected yet (e.g. freshly opened tab)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      extractionResponse = await chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_REVIEWS" });
    }

    if (!extractionResponse || !extractionResponse.success) {
      const msg = extractionResponse ? extractionResponse.message : "Failed to communicate with page.";
      showError("Extraction Notice", msg);
      return;
    }

    const { title, reviews, emptyState } = extractionResponse;

    if (emptyState || !reviews || reviews.length === 0) {
      showError(
        "No Reviews Found",
        "This product listing does not appear to have customer review text available on the page."
      );
      return;
    }

    // Transmit review payload to backend
    let apiData;
    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          product_title: title,
          reviews: reviews
        })
      });

      if (!response.ok) {
        const errorDetail = await response.text();
        throw new Error(`Backend error (${response.status}): ${errorDetail}`);
      }

      apiData = await response.json();
    } catch (fetchErr) {
      showError(
        "Backend Service Offline",
        `Could not connect to ${API_ENDPOINT}. Please make sure the FastAPI backend is running (run 'uvicorn app.main:app --reload' in the backend directory).`
      );
      return;
    }

    // Render results in success view
    renderResults(apiData);
    showState("success");

  } catch (err) {
    showError("Analysis Error", err.message || "An unexpected error occurred.");
  }
}

function renderResults(data) {
  resProductName.textContent = data.product_name || "Product Analysis";
  
  // Score badge & coloring
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

analyzeBtn.addEventListener("click", runAnalysis);
reanalyzeBtn.addEventListener("click", runAnalysis);
