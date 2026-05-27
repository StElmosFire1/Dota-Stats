import React, { useEffect, useState, useCallback } from 'react';
import { useSuperuser } from '../context/SuperuserContext';
import { getFeatureHealth, runFeatureHealth } from '../api';

function fmtTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch (_) { return '—'; }
}
function fmtAge(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function StatusBadge({ status }) {
  const map = {
    ok:        { bg: '#1f4d24', fg: '#7ee07e', label: 'OK',        dot: '#4caf50' },
    red:       { bg: '#4d1f1f', fg: '#ff8a8a', label: 'FAILING',   dot: '#f44336' },
    yellow:    { bg: '#4d3f1f', fg: '#ffd17a', label: 'DEGRADED',  dot: '#f59e0b' },
    never_run: { bg: '#2a2a2a', fg: '#aaa',    label: 'NEVER RUN', dot: '#888' },
  };
  const s = map[status] || map.never_run;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.fg,
    }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot }} />
      {s.label}
    </span>
  );
}

export default function AdminFeatureHealth() {
  const { isSuperuser, superuserKey, setShowModal } = useSuperuser() || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(null); // 'all' | key | null

  const reload = useCallback(async () => {
    if (!isSuperuser) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const data = await getFeatureHealth(superuserKey);
      setRows(Array.isArray(data?.probes) ? data.probes : []);
    } catch (e) { setError(e.message || 'Failed to load.'); }
    setLoading(false);
  }, [isSuperuser, superuserKey]);

  useEffect(() => { reload(); }, [reload]);

  const runProbe = async (key) => {
    setRunning(key || 'all'); setError(null);
    try {
      const data = await runFeatureHealth(superuserKey, key || null);
      setRows(Array.isArray(data?.probes) ? data.probes : []);
    } catch (e) { setError(e.message || 'Run failed.'); }
    setRunning(null);
  };

  if (!isSuperuser) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1>Feature health</h1>
        <p>Superuser access required.</p>
        <button type="button" className="btn" onClick={() => setShowModal?.(true)}>Log in as superuser</button>
      </div>
    );
  }

  const summary = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="container" style={{ padding: '20px 16px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Feature health</h1>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn"
          onClick={() => runProbe(null)}
          disabled={!!running}
          aria-label="Run every probe now"
        >
          {running === 'all' ? 'Running…' : '▶ Run all'}
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={reload}
          disabled={!!running || loading}
          aria-label="Refresh snapshot"
        >
          ↻ Refresh
        </button>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
        Lightweight probes that run on a cron tick (default every 30 min) plus
        on-demand from this page. Red status auto-DMs the bot owner once per
        24 h. Use this when you can't remember whether subsystem X still works.
      </p>

      {error && (
        <div role="alert" style={{
          padding: 10, marginBottom: 12, borderRadius: 6,
          background: '#4d1f1f', color: '#ffb3b3', fontSize: 13,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        <span>{rows.length} probes</span>
        {summary.ok ? <span>· <strong style={{ color: '#7ee07e' }}>{summary.ok} OK</strong></span> : null}
        {summary.red ? <span>· <strong style={{ color: '#ff8a8a' }}>{summary.red} failing</strong></span> : null}
        {summary.never_run ? <span>· {summary.never_run} never run</span> : null}
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--bg-card)' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Feature</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', width: 130 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', width: 180 }}>Last run</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', width: 180 }}>Last success</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.key}</div>
                    {r.reason && (
                      <div style={{
                        marginTop: 4, fontSize: 11,
                        color: r.status === 'ok' ? 'var(--text-muted)' : '#ffb3b3',
                      }}>{r.reason}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <StatusBadge status={r.status} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div>{fmtAge(r.ran_at)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtTime(r.ran_at)}</div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div>{fmtAge(r.last_success_at) || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtTime(r.last_success_at)}</div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!!running}
                      onClick={() => runProbe(r.key)}
                      aria-label={`Run ${r.label} now`}
                    >
                      {running === r.key ? 'Running…' : 'Run now'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
