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

  const footer = document.createElement("div");
  footer.style.fontSize = "10px";
  footer.style.color = "#64748b";
  footer.style.textAlign = "center";
  footer.style.padding = "6px 0";
  footer.style.fontStyle = "italic";
  footer.textContent = `Showing all ${picks.length} curated products (scroll to explore)`;
  searchPicksContainer.appendChild(footer);
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


// --- Account & Storage Helpers ---
async function getStoredAuthToken() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["userToken"], (result) => {
        resolve(result ? result.userToken : null);
      });
    } else {
      resolve(localStorage.getItem("synth_token"));
    }
  });
}

async function setStoredAuth(token, user) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ userToken: token, currentUser: user }, resolve);
    } else {
      localStorage.setItem("synth_token", token);
      localStorage.setItem("synth_user", JSON.stringify(user));
      resolve();
    }
  });
}

async function clearStoredAuth() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(["userToken", "currentUser"], resolve);
    } else {
      localStorage.removeItem("synth_token");
      localStorage.removeItem("synth_user");
      resolve();
    }
  });
}

async function fetchMe() {
  const token = await getStoredAuthToken();
  if (!token) return null;
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "AUTH_ME", token }, (res) => {
      if (res && res.success) {
        resolve({ ...res.data, token });
      } else {
        clearStoredAuth();
        resolve(null);
      }
    });
  });
}

const popupAccountBtn = document.getElementById("popupAccountBtn");
const popupAccountOverlay = document.getElementById("popupAccountOverlay");
const closePopupAccountBtn = document.getElementById("closePopupAccountBtn");
const popupAccountNav = document.getElementById("popupAccountNav");
const popupAccountTabContent = document.getElementById("popupAccountTabContent");
const saveProductPopupBtn = document.getElementById("saveProductPopupBtn");
const popupSaveSearchBtn = document.getElementById("popupSaveSearchBtn");

if (popupAccountBtn) {
  popupAccountBtn.addEventListener("click", () => {
    popupAccountOverlay.classList.remove("hidden");
    renderPopupAccountDrawer();
  });
}

if (closePopupAccountBtn) {
  closePopupAccountBtn.addEventListener("click", () => {
    popupAccountOverlay.classList.add("hidden");
  });
}

