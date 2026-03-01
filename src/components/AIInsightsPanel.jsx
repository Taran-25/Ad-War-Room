/**
 * AIInsightsPanel.jsx
 * Two-column AI-generated intelligence section:
 *   Left (60%): Top 5-7 Insights with priority indicators
 *   Right (40%): Weekly Brief (prose) + Messaging Shifts (table)
 *
 * Props:
 *   brief       {object|null} – Gemini analysis object
 *   isLoading   {boolean}     – shows skeleton while loading
 *   onAnalyze   {Function}    – triggers fresh Gemini analysis
 *   threatLevel {string}      – 'low' | 'medium' | 'high'
 *   threatReason {string}     – explanation for threat level
 */

import { BoldText } from '../utils/boldKeywords.jsx';
import { HighlightText } from '../utils/highlightKeywords.jsx';

const PRIORITY_STYLES = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

const BORDER_STYLES = {
  high:   'border-l-4 border-red-400 pl-3',
  medium: 'border-l-4 border-amber-400 pl-3',
  low:    'border-l-4 border-green-400 pl-3',
};

const THREAT_STYLES = {
  high: 'bg-red-50 border-red-200 text-red-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low: 'bg-green-50 border-green-200 text-green-700',
};

function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
  return <div className={`${width} ${height} bg-gray-200 rounded animate-pulse`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <SkeletonLine key={i} width={i % 2 === 0 ? 'w-full' : 'w-4/5'} />
      ))}
    </div>
  );
}

export default function AIInsightsPanel({ brief, isLoading, onAnalyze, threatLevel, threatReason, selectedBrand, sampled, adCount }) {
  const insights = brief?.topInsights || [];
  const weeklyBrief = brief?.weeklyBrief || '';
  const allMessagingShifts = brief?.messagingShifts || [];
  const validShifts = allMessagingShifts.filter(s => s.oldMessage && s.newMessage);
  const opportunityGaps = brief?.opportunityGaps || [];
  const tLevel = threatLevel || brief?.threatLevel || 'medium';
  const tReason = threatReason || brief?.threatReason || '';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h2 className="text-base font-semibold text-gray-800">AI Intelligence Brief</h2>
          <span className="text-xs text-gray-400">
            {selectedBrand && selectedBrand !== 'All' ? selectedBrand : 'All Brands'} · Gemini 2.5 Flash
          </span>
        </div>
        <div className="flex items-center gap-3">
          {tLevel && (
            <span className={`px-3 py-1 text-xs font-medium rounded-full border ${THREAT_STYLES[tLevel]}`}>
              Threat: {tLevel.charAt(0).toUpperCase() + tLevel.slice(1)}
            </span>
          )}
          <button
            onClick={onAnalyze}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Analyzing…' : 'Re-analyze'}
          </button>
        </div>
      </div>

      {sampled && adCount > 50 && (
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-600">
          Analysis based on a representative sample of 50 ads (top performers + newest + random sample) from your {adCount} selected ads.
        </div>
      )}
      <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
        {/* Left: Top Insights (60%) */}
        <div className="lg:w-3/5 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <span>🎯</span> Top Insights
          </h3>
          {isLoading ? (
            <LoadingSkeleton />
          ) : insights.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm mb-3">No insights yet</p>
              <button
                onClick={onAnalyze}
                className="text-sm text-blue-600 hover:underline"
              >
                Run AI analysis →
              </button>
            </div>
          ) : (
            <ul className="space-y-4">
              {insights.map((item, i) => (
                <li key={i} className={`py-1 ${BORDER_STYLES[item.priority] || BORDER_STYLES.medium}`}>
                  {/* Insight row */}
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded border uppercase tracking-wide flex-shrink-0 ${PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium}`}>
                      {item.priority || 'med'}
                    </span>
                    <HighlightText text={item.insight} className="text-sm text-gray-700 leading-relaxed" />
                  </div>

                  {/* Recommendation block */}
                  {item.recommendation && (
                    <div className="mt-2 ml-7 bg-orange-50 border border-orange-100 rounded-lg p-2.5 text-xs space-y-1">
                      <p className="flex items-start gap-1.5">
                        <span className="text-orange-500 flex-shrink-0 font-bold leading-relaxed">→</span>
                        <span>
                          <span className="font-semibold text-orange-700">Do: </span>
                          <HighlightText text={item.recommendation.what} className="text-gray-700" />
                        </span>
                      </p>
                      {item.recommendation.timeline && (
                        <p className="text-gray-500 pl-4">
                          Timeline: <span className="font-medium text-gray-700">{item.recommendation.timeline}</span>
                        </p>
                      )}
                      {item.recommendation.measure && (
                        <p className="text-gray-500 pl-4">
                          Measure: <span className="font-medium text-gray-700">{item.recommendation.measure}</span>
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Opportunity Gaps */}
          {opportunityGaps.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span>💡</span> Opportunity Gaps
              </h3>
              <ul className="space-y-2">
                {opportunityGaps.map((gap, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-green-500 mt-0.5 flex-shrink-0">→</span>
                    <BoldText text={gap} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: Weekly Brief + Messaging Shifts (40%) */}
        <div className="lg:w-2/5 p-6 space-y-5">
          {/* Weekly Brief */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span>📋</span>
              {selectedBrand && selectedBrand !== 'All' ? `${selectedBrand} — Weekly Brief` : 'All Brands — Weekly Brief'}
            </h3>
            {isLoading ? (
              <div className="space-y-2">
                <SkeletonLine />
                <SkeletonLine width="w-5/6" />
                <SkeletonLine />
                <SkeletonLine width="w-4/5" />
              </div>
            ) : weeklyBrief ? (
              <BoldText text={weeklyBrief} className="text-sm text-gray-600 leading-relaxed" />
            ) : (
              <p className="text-sm text-gray-400 italic">Brief will appear after analysis.</p>
            )}

            {tReason && (
              <p className={`mt-3 text-xs px-3 py-2 rounded-lg border ${THREAT_STYLES[tLevel]}`}>
                <strong>Threat context:</strong> {tReason}
              </p>
            )}
          </div>

          {/* Messaging Shifts — only shown when there are valid before/after entries */}
          {validShifts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span>🔄</span> Messaging Shifts
              </h3>
              <div className="space-y-3">
                {validShifts.map((shift, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 text-xs">
                    <p className="font-semibold text-gray-800 mb-1">{shift.competitor}</p>
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 flex-shrink-0">Before:</span>
                      <BoldText text={shift.oldMessage} className="text-gray-600 line-through" />
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 flex-shrink-0">Now:</span>
                      <BoldText text={shift.newMessage} className="text-gray-800 font-medium" />
                    </div>
                    {shift.signal && (
                      <p className="text-gray-400 mt-1 italic">Signal: {shift.signal}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
