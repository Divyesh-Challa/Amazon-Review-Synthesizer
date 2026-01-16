# Amazon Review Synthesizer

An AI-powered Chrome Extension (Manifest V3) backed by a FastAPI microservice that extracts verified customer reviews from Amazon product detail pages, analyzes authentic product feedback, and outputs an objective breakdown:
- **Normalized Reliability Score** (0–10)
- **High-level Pros & Cons Matrix**
- **Bulleted Positive Customer Highlights**
- **Bulleted Defects, Failures & Negative Callouts**

---

## Architecture & Project Structure

```
amazon-review-synthesizer/
├── README.md
├── .gitignore
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py            # FastAPI service & CORS middleware
│   │   ├── config.py          # Environment settings & model parameters
│   │   ├── schemas.py         # Pydantic request/response data contracts
│   │   ├── sanitizer.py       # PII/emoji stripping, deduplication & truncation
│   │   └── synthesizer.py     # Gemini 1.5 Flash structured output + Mock mode
│   └── tests/
│       ├── __init__.py
│       ├── sample_reviews.json # Realistic test review fixtures
│       ├── test_api.py         # Full test suite (requires dependencies)
│       └── test_sanitizer_standalone.py # Zero-dependency standard library test
└── extension/
    ├── manifest.json          # Chrome Manifest V3 declaration
    ├── icons/                 # Extension icons (16px, 48px, 128px)
    ├── content.js             # Amazon PDP scraping & empty-state detection
    ├── popup.html             # Slate dark mode (#0f172a) UI layout
    ├── popup.css              # Styling, score badge styling & skeleton loader
    └── popup.js               # State management & backend API communication
```

---

## Free LLM Provider Setup

You indicated a preference for a provider offering free tier services. We recommend **Google Gemini 1.5 Flash**:
- **Free Quota**: 15 Requests Per Minute (RPM), 1,500 Requests Per Day (RPD), and 1 Million Tokens Per Minute (TPM).
- **Cost**: 100% Free with **no credit card required**.
- **Latency**: Sub-second inference time, satisfying the $< 2.5$s PRD latency target.

### Getting Your Free API Key
1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click **"Get API key"** and create a new key.
4. Copy your key into `backend/.env`:
   ```bash
   GEMINI_API_KEY=your_copied_api_key_here
   ```

*Note: If no API key is provided, the backend automatically uses an **offline heuristic mock mode** so you can develop and test the extension immediately without paying or setting up keys!*

---

## 🚀 Quickstart Guide

### 1. Start the Backend API

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# (Optional) Edit .env with your free GEMINI_API_KEY

# Run tests
python3 -m pytest tests/test_api.py

# Launch FastAPI server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API will be live at `http://127.0.0.1:8000`. You can test the interactive documentation at `http://127.0.0.1:8000/docs`.

### 2. Load the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **"Developer mode"** in the top-right corner.
3. Click **"Load unpacked"**.
4. Select the `extension/` directory from this project:
   `/Users/divyeshchalla/Documents/Projects/amazon-review-synthesizer/extension`
5. The **Review Synthesizer** icon will appear in your Chrome toolbar.

### 3. Usage

1. Navigate to any Amazon product page (e.g. `amazon.com/dp/...` or `amazon.ca/dp/...`).
2. Click the **Review Synthesizer** extension icon in your browser toolbar.
3. Click **"Analyze Reviews"**.
4. Within $< 2.5$ seconds, view the normalized score, pros & cons, and key positive and negative insights!