async function renderPopupAccountDrawer() {
  const currentUser = await fetchMe();
  if (!currentUser) {
    popupAccountNav.innerHTML = `
      <button class="account-tab-btn active" data-tab="login">Sign In</button>
      <button class="account-tab-btn" data-tab="register">Create Account</button>
    `;

    function renderAuthForm(isRegister = false) {
      popupAccountTabContent.innerHTML = `
        <div style="font-size:11px; color:#cbd5e1; margin-bottom:10px;">
          ${isRegister ? "Create an account to save favorite items, track prices, and save searches." : "Sign in to access your saved items and search collections."}
        </div>
        ${isRegister ? `
          <div class="form-group">
            <label>Name</label>
            <input type="text" id="authNamePop" placeholder="Your name" />
          </div>
        ` : ""}
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="authEmailPop" placeholder="user@example.com" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="authPasswordPop" placeholder="••••••••" />
        </div>
        <div id="authErrorMsgPop" style="font-size:10.5px; color:#fb7185; margin:4px 0; min-height:16px;"></div>
        <button class="form-btn" id="submitAuthBtnPop">${isRegister ? "Create Account" : "Sign In"}</button>
      `;

      const submitBtn = popupAccountTabContent.querySelector("#submitAuthBtnPop");
      const errorMsg = popupAccountTabContent.querySelector("#authErrorMsgPop");

      submitBtn.addEventListener("click", () => {
        const email = popupAccountTabContent.querySelector("#authEmailPop").value.trim();
        const password = popupAccountTabContent.querySelector("#authPasswordPop").value;
        const name = isRegister ? popupAccountTabContent.querySelector("#authNamePop").value.trim() : "";

        if (!email || !password || (isRegister && !name)) {
          errorMsg.textContent = "Please fill in all required fields.";
          return;
        }

        submitBtn.textContent = "Processing...";
        submitBtn.disabled = true;

        const action = isRegister ? "AUTH_REGISTER" : "AUTH_LOGIN";
        const payload = isRegister ? { email, password, name } : { email, password };

        chrome.runtime.sendMessage({ action, payload }, async (res) => {
          submitBtn.disabled = false;
          submitBtn.textContent = isRegister ? "Create Account" : "Sign In";
          if (!res || !res.success) {
            errorMsg.textContent = res ? res.error : "Authentication failed.";
            return;
          }
          await setStoredAuth(res.data.token, res.data.user);
          renderPopupAccountDrawer();
        });
      });
    }

    renderAuthForm(false);

    popupAccountNav.querySelectorAll(".account-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        popupAccountNav.querySelectorAll(".account-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderAuthForm(btn.getAttribute("data-tab") === "register");
      });
    });
  } else {
    const isAdmin = currentUser.is_admin;
    popupAccountNav.innerHTML = `
      <button class="account-tab-btn active" data-tab="favorites">★ Favorites</button>
      <button class="account-tab-btn" data-tab="searches">🔍 Searches</button>
      ${isAdmin ? `<button class="account-tab-btn admin-tab" data-tab="admin">👑 Admin</button>` : ""}
      <button class="account-tab-btn" data-tab="logout" style="margin-left:auto;">Logout (${currentUser.name})</button>
    `;

    async function loadTab(tabName) {
      if (tabName === "logout") {
        await clearStoredAuth();
        renderPopupAccountDrawer();
        return;
      }

      if (tabName === "favorites") {
        popupAccountTabContent.innerHTML = `<p class="loading-subtext">Loading favorites...</p>`;
        chrome.runtime.sendMessage({ action: "FAVORITES_GET", token: currentUser.token }, (res) => {
          if (!res || !res.success) {
            popupAccountTabContent.innerHTML = `<div class="alert-card">Failed to load favorites.</div>`;
            return;
          }
          const favs = res.data || [];
          if (favs.length === 0) {
            popupAccountTabContent.innerHTML = `
              <div style="text-align:center; padding:20px; font-size:11px; color:#94a3b8;">
                No saved items yet. Click <strong>★ Save</strong> on recommendations to bookmark!
              </div>
            `;
            return;
          }
          popupAccountTabContent.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${favs.map(f => `
                <div class="product-preview" style="padding:8px 10px;">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                      <div style="font-size:11.5px; font-weight:700; color:#f8fafc;">${f.title}</div>
                      <span style="font-size:11px; color:#38bdf8; font-weight:700;">${f.price || "N/A"}</span>
                      ${f.score ? `<span style="font-size:10px; color:#34d399; margin-left:6px; font-weight:700;">${f.score.toFixed(1)}/10</span>` : ""}
                    </div>
                    <button class="icon-btn del-fav-pop" data-id="${f.id}" title="Remove" style="color:#f43f5e;">✕</button>
                  </div>
                  ${f.link ? `<a href="${f.link}" target="_blank" class="btn primary-btn" style="font-size:10px; padding:3px 8px; margin-top:4px; text-decoration:none;">View on Amazon →</a>` : ""}
                </div>
              `).join("")}
            </div>
          `;

          popupAccountTabContent.querySelectorAll(".del-fav-pop").forEach(btn => {
            btn.addEventListener("click", () => {
              const favId = btn.getAttribute("data-id");
              chrome.runtime.sendMessage({ action: "FAVORITES_DELETE", favorite_id: favId, token: currentUser.token }, () => {
                loadTab("favorites");
              });
            });
          });
        });
      }

      if (tabName === "searches") {
        popupAccountTabContent.innerHTML = `<p class="loading-subtext">Loading searches...</p>`;
        chrome.runtime.sendMessage({ action: "SAVED_SEARCHES_GET", token: currentUser.token }, (res) => {
          if (!res || !res.success) {
            popupAccountTabContent.innerHTML = `<div class="alert-card">Failed to load searches.</div>`;
            return;
          }
          const searches = res.data || [];
          if (searches.length === 0) {
            popupAccountTabContent.innerHTML = `
              <div style="text-align:center; padding:20px; font-size:11px; color:#94a3b8;">
                No saved searches yet. Click <strong>💾 Save Search</strong> in the Filter toolbar!
              </div>
            `;
            return;
          }
          popupAccountTabContent.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${searches.map(s => `
                <div class="product-preview" style="padding:8px 10px; display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <span class="preview-tag">Collection</span>
                    <strong style="font-size:12px; color:#f8fafc;">"${s.query}"</strong>
                  </div>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <a href="https://www.amazon.ca/s?k=${encodeURIComponent(s.query)}" target="_blank" class="btn primary-btn" style="font-size:9.5px; padding:2px 7px; text-decoration:none;">Search →</a>
                    <button class="icon-btn del-search-pop" data-id="${s.id}" title="Remove" style="color:#f43f5e;">✕</button>
                  </div>
                </div>
              `).join("")}
            </div>
          `;

          popupAccountTabContent.querySelectorAll(".del-search-pop").forEach(btn => {
            btn.addEventListener("click", () => {
              const sId = btn.getAttribute("data-id");
              chrome.runtime.sendMessage({ action: "SAVED_SEARCHES_DELETE", search_id: sId, token: currentUser.token }, () => {
                loadTab("searches");
              });
            });
          });
        });
      }

      if (tabName === "admin" && isAdmin) {
        popupAccountTabContent.innerHTML = `<p class="loading-subtext">Loading telemetry...</p>`;
        chrome.runtime.sendMessage({ action: "ADMIN_GET_METRICS", token: currentUser.token }, (res) => {
          if (!res || !res.success) {
            popupAccountTabContent.innerHTML = `<div class="alert-card">Admin access denied.</div>`;
            return;
          }
          const m = res.data;
          popupAccountTabContent.innerHTML = `
            <div style="margin-bottom:8px;">
              <span class="admin-badge">ADMIN CONSOLE</span>
              <div style="font-size:11.5px; font-weight:700; color:#f8fafc; margin-top:2px;">User Accounts & System Metrics</div>
            </div>

            <div class="metric-grid">
              <div class="metric-card">
                <div class="metric-val">${m.total_users}</div>
                <div class="metric-lbl">Registered Users</div>
              </div>
              <div class="metric-card">
                <div class="metric-val">${m.total_active_sessions}</div>
                <div class="metric-lbl">Active Sessions</div>
              </div>
              <div class="metric-card">
                <div class="metric-val">${m.total_favorites}</div>
                <div class="metric-lbl">Total Favorites</div>
              </div>
              <div class="metric-card">
                <div class="metric-val">${m.total_search_syntheses}</div>
                <div class="metric-lbl">Syntheses Executed</div>
              </div>
            </div>

            <div style="font-size:11px; font-weight:700; color:#e2e8f0; margin:8px 0 4px 0;">
              User Accounts Roster (${(m.recent_users || []).length})
            </div>
            <div style="max-height:140px; overflow-y:auto; border:1px solid #334155; border-radius:6px; background:#0f172a;">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Saved</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${(m.recent_users || []).map(u => `
                    <tr>
                      <td>
                        <strong>${u.name}</strong><br>
                        <span style="color:#94a3b8; font-size:8.5px;">${u.email}</span>
                      </td>
                      <td>${u.is_admin ? '<span class="admin-badge">Admin</span>' : '<span style="color:#94a3b8;">User</span>'}</td>
                      <td>${u.favorites_count} favs</td>
                      <td>
                        ${u.id !== currentUser.id ? `
                          <div style="display:flex; gap:3px;">
                            <button class="icon-btn toggle-admin-pop" data-id="${u.id}" title="${u.is_admin ? 'Demote to regular user' : 'Promote to Administrator'}" style="width:18px; height:18px; font-size:10px; color:${u.is_admin ? '#f59e0b' : '#38bdf8'};">${u.is_admin ? '★' : '☆'}</button>
                            <button class="icon-btn del-user-pop" data-id="${u.id}" title="Delete" style="width:18px; height:18px; font-size:9px; color:#f43f5e;">✕</button>
                          </div>
                        ` : `<span style="font-size:8.5px; color:#64748b;">(You)</span>`}
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `;

          popupAccountTabContent.querySelectorAll(".del-user-pop").forEach(btn => {
            btn.addEventListener("click", () => {
              const uId = btn.getAttribute("data-id");
              if (confirm(`Delete user ID ${uId}?`)) {
                chrome.runtime.sendMessage({ action: "ADMIN_DELETE_USER", user_id: uId, token: currentUser.token }, () => {
                  loadTab("admin");
                });
              }
            });
          });

          popupAccountTabContent.querySelectorAll(".toggle-admin-pop").forEach(btn => {
            btn.addEventListener("click", () => {
              const uId = btn.getAttribute("data-id");
              chrome.runtime.sendMessage({ action: "ADMIN_TOGGLE_USER", user_id: uId, token: currentUser.token }, () => {
                loadTab("admin");
              });
            });
          });
        });
      }
    }

    loadTab("favorites");

    popupAccountNav.querySelectorAll(".account-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        popupAccountNav.querySelectorAll(".account-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        loadTab(btn.getAttribute("data-tab"));
      });
    });
  }
}

if (saveProductPopupBtn) {
  saveProductPopupBtn.addEventListener("click", async () => {
    const user = await fetchMe();
    if (!user) {
      popupAccountOverlay.classList.remove("hidden");
      renderPopupAccountDrawer();
      return;
    }
    chrome.runtime.sendMessage({
      action: "FAVORITES_ADD",
      token: user.token,
      payload: {
        title: resProductName.textContent,
        price: "",
        score: parseFloat(resScoreValue.textContent) || 0,
        badge: "Verified Product"
      }
    }, (res) => {
      if (res && res.success) {
        saveProductPopupBtn.textContent = "★ Saved!";
        saveProductPopupBtn.classList.add("saved");
      }
    });
  });
}

if (popupSaveSearchBtn) {
  popupSaveSearchBtn.addEventListener("click", async () => {
    const user = await fetchMe();
    if (!user) {
      popupAccountOverlay.classList.remove("hidden");
      renderPopupAccountDrawer();
      return;
    }
    const tab = await getActiveTab();
    const urlParams = new URLSearchParams(new URL(tab.url).search);
    const query = urlParams.get("k") || "Amazon Search";
    chrome.runtime.sendMessage({
      action: "SAVED_SEARCHES_ADD",
      token: user.token,
      payload: {
        query: query,
        filters: {
          maxPrice: popupMaxPrice.value,
          minRating: popupMinRating.value,
          minReviews: popupMinReviews.value,
          keyword: popupKeyword.value
        }
      }
    }, (res) => {
      if (res && res.success) {
        popupSaveSearchBtn.textContent = "💾 Saved!";
        setTimeout(() => { popupSaveSearchBtn.textContent = "💾 Save Search"; }, 2000);
      }
    });
  });
}
