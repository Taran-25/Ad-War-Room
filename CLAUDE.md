# Ad War Room — CLAUDE.md

## Project
3-page competitive ad intelligence wizard for Mosaic Wellness (Man Matters, Bebodywise, Little Joys).

## Tech Stack
- Frontend: React + React Router v6 + Tailwind CSS (Vite, NO TypeScript)
- Backend: Node.js + Express
- AI: Google Gemini 2.5 Flash (`@google/generative-ai`)
- Database: SQLite (`better-sqlite3`) — caching only
- Data: ScrapeCreators Meta Ad Library API
- Charts: Recharts

## Page Structure
- `/`         → Page 1: Intelligence Hub (brand cards, competitor profiles, selectable ad grid — ZERO AI output)
- `/analysis` → Page 2: Analysis (KPIs, weekly brief, creative trends, longevity, scoring, video script)
- `/gaps`     → Page 3: Gap Radar (Reddit pulse, consumer complaints, gap opportunities)

## Critical Rules
1. NEVER call Gemini on every page load — cache responses (competitor profiles: 24hr, briefs: 1hr, scores: 1hr, reddit: 2hr)
2. 60+ day ads must show "Proven Performer" gold badge
3. Always fall back to SAMPLE_ADS if ScrapeCreators API key is missing or fails
4. Gemini returns raw JSON — ALWAYS strip markdown backticks before JSON.parse
5. Mobile responsive at all breakpoints
6. "How It Works" only appears in Layout's floating ? modal — NOT on any page
7. Gap detection prompt: frame as what competitors are NOT doing
8. Page 1 has NO AI output — competitor profiles are fetched lazily from /api/competitor-profile/:companyName
9. selectedAds in AdsContext flows from Page 1 → Page 2 (required). If empty on Page 2, redirect to /

## Brand Colors
- Man Matters: #1D4ED8 (blue)
- Bebodywise: #DB2777 (pink)
- Little Joys: #16A34A (green)
- Proven Performer badge: #F59E0B (amber/gold)
- Background: #F8F9FA

## Bold Keywords
Use `<BoldText text={str} />` from `src/utils/boldKeywords.jsx` for AI-generated text blocks.
Use `<Bold>` component for static JSX text.
Keywords auto-bolded: "Proven Performer", "Hook Strength", "CTA", "Gap Opportunity", "Active Ads",
"Days Running", "Video Script", "Unmet Need", "Weekly Brief", "Sentiment", "Creative Trends",
"Messaging Shift", "Threat Level", "Opportunity", "Insight", "Direct", "Indirect"

## Competitors (tiered)
```
Man Matters (direct):    trayahealth, boldcare, rxmen
Man Matters (indirect):  bombayshavingcompany, beardo, ustraa, themancompany
Man Matters (adjacent):  kapiva, fastandup, healthkart

Bebodywise (direct):     gynoveda, oziva, nuawoman, kindlife
Bebodywise (indirect):   theminimalist, dotandkey, wowskinscienceindia
Bebodywise (peripheral): plumgoodness, pilgrimbeauty, mcaffeine

Little Joys (direct):      babychakra, themomsco, mylo
Little Joys (productLed):  himalayababycare, sebamedbaby, chiccoindia
Little Joys (platform):    firstcry
```

## API Endpoints
- GET  /api/competitors               — hardcoded competitor list by brand
- GET  /api/ads/:companyName          — fetch + cache ads (6hr TTL)
- GET  /api/ads/all                   — all competitors in parallel (max 3 concurrent)
- POST /api/analyze                   — run Gemini weekly analysis, cache for 1hr minimum
- GET  /api/brief                     — return latest brief (trigger fresh if >7 days)
- POST /api/refresh                   — clear cache for company or all
- GET  /api/competitor-profile/:name  — 1-sentence AI summary per competitor (24hr cache)
- POST /api/score-ads                 — score selected ads on 5 dimensions (1hr cache)
- GET  /api/reddit/:brand             — Reddit pulse + gap opportunities (2hr cache)

## Database Tables
- ads_cache: company ad data (6hr TTL)
- ai_briefs: Gemini weekly briefs (1hr minimum TTL)
- competitor_profiles: 1-sentence AI summaries (24hr TTL)
- ad_score_cache: ad scoring results keyed by sorted ad IDs (1hr TTL)
- reddit_cache: Reddit gap analysis per brand (2hr TTL)

## File Structure
```
ad-war-room/
├── server.js           # Express backend (all API routes)
├── database.js         # SQLite helpers (5 tables, 12 helper functions)
├── src/
│   ├── main.jsx        # BrowserRouter + AdsProvider wrapper
│   ├── App.jsx         # Routes shell only
│   ├── index.css
│   ├── context/
│   │   └── AdsContext.jsx   # selectedAds, allAds, selectedBrand, lastUpdated, usingMock
│   ├── components/
│   │   ├── Layout.jsx           # Navbar (step progress) + Outlet + floating ? button
│   │   ├── Bold.jsx             # Keyword highlight span
│   │   ├── AdCard.jsx           # selectable + selected + onSelect props
│   │   ├── AdGrid.jsx           # selectable + selectedIds + onSelect props
│   │   ├── FilterBar.jsx        # + competitors, selectedCompetitor, minDaysRunning, onClearFilters
│   │   ├── KPICards.jsx         # (untouched)
│   │   ├── AIInsightsPanel.jsx  # (untouched)
│   │   ├── CreativeTrendsChart.jsx # (untouched)
│   │   ├── AdLongevityTable.jsx # (untouched)
│   │   └── Header.jsx           # (kept, unused — Layout replaces it)
│   └── pages/
│       ├── IntelligenceHub.jsx  # Page 1
│       ├── Analysis.jsx         # Page 2
│       └── GapRadar.jsx         # Page 3
├── vite.config.js
├── railway.json
└── .env.example
```
