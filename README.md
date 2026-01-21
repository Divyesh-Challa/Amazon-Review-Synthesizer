# 🛍️ Amazon Review Synthesizer

[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python&logoColor=white)](https://python.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An intelligent, AI-powered browser extension and microservice that transforms cluttered, sponsored, and noisy Amazon customer reviews into objective product intelligence. 

In under 2.5 seconds, it filters out logistics complaints and promotional bias, outputting an actionable breakdown: a **Normalized Reliability Score (0–10)**, high-level **Pros & Cons**, and verified **Defect & Highlight Callouts**.

---

## 🎯 The Problem

Online shoppers face decision fatigue and deceptive review signals on major e-commerce platforms:
- **Review Noise**: Sifting through hundreds of promotional five-star ratings and one-star delivery complaints obscures actual product durability.
- **Logistics Bias**: Negative reviews often penalize items for carrier delays or crushed outer boxes rather than product defects.
- **Search Overwhelm**: Comparing multiple candidate listings on a crowded search results page is manual, tedious, and error-prone.

**Amazon Review Synthesizer** automates review extraction and synthesis, applying strict evaluation guardrails so buyers can validate products in seconds.

---

## ✨ Features

- **⚡ Automatic On-Page Detection**: Sleek, non-intrusive on-page drawer automatically detects Amazon product and search pages—no manual toolbar clicking required.
- **📊 Normalized Reliability Score**: Evaluates genuine customer satisfaction and defect-free rates on an objective 0.0 to 10.0 scale.
- **⚖️ Pros & Cons Matrix**: Clean, side-by-side view summarizing functional strengths, material quality, and real-world trade-offs.
- **🛡️ Intelligent Guardrails**: Disregards shipping delays and carrier issues; prioritizes recurring hardware, battery, or build quality flaws.
- **🔍 Search Page Buying Guide**: Automatically compares top listings across search queries (e.g., *"mechanical keyboard"*, *"speakers"*), highlighting top-recommended picks with instant buyer verdicts.
- **🔒 Privacy & Sanitization**: Strips personal identifiable information (PII), tracking URLs, emojis, and marketing noise before analysis.

---

## ⚙️ How It Works

```
[ Amazon Webpage ] ──> [ Content Script ] ──> [ Background Worker ] ──> [ FastAPI Microservice ]
   (PDP / Search)      (Scrapes & Cleans)     (Bypasses Mixed-CSP)         (Sanitizes & Truncates)
                                                                                   │
                                                                                   ▼
[ On-Page Dark UI ] <─────────────────────────────────────────────────────── [ LLM Synthesis ]
(Score, Matrix, Bullets)                                                     (Strict JSON Schema)
```

1. **Client Extraction**: Content scripts extract product titles, verified customer review nodes, star ratings, and metadata from Amazon listings.
2. **Sanitization**: Backend sanitizers deduplicate repetitive text, redact emails/phone numbers, and normalize whitespace.
3. **Structured LLM Inference**: An LLM pipeline evaluates inputs under strict system constraints, enforcing a deterministic JSON schema.
4. **Client Presentation**: Results render instantly in a high-contrast slate dark theme (`#0f172a`) with smooth animations and skeleton loaders.

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.9+**
- **Google Chrome** (or any Chromium-based browser)

### 1. Backend Service Setup

```bash
# Clone the repository
git clone https://github.com/Divyesh-Challa/amazon-review-synthesizer.git
cd amazon-review-synthesizer/backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env

# Launch the FastAPI microservice
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API will be live at `http://127.0.0.1:8000`. Interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

### 2. Chrome Extension Installation

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/` directory from this repository.
5. The **Review Synthesizer** extension is now active.

---

## 💻 Usage

- **Product Pages**: Navigate to any Amazon product listing (e.g., `/dp/...`). The synthesizer panel will automatically appear on the right with the reliability score, pros & cons, and review highlights.
- **Search Pages**: Search for any product category (e.g., *"headphones"* or *"ergonomic chair"*). The extension automatically aggregates top search results into a curated buying guide.
- **Toolbar Popup**: Click the extension icon in your browser toolbar anytime to inspect or re-trigger synthesis manually.

---

## 🔧 Configuration

All backend parameters can be customized via `.env`:

| Parameter | Default | Description |
| :--- | :--- | :--- |
| `HOST` | `127.0.0.1` | API host address |
| `PORT` | `8000` | API port |
| `LLM_PROVIDER` | `gemini` | Synthesis engine (`gemini` or `mock`) |
| `GEMINI_API_KEY` | `""` | API key for Gemini inference models |
| `MAX_REVIEWS` | `15` | Maximum review sample size per listing |
| `MAX_CHARS_PER_REVIEW` | `600` | Maximum character cap per review |

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
