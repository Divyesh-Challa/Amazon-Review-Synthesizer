# AZ-Scout

An AI-powered shopping assistant and Chrome browser extension built with JavaScript, FastAPI, Python, SQLite, and Google Gemini.

It analyzes verified customer reviews on Amazon product and search pages to calculate an objective reliability score, check product durability, detect hijacked listings, and filter out carrier delays and promotional noise.

## Features

- Automatic review extraction on Amazon product pages
- Normalized reliability scoring on a 0 to 10 scale
- Pros and cons summary
- Authenticity check and hijacked listing detection
- Long-term durability and defect rate forecasting
- Search results buying guide and multi-page recommendations
- Interactive review Q&A (Ask the Reviews)
- Head-to-head product comparisons (VS mode)
- User accounts, saved searches, and price tracking stored in SQLite

## Tech Stack

- JavaScript (Chrome Extension Manifest V3)
- FastAPI
- Python 3.9+
- SQLite
- Google Gemini API

## Requirements

Install these before running the project:

- Python 3.9+
- Google Chrome (or any Chromium-based browser)
- Git
- Google Gemini API key

## 1. Clone the Project

Clone the repository:

```bash
git clone https://github.com/Divyesh-Challa/amazon-review-synthesizer.git
cd amazon-review-synthesizer
```

## 2. Backend Setup

Open a terminal in the project folder:

```bash
cd backend
```

Create a Python virtual environment:

On macOS/Linux:
```bash
python3 -m venv venv
source venv/bin/activate
```

On Windows:
```bash
python -m venv venv
venv\Scripts\activate
```

Install the required Python packages:

```bash
pip install -r requirements.txt
```

## 3. Configure Environment Variables

Create a .env file inside the backend directory:

```bash
cp .env.example .env
```

Open .env and set your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
LLM_PROVIDER=gemini
```

A free API key can be generated at Google AI Studio: https://aistudio.google.com/

## 4. Start the Backend

Make sure your virtual environment is activated.

Run:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend API will run at:

http://127.0.0.1:8000

Interactive OpenAPI documentation is available at:

http://127.0.0.1:8000/docs

Keep this terminal running.

## 5. Install the Chrome Extension

1. Open Google Chrome and go to:

```text
chrome://extensions/
```

2. Toggle on Developer mode in the top right corner.
3. Click Load unpacked.
4. Select the extension directory from this repository.
5. The AZ-Scout extension is now active.

## 6. Using the Application

1. Open Amazon and navigate to any product listing page.
2. The AZ-Scout drawer will open on the right side with the reliability score, authenticity check, durability forecast, and pros and cons.
3. On Amazon search pages (for example, searching "mechanical keyboard"), AZ-Scout aggregates and ranks top products with filters for price and rating.
4. Click the extension icon in the browser toolbar anytime to inspect or trigger analysis manually.

## Project Structure

```text
amazon-review-synthesizer/
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   ├── auth.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── schemas.py
│   │   └── synthesizer.py
│   ├── data/
│   │   └── synthesizer.db
│   ├── requirements.txt
│   ├── manage_admin.py
│   ├── .env.example
│   └── .env
├── extension/
│   ├── icons/
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   └── manifest.json
└── README.md
```

## Database

The project uses SQLite to store user accounts, favorites, saved searches, and price snapshots. No separate database server is required.

The database file is created automatically when the backend starts:

```text
backend/data/synthesizer.db
```

## Troubleshooting

Backend won't start:
Make sure the virtual environment is activated:
```bash
source venv/bin/activate
```
Then install dependencies:
```bash
pip install -r requirements.txt
```

Invalid API Key:
Check that your GEMINI_API_KEY is correctly set in backend/.env.

Extension not connecting to backend:
Make sure the backend terminal is running at http://127.0.0.1:8000. If deployed to cloud (e.g., Render), update API_BASE in extension/background.js to your Render HTTPS URL.

## License

This project is licensed under the MIT License.
