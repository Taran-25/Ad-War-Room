/**
 * database.js
 * SQLite database layer using better-sqlite3.
 * Provides two tables:
 *   - ads_cache: caches raw ad data per competitor (6hr TTL used by server)
 *   - ai_briefs: stores Gemini-generated analysis briefs (1hr minimum TTL)
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'ad_war_room.db');

// Open (or create) the SQLite database file
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS ads_cache (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT    NOT NULL,
    ad_data      TEXT    NOT NULL,   -- JSON array of ad objects
    fetched_at   INTEGER NOT NULL    -- Unix timestamp (seconds)
  );

  CREATE INDEX IF NOT EXISTS idx_ads_company ON ads_cache (company_name);
  CREATE INDEX IF NOT EXISTS idx_ads_fetched ON ads_cache (fetched_at);

  CREATE TABLE IF NOT EXISTS ai_briefs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    brief_data     TEXT    NOT NULL,   -- JSON object returned by Gemini
    created_at     INTEGER NOT NULL,   -- Unix timestamp (seconds)
    ad_count       INTEGER NOT NULL DEFAULT 0,
    brands_covered TEXT    NOT NULL DEFAULT ''  -- comma-separated brand names
  );

  CREATE INDEX IF NOT EXISTS idx_briefs_created ON ai_briefs (created_at);

  CREATE TABLE IF NOT EXISTS competitor_profiles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    summary      TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_profiles_company ON competitor_profiles (company_name);

  CREATE TABLE IF NOT EXISTS ad_score_cache (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key  TEXT NOT NULL,
    score_data TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scores_key ON ad_score_cache (cache_key);

  CREATE TABLE IF NOT EXISTS reddit_cache (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    brand       TEXT NOT NULL,
    reddit_data TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reddit_brand ON reddit_cache (brand);
`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return cached ads for a company if fresher than maxAgeHours.
 * @param {string} company     - Competitor company name
 * @param {number} maxAgeHours - Maximum acceptable cache age in hours
 * @returns {Array|null} Parsed ad array or null if cache miss/expired
 */
function getCachedAds(company, maxAgeHours = 6) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  const row = db
    .prepare(
      `SELECT ad_data FROM ads_cache
       WHERE company_name = ? AND fetched_at > ?
       ORDER BY fetched_at DESC
       LIMIT 1`
    )
    .get(company, cutoff);

  if (!row) return null;
  try {
    return JSON.parse(row.ad_data);
  } catch {
    return null;
  }
}

/**
 * Save (or replace) ads for a company into the cache.
 * Deletes old entries for the same company to keep the table lean.
 * @param {string} company - Competitor company name
 * @param {Array}  ads     - Array of ad objects to cache
 */
function saveAds(company, ads) {
  const now = Math.floor(Date.now() / 1000);
  // Remove previous cache entries for this company
  db.prepare('DELETE FROM ads_cache WHERE company_name = ?').run(company);
  db.prepare(
    'INSERT INTO ads_cache (company_name, ad_data, fetched_at) VALUES (?, ?, ?)'
  ).run(company, JSON.stringify(ads), now);
}

/**
 * Persist a Gemini-generated brief.
 * @param {object} brief         - Parsed JSON brief from Gemini
 * @param {number} adCount       - Number of ads that were analyzed
 * @param {string} brandsCovered - Comma-separated list of brands
 */
function saveAiBrief(brief, adCount = 0, brandsCovered = '') {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO ai_briefs (brief_data, created_at, ad_count, brands_covered)
     VALUES (?, ?, ?, ?)`
  ).run(JSON.stringify(brief), now, adCount, brandsCovered);
}

/**
 * Return the most recently stored AI brief (any brand).
 * @returns {{ brief: object, created_at: number, ad_count: number, brands_covered: string }|null}
 */
function getLatestBrief() {
  const row = db
    .prepare(
      `SELECT brief_data, created_at, ad_count, brands_covered
       FROM ai_briefs
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get();

  if (!row) return null;
  try {
    return {
      brief: JSON.parse(row.brief_data),
      created_at: row.created_at,
      ad_count: row.ad_count,
      brands_covered: row.brands_covered,
    };
  } catch {
    return null;
  }
}

/**
 * Return the most recent brief for a specific brand key (brands_covered value),
 * if it was created within maxAgeHours.
 * @param {string} brand       - Exact brands_covered value (e.g. 'All', 'Man Matters')
 * @param {number} maxAgeHours - Maximum acceptable age in hours
 * @returns {{ brief: object, created_at: number, ad_count: number, brands_covered: string }|null}
 */
