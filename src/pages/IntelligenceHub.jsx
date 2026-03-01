/**
 * IntelligenceHub.jsx — Page 1
 * Pure data + ad selection. Zero AI output on this page.
 *
 * Sections:
 *   1. Brand Cards (4 cards: All + 3 brands)
 *   2. Cache Stats Bar + Fetch Fresh Ads button
 *   3. Competitor Profile Cards (AI summary, per-competitor, with cache badge)
 *   4. Extended FilterBar (sticky)
 *   5. Selection toolbar (appears when ads are selected)
 *   6. Selectable Ad Grid
 *   7. Bottom Nav → /analysis
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAds } from '../context/AdsContext.jsx';
import FilterBar from '../components/FilterBar.jsx';
import AdGrid from '../components/AdGrid.jsx';
import Bold from '../components/Bold.jsx';
import CompetitorCard from '../components/CompetitorCard.jsx';

const API_BASE = import.meta.env.VITE_API_URL || '';

const BRAND_META = [
  { id: 'All',         label: 'All Brands',  tagline: 'All three verticals',     color: 'gray' },
  { id: 'Man Matters', label: 'Man Matters',  tagline: "Men's Health & Grooming", color: 'blue' },
  { id: 'Bebodywise',  label: 'Bebodywise',   tagline: "Women's Wellness",        color: 'pink' },
  { id: 'Little Joys', label: 'Little Joys',  tagline: "Kids' Health",            color: 'green' },
];

const BRAND_CARD_COLORS = {
  gray:  { ring: 'ring-gray-300',  bg: 'bg-gray-50',  pill: 'bg-gray-800 text-white',  dot: 'bg-gray-400' },
  blue:  { ring: 'ring-blue-400',  bg: 'bg-blue-50',  pill: 'bg-blue-600 text-white',  dot: 'bg-blue-500' },
  pink:  { ring: 'ring-pink-400',  bg: 'bg-pink-50',  pill: 'bg-pink-600 text-white',  dot: 'bg-pink-500' },
  green: { ring: 'ring-green-400', bg: 'bg-green-50', pill: 'bg-green-600 text-white', dot: 'bg-green-500' },
};

// Tiered competitor structure
const COMPETITOR_TIERS = {
  'Man Matters': {
    direct: [
      { name: 'Traya Health', companyName: 'trayahealth' },
      { name: 'Bold Care',    companyName: 'boldcare' },
      { name: 'RxMen',        companyName: 'rxmen' },
    ],
    indirect: [
      { name: 'Bombay Shaving Company', companyName: 'bombayshavingcompany' },
      { name: 'Beardo',                 companyName: 'beardo' },
      { name: 'Ustraa',                 companyName: 'ustraa' },
      { name: 'The Man Company',        companyName: 'themancompany' },
    ],
    adjacent: [
      { name: 'Kapiva',      companyName: 'kapiva' },
      { name: 'Fast and Up', companyName: 'fastandup' },
      { name: 'Healthkart',  companyName: 'healthkart' },
    ],
  },
  'Bebodywise': {
    direct: [
      { name: 'Gynoveda',  companyName: 'gynoveda' },
      { name: 'Oziva',     companyName: 'oziva' },
      { name: 'Nua',       companyName: 'nuawoman' },
      { name: 'Kindlife',  companyName: 'kindlife' },
    ],
    indirect: [
      { name: 'Minimalist',       companyName: 'theminimalist' },
      { name: 'Dot and Key',      companyName: 'dotandkey' },
      { name: 'WOW Skin Science', companyName: 'wowskinscienceindia' },
    ],
    peripheral: [
      { name: 'Plum Goodness', companyName: 'plumgoodness' },
      { name: 'Pilgrim',       companyName: 'pilgrimbeauty' },
      { name: 'mCaffeine',     companyName: 'mcaffeine' },
    ],
  },
  'Little Joys': {
    direct: [
      { name: 'Mee Mee',     companyName: 'meemeeofficial' },
      { name: 'The Moms Co', companyName: 'themomsco' },
      { name: 'Mylo',        companyName: 'mylo' },
    ],
    productLed: [
      { name: 'Himalaya Baby', companyName: 'himalayababycare' },
      { name: 'Sebamed Baby',  companyName: 'sebamedbaby' },
      { name: 'Chicco India',  companyName: 'chiccoindia' },
    ],
    platform: [
      { name: 'FirstCry', companyName: 'firstcry' },
    ],
  },
};

// Flatten tiers → { brand: [{ ...competitor, tier }] }
const COMPETITORS_BY_BRAND = Object.fromEntries(
  Object.entries(COMPETITOR_TIERS).map(([brand, tiers]) => [
    brand,
    Object.entries(tiers).flatMap(([tier, list]) =>
      list.map(c => ({ ...c, tier }))
    ),
  ])
);

// Flat list of all 27 competitors
const ALL_COMPETITORS_FLAT = Object.values(COMPETITORS_BY_BRAND).flat();

const CACHE_HOURS = 24;

function SkeletonProfileCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-2">
      <div className="h-4 w-32 bg-gray-200 rounded" />
      <div className="h-3 w-20 bg-gray-100 rounded" />
      <div className="h-3 w-full bg-gray-100 rounded" />
      <div className="h-3 w-4/5 bg-gray-100 rounded" />
    </div>
  );
}

export default function IntelligenceHub() {
  const navigate = useNavigate();
  const {
    allAds, setAllAds, selectedAds, setSelectedAds,
    selectedBrand, setSelectedBrand,
    setLastUpdated, setUsingMock,
    redirectTargetBrand, setRedirectTargetBrand,
  } = useAds();

  const [adsLoading, setAdsLoading] = useState(allAds.length === 0);
  const [competitorProfiles, setCompetitorProfiles] = useState({});
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [cacheStatus, setCacheStatus] = useState({});   // { [companyName]: { fetched_at, ad_count, has_data, age_hours, is_fresh } }
  const [isFetching, setIsFetching] = useState(false);  // true while batch fetch is running
  const [fetchMsg, setFetchMsg] = useState('');          // transient status message

  // Session-level dedup: track companies already fetched this browser session
  // so switching brands back and forth never re-triggers an API call
  const requestedCompanies = useRef(new Set());

  const [filterState, setFilterState] = useState({
    brand: selectedBrand || 'All',
    competitor: 'all',
    format: 'all',
    status: 'all',
    sort: 'daysRunning',
    minDays: 0,
  });

  // ── Handle redirect from Page 2 (locked brand pill → "Go to Intelligence Hub") ──
  useEffect(() => {
    if (!redirectTargetBrand) return;
    // Pre-select the brand and scroll to the ads grid
    setFilterState((prev) => ({ ...prev, brand: redirectTargetBrand, competitor: 'all' }));
    setSelectedBrand(redirectTargetBrand);
    setRedirectTargetBrand(null);
    setTimeout(() => {
      const el = document.getElementById('ads-grid-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }, []);

  // ── Load CACHED ads on mount — no ScrapeCreators API call ─────────────────
  useEffect(() => {
    // Always refresh cache metadata — even when ads are already in context
    // (e.g. navigating back from Analysis page keeps allAds but loses cacheStatus)
    fetch(`${API_BASE}/api/cache-status`)
      .then((r) => r.json())
      .then((data) => { if (data.statuses) setCacheStatus(data.statuses); })
      .catch(() => {});

    if (allAds.length > 0) {
      setAdsLoading(false);
      return;
    }
    setAdsLoading(true);
    fetch(`${API_BASE}/api/ads/cached`)
      .then((r) => r.json())
      .then((data) => {
        setAllAds(data.ads || []);
        setLastUpdated(data.ads?.length > 0 ? new Date() : null);
        setUsingMock(false);
        if (data.cacheStatuses) setCacheStatus(data.cacheStatuses);
      })
      .catch((err) => console.error('Failed to load cached ads:', err))
      .finally(() => setAdsLoading(false));
  }, []);

  // ── Competitors visible given current brand filter ─────────────────────────
  const visibleCompetitors = useMemo(() => {
    if (filterState.brand === 'All') {
      return ALL_COMPETITORS_FLAT;
    }
    return COMPETITORS_BY_BRAND[filterState.brand] || [];
  }, [filterState.brand]);

  // ── Fetch competitor profiles when brand filter changes ────────────────────
  useEffect(() => {
    if (visibleCompetitors.length === 0) return;
    const unresolved = visibleCompetitors.filter((c) => !competitorProfiles[c.companyName]);
    if (unresolved.length === 0) { setProfilesLoading(false); return; }

    setProfilesLoading(true);
    Promise.allSettled(
      unresolved.map((c) =>
        fetch(`${API_BASE}/api/competitor-profile/${c.companyName}`)
          .then((r) => r.json())
          .then((data) => ({ companyName: c.companyName, summary: data.summary }))
      )
    ).then((results) => {
      const settled = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      setCompetitorProfiles((prev) => {
        const next = { ...prev };
        settled.forEach(({ companyName, summary }) => { next[companyName] = summary; });
        return next;
      });
    }).finally(() => setProfilesLoading(false));
  }, [filterState.brand]);

  // ── Cache stats derived from cacheStatus ──────────────────────────────────
  const cacheStats = useMemo(() => {
    const now = Date.now() / 1000;
    let loadedCount = 0; // has ANY data (fresh or stale)
    let freshCount = 0;  // has fresh data (<24h)
    let latestFetch = 0;
    let oldestFreshExpiry = Infinity;

    for (const c of ALL_COMPETITORS_FLAT) {
      const s = cacheStatus[c.companyName];
      if (!s?.has_data) continue;
      loadedCount++; // counts regardless of freshness
      const isFresh = (now - s.fetched_at) < CACHE_HOURS * 3600;
      if (s.fetched_at > latestFetch) latestFetch = s.fetched_at;
      if (isFresh) {
        freshCount++;
        const expiresAt = s.fetched_at + CACHE_HOURS * 3600;
        if (expiresAt < oldestFreshExpiry) oldestFreshExpiry = expiresAt;
      }
    }

    const total = ALL_COMPETITORS_FLAT.length;

    let lastRefreshStr = null;
    if (latestFetch > 0) {
      const mins = Math.round((now - latestFetch) / 60);
      lastRefreshStr = mins < 60
        ? `${mins} min${mins !== 1 ? 's' : ''} ago`
        : `${Math.floor(mins / 60)}h ago`;
    }

    let nextRefreshIn = null;
    if (oldestFreshExpiry < Infinity) {
      const secs = Math.max(0, oldestFreshExpiry - now);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      nextRefreshIn = `${h}h ${m}m`;
    }

    return { loadedCount, freshCount, total, lastRefreshStr, nextRefreshIn };
  }, [cacheStatus]);

  // ── Handle "Fetch Fresh Ads" ──────────────────────────────────────────────
  const handleFetchFreshAds = useCallback(async () => {
    const brand = filterState.brand;
    const competitorsInScope = brand === 'All'
      ? ALL_COMPETITORS_FLAT
      : (COMPETITORS_BY_BRAND[brand] || []);

    const now = Date.now() / 1000;

    // Three-layer dedup: session ref → 24h cache status → server dedup
    const needsRefresh = competitorsInScope.filter((c) => {
      if (requestedCompanies.current.has(c.companyName)) return false; // already fetched this session
      const s = cacheStatus[c.companyName];
      if (!s?.has_data) return true;                                    // no data at all
      return (now - s.fetched_at) >= CACHE_HOURS * 3600;               // cache expired
    });
    const alreadyCached = competitorsInScope.length - needsRefresh.length;

    if (needsRefresh.length === 0) {
      window.alert(
        `All ${alreadyCached} competitor${alreadyCached !== 1 ? 's' : ''} already have fresh data ` +
        `(within ${CACHE_HOURS} hours). No API credits needed.`
      );
      return;
    }

    // Last-fetch context for confirmation dialog
    const fetchTimes = competitorsInScope
      .filter((c) => cacheStatus[c.companyName]?.fetched_at)
      .map((c) => cacheStatus[c.companyName].fetched_at);
    const latestFetch = fetchTimes.length > 0 ? Math.max(...fetchTimes) : null;
    const lastFetchStr = latestFetch
      ? new Date(latestFetch * 1000).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
      : 'Never';

    const confirmed = window.confirm(
      `Fetch fresh ads from Meta Ad Library?\n\n` +
      `Will fetch: ${needsRefresh.length} competitor${needsRefresh.length !== 1 ? 's' : ''} (uses API credits)\n` +
      `Already cached / fetched: ${alreadyCached} (will be skipped)\n` +
      `Cache last updated: ${lastFetchStr}\n\n` +
      `Proceed?`
    );
    if (!confirmed) return;

    // Mark in session dedup BEFORE the request (prevents double-click race)
    needsRefresh.forEach((c) => requestedCompanies.current.add(c.companyName));

    setIsFetching(true);
    setFetchMsg(
      `Fetching ${needsRefresh.length} of ${competitorsInScope.length} competitors ` +
      `(${alreadyCached} already cached)…`
    );

    try {
      // Use /api/ads/batch with explicit company list — single request, server dedupes internally
      const res = await fetch(`${API_BASE}/api/ads/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies: needsRefresh.map((c) => c.companyName) }),
      });
      const data = await res.json();
      setAllAds(data.ads || []);
      setLastUpdated(new Date());
      setUsingMock(false);
      if (data.cacheStatuses) setCacheStatus(data.cacheStatuses);

      const fetchedCount = data.fetchedCount ?? 0;
      const skippedCount = data.cachedCount  ?? 0;
      const errCount     = data.errors?.length ?? 0;
      setFetchMsg(
        `Done! Fetched ${fetchedCount}, skipped ${skippedCount} cached` +
        (errCount ? `, ${errCount} failed` : '') + '.'
      );
      setTimeout(() => setFetchMsg(''), 5000);
    } catch (err) {
      console.error('Fetch failed:', err);
      // Roll back session dedup so the user can retry
      needsRefresh.forEach((c) => requestedCompanies.current.delete(c.companyName));
      setFetchMsg('Fetch failed — check your connection and try again.');
      setTimeout(() => setFetchMsg(''), 5000);
    } finally {
      setIsFetching(false);
    }
  }, [filterState.brand, cacheStatus, setAllAds, setLastUpdated, setUsingMock]);

  // ── Brand card click ───────────────────────────────────────────────────────
  const handleBrandCard = useCallback((brandId) => {
    setFilterState((prev) => ({ ...prev, brand: brandId, competitor: 'all' }));
    setSelectedBrand(brandId);
  }, [setSelectedBrand]);

  // ── Filtered + sorted ads ─────────────────────────────────────────────────
  const filteredAds = useMemo(() => {
    let result = [...allAds];
    if (filterState.brand !== 'All') result = result.filter((a) => a.brandLabel === filterState.brand);
    if (filterState.competitor !== 'all') result = result.filter((a) => a.companyName === filterState.competitor);
    if (filterState.format !== 'all') result = result.filter((a) => (a.mediaType || '').toLowerCase() === filterState.format);
    if (filterState.status === 'active') result = result.filter((a) => a.isActive);
    else if (filterState.status === 'inactive') result = result.filter((a) => !a.isActive);
    if (filterState.minDays > 0) result = result.filter((a) => (a.daysRunning || 0) >= filterState.minDays);
    if (filterState.sort === 'daysRunning') result.sort((a, b) => (b.daysRunning || 0) - (a.daysRunning || 0));
    else if (filterState.sort === 'startDate') result.sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
    else if (filterState.sort === 'brand') result.sort((a, b) => (a.brandLabel || '').localeCompare(b.brandLabel || ''));
    return result;
  }, [allAds, filterState]);

  const selectedIds = useMemo(() => new Set(selectedAds.map((a) => a.id)), [selectedAds]);

  const handleSelectAd = useCallback((ad) => {
    setSelectedAds((prev) => {
      if (prev.some((a) => a.id === ad.id)) return prev.filter((a) => a.id !== ad.id);
      return [...prev, ad];
    });
  }, [setSelectedAds]);

  const handleSelectAllVisible = useCallback(() => {
    setSelectedAds((prev) => {
      const prevIds = new Set(prev.map((a) => a.id));
      const toAdd = filteredAds.filter((a) => !prevIds.has(a.id));
      return [...prev, ...toAdd];
    });
  }, [filteredAds, setSelectedAds]);

  const handleClearFilters = useCallback(() => {
    setFilterState((prev) => ({ ...prev, competitor: 'all', format: 'all', status: 'all', sort: 'daysRunning', minDays: 0 }));
  }, []);

  // Compute ad count + format breakdown per competitor
  const competitorStats = useMemo(() => {
    const stats = {};
    allAds.forEach((ad) => {
      if (!stats[ad.companyName]) stats[ad.companyName] = { total: 0, video: 0, image: 0, carousel: 0 };
      stats[ad.companyName].total++;
      const mt = (ad.mediaType || '').toLowerCase();
      if (mt === 'video') stats[ad.companyName].video++;
      else if (mt === 'image') stats[ad.companyName].image++;
      else if (mt === 'carousel') stats[ad.companyName].carousel++;
    });
    return stats;
  }, [allAds]);

  const adsForFilterBar = useMemo(() => {
    let result = [...allAds];
    if (filterState.brand !== 'All') result = result.filter((a) => a.brandLabel === filterState.brand);
    if (filterState.competitor !== 'all') result = result.filter((a) => a.companyName === filterState.competitor);
    if (filterState.minDays > 0) result = result.filter((a) => (a.daysRunning || 0) >= filterState.minDays);
    return result;
  }, [allAds, filterState.brand, filterState.competitor, filterState.minDays]);

  const liveCount = `${filteredAds.length} of ${allAds.length} ads`;

  // Floating "Analyse Selected" button — appears once ads grid scrolls into view
  const [showFloatingAnalyse, setShowFloatingAnalyse] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      const el = document.getElementById('ads-grid-section');
      if (!el) return;
      setShowFloatingAnalyse(el.getBoundingClientRect().top < window.innerHeight * 0.75);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // How many of the currently-scoped competitors need a refresh
  const scopedNeedsRefresh = useMemo(() => {
    const now = Date.now() / 1000;
    const scope = filterState.brand === 'All' ? ALL_COMPETITORS_FLAT : (COMPETITORS_BY_BRAND[filterState.brand] || []);
    return scope.filter((c) => {
      const s = cacheStatus[c.companyName];
      if (!s?.has_data) return true;
      return (now - s.fetched_at) >= CACHE_HOURS * 3600;
    }).length;
  }, [filterState.brand, cacheStatus]);

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

      {/* ── Section 1: Brand Cards ── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Brand Focus
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {BRAND_META.map((brand) => {
            const isActive = filterState.brand === brand.id;
            const c = BRAND_CARD_COLORS[brand.color];
            const brandAdCount = brand.id === 'All'
              ? allAds.length
              : allAds.filter((a) => a.brandLabel === brand.id).length;
            return (
              <button
                key={brand.id}
                onClick={() => handleBrandCard(brand.id)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  isActive ? `${c.bg} ${c.ring} ring-2` : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isActive ? c.pill : 'bg-gray-100 text-gray-600'}`}>
                    {brand.id === 'All' ? 'ALL' : brand.id.split(' ')[0].toUpperCase()}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900">{brand.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{brand.tagline}</p>
                <p className="text-xs font-bold text-gray-700 mt-2">
                  <Bold>{brandAdCount}</Bold> <span className="font-normal text-gray-400">ads tracked</span>
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Section 2: Cache Stats Bar + Fetch Fresh Ads ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Cache stats */}
        <div className="text-xs text-gray-500 space-y-0.5">
          <p>
            Cache status:{' '}
            {adsLoading ? (
              <span className="text-gray-400 animate-pulse">Checking cache…</span>
            ) : (
              <>
                <span className={`font-semibold ${cacheStats.loadedCount === cacheStats.total ? 'text-green-600' : cacheStats.loadedCount === 0 ? 'text-red-500' : 'text-amber-600'}`}>
                  {cacheStats.loadedCount}/{cacheStats.total} competitors loaded
                </span>
                {cacheStats.freshCount < cacheStats.loadedCount && cacheStats.loadedCount > 0 && (
                  <span className="text-gray-400 ml-1">({cacheStats.freshCount} fresh)</span>
                )}
              </>
            )}
            {!adsLoading && cacheStats.lastRefreshStr && (
              <span className="text-gray-400"> · Last refresh: {cacheStats.lastRefreshStr}</span>
            )}
            {!adsLoading && cacheStats.nextRefreshIn && (
              <span className="text-gray-400"> · Next expiry in: {cacheStats.nextRefreshIn}</span>
            )}
          </p>
          {fetchMsg && (
            <p className={`font-medium ${isFetching ? 'text-blue-600 animate-pulse' : fetchMsg.includes('failed') ? 'text-red-500' : 'text-green-600'}`}>
              {fetchMsg}
            </p>
          )}
        </div>

        {/* Fetch button — disabled until initial cache check completes */}
        <button
          onClick={handleFetchFreshAds}
          disabled={isFetching || adsLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex-shrink-0"
        >
          {isFetching ? (
            <><span className="animate-spin inline-block">⏳</span> Fetching…</>
          ) : adsLoading ? (
            <><span className="animate-pulse">⏳</span> Loading…</>
          ) : (
            <>
              <span>⬇</span>
              Fetch Fresh Ads
              {scopedNeedsRefresh > 0 && (
                <span className="bg-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {scopedNeedsRefresh} due
                </span>
              )}
            </>
          )}
        </button>
      </div>

      {/* ── Section 3: Competitor Profile Cards ── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Competitor Profiles
          <span className="ml-2 text-[10px] font-normal normal-case text-gray-400">AI-generated · 24hr cache</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleCompetitors.map((competitor) => {
            const brandLabel = Object.entries(COMPETITORS_BY_BRAND).find(([, list]) =>
              list.some((c) => c.companyName === competitor.companyName)
            )?.[0] || '';
            return (
              <CompetitorCard
                key={competitor.companyName}
                competitor={competitor}
                stats={competitorStats[competitor.companyName] || { total: 0, video: 0, image: 0, carousel: 0 }}
                summary={competitorProfiles[competitor.companyName]}
                brandLabel={brandLabel}
                cacheStatus={cacheStatus[competitor.companyName]}
                onViewAds={() => setFilterState((prev) => ({ ...prev, competitor: competitor.companyName, brand: brandLabel || prev.brand }))}
              />
            );
          })}
        </div>
      </section>

      {/* ── Section 4: Extended FilterBar ── */}
      <FilterBar
        selectedBrand={filterState.brand}
        onBrandChange={(b) => { setFilterState((prev) => ({ ...prev, brand: b, competitor: 'all' })); setSelectedBrand(b); }}
        formatFilter={filterState.format}
        onFormatChange={(f) => setFilterState((prev) => ({ ...prev, format: f }))}
        statusFilter={filterState.status}
        onStatusChange={(s) => setFilterState((prev) => ({ ...prev, status: s }))}
        sortBy={filterState.sort}
        onSortChange={(so) => setFilterState((prev) => ({ ...prev, sort: so }))}
        totalShowing={filteredAds.length}
        competitors={filterState.brand === 'All' ? [] : (COMPETITORS_BY_BRAND[filterState.brand] || [])}
        selectedCompetitor={filterState.competitor}
        onCompetitorChange={(c) => setFilterState((prev) => ({ ...prev, competitor: c }))}
        minDaysRunning={filterState.minDays}
        onMinDaysChange={(d) => setFilterState((prev) => ({ ...prev, minDays: d }))}
        onClearFilters={handleClearFilters}
        liveCount={liveCount}
        ads={adsForFilterBar}
      />

      {/* ── Selection Toolbar ── */}
      {selectedAds.length > 0 && (
        <div className="sticky top-[7.5rem] z-20 bg-amber-50 border border-amber-200 rounded-xl px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-amber-800">
            {selectedAds.length} ad{selectedAds.length !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleSelectAllVisible}
            className="text-xs text-amber-700 border border-amber-300 hover:bg-amber-100 px-2.5 py-1 rounded-md transition-colors"
          >
            Select All Visible ({filteredAds.length})
          </button>
          <button
            onClick={() => setSelectedAds([])}
            className="text-xs text-gray-600 border border-gray-300 hover:bg-gray-100 px-2.5 py-1 rounded-md transition-colors"
          >
            Clear Selection
          </button>
          <button
            onClick={() => navigate('/analysis')}
            className="ml-auto sm:ml-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg transition-colors"
          >
            → Analyse Selected ({selectedAds.length})
          </button>
        </div>
      )}

      {/* ── Section 5: Selectable Ad Grid ── */}
      <section id="ads-grid-section">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-semibold text-gray-800">Competitor Ads</h2>
          <span className="text-xs text-gray-400">{filteredAds.length} shown</span>
          {selectedAds.length === 0 && allAds.length > 0 && (
            <span className="text-xs text-gray-400 ml-2">Click any card to select for analysis</span>
          )}
        </div>

        {/* Empty state — no cached data at all */}
        {!adsLoading && allAds.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm font-semibold text-gray-700 mb-1">No ads loaded yet</p>
            <p className="text-xs text-gray-400 max-w-xs mx-auto mb-4">
              Click "Fetch Fresh Ads" to load competitor ads from Meta Ad Library.
              Data will be cached for 24 hours.
            </p>
            <button
              onClick={handleFetchFreshAds}
              disabled={isFetching}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {isFetching ? 'Fetching…' : 'Fetch Fresh Ads'}
            </button>
          </div>
        ) : (
          <AdGrid
            ads={filteredAds}
            isLoading={adsLoading}
            selectable={true}
            selectedIds={selectedIds}
            onSelect={handleSelectAd}
          />
        )}
      </section>

      {/* ── Floating Analyse Button ── */}
      {showFloatingAnalyse && (
        <button
          onClick={() => navigate('/analysis')}
          disabled={selectedAds.length === 0}
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-full font-bold text-sm shadow-lg transition-all ${
            selectedAds.length > 0
              ? 'bg-amber-500 hover:bg-amber-600 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Analyse Selected ({selectedAds.length}) →
        </button>
      )}

      {/* ── Section 6: Bottom Nav ── */}
      <div className="flex justify-end pb-4">
        <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
          <button
            disabled={selectedAds.length === 0}
            onClick={() => navigate('/analysis')}
            className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-white transition-colors ${
              selectedAds.length > 0 ? 'bg-amber-500 hover:bg-amber-600' : 'bg-gray-300 cursor-not-allowed'
            }`}
          >
            Analyse Selected Ads ({selectedAds.length}) →
          </button>
          {selectedAds.length === 0 && (
            <p className="text-xs text-gray-400">Select at least 1 ad to proceed to analysis</p>
          )}
        </div>
      </div>
    </div>
  );
}
