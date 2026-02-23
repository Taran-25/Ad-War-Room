/**
 * FilterBar.jsx
 * Sticky filter/tab bar below the header.
 * Controls: brand tabs, ad format, active status, sort order,
 *           and optionally competitor dropdown, min-days slider, clear button.
 *
 * Props:
 *   selectedBrand      {string}    – currently active brand ('All' | brand name)
 *   onBrandChange      {Function}  – (brand) => void
 *   formatFilter       {string}    – 'all' | 'video' | 'image' | 'carousel'
 *   onFormatChange     {Function}  – (format) => void
 *   statusFilter       {string}    – 'all' | 'active' | 'inactive'
 *   onStatusChange     {Function}  – (status) => void
 *   sortBy             {string}    – 'daysRunning' | 'startDate' | 'brand'
 *   onSortChange       {Function}  – (sort) => void
 *   totalShowing       {number}    – how many ads are currently shown
 *   competitors        {Array}     – [{name, companyName}] for dropdown (optional)
 *   selectedCompetitor {string}    – currently selected competitor (default 'all')
 *   onCompetitorChange {Function}  – (companyName) => void (optional)
 *   minDaysRunning     {number}    – minimum days running filter (default 0)
 *   onMinDaysChange    {Function}  – (days) => void (optional)
 *   onClearFilters     {Function}  – () => void (optional)
 *   liveCount          {string}    – overrides the "{N} ads" count display (optional)
 */

const BRANDS = ['All', 'Man Matters', 'Bebodywise', 'Little Joys'];

const BRAND_COLORS = {
  'Man Matters': 'bg-blue-600 text-white',
  'Bebodywise': 'bg-pink-600 text-white',
  'Little Joys': 'bg-green-600 text-white',
  'All': 'bg-gray-900 text-white',
};

const BRAND_INACTIVE = {
  'Man Matters': 'text-blue-600 border-blue-200 hover:bg-blue-50',
  'Bebodywise': 'text-pink-600 border-pink-200 hover:bg-pink-50',
  'Little Joys': 'text-green-600 border-green-200 hover:bg-green-50',
  'All': 'text-gray-700 border-gray-200 hover:bg-gray-50',
};

export default function FilterBar({
  selectedBrand,
  onBrandChange,
  formatFilter,
  onFormatChange,
  statusFilter,
  onStatusChange,
  sortBy,
  onSortChange,
  totalShowing,
  competitors = [],
  selectedCompetitor = 'all',
  onCompetitorChange,
  minDaysRunning = 0,
  onMinDaysChange,
  onClearFilters,
  liveCount,
  ads = [],
}) {
  const hasExtendedFilters = competitors.length > 0 || onMinDaysChange || onClearFilters;

  // Dynamic counts derived from current ad dataset
  const activeCount = ads.filter(a => a.isActive).length;
  const inactiveCount = ads.filter(a => !a.isActive).length;
  const formatCounts = {
    video:    ads.filter(a => (a.mediaType || a.media_type || '').toLowerCase() === 'video').length,
    image:    ads.filter(a => (a.mediaType || a.media_type || '').toLowerCase() === 'image').length,
    carousel: ads.filter(a => (a.mediaType || a.media_type || '').toLowerCase() === 'carousel').length,
  };

  return (
    <div className="sticky top-16 z-10 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {/* Brand tabs */}
        <div className="flex flex-wrap gap-2 mb-3">
          {BRANDS.map((brand) => {
            const isActive = selectedBrand === brand;
            return (
              <button
                key={brand}
                onClick={() => onBrandChange(brand)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  isActive
                    ? BRAND_COLORS[brand]
                    : `bg-white border ${BRAND_INACTIVE[brand]}`
                }`}
              >
                {brand}
              </button>
            );
          })}
          {(liveCount !== undefined || totalShowing !== undefined) && (
            <span className="ml-auto self-center text-xs text-gray-400">
              {liveCount !== undefined ? liveCount : `${totalShowing} ads`}
            </span>
          )}
        </div>

        {/* Secondary filters */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Format */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium">Format:</span>
            {['all', 'video', 'image', 'carousel'].map((fmt) => {
              const count = fmt === 'all' ? ads.length : (formatCounts[fmt] || 0);
              if (fmt !== 'all' && count === 0) return null;
              return (
                <button
                  key={fmt}
                  onClick={() => onFormatChange(fmt)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    formatFilter === fmt
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {fmt.charAt(0).toUpperCase() + fmt.slice(1)}{fmt !== 'all' && ` (${count})`}
                </button>
              );
            })}
          </div>

          {/* Status */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium">Status:</span>
            {['all', 'active', 'inactive'].map((s) => {
              const count = s === 'all' ? ads.length : s === 'active' ? activeCount : inactiveCount;
              if (s !== 'all' && count === 0) return null;
              return (
                <button
                  key={s}
                  onClick={() => onStatusChange(s)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    statusFilter === s
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}{s !== 'all' && ` (${count})`}
                </button>
              );
            })}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-gray-500 font-medium">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="daysRunning">Longest Running</option>
              <option value="startDate">Most Recent</option>
              <option value="brand">Brand</option>
            </select>
          </div>
        </div>

        {/* Extended filters row (optional) */}
        {hasExtendedFilters && (
          <div className="flex flex-wrap gap-3 items-center mt-2 pt-2 border-t border-gray-100">
            {/* Competitor dropdown */}
            {competitors.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 font-medium">Competitor:</span>
                <select
                  value={selectedCompetitor}
                  onChange={(e) => onCompetitorChange?.(e.target.value)}
                  className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Competitors</option>
                  {competitors.map((c) => (
                    <option key={c.companyName} value={c.companyName}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Min Days Running slider */}
            {onMinDaysChange && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">
                  Min <span className="font-semibold text-gray-900">{minDaysRunning}d</span> running:
                </span>
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="5"
                  value={minDaysRunning}
                  onChange={(e) => onMinDaysChange(Number(e.target.value))}
                  className="w-24 accent-blue-600"
                />
              </div>
            )}

            {/* Clear Filters button */}
            {onClearFilters && (
              <button
                onClick={onClearFilters}
                className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-2.5 py-1 rounded-md transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
