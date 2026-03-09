# Ad War Room — Mosaic Wellness Competitive Intelligence

> **Live demo:** [ad-war-room.vercel.app](https://ad-war-room.vercel.app)

A 3-page competitive ad intelligence wizard for Mosaic Wellness brands — **Man Matters**, **Bebodywise**, and **Little Joys**. Pulls live Meta ad data for 27 competitors, runs AI analysis via Google Gemini 2.5 Flash, surfaces Reddit consumer gaps, and presents everything in a filterable React dashboard.

---

## Features

| Feature | Description |
|---|---|
| **Live Ad Data** | Fetches active Meta (Facebook/Instagram) ads for 27 competitors via the ScrapeCreators API |
| **AI Intelligence Brief** | Gemini 2.5 Flash analyses selected ads — weekly brief, creative trends, messaging shifts, threat level |
| **Ad Scoring** | Scores each ad across 5 dimensions: Hook Strength, CTA Clarity, Emotional Pull, Format Fit, Message Clarity |
| **Video Script Generator** | AI-generated ready-to-brief video script based on highest-scoring ads |
| **Gap Radar** | Reddit pulse analysis — surfaces unmet consumer needs competitors are NOT addressing |
| **Smart Caching** | SQLite caches ads (6hr), AI briefs (1hr), ad scores (1hr), Reddit data (2hr), competitor profiles (24hr) |
| **Proven Performer Badge** | Ads running 60+ days auto-flagged with a gold badge |
| **View Ad Links** | Direct links to the live Meta Ad Library for each real ad |
| **Demo Mode** | Falls back to sample data automatically if API keys are missing |
| **Mobile Responsive** | Adapts across desktop, tablet, and mobile |

---

## Pages

| Route | Page | Description |
|---|---|---|
| `/` | Intelligence Hub | Browse & select competitor ads (zero AI output) |
| `/analysis` | Analysis | AI brief, ad scoring, creative trends, longevity table, video script |
| `/gaps` | Gap Radar | Reddit pulse, consumer complaints, gap opportunities |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, React Router v6, Tailwind CSS, Vite |
| Backend | Node.js, Express |
| AI | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| Database | SQLite via `@libsql/client` (caching only) |
| Data | ScrapeCreators Meta Ad Library API |
| Charts | Recharts |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Environment Variables

```bash
cp .env.example .env
```

| Variable | Where to Get It | Required? |
|---|---|---|
| `SCRAPECREATORS_API_KEY` | [scrapecreators.com](https://scrapecreators.com) | Optional — falls back to sample data |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) — free tier | Optional — AI features disabled without it |
| `PORT` | Defaults to `3001` | No |
| `NODE_ENV` | `development` or `production` | No |

---

## Running Locally

**Prerequisites:** Node.js 18+, npm 9+

```bash
# Clone and install
git clone https://github.com/Taran-25/Ad-War-Room.git
cd Ad-War-Room
npm install

# Configure environment
cp .env.example .env
# Add your API keys (or leave blank for demo mode)

# Start backend + frontend in parallel
npm run dev
```

- Backend API: `http://localhost:3001`
- Frontend: `http://localhost:5173`

---

## Deployment

**Frontend** — Vercel
**Backend** — Render (or any Node.js host)

Set the following env vars on your backend host:
- `SCRAPECREATORS_API_KEY`
- `GEMINI_API_KEY`
- `NODE_ENV=production`

Set `VITE_API_URL` on Vercel pointing to your backend URL.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/competitors` | Competitor list grouped by brand |
| `GET` | `/api/ads/cached` | All SQLite-cached ads (no API call) |
| `GET` | `/api/ads/:companyName` | Fetch + cache ads for one competitor (6hr TTL) |
| `POST` | `/api/ads/fetch` | Selectively re-fetch expired/missing competitors |
| `POST` | `/api/analyze` | Run Gemini weekly analysis (1hr cache) |
| `POST` | `/api/score-ads` | Score selected ads on 5 dimensions (1hr cache) |
| `GET` | `/api/competitor-profile/:name` | AI one-line competitor summary (24hr cache) |
| `GET` | `/api/reddit/:brand` | Reddit pulse + gap opportunities (2hr cache) |
| `POST` | `/api/refresh` | Clear cache — body `{ "company": "beardo" }` or `{}` for all |
| `GET` | `/api/cache-status` | Cache metadata for all 27 competitors |

---

## Project Structure

```
ad-war-room/
├── server.js           # Express backend (all API routes + Gemini integration)
├── database.js         # SQLite helpers (5 tables, cache read/write)
├── vite.config.js      # Vite config — proxies /api → localhost:3001 in dev
├── vercel.json         # Vercel SPA rewrite config
├── .env.example        # Environment variable template
└── src/
    ├── main.jsx        # React entry + AdsProvider
    ├── App.jsx         # Route shell
    ├── context/
    │   └── AdsContext.jsx       # Global state (selectedAds, allAds, briefs, scores)
    ├── components/
    │   ├── Layout.jsx           # Navbar, step progress, floating ? help modal
    │   ├── AdCard.jsx           # Selectable ad card with View Ad link
    │   ├── AdGrid.jsx           # Responsive ad grid
    │   ├── FilterBar.jsx        # Brand/format/sort filters
    │   ├── AdLongevityTable.jsx # Top 10 longest-running ads
    │   ├── CreativeTrendsChart.jsx
    │   ├── KPICards.jsx
    │   ├── AIInsightsPanel.jsx
    │   └── Bold.jsx / BoldText  # Keyword highlight components
    └── pages/
        ├── IntelligenceHub.jsx  # Page 1 — ad browsing & selection
        ├── Analysis.jsx         # Page 2 — AI brief, scoring, trends
        └── GapRadar.jsx         # Page 3 — Reddit gap analysis
```
