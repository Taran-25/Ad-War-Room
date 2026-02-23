# Ad War Room — Mosaic Wellness Competitive Intelligence

> Submitted for **Mosaic Fellowship 2026 Builder Challenge**

A production-ready competitive ad intelligence dashboard that pulls live Meta ad data for competitors of Man Matters, Bebodywise, and Little Joys, runs AI analysis via Google Gemini 1.5 Flash, and presents everything in a filterable React dashboard.

---

## What It Does

| Feature | Description |
|---|---|
| **Live Ad Data** | Fetches active Meta (Facebook/Instagram) ads for 12 competitors using the ScrapeCreators API |
| **AI Intelligence Brief** | Gemini 2.0 Flash analyses all ads and returns structured insights: top observations, messaging shifts, creative trends, and opportunity gaps |
| **Smart Caching** | SQLite caches ad data for 6 hours and AI briefs for ≥1 hour — no redundant API calls |
| **Proven Performer Detection** | Ads running 60+ days are automatically flagged with a gold "Proven Performer" badge |
| **Demo Mode** | Works fully without any API keys using realistic sample data |
| **Mobile Responsive** | Adapts across desktop (4-col), tablet (2-col), and mobile (1-col) |

---

## Environment Variables

Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

| Variable | Where to Get It | Required? |
|---|---|---|
| `SCRAPECREATORS_API_KEY` | [scrapecreators.com](https://scrapecreators.com) — sign up for API access | Optional (demo mode without it) |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) — free tier available | Optional (fallback insights without it) |
| `PORT` | Set to `3001` by default | No |
| `NODE_ENV` | `development` or `production` | No |

---

## Running Locally

### Prerequisites
- Node.js 18+
- npm 9+

### Steps

```bash
# 1. Clone / navigate to the project
cd ad-war-room

# 2. Install dependencies
npm install

# 3. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your API keys (or leave blank for demo mode)

# 4. Start both backend + frontend in parallel
npm run dev
```

- Backend API: `http://localhost:3001`
- Frontend dashboard: `http://localhost:5173`

Visit `http://localhost:5173` — the dashboard loads with mock data even without API keys.

---

## Deploying to Railway

### One-click deploy

1. Push your code to a GitHub repository
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repository
4. In the Railway dashboard → Variables → add your env vars:
   - `SCRAPECREATORS_API_KEY`
   - `GEMINI_API_KEY`
   - `NODE_ENV=production`
5. Railway auto-detects `railway.json` and runs `npm run build && node server.js`
6. Your app is live at the auto-generated Railway URL

### What happens in production
- `npm run build` compiles the React app into `dist/`
- `node server.js` serves the Express API on the configured `PORT`
- When `NODE_ENV=production`, Express also serves `dist/` at `/` — single server, no separate static host needed

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/competitors` | Returns hardcoded competitor list grouped by Mosaic brand |
| `GET` | `/api/ads/:companyName` | Fetch + cache ads for one competitor (6hr TTL) |
| `GET` | `/api/ads/all` | Fetch all competitors in parallel (max 3 concurrent), returns flat array |
| `POST` | `/api/analyze` | Run Gemini analysis on cached ads; returns and saves brief |
| `GET` | `/api/brief` | Return latest brief (triggers fresh if >7 days old) |
| `POST` | `/api/refresh` | Clear cache — body `{ "company": "beardo" }` or empty `{}` for all |

---

## Project Structure

```
ad-war-room/
├── server.js              # Express backend — all API routes + Gemini integration
├── database.js            # SQLite helpers (ads_cache + ai_briefs tables)
├── index.html             # Vite HTML entry point (loads Inter font)
├── vite.config.js         # Vite config — proxies /api → localhost:3001
├── tailwind.config.js     # Tailwind config — custom brand colors
├── railway.json           # Railway deployment config
├── .env.example           # Environment variable template
├── .gitignore
├── package.json
└── src/
    ├── main.jsx           # React entry point
    ├── index.css          # Tailwind base + custom scrollbar
    ├── App.jsx            # Root orchestrator — state, fetching, filtering
    └── components/
        ├── Header.jsx              # App title, last-updated, Refresh button
        ├── FilterBar.jsx           # Brand tabs + format/status/sort filters
        ├── KPICards.jsx            # 4 summary metric cards
        ├── AIInsightsPanel.jsx     # Gemini insights + weekly brief + shifts
        ├── CreativeTrendsChart.jsx # Recharts horizontal bar chart
        ├── AdLongevityTable.jsx    # Ranked table with Proven Performer badges
        ├── AdCard.jsx              # Individual ad card
        └── AdGrid.jsx              # Responsive 4/2/1 col grid of AdCards
```

---

## Tech Stack Decisions

| Choice | Why |
|---|---|
| **Vite + React** | Fast HMR in dev, tiny production builds, no TypeScript overhead |
| **Express** | Lightweight, well-understood, easy to deploy on Railway |
| **better-sqlite3** | Synchronous SQLite — no async overhead for simple cache reads |
| **Gemini 2.0 Flash** | Fast, cheap, large context window — handles 50 ads comfortably |
| **Recharts** | Works natively in React, no extra bundle overhead |
| **Railway** | Supports Node.js + SQLite natively, free tier available, `railway.json` auto-detected |

---

## Brands & Competitors Tracked

| Mosaic Brand | Competitors Monitored |
|---|---|
| Man Matters | Beardo, Ustraa, Bombay Shaving Company, The Man Company, Vedix |
| Bebodywise | Nua Woman, Pee Safe, Sirona, Carmesi |
| Little Joys | Mamaearth, The Moms Co, Mee Mee |
