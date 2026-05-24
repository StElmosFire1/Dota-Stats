import React from 'react';

// Task #349 — tiny dependency-free SVG trend chart for sponsorship impressions
// + clicks over time. Pads `rows` (a list of `{ day, impressions, clicks }`)
// out to a continuous `days`-day window ending today so gaps render as zero
// rather than collapsing the x-axis. Two stacked polylines (impressions in
// brass, clicks in amber) share a y-axis scaled to whichever metric is larger.
// Hidden entirely when every day in the window is zero — there's nothing to
// plot and a flat line would just be noise.
export default function SponsorshipTrendChart({ rows, days = 30, width = 180, height = 36, label }) {
  const series = React.useMemo(() => fillSeries(rows || [], days), [rows, days]);
  const maxImpr = series.reduce((m, d) => Math.max(m, d.impressions), 0);
  const maxClick = series.reduce((m, d) => Math.max(m, d.clicks), 0);
  const max = Math.max(maxImpr, maxClick);
  if (max <= 0) {
    return (
      <span style={{ color: 'var(--text-muted)', fontSize: 11 }} aria-label={label ? `${label}: no activity yet` : 'No activity yet'}>
        no activity
      </span>
    );
  }
  const stepX = series.length > 1 ? width / (series.length - 1) : width;
  const pointsFor = (key) => series.map((d, i) => {
    const x = i * stepX;
    const y = height - (d[key] / max) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first = series[0].day;
  const last = series[series.length - 1].day;
  const totalImpr = series.reduce((s, d) => s + d.impressions, 0);
  const totalClick = series.reduce((s, d) => s + d.clicks, 0);
  const a11y = `${label ? label + ': ' : ''}${days}-day trend, ${first} to ${last}. ${totalImpr.toLocaleString()} impressions, ${totalClick.toLocaleString()} clicks.`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={a11y}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <title>{a11y}</title>
      <polyline
        fill="none"
        stroke="var(--brass, #c5a975)"
        strokeWidth="1.5"
        points={pointsFor('impressions')}
      />
      <polyline
        fill="none"
        stroke="var(--amber, #f59e0b)"
        strokeWidth="1.5"
        points={pointsFor('clicks')}
      />
    </svg>
  );
}

// Pad an arbitrary list of `{ day: 'YYYY-MM-DD', impressions, clicks }` rows
// out to a continuous, chronologically-ordered window ending on today (UTC).
// Missing days become zero entries so the polyline stays anchored to the
// real time axis instead of stretching across gaps.
function fillSeries(rows, days) {
  const map = new Map();
  for (const r of rows) {
    map.set(r.day, {
      impressions: Number(r.impressions || 0),
      clicks: Number(r.clicks || 0),
    });
  }
  const out = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const hit = map.get(key);
    out.push({
      day: key,
      impressions: hit ? hit.impressions : 0,
      clicks: hit ? hit.clicks : 0,
    });
  }
  return out;
}

// Helper for callers that have the API response shape and need to filter the
// flat trend rows down to a single slot or order before passing them in.
export function trendRowsFor(allRows, key, value) {
  if (!Array.isArray(allRows)) return [];
  return allRows.filter(r => r[key] === value);
}
