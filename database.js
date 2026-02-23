/**
 * database.js
 * SQLite database layer using @libsql/client (Turso / local LibSQL file).
 *
 * Local dev  → TURSO_DATABASE_URL unset → falls back to file:ad_war_room.db
 * Production → set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in env
 *
 * All functions are async (await client.execute / client.batch).
 */

const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:ad_war_room.db',
  authToken: process.env.TURSO_AUTH_TOKEN, // undefined locally = OK
});

// ─── Schema ──────────────────────────────────────────────────────────────────

async function initSchema() {
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS ads_cache (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT    NOT NULL,
        ad_data      TEXT    NOT NULL,
        fetched_at   INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ads_company ON ads_cache (company_name)`,
      `CREATE INDEX IF NOT EXISTS idx_ads_fetched  ON ads_cache (fetched_at)`,
      `CREATE TABLE IF NOT EXISTS ai_briefs (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        brief_data     TEXT    NOT NULL,
        created_at     INTEGER NOT NULL,
        ad_count       INTEGER NOT NULL DEFAULT 0,
        brands_covered TEXT    NOT NULL DEFAULT ''
      )`,
      `CREATE INDEX IF NOT EXISTS idx_briefs_created ON ai_briefs (created_at)`,
      `CREATE TABLE IF NOT EXISTS competitor_profiles (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        summary      TEXT NOT NULL,
        created_at   INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_profiles_company ON competitor_profiles (company_name)`,
      `CREATE TABLE IF NOT EXISTS ad_score_cache (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key  TEXT NOT NULL,
        score_data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_scores_key ON ad_score_cache (cache_key)`,
      `CREATE TABLE IF NOT EXISTS reddit_cache (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        brand       TEXT NOT NULL,
        reddit_data TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_reddit_brand ON reddit_cache (brand)`,
    ],
    'write'
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return cached ads for a company if fresher than maxAgeHours.
 * @param {string} company
 * @param {number} maxAgeHours
 * @returns {Promise<Array|null>}
 */
async function getCachedAds(company, maxAgeHours = 6) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  const result = await client.execute({
    sql: `SELECT ad_data FROM ads_cache
          WHERE company_name = ? AND fetched_at > ?
          ORDER BY fetched_at DESC
          LIMIT 1`,
    args: [company, cutoff],
  });
  const row = result.rows[0];
  if (!row) return null;
  try {
    return JSON.parse(row.ad_data);
  } catch {
    return null;
  }
}

/**
 * Save (or replace) ads for a company into the cache.
 * @param {string} company
 * @param {Array}  ads
 */
async function saveAds(company, ads) {
  const now = Math.floor(Date.now() / 1000);
  await client.batch(
    [
      { sql: 'DELETE FROM ads_cache WHERE company_name = ?', args: [company] },
      {
        sql: 'INSERT INTO ads_cache (company_name, ad_data, fetched_at) VALUES (?, ?, ?)',
        args: [company, JSON.stringify(ads), now],
      },
    ],
    'write'
  );
}

/**
 * Persist a Gemini-generated brief.
 */
async function saveAiBrief(brief, adCount = 0, brandsCovered = '') {
  const now = Math.floor(Date.now() / 1000);
  await client.execute({
    sql: `INSERT INTO ai_briefs (brief_data, created_at, ad_count, brands_covered)
          VALUES (?, ?, ?, ?)`,
    args: [JSON.stringify(brief), now, adCount, brandsCovered],
  });
}

/**
 * Return the most recently stored AI brief (any brand).
 * @returns {Promise<{ brief: object, created_at: number, ad_count: number, brands_covered: string }|null>}
 */
async function getLatestBrief() {
  const result = await client.execute({
    sql: `SELECT brief_data, created_at, ad_count, brands_covered
          FROM ai_briefs
          ORDER BY created_at DESC
          LIMIT 1`,
    args: [],
  });
  const row = result.rows[0];
  if (!row) return null;
  try {
    return {
      brief: JSON.parse(row.brief_data),
      created_at: Number(row.created_at),
      ad_count: Number(row.ad_count),
      brands_covered: row.brands_covered,
    };
  } catch {
    return null;
  }
}

/**
 * Return the most recent brief for a specific brand key if within maxAgeHours.
 * @param {string} brand
 * @param {number} maxAgeHours
 * @returns {Promise<{ brief: object, created_at: number, ad_count: number, brands_covered: string }|null>}
 */
async function getBriefByBrand(brand, maxAgeHours = 1) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  const result = await client.execute({
    sql: `SELECT brief_data, created_at, ad_count, brands_covered
          FROM ai_briefs
          WHERE brands_covered = ? AND created_at > ?
          ORDER BY created_at DESC
          LIMIT 1`,
    args: [brand, cutoff],
  });
  const row = result.rows[0];
  if (!row) return null;
  try {
    return {
      brief: JSON.parse(row.brief_data),
      created_at: Number(row.created_at),
      ad_count: Number(row.ad_count),
      brands_covered: row.brands_covered,
    };
  } catch {
    return null;
  }
}

/**
 * Return cache metadata for a company regardless of age.
 * @param {string} company
 * @returns {Promise<{ fetched_at: number|null, ad_count: number, has_data: boolean }>}
 */
async function getCacheStatus(company) {
  const result = await client.execute({
    sql: `SELECT ad_data, fetched_at FROM ads_cache
          WHERE company_name = ?
          ORDER BY fetched_at DESC
          LIMIT 1`,
    args: [company],
  });
  const row = result.rows[0];
  if (!row) return { fetched_at: null, ad_count: 0, has_data: false };
  let ad_count = 0;
  try { ad_count = JSON.parse(row.ad_data).length; } catch { /* empty */ }
  return { fetched_at: Number(row.fetched_at), ad_count, has_data: true };
}

/**
 * Return cache metadata for multiple companies.
 * @param {string[]} companies
 * @returns {Promise<Array>}
 */
async function getAllCacheStatuses(companies) {
  const results = await Promise.all(
    companies.map(async (c) => ({ company: c, ...(await getCacheStatus(c)) }))
  );
  return results;
}

/**
 * Return the most recently cached ads for a company regardless of age (stale fallback).
 * @param {string} company
 * @returns {Promise<Array|null>}
 */
async function getCachedAdsAny(company) {
  const result = await client.execute({
    sql: `SELECT ad_data FROM ads_cache
          WHERE company_name = ?
          ORDER BY fetched_at DESC
          LIMIT 1`,
    args: [company],
  });
  const row = result.rows[0];
  if (!row) return null;
  try {
    return JSON.parse(row.ad_data);
  } catch {
    return null;
  }
}

/**
 * Clear cached ads for a specific company, or all companies if name is '*'.
 * @param {string} company
 */
async function clearAdsCache(company) {
  if (company === '*') {
    await client.execute({ sql: 'DELETE FROM ads_cache', args: [] });
  } else {
    await client.execute({ sql: 'DELETE FROM ads_cache WHERE company_name = ?', args: [company] });
  }
}

/**
 * Return cached competitor profile if fresher than maxAgeHours.
 */
async function getCompetitorProfile(company, maxAgeHours = 24) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  const result = await client.execute({
    sql: `SELECT summary, created_at FROM competitor_profiles
          WHERE company_name = ? AND created_at > ?
          ORDER BY created_at DESC LIMIT 1`,
    args: [company, cutoff],
  });
  const row = result.rows[0];
  if (!row) return null;
  return { summary: row.summary, created_at: Number(row.created_at) };
}

/**
 * Save competitor profile — deletes old entry, inserts new.
 */
async function saveCompetitorProfile(company, summary) {
  const now = Math.floor(Date.now() / 1000);
  await client.batch(
    [
      { sql: 'DELETE FROM competitor_profiles WHERE company_name = ?', args: [company] },
      {
        sql: 'INSERT INTO competitor_profiles (company_name, summary, created_at) VALUES (?, ?, ?)',
        args: [company, summary, now],
      },
    ],
    'write'
  );
}

/**
 * Return cached ad scores if fresher than maxAgeHours.
 */
async function getAdScores(cacheKey, maxAgeHours = 1) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  const result = await client.execute({
    sql: `SELECT score_data FROM ad_score_cache
          WHERE cache_key = ? AND created_at > ?
          ORDER BY created_at DESC LIMIT 1`,
    args: [cacheKey, cutoff],
  });
  const row = result.rows[0];
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
async function saveAdScores(cacheKey, data) {
  const now = Math.floor(Date.now() / 1000);
  await client.execute({
    sql: 'INSERT INTO ad_score_cache (cache_key, score_data, created_at) VALUES (?, ?, ?)',
    args: [cacheKey, JSON.stringify(data), now],
  });
}

/**
 * Return cached Reddit data for a brand if fresher than maxAgeHours.
 */
async function getRedditData(brand, maxAgeHours = 2) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  const result = await client.execute({
    sql: `SELECT reddit_data FROM reddit_cache
          WHERE brand = ? AND created_at > ?
          ORDER BY created_at DESC LIMIT 1`,
    args: [brand, cutoff],
  });
  const row = result.rows[0];
  if (!row) return null;
  try {
    return JSON.parse(row.reddit_data);
  } catch {
    return null;
  }
}

/**
 * Return any cached Reddit data for a brand regardless of age (stale fallback).
 */
async function getRedditDataAny(brand) {
  const result = await client.execute({
    sql: `SELECT reddit_data FROM reddit_cache
          WHERE brand = ?
          ORDER BY created_at DESC LIMIT 1`,
    args: [brand],
  });
  const row = result.rows[0];
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
async function saveRedditData(brand, data) {
  const now = Math.floor(Date.now() / 1000);
  await client.batch(
    [
      { sql: 'DELETE FROM reddit_cache WHERE brand = ?', args: [brand] },
      {
        sql: 'INSERT INTO reddit_cache (brand, reddit_data, created_at) VALUES (?, ?, ?)',
        args: [brand, JSON.stringify(data), now],
      },
    ],
    'write'
  );
}

module.exports = {
  initSchema,
  getCachedAds, getCachedAdsAny, getCacheStatus, getAllCacheStatuses,
  saveAds, saveAiBrief, getLatestBrief, getBriefByBrand, clearAdsCache,
  getCompetitorProfile, saveCompetitorProfile,
  getAdScores, saveAdScores,
  getRedditData, getRedditDataAny, saveRedditData,
};
