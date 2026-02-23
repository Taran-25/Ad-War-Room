/**
 * Header.jsx
 * Top navigation bar showing the app title, last-updated timestamp,
 * and a Refresh button (with loading spinner).
 *
 * Props:
 *   lastUpdated  {Date|null}  – timestamp of the most recent data fetch
 *   isLoading    {boolean}    – shows spinner on refresh button when true
 *   onRefresh    {Function}   – callback invoked when Refresh is clicked
 *   usingMock    {boolean}    – shows "Demo Mode" badge if true
 */

export default function Header({ lastUpdated, isLoading, onRefresh, usingMock }) {
  const formatted = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: 'short',
      })
    : null;

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Brand + Title */}
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <span className="w-3 h-3 rounded-full bg-blue-600" title="Man Matters" />
              <span className="w-3 h-3 rounded-full bg-pink-600" title="Bebodywise" />
              <span className="w-3 h-3 rounded-full bg-green-600" title="Little Joys" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                Ad War Room
              </h1>
              <p className="text-xs text-gray-500">Mosaic Wellness · Competitive Intelligence</p>
            </div>
            {usingMock && (
              <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                Demo Mode
              </span>
            )}
          </div>

          {/* Last updated + Refresh */}
          <div className="flex items-center gap-3">
            {formatted && (
              <span className="text-xs text-gray-400">
                Updated {formatted}
              </span>
            )}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12" cy="12" r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Refreshing…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Refresh Data
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
