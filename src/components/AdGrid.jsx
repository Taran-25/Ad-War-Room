/**
 * AdGrid.jsx
 * Responsive grid of AdCards.
 * Columns: 4 on xl, 2 on md, 1 on mobile.
 *
 * Props:
 *   ads         {Array}   – filtered + sorted array of ad objects
 *   isLoading   {boolean} – shows skeleton cards when true
 *   selectable  {boolean} – enable selection mode on cards (default false)
 *   selectedIds {Set}     – Set of selected ad IDs (default empty Set)
 *   onSelect    {Function}– (ad) => void callback for selection
 */

import AdCard from './AdCard.jsx';

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 border-t-4 border-t-gray-200 p-4 animate-pulse space-y-3">
      <div className="flex gap-2">
        <div className="h-5 w-24 bg-gray-200 rounded-full" />
        <div className="h-5 w-5 bg-gray-200 rounded" />
      </div>
      <div className="h-3 w-16 bg-gray-200 rounded" />
      <div className="h-4 w-full bg-gray-200 rounded" />
      <div className="h-4 w-4/5 bg-gray-200 rounded" />
      <div className="h-20 w-full bg-gray-100 rounded" />
      <div className="h-3 w-20 bg-gray-200 rounded" />
      <div className="h-6 w-24 bg-gray-200 rounded-full" />
    </div>
  );
}

export default function AdGrid({ ads, isLoading, selectable = false, selectedIds = new Set(), onSelect }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!ads || ads.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
        <p className="text-4xl mb-3">📭</p>
        <p className="text-gray-500 font-medium">No ads match your filters</p>
        <p className="text-gray-400 text-sm mt-1">Try adjusting the brand, format, or status filters</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {ads.map((ad, i) => (
        <AdCard
          key={`${ad.companyName}-${ad.id || i}`}
          ad={ad}
          selectable={selectable}
          selected={selectedIds.has(ad.id)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
