/**
 * AdCard.jsx
 * Individual ad card displayed in the AdGrid.
 * Shows brand badge, media type icon, truncated body copy,
 * days running (with Proven Performer highlight for 60+d),
 * CTA, and platform tags.
 *
 * Props:
 *   ad         {object}   – single ad object
 *   selectable {boolean}  – enable selection mode (default false)
 *   selected   {boolean}  – whether this card is selected (default false)
 *   onSelect   {Function} – (ad) => void callback when card is clicked in selectable mode
 */

import { useState } from 'react';

const BRAND_BADGE = {
  'Man Matters': 'bg-blue-100 text-blue-700 border-blue-200',
  'Bebodywise': 'bg-pink-100 text-pink-700 border-pink-200',
  'Little Joys': 'bg-green-100 text-green-700 border-green-200',
};

const BRAND_BORDER = {
  'Man Matters': 'border-t-blue-500',
  'Bebodywise': 'border-t-pink-500',
  'Little Joys': 'border-t-green-500',
};

const MEDIA_ICON = {
  video: '🎬',
  image: '🖼️',
  carousel: '🔀',
};

const PLATFORM_COLORS = {
  Facebook: 'bg-blue-50 text-blue-600',
  Instagram: 'bg-pink-50 text-pink-600',
  Messenger: 'bg-purple-50 text-purple-600',
};

export default function AdCard({ ad, selectable = false, selected = false, onSelect }) {
  const [expanded, setExpanded] = useState(false);

  // Null-safe field extraction
  const safeBody = ad.ad_text || ad.body || ad.description || '';
  const safeCTA = ad.cta_text || ad.cta || ad.callToAction || ad.call_to_action || 'Learn More';
  const safeCompany = ad.company_name || ad.page_name || ad.companyName || ad.advertiser || 'Unknown Brand';
  const safeFormat = ad.mediaType || ad.media_type || ad.ad_type || 'Unknown';
  const safeDays = ad.daysRunning || ad.days_running || 0;
  const safeTitle = ad.title || safeCompany;

  const isProven = safeDays >= 60;

  const PREVIEW_LENGTH = 140;
  const bodyFull = safeBody;
  const bodyShort = bodyFull.length > PREVIEW_LENGTH ? bodyFull.slice(0, PREVIEW_LENGTH - 1) + '…' : bodyFull;
  const showToggle = selectable && bodyFull.length > PREVIEW_LENGTH;

  const displayBody = selectable
    ? (expanded ? bodyFull : bodyShort)
    : (bodyFull.length > 120 ? bodyFull.slice(0, 117) + '…' : bodyFull);

  return (
    <div
      onClick={selectable ? () => onSelect?.(ad) : undefined}
      className={`bg-white rounded-xl border border-t-4 ${
        BRAND_BORDER[ad.brandLabel] || 'border-t-gray-300'
      } shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden ${
        selectable ? 'cursor-pointer' : ''
      } ${
        selected
          ? 'border-2 border-blue-500 bg-blue-50/50'
          : 'border-gray-200'
      }`}
    >
      {/* Card header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          {/* Checkbox (selectable mode) + brand badge + media icon */}
          <div className="flex items-center gap-2">
            {selectable && (
              <input
                type="checkbox"
                checked={selected}
                readOnly
                className="h-4 w-4 accent-blue-600 pointer-events-none flex-shrink-0"
              />
            )}
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                BRAND_BADGE[ad.brandLabel] || 'bg-gray-100 text-gray-600 border-gray-200'
              }`}
            >
              {ad.brandLabel || 'Unknown'}
            </span>
            <span title={safeFormat} className="text-base">
              {MEDIA_ICON[safeFormat?.toLowerCase()] || '📄'}
            </span>
          </div>

          {/* Right side: translated badge + selected badge + status dot */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {ad.translated && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                Translated
              </span>
            )}
            {selectable && selected && (
              <span className="bg-blue-600 text-white text-xs rounded-full px-1.5">✓</span>
            )}
            <span
              title={ad.isActive ? 'Active' : 'Inactive'}
              className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                ad.isActive ? 'bg-green-400' : 'bg-gray-300'
              }`}
            />
          </div>
        </div>

        {/* Company name */}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">
          {safeCompany}
        </p>

        {/* Ad title */}
        {safeTitle && (
          <p className="text-sm font-semibold text-gray-800 mt-1 leading-snug line-clamp-2">
            {safeTitle}
          </p>
        )}
      </div>

      {/* Body copy */}
      <div className="px-4 py-3 flex-1">
        {safeBody ? (
          <p className="text-xs text-gray-600 leading-relaxed">{displayBody}</p>
        ) : (
          <p className="text-xs text-gray-400 italic">Ad copy not available</p>
        )}
        {showToggle && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="text-xs text-blue-600 hover:underline mt-1"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 space-y-2">
        {/* Days running + Proven Performer badge */}
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold ${
              isProven ? 'text-amber-600' : 'text-gray-500'
            }`}
          >
            {safeDays}d running
          </span>
          {isProven && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-bold rounded-full uppercase tracking-wide">
              🏆 Proven Performer
            </span>
          )}
        </div>

        {/* CTA */}
        {safeCTA && (
          <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-md">
            {safeCTA}
          </span>
        )}

        {/* Platform tags */}
        {ad.platforms && ad.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {ad.platforms.map((p) => (
              <span
                key={p}
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                  PLATFORM_COLORS[p] || 'bg-gray-100 text-gray-500'
                }`}
              >
                {p}
              </span>
            ))}
          </div>
        )}

        {/* Impressions */}
        {ad.impressions && ad.impressions !== 'Unknown' && (
          <p className="text-[10px] text-gray-400">
            Impressions: {ad.impressions}
          </p>
        )}
      </div>
    </div>
  );
}
