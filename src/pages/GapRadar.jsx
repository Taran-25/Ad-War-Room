/**
 * GapRadar.jsx — Page 3
 * Reddit pulse + gap opportunities.
 *
 * Sections:
 *   1. Brand Focus Selector (per-brand loading spinner / ✓ checkmark)
 *   2. 2-column layout: Consumer Complaints (left) + Gap Opportunities (right)
 *   3. Trending Topics horizontal scroll strip
 *   4. Reddit Sentiment Summary card
 *   5. Bottom Nav
 *
 * All 3 brands are preloaded in parallel on mount.
 * Data persists in AdsContext across navigation — switching tabs is instant.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAds } from '../context/AdsContext.jsx';
import Bold from '../components/Bold.jsx';
import { BoldText } from '../utils/boldKeywords.jsx';

const API_BASE = import.meta.env.VITE_API_URL || '';

const BRANDS = ['Man Matters', 'Bebodywise', 'Little Joys'];

const BRAND_PILL = {
  'Man Matters': { active: 'bg-blue-600 text-white', inactive: 'text-blue-600 border-blue-200 hover:bg-blue-50' },
  'Bebodywise':  { active: 'bg-pink-600 text-white',  inactive: 'text-pink-600 border-pink-200 hover:bg-pink-50' },
  'Little Joys': { active: 'bg-green-600 text-white', inactive: 'text-green-600 border-green-200 hover:bg-green-50' },
};

const URGENCY_COLORS = {
  high:   'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-green-100 text-green-700 border-green-200',
};

const FREQUENCY_COLORS = {
  high:   'bg-red-50 text-red-600',
  medium: 'bg-amber-50 text-amber-600',
  low:    'bg-gray-50 text-gray-500',
};

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-2">
      <div className="h-4 w-3/4 bg-gray-200 rounded" />
      <div className="h-3 w-full bg-gray-100 rounded" />
      <div className="h-3 w-5/6 bg-gray-100 rounded" />
      <div className="h-6 w-16 bg-gray-100 rounded-full" />
    </div>
  );
}

function BrandLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 py-2">
        <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        <p className="text-sm text-gray-400">Analysing Reddit data…</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );
}

export default function GapRadar() {
  const navigate = useNavigate();
  const {
    selectedBrand,
    redditDataCache, setRedditDataCache,
    redditLoadingState, setRedditLoadingState,
  } = useAds();

  const [focusBrand, setFocusBrand] = useState(
    BRANDS.includes(selectedBrand) ? selectedBrand : 'Man Matters'
  );
  const [copiedAngle, setCopiedAngle] = useState(null);
  const [lastFetched, setLastFetched] = useState({});   // { [brand]: Date }

  // Prevent duplicate concurrent requests
  const fetchingRef = useRef(new Set());

  const fetchRedditForBrand = useCallback(async (brand, opts = {}) => {
    // Force-refresh: clear in-flight flag so we can re-request
    if (opts.force) fetchingRef.current.delete(brand);
    // Skip if already in-flight
    if (fetchingRef.current.has(brand)) return;

    fetchingRef.current.add(brand);
    setRedditLoadingState((prev) => ({ ...prev, [brand]: true }));
    if (opts.force) {
      setRedditDataCache((prev) => ({ ...prev, [brand]: null }));
    }

    try {
      const res = await fetch(`${API_BASE}/api/reddit/${encodeURIComponent(brand)}`);
      const data = await res.json();
      setRedditDataCache((prev) => ({ ...prev, [brand]: data }));
      setLastFetched((prev) => ({ ...prev, [brand]: new Date() }));
    } catch (err) {
      console.error(`Reddit fetch failed for ${brand}:`, err);
      setRedditDataCache((prev) => ({ ...prev, [brand]: { fallback: true } }));
    } finally {
      fetchingRef.current.delete(brand);
      setRedditLoadingState((prev) => ({ ...prev, [brand]: false }));
    }
  }, [setRedditDataCache, setRedditLoadingState]);

  // Scroll to top on every mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // Preload all 3 brands on mount — skip any already in context
  useEffect(() => {
    BRANDS.forEach((brand) => {
      if (!redditDataCache[brand]) fetchRedditForBrand(brand);
    });
  }, []);

  const handleRefresh = useCallback(() => {
    fetchRedditForBrand(focusBrand, { force: true });
  }, [focusBrand, fetchRedditForBrand]);

  const handleCopyAngle = useCallback((gap, idx) => {
    const copyText = `GAP: ${gap.title}\n\nUNMET NEED: ${gap.unmetNeed}\n\nSUGGESTED AD ANGLE: ${gap.suggestedAngle || ''}`;
    navigator.clipboard.writeText(copyText).then(() => {
      setCopiedAngle(idx);
      setTimeout(() => setCopiedAngle(null), 2000);
    });
  }, []);

  function timeAgo(date) {
    const mins = Math.floor((Date.now() - date) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  const URGENCY_ORDER = { high: 0, medium: 1, low: 2 };

  // Derive display data from context cache for focused brand
  const redditData = redditDataCache[focusBrand];
  const loading = redditLoadingState[focusBrand];

  const complaints = redditData?.complaints || [];
  const gapOpportunities = redditData?.gapOpportunities || [];
  const trendingTopics = redditData?.trendingTopics || [];
  const sentimentSummary = redditData?.sentimentSummary || '';
  const subredditSources = redditData?.subredditSources || [];
  const isFallback = redditData?.fallback === true;

  const sortedGaps = useMemo(() =>
    [...gapOpportunities].sort(
      (a, b) => (URGENCY_ORDER[a.urgency] ?? 1) - (URGENCY_ORDER[b.urgency] ?? 1)
    ),
  [gapOpportunities]);

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

      {/* ── Section 1: Brand Focus Selector ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              <Bold>Gap Radar</Bold>
            </h1>
            <p className="text-sm text-gray-500">Reddit pulse → unmet consumer needs → creative angles</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {BRANDS.map((brand) => {
            const isActive = focusBrand === brand;
            const isLoading = redditLoadingState[brand];
            const hasData = !!redditDataCache[brand];
            const c = BRAND_PILL[brand];
            return (
              <button
                key={brand}
                onClick={() => setFocusBrand(brand)}
                className={`px-5 py-2 rounded-full text-sm font-semibold border-2 transition-all flex items-center gap-2 ${
                  isActive ? `${c.active} border-transparent` : `bg-white border ${c.inactive}`
                }`}
              >
                {brand}
                {isLoading ? (
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : hasData ? (
                  <span className="text-[10px] opacity-75">✓</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {redditData && !loading && (
          <p className="text-xs text-gray-400 mt-2">
            📊 Data Quality: {redditData.postCount || '—'} relevant posts analysed from{' '}
            {subredditSources.length} subreddits
            {lastFetched[focusBrand] && ` | Last fetched: ${timeAgo(lastFetched[focusBrand])}`}
          </p>
        )}
      </div>

      {/* Fallback banner */}
      {isFallback && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <span className="text-amber-500 text-sm">⚠️</span>
          <p className="text-sm text-amber-700">
            Reddit data temporarily unavailable — showing cached insights for {focusBrand}
          </p>
        </div>
      )}

      {/* Loading skeleton — shown while focused brand is loading */}
      {loading && <BrandLoadingSkeleton />}

      {/* ── Section 2: 2-column: Complaints + Gap Opportunities ── */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Consumer Complaints */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>📢</span> Consumer Complaints
              <span className="text-[10px] normal-case font-normal text-gray-400">from Reddit</span>
            </h2>
            {complaints.length > 0 ? (
              <div className="space-y-3">
                {complaints.map((complaint, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800 leading-snug">
                        {complaint.title}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 uppercase ${FREQUENCY_COLORS[complaint.frequency] || FREQUENCY_COLORS.medium}`}>
                        {complaint.frequency}
                      </span>
                    </div>
                    <BoldText text={complaint.detail} className="text-xs text-gray-500 leading-relaxed" />
                    {complaint.subreddit && (
                      <p className="text-[10px] text-blue-500">{complaint.subreddit}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                <p className="text-gray-400 text-sm">No complaints data available</p>
              </div>
            )}
          </div>

          {/* Gap Opportunities */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <span>💡</span> <Bold>Gap Opportunity</Bold> — What Competitors Miss
            </h2>
            {sortedGaps.length > 0 ? (
              <div className="space-y-3">
                {sortedGaps.map((gap, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-gray-900 leading-snug">{gap.title}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 uppercase ${URGENCY_COLORS[gap.urgency] || URGENCY_COLORS.medium}`}>
                        {gap.urgency}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                        <Bold>Unmet Need</Bold>
                      </p>
                      <BoldText text={gap.unmetNeed} className="text-xs text-gray-600 leading-relaxed" />
                    </div>
                    {gap.suggestedAngle && (
                      <div>
                        <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-0.5">
                          Suggested Angle
                        </p>
                        <BoldText text={gap.suggestedAngle} className="text-xs text-gray-700 leading-relaxed italic" />
                      </div>
                    )}
                    <button
                      onClick={() => handleCopyAngle(gap, i)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-2 py-0.5 rounded-md transition-colors"
                    >
                      {copiedAngle === i ? '✓ Copied!' : '📋 Copy Angle'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                <p className="text-gray-400 text-sm">No gap data available</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Section 3: Trending Topics horizontal scroll ── */}
      {!loading && trendingTopics.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span>📈</span> Trending Topics
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {trendingTopics.map((topic, i) => (
              <span
                key={i}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0 border ${
                  topic.direction === 'rising'
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}
              >
                {topic.direction === 'rising' ? '↑' : '→'}
                {topic.topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 4: Sentiment Summary + Subreddit Sources ── */}
      {!loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span>🧠</span> Reddit <Bold>Sentiment</Bold> Summary
          </h2>
          {sentimentSummary ? (
            <BoldText text={sentimentSummary} className="text-sm text-gray-600 leading-relaxed" />
          ) : (
            <p className="text-sm text-gray-400 italic">Sentiment analysis will appear after data loads.</p>
          )}

          {sentimentSummary && (
            <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-2 mt-2">
              Reddit insights are based on public posts and represent organic consumer conversations,
              not a statistically representative sample.
            </p>
          )}

          {subredditSources.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-400">Sources used for this analysis:</span>
              {subredditSources.map((sub, i) => (
                <span key={i} className="text-xs text-blue-600 font-medium">{sub}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Section 5: Bottom Nav ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4">
        <button
          onClick={() => navigate('/analysis')}
          className="px-6 py-3 rounded-xl font-semibold text-gray-700 border-2 border-gray-200 hover:bg-gray-50 transition-colors text-sm"
        >
          ← Back to Analysis
        </button>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="px-6 py-3 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-colors text-sm"
        >
          {loading ? '⏳ Refreshing…' : '🔄 Refresh Reddit Data'}
        </button>
      </div>
    </div>
  );
}