function getBriefByBrand(brand, maxAgeHours = 1) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  const row = db
    .prepare(
      `SELECT brief_data, created_at, ad_count, brands_covered
       FROM ai_briefs
       WHERE brands_covered = ? AND created_at > ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(brand, cutoff);

  if (!row) return null;
  try {
    return {
      brief: JSON.parse(row.brief_data),
      created_at: row.created_at,
      ad_count: row.ad_count,
      brands_covered: row.brands_covered,
    };
  } catch {
    return null;
  }
}

/**
 * Return cache metadata for a company regardless of age.
 * @param {string} company - Competitor company name
 * @returns {{ fetched_at: number|null, ad_count: number, has_data: boolean }}
 */
function getCacheStatus(company) {
  const row = db
    .prepare(
      `SELECT ad_data, fetched_at FROM ads_cache
       WHERE company_name = ?
       ORDER BY fetched_at DESC
       LIMIT 1`
    )
    .get(company);
  if (!row) return { fetched_at: null, ad_count: 0, has_data: false };
  let ad_count = 0;
  try { ad_count = JSON.parse(row.ad_data).length; } catch { /* empty */ }
  return { fetched_at: row.fetched_at, ad_count, has_data: true };
}

/**
 * Return cache metadata for multiple companies.
 * @param {string[]} companies
 * @returns {{ company: string, fetched_at: number|null, ad_count: number, has_data: boolean }[]}
 */
function getAllCacheStatuses(companies) {
  return companies.map((c) => ({ company: c, ...getCacheStatus(c) }));
}

/**
 * Return the most recently cached ads for a company regardless of age.
 * Used as a stale-cache fallback when the live API is unavailable.
 * @param {string} company - Competitor company name
 * @returns {Array|null} Parsed ad array or null if never cached
 */
function getCachedAdsAny(company) {
  const row = db
    .prepare(
      `SELECT ad_data FROM ads_cache
       WHERE company_name = ?
       ORDER BY fetched_at DESC
       LIMIT 1`
    )
    .get(company);

  if (!row) return null;
  try {
    return JSON.parse(row.ad_data);
  } catch {
    return null;
  }
}

/**
 * Clear cached ads for a specific company, or all companies if name is '*'.
 * @param {string} company - Company name or '*' for all
 */
function clearAdsCache(company) {
  if (company === '*') {
    db.prepare('DELETE FROM ads_cache').run();
  } else {
    db.prepare('DELETE FROM ads_cache WHERE company_name = ?').run(company);
  }
}

/**
 * Return cached competitor profile if fresher than maxAgeHours.
 */
function getCompetitorProfile(company, maxAgeHours = 24) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  const row = db
    .prepare(
      `SELECT summary, created_at FROM competitor_profiles
       WHERE company_name = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(company, cutoff);
  if (!row) return null;
  return { summary: row.summary, created_at: row.created_at };
}

/**
 * Save competitor profile — deletes old entry, inserts new.
 */
function saveCompetitorProfile(company, summary) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM competitor_profiles WHERE company_name = ?').run(company);
  db.prepare(
    'INSERT INTO competitor_profiles (company_name, summary, created_at) VALUES (?, ?, ?)'
  ).run(company, summary, now);
}

/**
 * Return cached ad scores if fresher than maxAgeHours.
 */
function getAdScores(cacheKey, maxAgeHours = 1) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  const row = db
    .prepare(
      `SELECT score_data FROM ad_score_cache
       WHERE cache_key = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(cacheKey, cutoff);
  if (!row) return null;
  try {
    return JSON.parse(row.score_data);
  } catch {
    return null;
  }
}

/**
 * Save ad scores for a given cache key.
 */
function saveAdScores(cacheKey, data) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO ad_score_cache (cache_key, score_data, created_at) VALUES (?, ?, ?)'
  ).run(cacheKey, JSON.stringify(data), now);
}

/**
 * Return cached Reddit data for a brand if fresher than maxAgeHours.
 */
function getRedditData(brand, maxAgeHours = 2) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  const row = db
    .prepare(
      `SELECT reddit_data FROM reddit_cache
       WHERE brand = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(brand, cutoff);
  if (!row) return null;
  try {
    return JSON.parse(row.reddit_data);
  } catch {
    return null;
  }
}

/**
 * Save Reddit data for a brand — deletes old entry, inserts new.
 */
function saveRedditData(brand, data) {
  const now = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM reddit_cache WHERE brand = ?').run(brand);
  db.prepare(
    'INSERT INTO reddit_cache (brand, reddit_data, created_at) VALUES (?, ?, ?)'
  ).run(brand, JSON.stringify(data), now);
}

module.exports = {
  getCachedAds, getCachedAdsAny, getCacheStatus, getAllCacheStatuses,
  saveAds, saveAiBrief, getLatestBrief, getBriefByBrand, clearAdsCache,
  getCompetitorProfile, saveCompetitorProfile,
  getAdScores, saveAdScores,
  getRedditData, saveRedditData,
};
