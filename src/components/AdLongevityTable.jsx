/**
 * AdLongevityTable.jsx
 * Ranked table of ads sorted by days running (descending).
 * Ads running 60+ days get a gold "Proven Performer" badge.
 *
 * Props:
 *   ads {Array} – array of ad objects
 */

const BRAND_DOT = {
  'Man Matters': 'bg-blue-600',
  'Bebodywise': 'bg-pink-600',
  'Little Joys': 'bg-green-600',
};

function PerformanceBadge({ daysRunning }) {
  if (daysRunning >= 60) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
        🏆 Proven Performer
      </span>
    );
  }
  if (daysRunning >= 30) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-100">
        📈 Gaining Traction
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
      🆕 New
    </span>
  );
}

export default function AdLongevityTable({ ads }) {
  if (!ads || ads.length === 0) return null;

  const sorted = [...ads].sort((a, b) => (b.daysRunning || 0) - (a.daysRunning || 0));
  const top10 = sorted.slice(0, 10);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <span className="text-lg">🏅</span>
        <h2 className="text-base font-semibold text-gray-800">Ad Longevity Ranking</h2>
        <span className="text-xs text-gray-400 ml-1">Top 10 longest-running ads</span>
        <span className="ml-auto px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full border border-amber-200 font-medium">
          60d+ = Proven Performer
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 font-medium uppercase tracking-wider border-b border-gray-100">
              <th className="text-left pl-6 pr-3 py-3">#</th>
              <th className="text-left pr-3 py-3">Competitor</th>
              <th className="text-left pr-3 py-3">Brand</th>
              <th className="text-left pr-3 py-3 max-w-xs">Ad</th>
              <th className="text-right pr-3 py-3">Days</th>
              <th className="text-left pl-3 pr-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {top10.map((ad, i) => {
              const isProven = (ad.daysRunning || 0) >= 60;
              return (
                <tr
                  key={`${ad.companyName}-${ad.id || i}`}
                  className={`hover:bg-gray-50 transition-colors ${
                    isProven ? 'bg-amber-50/40' : ''
                  }`}
                >
                  {/* Rank */}
                  <td className="pl-6 pr-3 py-3 text-gray-400 font-medium">
                    {i + 1}
                  </td>
                  {/* Competitor */}
                  <td className="pr-3 py-3 font-medium text-gray-800">
                    {ad.companyName}
                  </td>
                  {/* Brand */}
                  <td className="pr-3 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          BRAND_DOT[ad.brandLabel] || 'bg-gray-400'
                        }`}
                      />
                      <span className="text-xs text-gray-600">{ad.brandLabel}</span>
                    </span>
                  </td>
                  {/* Ad title (truncated) */}
                  <td className="pr-3 py-3 max-w-xs">
                    <p className="text-gray-700 truncate max-w-[200px]" title={ad.title}>
                      {ad.title || ad.body?.slice(0, 50) || '—'}
                    </p>
                  </td>
                  {/* Days running */}
                  <td className="pr-3 py-3 text-right">
                    <span
                      className={`font-bold ${
                        isProven ? 'text-amber-600' : 'text-gray-700'
                      }`}
                    >
                      {ad.daysRunning || 0}d
                    </span>
                  </td>
                  {/* Badge */}
                  <td className="pl-3 pr-6 py-3">
                    <PerformanceBadge daysRunning={ad.daysRunning || 0} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
