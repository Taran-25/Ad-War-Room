/**
 * Analysis.jsx — Page 2
 * All analytics + new scoring + video script.
 *
 * Sections:
 *   1. Selected Ads Summary Bar
 *   2. Brand Filter Pills
 *   3. KPI Cards
 *   4. Weekly Brief (AIInsightsPanel)
 *   5. Creative Trends
 *   6. Ad Longevity Table
 *   7. Ad Scoring Table (new)
 *   8. Video Script Card (new)
 *   9. Bottom Nav
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAds } from '../context/AdsContext.jsx';
import KPICards from '../components/KPICards.jsx';
import AIInsightsPanel from '../components/AIInsightsPanel.jsx';
import CreativeTrendsChart from '../components/CreativeTrendsChart.jsx';
import AdLongevityTable from '../components/AdLongevityTable.jsx';
import Bold from '../components/Bold.jsx';
import { BoldText } from '../utils/boldKeywords.jsx';

const API_BASE = import.meta.env.VITE_API_URL || '';

const BRANDS = ['All', 'Man Matters', 'Bebodywise', 'Little Joys'];

const BRAND_PILL_ACTIVE = {
  'All':         'bg-gray-900 text-white',
  'Man Matters': 'bg-blue-600 text-white',
  'Bebodywise':  'bg-pink-600 text-white',
  'Little Joys': 'bg-green-600 text-white',
};

const BRAND_PILL_INACTIVE = {
  'All':         'text-gray-700 border-gray-200 hover:bg-gray-50',
  'Man Matters': 'text-blue-600 border-blue-200 hover:bg-blue-50',
  'Bebodywise':  'text-pink-600 border-pink-200 hover:bg-pink-50',
  'Little Joys': 'text-green-600 border-green-200 hover:bg-green-50',
};

function scoreColor(score) {
  if (score >= 8) return 'bg-green-100 text-green-800';
  if (score >= 5) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

function ScoringSkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(9)].map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className="h-4 bg-gray-200 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

export default function Analysis() {
  const navigate = useNavigate();
  const { allAds, selectedAds, selectedBrand, setSelectedBrand } = useAds();

  // Guard: redirect to / if no ads are selected (and we have ads to select from)
  useEffect(() => {
    if (allAds.length > 0 && selectedAds.length === 0) {
      navigate('/');
    }
  }, []);

  const [briefs, setBriefs] = useState({});
  const [briefLoading, setBriefLoading] = useState(false);
  const fetchedBrands = useRef(new Set());

  const [scores, setScores] = useState(null);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [expandedScoreRow, setExpandedScoreRow] = useState(null);
  const [scriptCopied, setScriptCopied] = useState(false);

  // Fetch weekly brief — passes selectedAds so backend analyses only the chosen set
  const fetchBriefForBrand = useCallback(async (brand) => {
    setBriefLoading(true);
    try {
      const adsToAnalyze = selectedAds.length > 0 ? selectedAds : allAds;
      const isSelectionBased = selectedAds.length > 0;
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, ads: adsToAnalyze, isSelectionBased }),
      });
      const data = await res.json();
      if (data.brief) {
        setBriefs((prev) => ({ ...prev, [brand]: data.brief }));
      }
    } catch (err) {
      console.error(`Brief fetch failed for ${brand}:`, err);
    } finally {
      setBriefLoading(false);
    }
  }, [selectedAds, allAds]);

  // Initial brief load
  useEffect(() => {
    const brand = selectedBrand || 'All';
    if (!fetchedBrands.current.has(brand)) {
      fetchedBrands.current.add(brand);
      fetchBriefForBrand(brand);
    }
  }, []);

  // When brand changes, fetch its brief if not cached
  useEffect(() => {
    const brand = selectedBrand || 'All';
    if (!fetchedBrands.current.has(brand)) {
      fetchedBrands.current.add(brand);
      fetchBriefForBrand(brand);
    }
  }, [selectedBrand, fetchBriefForBrand]);

  // Score selected ads — bypassCache=true forces fresh Gemini run
  const fetchScores = useCallback(async (bypassCache = false) => {
    if (selectedAds.length === 0) return;
    setScoresLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/score-ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ads: selectedAds, regenerate: bypassCache }),
      });
      const data = await res.json();
      setScores(data);
    } catch (err) {
      console.error('Score fetch failed:', err);
    } finally {
      setScoresLoading(false);
    }
  }, [selectedAds]);

  useEffect(() => {
    if (selectedAds.length > 0) {
      fetchScores();
    }
  }, []);

  // filteredAds — derived from selectedAds (or allAds if none selected), filtered by brand
  const filteredAds = useMemo(() => {
    const base = selectedAds.length > 0 ? selectedAds : allAds;
    if (!selectedBrand || selectedBrand === 'All') return base;
    return base.filter((a) => a.brandLabel === selectedBrand);
  }, [allAds, selectedAds, selectedBrand]);

  // Sorted scored ads — highest total first
  const sortedScoredAds = useMemo(() =>
    scores?.scoredAds
      ? [...scores.scoredAds].sort((a, b) => (b.total || 0) - (a.total || 0))
      : [],
  [scores]);

  const currentBrief = briefs[selectedBrand || 'All'] || null;

  // Unique competitors in selected ads
  const selectedCompetitors = useMemo(() => {
    const names = new Set(selectedAds.map((a) => a.companyName));
    return [...names];
  }, [selectedAds]);

  const handleReanalyz = useCallback(() => {
    const brand = selectedBrand || 'All';
    fetchedBrands.current.delete(brand);
    fetchBriefForBrand(brand);
  }, [selectedBrand, fetchBriefForBrand]);

  const handleCopyScript = useCallback(() => {
    if (!scores?.videoScriptBrief) return;
    const b = scores.videoScriptBrief;
    const text = [
      `Format: ${b.format}`,
      `Tone: ${b.tone}`,
      `HOOK: ${b.hook}`,
      `BODY: ${b.body}`,
      `CTA: ${b.cta}`,
      `VISUAL DIRECTION: ${b.visualDirection}`,
      `WHY IT WORKS: ${b.whyItWorks}`,
    ].join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setScriptCopied(true);
      setTimeout(() => setScriptCopied(false), 2000);
    });
  }, [scores]);

  const handleRegenerateScript = useCallback(() => {
    setScores(null);
    fetchScores(true);  // bypass cache
  }, [fetchScores]);

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

      {/* ── Section 1: Selected Ads Summary Bar ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">
            Analysing{' '}
            <Bold>{selectedAds.length}</Bold>
            {' '}ad{selectedAds.length !== 1 ? 's' : ''} across{' '}
            <Bold>{selectedCompetitors.length}</Bold>
            {' '}competitor{selectedCompetitors.length !== 1 ? 's' : ''}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {selectedCompetitors.slice(0, 8).map((name) => (
              <span key={name} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                {name}
              </span>
            ))}
            {selectedCompetitors.length > 8 && (
              <span className="text-[10px] text-gray-400">+{selectedCompetitors.length - 8} more</span>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg flex-shrink-0"
        >
          ← Change Selection
        </button>
      </div>

      {/* ── Section 2: Brand Filter Pills ── */}
      <div className="flex flex-wrap gap-2">
        {BRANDS.map((brand) => {
          const isActive = (selectedBrand || 'All') === brand;
          return (
            <button
              key={brand}
              onClick={() => setSelectedBrand(brand)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                isActive
                  ? BRAND_PILL_ACTIVE[brand]
                  : `bg-white border ${BRAND_PILL_INACTIVE[brand]}`
              }`}
            >
              {brand}
            </button>
          );
        })}
        <span className="ml-auto self-center text-xs text-gray-400">
          {selectedAds.length > 0
            ? `Based on your ${selectedAds.length} selected ads`
            : `Based on all ${allAds.length} tracked ads`}
        </span>
      </div>

      {/* ── Section 3: KPI Cards ── */}
      <KPICards ads={filteredAds} />

      {/* ── Section 4: Weekly Brief ── */}
      <AIInsightsPanel
        brief={currentBrief}
        isLoading={briefLoading}
        onAnalyze={handleReanalyz}
        threatLevel={currentBrief?.threatLevel}
        threatReason={currentBrief?.threatReason}
        selectedBrand={selectedBrand || 'All'}
      />

      {/* ── Section 5: Creative Trends ── */}
      <CreativeTrendsChart
        trends={currentBrief?.creativeTrends}
        ads={filteredAds}
      />

      {/* ── Section 6: Ad Longevity Table ── */}
      <AdLongevityTable ads={filteredAds} />

      {/* ── Section 7: Ad Scoring Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              Ad Scoring — <Bold>{selectedAds.length}</Bold> Selected
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              <Bold>Hook Strength</Bold> · <Bold>CTA</Bold> · Emotion · Format · Clarity — each /10
            </p>
          </div>
          {scoresLoading && (
            <span className="text-xs text-gray-400 animate-pulse">Scoring with Gemini…</span>
          )}
        </div>

        {/* Top Patterns */}
        {scores?.topPatterns && scores.topPatterns.length > 0 && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-100">
            <p className="text-xs font-semibold text-amber-800 mb-2">What Makes These Ads Work</p>
            <ul className="space-y-1">
              {scores.topPatterns.map((pattern, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                  <span className="font-bold flex-shrink-0">→</span>
                  <BoldText text={pattern} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 font-medium">
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Ad Preview</th>
                <th className="px-3 py-2 text-left">Brand</th>
                <th className="px-3 py-2 text-center">Hook/10</th>
                <th className="px-3 py-2 text-center">CTA/10</th>
                <th className="px-3 py-2 text-center">Emotion/10</th>
                <th className="px-3 py-2 text-center">Format/10</th>
                <th className="px-3 py-2 text-center">Clarity/10</th>
                <th className="px-3 py-2 text-center">Total/50</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scoresLoading ? (
                [...Array(Math.min(selectedAds.length, 5))].map((_, i) => (
                  <ScoringSkeletonRow key={i} />
                ))
              ) : sortedScoredAds.length > 0 ? (
                sortedScoredAds.map((scored, idx) => {
                  const ad = selectedAds.find((a) => a.id === scored.id) || selectedAds[idx];
                  const isExpanded = expandedScoreRow === scored.id;
                  return (
                    <>
                      <tr
                        key={scored.id}
                        onClick={() => setExpandedScoreRow(isExpanded ? null : scored.id)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-3 py-3 text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-3 max-w-[200px]">
                          <p className="truncate text-gray-700 font-medium">
                            {(ad?.title || ad?.body || '—').slice(0, 80)}
                          </p>
                          <p className="text-gray-400 truncate">{ad?.companyName}</p>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-[10px] text-gray-500">{ad?.brandLabel || '—'}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${scoreColor(scored.hookStrength)}`}>
                            {scored.hookStrength}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${scoreColor(scored.ctaClarity)}`}>
                            {scored.ctaClarity}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${scoreColor(scored.emotionalAppeal)}`}>
                            {scored.emotionalAppeal}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${scoreColor(scored.formatFit)}`}>
                            {scored.formatFit}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${scoreColor(scored.messageClarity)}`}>
                            {scored.messageClarity}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded font-bold text-xs ${scoreColor(scored.total / 5)}`}>
                            {scored.total}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${scored.id}-exp`} className="bg-blue-50">
                          <td />
                          <td colSpan={8} className="px-4 py-3 space-y-1">
                            <p className="text-xs text-green-700">
                              <span className="font-semibold">✓ Standout:</span> <BoldText text={scored.standoutElement} />
                            </p>
                            <p className="text-xs text-red-600">
                              <span className="font-semibold">△ Weakness:</span> <BoldText text={scored.weakness} />
                            </p>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Scoring will appear here once analysis completes
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 8: Video Script Card ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              <Bold>Video Script</Bold> Brief
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              AI-synthesized from top-performing patterns in your selected ads
            </p>
            {sortedScoredAds.length > 0 && (() => {
              const topThreeAds = sortedScoredAds.slice(0, 3).map(s => {
                const ad = selectedAds.find(a => a.id === s.id);
                return ad?.companyName || s.id;
              });
              const topAdPreview = selectedAds.find(a => a.id === sortedScoredAds[0]?.id);
              return (
                <p className="text-xs text-gray-400 mt-0.5">
                  Generated from: {topThreeAds.join(', ')} ads
                  {topAdPreview && ` · Top: ${topAdPreview.brandLabel} — "${(topAdPreview.title || topAdPreview.body || '').slice(0, 60)}"`}
                </p>
              );
            })()}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopyScript}
              disabled={!scores?.videoScriptBrief}
              className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-40 transition-colors"
            >
              {scriptCopied ? '✓ Copied!' : '📋 Copy Script'}
            </button>
            <button
              onClick={handleRegenerateScript}
              disabled={scoresLoading}
              className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-40 transition-colors"
            >
              {scoresLoading ? '⏳ Regenerating…' : '🔄 Regenerate'}
            </button>
          </div>
        </div>

        {scoresLoading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-4 w-32 bg-gray-200 rounded flex-shrink-0" />
                <div className="h-4 bg-gray-100 rounded flex-1" />
              </div>
            ))}
          </div>
        ) : scores?.videoScriptBrief ? (
          <div className="divide-y divide-gray-100">
            {[
              { label: 'Format / Tone', value: `${scores.videoScriptBrief.format} · ${scores.videoScriptBrief.tone}` },
              { label: 'HOOK',              value: scores.videoScriptBrief.hook },
              { label: 'BODY',              value: scores.videoScriptBrief.body },
              { label: 'CTA',               value: scores.videoScriptBrief.cta },
              { label: 'VISUAL DIRECTION',  value: scores.videoScriptBrief.visualDirection },
              { label: 'WHY IT WORKS',      value: scores.videoScriptBrief.whyItWorks },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-4 px-6 py-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide w-32 flex-shrink-0 pt-0.5">
                  {label}
                </span>
                <BoldText text={value} className="text-sm text-gray-700 leading-relaxed flex-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            <p>Video script brief will appear after ad scoring completes.</p>
            <button onClick={fetchScores} className="mt-2 text-blue-600 hover:underline text-xs">
              Run scoring now →
            </button>
          </div>
        )}
      </div>

      {/* ── Section 9: Bottom Nav ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4">
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-xl font-semibold text-gray-700 border-2 border-gray-200 hover:bg-gray-50 transition-colors text-sm"
        >
          ← Back to Intelligence Hub
        </button>
        <button
          onClick={() => navigate('/gaps')}
          className="px-6 py-3 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors text-sm"
        >
          View <Bold>Gap Radar</Bold> →
        </button>
      </div>
    </div>
  );
}
