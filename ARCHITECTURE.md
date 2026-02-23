# Ad War Room — Architecture & Implementation Reference

A complete walkthrough of every decision made building this project: what was built, why, and how each piece works.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Why](#2-tech-stack--why)
3. [Project Scaffold (Step 0)](#3-project-scaffold-step-0)
4. [Database Layer — `database.js` (Step 1)](#4-database-layer--databasejs-step-1)
5. [Backend Server — `server.js` (Step 2)](#5-backend-server--serverjs-step-2)
6. [Frontend Components — `src/` (Step 3)](#6-frontend-components--src-step-3)
7. [Deployment Config (Step 4)](#7-deployment-config-step-4)
8. [Key Implementation Decisions](#8-key-implementation-decisions)
9. [Data Flow Diagram](#9-data-flow-diagram)
10. [Environment Variables Reference](#10-environment-variables-reference)
11. [Bugs Fixed During Build](#11-bugs-fixed-during-build)

---

## 1. Project Overview

**Ad War Room** is a competitive ad intelligence dashboard for Mosaic Wellness. Mosaic runs three health/wellness brands:

| Brand | Category |
|---|---|
| Man Matters | Men's grooming, hair care, sexual wellness |
| Bebodywise | Women's hygiene, period care, nutrition |
| Little Joys | Baby/kids personal care |

The dashboard tracks 12 competitor brands across these verticals by pulling their active Meta (Facebook/Instagram) ads via the ScrapeCreators API, feeding the data into Google Gemini for AI analysis, and displaying structured insights in a React dashboard.

**Why this matters:** Knowing which competitor ads run for 60+ days (battle-tested creatives) and detecting their messaging shifts helps Mosaic's brand teams avoid wasting ad spend and identify positioning gaps.

---

## 2. Tech Stack & Why

| Layer | Choice | Reason |
|---|---|---|
| **Frontend** | React + Vite | Industry-standard SPA framework; Vite is fast in dev (HMR) and produces small production bundles |
| **Styling** | Tailwind CSS v3 | Utility-first CSS; no separate stylesheet to maintain; perfect for rapid dashboard UI |
| **Backend** | Node.js + Express 5 | Lightweight API server; easy Railway deployment; async-native for concurrent API calls |
| **Database** | SQLite via `better-sqlite3` | Zero-config file database; synchronous API is perfect for simple cache reads; no external DB service |
| **AI** | Google Gemini 2.5 Flash | Fastest Gemini model with large context window; handles 100+ ads in a single prompt |
| **Data** | ScrapeCreators API | Purpose-built Meta Ad Library scraper; returns normalised ad objects |
| **Charts** | Recharts | React-native charting library; no extra config; works out-of-the-box with JSX |
| **Deployment** | Railway | Auto-detects `railway.json`; supports Node.js + SQLite natively; free tier available |
| **Dev runner** | `concurrently` | Runs backend (port 3001) and Vite dev server (port 5173) in parallel with one command |

---

## 3. Project Scaffold (Step 0)

### What was created

```
ad-war-room/
├── CLAUDE.md           ← Created FIRST per spec (AI assistant rules)
├── package.json        ← npm project + all scripts
├── index.html          ← Vite HTML entry (loads Inter font)
├── vite.config.js      ← Vite config + /api proxy to localhost:3001
├── tailwind.config.js  ← Tailwind with custom brand colors
├── postcss.config.js   ← Required by Tailwind
├── .env.example        ← Template for env vars
└── .gitignore          ← Excludes node_modules, dist, .env, *.db
```

### Why CLAUDE.md first?

CLAUDE.md is the AI assistant's rule file — it persists the critical constraints across sessions:
- Never call Gemini on every page load (minimum 1hr cache)
- 60+ day ads = Proven Performer badge
- Always fall back to SAMPLE_ADS
- Strip markdown fences from Gemini JSON output

### Vite proxy config

```js
// vite.config.js
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
    }
  }
}
```

In development, the React app runs on port 5173. Any fetch to `/api/...` from the browser is transparently proxied to the Express server on port 3001. This means the frontend code uses `/api/...` paths everywhere — works in both dev and production without changes.

### Package.json scripts

```json
{
  "dev":   "concurrently \"node server.js\" \"vite\"",
  "build": "vite build",
  "start": "node server.js"
}
```

- `npm run dev` starts both servers simultaneously
- `npm run build` compiles React → `dist/`
- `node server.js` in production reads `dist/` and serves it

---

## 4. Database Layer — `database.js` (Step 1)

### Why SQLite?

This app is a single-server deployment (Railway). We don't need concurrent writes from multiple processes. SQLite with `better-sqlite3` is:
- **Synchronous** — no async/await overhead for cache reads
- **Zero-config** — just a file on disk (`ad_war_room.db`)
- **Sufficient** — we're caching JSON, not running analytics

### Schema

```sql
-- Caches raw ad arrays per competitor
CREATE TABLE ads_cache (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT    NOT NULL,
  ad_data      TEXT    NOT NULL,   -- JSON array
  fetched_at   INTEGER NOT NULL    -- Unix timestamp (seconds)
);

-- Stores Gemini-generated intelligence briefs
CREATE TABLE ai_briefs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  brief_data     TEXT    NOT NULL,   -- JSON object
  created_at     INTEGER NOT NULL,
  ad_count       INTEGER NOT NULL DEFAULT 0,
  brands_covered TEXT    NOT NULL DEFAULT ''
);
```

### Key functions

| Function | What it does |
|---|---|
| `getCachedAds(company, maxAgeHours)` | Returns cached ads for a company if fresher than `maxAgeHours`. Returns `null` on miss. |
| `saveAds(company, ads)` | Deletes old entries for the company first, then inserts fresh data. Keeps the table lean. |
| `saveAiBrief(brief, adCount, brandsCovered)` | Appends a new Gemini brief row (never overwrites — keeps history) |
| `getLatestBrief()` | Returns the most recent brief row |
| `clearAdsCache(company)` | Clears one company's cache, or all if `'*'` passed |

### WAL mode

```js
db.pragma('journal_mode = WAL');
```

WAL (Write-Ahead Logging) allows concurrent reads while a write is happening — important because the Express server may be reading the cache while another request writes to it.

---

## 5. Backend Server — `server.js` (Step 2)

### Competitor list

Hardcoded in `COMPETITORS` object — 12 competitors across 3 brands:

```js
const COMPETITORS = {
  'Man Matters':  [beardo, ustraa, bombayshavingcompany, themancompany, vedix],
  'Bebodywise':   [nuawoman, peesafe, sironahygiene, mycarmesi],
  'Little Joys':  [mamaearth, themomsco, meemee],
};
```

### ScrapeCreators API integration

**Correct endpoint (discovered during build):**
```
GET https://api.scrapecreators.com/v1/facebook/adLibrary/search/ads
```

Note the camelCase `adLibrary` and `/search/` prefix — the obvious `adlibrary/ads` path returns 404.

**Parameters:**
```js
params: {
  query: companyName,  // e.g. "beardo"
  status: 'ACTIVE',   // only active ads
  country: 'ALL',
  ad_type: 'all',
}
headers: { 'x-api-key': SCRAPE_API_KEY }
```

**Response normalization:** The API returns `{ searchResults: [...] }`. Each ad has:
- `snapshot.body.text` — ad copy
- `snapshot.cards[]` — creative elements (image/video/CTA)
- `start_date`, `end_date` — Unix timestamps (seconds, not milliseconds!)
- `is_active` — boolean
- `publisher_platforms` — array like `['facebook', 'instagram']`

The server maps this to a flat internal shape with `daysRunning` computed client-side.

### Caching strategy

| Data | TTL | Why |
|---|---|---|
| Ad data per competitor | 6 hours | Meta ad library updates aren't real-time; 6h is fresh enough |
| AI briefs | ≥ 1 hour (enforced in code) | Gemini calls are expensive and slow; never call on every page load |
| GET /api/brief | Re-triggers if > 7 days | Weekly intelligence cadence |

### Fallback to SAMPLE_ADS

If `SCRAPECREATORS_API_KEY` is missing or any API call fails:
```js
if (!SCRAPE_API_KEY) return null;  // skip API, use fallback
// ...
if (ads && ads.length > 0) {
  saveAds(company, ads);
} else {
  ads = SAMPLE_ADS.filter(a => a.companyName === company);
}
```

This means the app works 100% in demo mode — no keys needed.

### Gemini integration

**Model used:** `gemini-2.5-flash` (determined by testing available models — `gemini-1.5-flash` is deprecated, `gemini-2.0-flash` had quota issues)

**Critical pattern — strip markdown fences:**

Gemini sometimes wraps its JSON in ````json ... ```` even when told not to. The `stripMarkdownFences` function handles this:

```js
function stripMarkdownFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}
```

**Two-attempt retry:**
1. Full prompt with detailed output spec → try to parse JSON
2. If parse fails → simpler prompt with fewer fields → try again
3. If both fail → return hardcoded fallback brief (UI always has data)

### Parallel competitor fetching

`GET /api/ads/all` processes competitors in batches of 3:

```js
const BATCH_SIZE = 3;
for (let i = 0; i < companies.length; i += BATCH_SIZE) {
  const batch = companies.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(async (company) => { ... }));
}
```

This avoids overwhelming the ScrapeCreators API (rate limits) while still being faster than sequential requests.

### Express 5 catch-all route fix

Express 5 removed support for bare `*` as a path wildcard. The production catch-all (for React Router) must use:
```js
// Express 5 syntax — NOT app.get('*', ...)
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});
```

---

## 6. Frontend Components — `src/` (Step 3)

### Component tree

```
App.jsx                    ← Root: state, fetching, filtering, layout
├── Header.jsx             ← Title, last-updated, Refresh button
├── FilterBar.jsx          ← Brand tabs + secondary filters (sticky)
├── KPICards.jsx           ← 4 metric cards (total, active, avg days, longest)
├── AIInsightsPanel.jsx    ← Gemini insights (left 60%) + brief/shifts (right 40%)
├── CreativeTrendsChart.jsx ← Recharts horizontal BarChart
├── AdLongevityTable.jsx   ← Top-10 ranked table with Proven Performer badges
├── AdGrid.jsx             ← Responsive 4/2/1 col grid
│   └── AdCard.jsx         ← Individual ad card
└── HowItWorks (inline)    ← 5-step horizontal flow in App.jsx
```

### App.jsx — State management

All data state lives in App. Child components are pure/presentational:

```js
const [ads, setAds] = useState([]);           // raw ads from API
const [brief, setBrief] = useState(null);     // Gemini brief
const [selectedBrand, setSelectedBrand] = useState('All');
const [formatFilter, setFormatFilter] = useState('all');
const [statusFilter, setStatusFilter] = useState('all');
const [sortBy, setSortBy] = useState('daysRunning');
```

Filtered ads computed with `useMemo` to avoid recomputation on every render:

```js
const filteredAds = useMemo(() => {
  let result = [...ads];
  if (selectedBrand !== 'All') result = result.filter(a => a.brandLabel === selectedBrand);
  if (formatFilter !== 'all') result = result.filter(a => a.mediaType === formatFilter);
  if (statusFilter === 'active') result = result.filter(a => a.isActive);
  result.sort(sortFn);
  return result;
}, [ads, selectedBrand, formatFilter, statusFilter, sortBy]);
```

### FilterBar.jsx — Sticky filters

The `sticky top-0 z-10` classes make the filter bar stay visible when scrolling through the ad grid. Brand tabs have color-coded active states matching brand identity colors.

### KPICards.jsx — Derived metrics

All 4 KPIs are computed from the current filtered `ads` array:
- **Total Ads:** `ads.length`
- **Active Ads:** `ads.filter(a => a.isActive).length`
- **Avg Days:** mean of all `daysRunning` values
- **Longest Running:** `ads.reduce((max, a) => a.daysRunning > max.daysRunning ? a : max)`

### AIInsightsPanel.jsx — Two-column layout

- Left 60%: Top Insights list with priority badges (red/amber/green)
- Right 40%: Weekly Brief prose + Messaging Shifts cards
- Loading: skeleton animation (gray pulsing blocks)
- Empty state: "Run AI analysis →" call to action

### CreativeTrendsChart.jsx — Recharts

Uses a horizontal `BarChart` with `layout="vertical"` — bars extend right, labels on left. This is more readable than vertical bars for trend names.

```jsx
<BarChart data={chartData} layout="vertical">
  <XAxis type="number" />
  <YAxis type="category" dataKey="trend" />
  <Bar dataKey="count">
    {chartData.map((entry, i) => (
      <Cell fill={BRAND_COLORS[entry.brand] || FORMAT_COLORS[entry.trend]} />
    ))}
    <LabelList dataKey="percentage" position="right" formatter={v => `${v}%`} />
  </Bar>
</BarChart>
```

Falls back to computing format distribution from raw ads if Gemini trends aren't available.

### AdLongevityTable.jsx — Proven Performer detection

```js
// 60+ days = Proven Performer (gold badge)
// 30-59 days = Gaining Traction (blue badge)
// <30 days = New (gray badge)
function PerformanceBadge({ daysRunning }) {
  if (daysRunning >= 60) return <span className="bg-amber-100 text-amber-700">🏆 Proven Performer</span>
  ...
}
```

Row background: `bg-amber-50/40` for proven performers — subtle gold tint.

### AdCard.jsx — Brand color system

Each card has a 4px top border in the brand's color:
```js
const BRAND_BORDER = {
  'Man Matters': 'border-t-blue-500',
  'Bebodywise':  'border-t-pink-500',
  'Little Joys': 'border-t-green-500',
};
```

### How It Works section

5-step horizontal flow explaining the full data pipeline from Meta → ScrapeCreators → SQLite cache → Gemini → Dashboard. Renders as a vertical stack on mobile, horizontal row on `lg+` screens.

---

## 7. Deployment Config (Step 4)

### railway.json

```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm run build && node server.js",
    "healthcheckPath": "/api/competitors",
    "healthcheckTimeout": 300
  }
}
```

- **NIXPACKS:** Railway's auto-detector — it reads `package.json` and sets up Node.js automatically
- **startCommand:** builds the React app on each deploy, then starts Express
- **healthcheckPath:** Railway pings `/api/competitors` to confirm the server is running before routing traffic

### Production mode in Express

When `NODE_ENV=production`, the Express server serves the compiled React app:

```js
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}
```

This means in production, only one server (port 3001) handles everything — no separate static host needed.

---

## 8. Key Implementation Decisions

### Decision 1: Flat ad shape (internal normalization)

Rather than working with ScrapeCreators' nested response format everywhere, the `fetchAdsFromAPI` function normalizes all ad data into a flat internal shape. This means:
- Components don't need to know about `snapshot.cards[0].body` — they just use `ad.body`
- Mock data (`SAMPLE_ADS`) uses the same shape → seamless fallback
- Future data source changes only require updating one function

### Decision 2: Cache-first, fetch-second

Every data fetch follows: check SQLite → if fresh, return it → if stale/missing, hit API → save to SQLite → return. This pattern means:
- After first load, the dashboard is near-instant (reading from SQLite)
- ScrapeCreators rate limits are respected
- App works offline after first successful fetch

### Decision 3: Gemini analysis on the backend

The AI analysis happens on the server, not in the browser. This:
- Hides the Gemini API key (never exposed to client)
- Allows server-side caching of the response
- Avoids re-running expensive analysis on every page load

### Decision 4: Fallback brief (never fail)

The `/api/analyze` endpoint catches all Gemini errors and returns a hardcoded fallback brief. The UI always has data to display — it doesn't break if Gemini is down or quota-limited.

### Decision 5: useMemo for filtering

Filtering 100+ ads on every render would be wasteful. `useMemo` ensures the filtered+sorted array is only recomputed when filter state actually changes, not on unrelated re-renders.

---

## 9. Data Flow Diagram

```
User's Browser
     │
     │  GET /api/ads/all
     ▼
Express Server (port 3001)
     │
     ├─ Check SQLite ads_cache
     │   ├─ HIT (< 6hr old) ──────────────────────────► Return cached JSON
     │   └─ MISS
     │       │
     │       ├─ SCRAPE_API_KEY present?
     │       │   ├─ YES → GET scrapecreators.com/v1/facebook/adLibrary/search/ads
     │       │   │            └─ Normalize → Save to SQLite → Return
     │       │   └─ NO  → Filter SAMPLE_ADS → Return
     │       └─ API fails → Filter SAMPLE_ADS → Return
     │
     │  POST /api/analyze
     ▼
Express Server
     │
     ├─ Check ai_briefs (< 1hr old) ───────────────────► Return cached brief
     │
     ├─ Gather ads (from cache or SAMPLE_ADS)
     │
     └─ POST generativelanguage.googleapis.com (Gemini 2.5 Flash)
         │
         ├─ Strip markdown fences from response
         ├─ JSON.parse
         ├─ FAIL → retry with simplified prompt
         ├─ FAIL again → return hardcoded fallback brief
         └─ SUCCESS → Save to ai_briefs → Return to client
```

---

## 10. Environment Variables Reference

| Variable | Used in | What it does |
|---|---|---|
| `SCRAPECREATORS_API_KEY` | `server.js` | Enables live Meta ad fetching. Absent → demo mode |
| `GEMINI_API_KEY` | `server.js` | Enables AI analysis. Absent → hardcoded fallback brief |
| `PORT` | `server.js` | Server listen port (default: 3001) |
| `NODE_ENV` | `server.js` | If `production`, serves `dist/` static files |

---

## 11. Bugs Fixed During Build

### Bug 1: Unescaped apostrophes in single-quoted strings

**Problem:** JavaScript string literals like `'India's #1 Brand'` cause `SyntaxError`.

**Fix:** Changed affected strings to double-quoted: `"India's #1 Brand"`.

**Lesson:** Always use template literals or double quotes when ad copy may contain apostrophes.

---

### Bug 2: Wrong ScrapeCreators endpoint

**Problem:** Used `adlibrary` (lowercase) → 404.

**Fix:** Correct path is `adLibrary` (camelCase) + `/search/ads`:
```
GET /v1/facebook/adLibrary/search/ads
```

**Discovery method:** Direct curl + checking HTTP status codes.

---

### Bug 3: Deprecated Gemini model

**Problem:** `gemini-1.5-flash` → 404 (model no longer available in v1beta).

**Fix:** Listed available models via `GET /v1beta/models` → found `gemini-2.5-flash`.

---

### Bug 4: Express 5 wildcard route

**Problem:** `app.get('*', handler)` throws `PathError` in Express 5.

**Fix:** Express 5 requires explicit parameter syntax:
```js
app.get('/{*path}', handler)
```

---

### Bug 5: ScrapeCreators timestamps in seconds not milliseconds

**Problem:** `new Date(ad.start_date)` gave dates in 1970 (Unix 0 + small offset).

**Fix:** ScrapeCreators returns Unix seconds, not milliseconds:
```js
const startDate = new Date(startTs * 1000).toISOString().split('T')[0];
```

---

### Bug 6: Gemini free tier quota = 0 for gemini-2.0-flash

**Problem:** Free tier had 0 quota for `gemini-2.0-flash`, causing 429 on every call.

**Fix:** Switched to `gemini-2.5-flash` which worked on the same API key.

---

*This document covers every file, every decision, and every bug encountered during the build. For deployment instructions, see README.md.*
