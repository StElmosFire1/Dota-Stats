import React, { useEffect, useState } from 'react';
import { getWeeklyReport } from '../api';

export default function WeeklyReportTile() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [paywall, setPaywall] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWeeklyReport()
      .then(d => setReport(d))
      .catch(err => {
        if (err.paywall) setPaywall(true);
        else if (err.status !== 401) setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (paywall) {
    return (
      <div style={{
        background: 'rgba(245,158,11,.08)', border: '1px solid var(--amber)',
        padding: 12, borderRadius: 8, marginBottom: 12,
      }}>
        <strong>Weekly AI Report</strong> — Pro feature.{' '}
        <a href="/pricing">Upgrade →</a>
      </div>
    );
  }
  if (error || !report) return null;

  return (
    <div style={{
      background: 'var(--ink-navy, #0d1424)', color: 'var(--parchment, #f5efe2)',
      border: '1px solid var(--brass, #c5a975)', padding: 16, borderRadius: 8,
      marginBottom: 12,
    }}>
      <h3 style={{ margin: '0 0 8px', color: 'var(--brass, #c5a975)' }}>
        Weekly Report
      </h3>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5 }}>
        {report.report || '(no content)'}
      </div>
      {report.stats?.games_count != null && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: .7 }}>
          {report.stats.games_count} games · {report.stats.win_rate}% WR
          {report.stats.avg_perf != null ? ` · PERF ${report.stats.avg_perf}` : ''}
        </div>
      )}
    </div>
  );
}
