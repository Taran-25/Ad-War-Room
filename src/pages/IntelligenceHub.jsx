/**
 * IntelligenceHub.jsx — Page 1
 * Pure data + ad selection. Zero AI output on this page.
 *
 * Sections:
 *   1. Brand Cards (4 cards: All + 3 brands)
 *   2. Competitor Profile Cards (AI summary, per-competitor)
 *   3. Extended FilterBar (sticky)
 *   4. Selection toolbar (appears when ads are selected)
 *   5. Selectable Ad Grid
 *   6. Bottom Nav → /analysis
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAds } from '../context/AdsContext.jsx';
import FilterBar from '../components/FilterBar.jsx';
import AdGrid from '../components/AdGrid.jsx';
import Bold from '../components/Bold.jsx';

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
      { name: 'BabyChakra', companyName: 'babychakra' },
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

// Tier badge styles
const TIER_STYLES = {
  direct:     { label: 'Direct',     style: 'bg-red-100 text-red-700' },
  indirect:   { label: 'Indirect',   style: 'bg-amber-100 text-amber-700' },
  adjacent:   { label: 'Adjacent',   style: 'bg-gray-100 text-gray-600' },
  peripheral: { label: 'Peripheral', style: 'bg-gray-100 text-gray-600' },
  productLed: { label: 'Product-led', style: 'bg-gray-100 text-gray-600' },
  platform:   { label: 'Platform',   style: 'bg-gray-100 text-gray-600' },
};

const BRAND_BADGE_STYLE = {
  'Man Matters': 'bg-blue-100 text-blue-700',
  'Bebodywise':  'bg-pink-100 text-pink-700',
  'Little Joys': 'bg-green-100 text-green-700',
};

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
  const { allAds, setAllAds, selectedAds, setSelectedAds, selectedBrand, setSelectedBrand, setLastUpdated, setUsingMock } = useAds();

  const [adsLoading, setAdsLoading] = useState(allAds.length === 0);
  const [competitorProfiles, setCompetitorProfiles] = useState({});
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesProgress, setProfilesProgress] = useState(null); // null | { loaded, total }

  const [filterState, setFilterState] = useState({
    brand: selectedBrand || 'All',
    competitor: 'all',
    format: 'all',
    status: 'all',
    sort: 'daysRunning',
    minDays: 0,
  });

  // Load ads on mount if not already loaded
  useEffect(() => {
    if (allAds.length > 0) {
      setAdsLoading(false);
      return;
    }
    setAdsLoading(true);
    fetch('/api/ads/all')
      .then((r) => r.json())
      .then((data) => {
        setAllAds(data.ads || []);
        setLastUpdated(new Date());
        setUsingMock(data.usingMockData || false);
      })
      .catch((err) => console.error('Failed to load ads:', err))
      .finally(() => setAdsLoading(false));
  }, []);

  // Competitors visible given current brand filter
  const visibleCompetitors = useMemo(() => {
    if (filterState.brand === 'All') {
      return Object.values(COMPETITORS_BY_BRAND).flat();
    }
    return COMPETITORS_BY_BRAND[filterState.brand] || [];
  }, [filterState.brand]);

  // Fetch competitor profiles when brand filter changes
  useEffect(() => {
    if (visibleCompetitors.length === 0) return;
    const unresolved = visibleCompetitors.filter((c) => !competitorProfiles[c.companyName]);
    if (unresolved.length === 0) { setProfilesLoading(false); return; }

    setProfilesLoading(true);
    setProfilesProgress({ loaded: 0, total: unresolved.length });
    let completedCount = 0;
    const controller = new AbortController();

    unresolved.forEach((competitor) => {
      const url = `/api/competitor-profile/${competitor.companyName}`;
      fetch(url, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          setCompetitorProfiles((prev) => ({ ...prev, [competitor.companyName]: data.summary }));
        })
        .catch((err) => {
          if (err.name !== 'AbortError') console.warn('[competitor-profile]', err.message);
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          completedCount++;
          setProfilesProgress({ loaded: completedCount, total: unresolved.length });
          if (completedCount === unresolved.length) {
            setProfilesLoading(false);
            setProfilesProgress(null);
          }
        });
    });

    return () => controller.abort();
  }, [filterState.brand]);

  // Handle brand card click — syncs local filterState + context
  const handleBrandCard = useCallback((brandId) => {
    setFilterState((prev) => ({ ...prev, brand: brandId, competitor: 'all' }));
    setSelectedBrand(brandId);
  }, [setSelectedBrand]);

  // Filtered + sorted ads
  const filteredAds = useMemo(() => {
    let result = [...allAds];

    if (filterState.brand !== 'All') {
      result = result.filter((a) => a.brandLabel === filterState.brand);
    }
    if (filterState.competitor !== 'all') {
      result = result.filter((a) => a.companyName === filterState.competitor);
    }
    if (filterState.format !== 'all') {
      result = result.filter((a) => (a.mediaType || '').toLowerCase() === filterState.format);
    }
    if (filterState.status === 'active') {
      result = result.filter((a) => a.isActive);
    } else if (filterState.status === 'inactive') {
      result = result.filter((a) => !a.isActive);
    }
    if (filterState.minDays > 0) {
      result = result.filter((a) => (a.daysRunning || 0) >= filterState.minDays);
    }

    if (filterState.sort === 'daysRunning') {
      result.sort((a, b) => (b.daysRunning || 0) - (a.daysRunning || 0));
    } else if (filterState.sort === 'startDate') {
      result.sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
    } else if (filterState.sort === 'brand') {
      result.sort((a, b) => (a.brandLabel || '').localeCompare(b.brandLabel || ''));
    }

    return result;
  }, [allAds, filterState]);

  const selectedIds = useMemo(() => new Set(selectedAds.map((a) => a.id)), [selectedAds]);

  const handleSelectAd = useCallback((ad) => {
    setSelectedAds((prev) => {
      if (prev.some((a) => a.id === ad.id)) {
        return prev.filter((a) => a.id !== ad.id);
      }
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
    setFilterState((prev) => ({
      ...prev,
      competitor: 'all',
      format: 'all',
      status: 'all',
      sort: 'daysRunning',
      minDays: 0,
    }));
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

  // Ads pre-filtered by brand + competitor + minDays only (not status/format) — for FilterBar counts
  const adsForFilterBar = useMemo(() => {
    let result = [...allAds];
    if (filterState.brand !== 'All') result = result.filter((a) => a.brandLabel === filterState.brand);
    if (filterState.competitor !== 'all') result = result.filter((a) => a.companyName === filterState.competitor);
    if (filterState.minDays > 0) result = result.filter((a) => (a.daysRunning || 0) >= filterState.minDays);
    return result;
  }, [allAds, filterState.brand, filterState.competitor, filterState.minDays]);

  const liveCount = `${filteredAds.length} of ${allAds.length} ads`;

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
                  isActive
                    ? `${c.bg} ${c.ring} ring-2`
                    : 'bg-white border-gray-200 hover:border-gray-300'
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

      {/* ── Section 2: Competitor Profile Cards ── */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Competitor Profiles
            <span className="ml-2 text-[10px] font-normal normal-case text-gray-400">AI-generated · 48hr cache</span>
          </h2>
          {profilesProgress && (
            <span className="text-xs text-blue-600 font-medium animate-pulse">
              Loading profiles… ({profilesProgress.loaded}/{profilesProgress.total} complete)
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleCompetitors.map((competitor) => {
            const stats = competitorStats[competitor.companyName] || { total: 0, video: 0, image: 0, carousel: 0 };
            const summary = competitorProfiles[competitor.companyName];
            const brandLabel = Object.entries(COMPETITORS_BY_BRAND).find(([, list]) =>
              list.some((c) => c.companyName === competitor.companyName)
            )?.[0] || '';
            const tierInfo = competitor.tier ? (TIER_STYLES[competitor.tier] || { label: competitor.tier, style: 'bg-gray-100 text-gray-600' }) : null;

            return (
              <div key={competitor.companyName} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-gray-900">{competitor.name}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {brandLabel && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${BRAND_BADGE_STYLE[brandLabel] || 'bg-gray-100 text-gray-600'}`}>
                          {brandLabel}
                        </span>
                      )}
                      {tierInfo && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tierInfo.style}`}>
                          {tierInfo.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-gray-700"><Bold>{stats.total}</Bold> <span className="font-normal text-gray-400">ads</span></p>
                    <p
                      className="text-[10px] text-gray-400"
                      title="v = Video  |  i = Image  |  c = Carousel"
                      style={{ cursor: 'help' }}
                    >
                      {stats.video > 0 && `${stats.video}v `}
                      {stats.image > 0 && `${stats.image}i `}
                      {stats.carousel > 0 && `${stats.carousel}c`}
                    </p>
                  </div>
                </div>

                {!summary ? (
                  <div className="space-y-1.5">
                    <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 w-4/5 bg-gray-100 rounded animate-pulse" />
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 leading-relaxed">{summary}</p>
                )}

                <button
                  onClick={() => setFilterState((prev) => ({ ...prev, competitor: competitor.companyName, brand: brandLabel || prev.brand }))}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  View Ads ↓
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Section 3: Extended FilterBar ── */}
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

      {/* ── Section 4: Selectable Ad Grid ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-semibold text-gray-800">Competitor Ads</h2>
          <span className="text-xs text-gray-400">{filteredAds.length} shown</span>
          {selectedAds.length === 0 && (
            <span className="text-xs text-gray-400 ml-2">Click any card to select for analysis</span>
          )}
        </div>
        <AdGrid
          ads={filteredAds}
          isLoading={adsLoading}
          selectable={true}
          selectedIds={selectedIds}
          onSelect={handleSelectAd}
        />
      </section>

      {/* ── Section 5: Bottom Nav ── */}
      <div className="flex justify-end pb-4">
        <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
          <button
            disabled={selectedAds.length === 0}
            onClick={() => navigate('/analysis')}
            className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-white transition-colors ${
              selectedAds.length > 0
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-gray-300 cursor-not-allowed'
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
