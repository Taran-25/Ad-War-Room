/**
 * CreativeTrendsChart.jsx
 * Horizontal bar chart (Recharts) showing creative format/trend distribution.
 *
 * Layout: YAxis width={240} handles label space — NO large left margin.
 * margin.left: 0 is critical; large left margin + YAxis width + right margin
 * can exceed container width, leaving bars zero or negative space.
 *
 * Colors by direction: rising=green, stable=gray, declining=red.
 *
 * Props:
 *   trends  {Array}  – array of { trend, count, percentage, brand, direction }
 *   ads     {Array}  – raw ads used as fallback when trends not yet available
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

const DIRECTION_COLOR = {
  rising:   '#16A34A',
  declining: '#DC2626',
  stable:   '#6B7280',
};

function computeTrendsFromAds(ads) {
  if (!ads || ads.length === 0) return [];
  const counts = {};
  ads.forEach((ad) => {
    const key = ad.creativeFormat || ad.mediaType || 'Unknown';
    counts[key] = (counts[key] || 0) + 1;
  });
  const total = ads.length;
  return Object.entries(counts)
    .map(([trend, count]) => ({
      trend,
      count,
      percentage: Math.round((count / total) * 100),
      brand: 'All',
      direction: 'stable',
    }))
    .sort((a, b) => b.count - a.count);
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const dir = d.direction || 'stable';
  const dirLabel = { rising: '↑ Rising', declining: '↓ Declining', stable: '→ Stable' }[dir] || dir;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm max-w-[260px]">
      <p className="font-semibold text-gray-800 whitespace-normal">{d.trend}</p>
      <p className="text-gray-600 mt-1">
        {d.count != null ? `${d.count} ads · ` : ''}{Number(d.percentage).toFixed(1)}%
      </p>
      <p className="text-xs mt-0.5" style={{ color: DIRECTION_COLOR[dir] }}>
        {dirLabel}
      </p>
    </div>
  );
};

export default function CreativeTrendsChart({ trends, ads }) {
  const data = trends && trends.length > 0 ? trends : computeTrendsFromAds(ads);
  if (data.length === 0) return null;

  // Sort descending — Recharts v3 renders Y-axis top-to-bottom,
  // so highest percentage appears at the top of the chart.
  const chartData = [...data]
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 8);
  const chartHeight = Math.max(320, chartData.length * 52);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-lg">📈</span>
        <h2 className="text-base font-semibold text-gray-800">Creative Trends</h2>
        <span className="text-xs text-gray-400">by format / theme</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-600 inline-block" /> Rising
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" /> Stable
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-600 inline-block" /> Declining
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: '#9CA3AF' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="trend"
            width={320}
            tick={{ fontSize: 12, fill: '#374151' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v.length > 52 ? v.slice(0, 52) + '…' : v)}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />
          <Bar dataKey="percentage" barSize={26} radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={DIRECTION_COLOR[entry.direction] ?? DIRECTION_COLOR.stable}
              />
            ))}
            <LabelList
              dataKey="percentage"
              position="right"
              formatter={(v) => `${Number(v).toFixed(1)}%`}
              style={{ fill: '#111827', fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
