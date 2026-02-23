/**
 * KPICards.jsx
 * Four summary metric cards displayed at the top of the dashboard:
 *   1. Total Ads tracked
 *   2. Active Ads (currently running)
 *   3. Average Days Running
 *   4. Longest Running ad (in days)
 *
 * Props:
 *   ads {Array} – full array of ad objects (after brand filter)
 */

function KPICard({ title, value, subtitle, icon, accentColor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={`p-2.5 rounded-lg ${accentColor} bg-opacity-10`}>
        <span className="text-2xl">{icon}</span>
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function KPICards({ ads }) {
  if (!ads || ads.length === 0) {
    return null;
  }

  const totalAds = ads.length;
  const activeAds = ads.filter((a) => a.isActive).length;
  const avgDays =
    ads.length > 0
      ? Math.round(ads.reduce((sum, a) => sum + (a.daysRunning || 0), 0) / ads.length)
      : 0;
  const longest = ads.reduce(
    (max, a) => ((a.daysRunning || 0) > (max.daysRunning || 0) ? a : max),
    ads[0]
  );
  const longestDays = longest?.daysRunning || 0;
  const longestCompany = longest?.companyName || '';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        title="Total Ads Tracked"
        value={totalAds}
        subtitle="across all competitors"
        icon="📊"
        accentColor="bg-blue-500"
      />
      <KPICard
        title="Active Ads"
        value={activeAds}
        subtitle={`${Math.round((activeAds / totalAds) * 100)}% of total`}
        icon="🟢"
        accentColor="bg-green-500"
      />
      <KPICard
        title="Avg. Days Running"
        value={`${avgDays}d`}
        subtitle="across active campaigns"
        icon="📅"
        accentColor="bg-purple-500"
      />
      <KPICard
        title="Longest Running"
        value={`${longestDays}d`}
        subtitle={longestCompany}
        icon="🥇"
        accentColor="bg-amber-500"
      />
    </div>
  );
}
