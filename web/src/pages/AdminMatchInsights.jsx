import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getMatchInsights,
  startMatchInsightsBackfill,
  getMatchInsightsBackfillStatus,
  matchInsightsWardHeatmapUrl,
} from '../api';
import { useSuperuser } from '../context/SuperuserContext';

const CARD = {
  background: '#1e293b', border: '1px solid #334155', borderRadius: 10,
  padding: 16, marginBottom: 16,
};
const BTN = {
  background: '#1d4ed8', color: '#fff', border: 0, padding: '6px 12px',
  borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const BTN_GHOST = {
  background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
  padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
};

function flagColor(state) {
  if (state === 'on') return '#10b981';
  if (state === 'off') return '#64748b';
  return '#f59e0b';
}

function InsightCard({ insight, matchId, superuserKey }) {
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const isHeatmap = insight.key === 'match_insights_vision_report';

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span
          aria-label={`feature flag ${insight.flag_state}`}
          style={{
            width: 10, height: 10, borderRadius: 5,
            background: flagColor(insight.flag_state), flexShrink: 0,
          }}
        />
        <h3 style={{ flex: 1, margin: 0, fontSize: 16, color: '#e2e8f0' }}>
          {insight.label}
          <span style={{
            marginLeft: 8, fontSize: 11, color: '#64748b', textTransform: 'uppercase',
          }}>
            flag: {insight.flag_state}
          </span>
        </h3>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse insight' : 'Expand insight'}
          style={BTN_GHOST}
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          onClick={() => setShowRaw(v => !v)}
          aria-pressed={showRaw}
          aria-label="Toggle raw JSON view"
          style={BTN_GHOST}
        >
          Raw
        </button>
      </div>
      <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: expanded ? 12 : 0 }}>
        {insight.summary}
      </div>
      {expanded && (
        <div style={{ marginTop: 8 }}>
          {isHeatmap && (
            <div style={{ marginBottom: 12 }}>
              <img
                src={matchInsightsWardHeatmapUrl(superuserKey, matchId)}
                alt="Ward heatmap for this match"
                style={{ width: '100%', maxWidth: 480, borderRadius: 8, border: '1px solid #334155' }}
              />
            </div>
          )}
          {showRaw ? (
            <pre style={{
              background: '#0f172a', color: '#cbd5e1', padding: 12, borderRadius: 6,
              fontSize: 11, overflow: 'auto', maxHeight: 320, margin: 0,
            }}>{JSON.stringify(insight, null, 2)}</pre>
          ) : (
            <InsightRows rows={insight.rows} />
          )}
        </div>
      )}
    </div>
  );
}

function InsightRows({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <div style={{ color: '#64748b', fontStyle: 'italic', fontSize: 13 }}>No rows.</div>;
  }
  const cols = Object.keys(rows[0]);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, color: '#cbd5e1', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0f172a' }}>
            {cols.map(c => (
              <th key={c} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #334155' }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
              {cols.map(c => (
                <td key={c} style={{ padding: '6px 8px', whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {formatCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  return String(v);
}

export default function AdminMatchInsights() {
  const { matchId: routeMatchId } = useParams();
  const navigate = useNavigate();
  const { superuserKey, isSuperuser } = useSuperuser();
  const [matchIdInput, setMatchIdInput] = useState(routeMatchId || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [backfillStatus, setBackfillStatus] = useState(null);

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const d = await getMatchInsights(superuserKey, id);
      setData(d);
    } catch (e) {
      setError(e.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [superuserKey]);

  useEffect(() => {
    if (routeMatchId && isSuperuser) load(routeMatchId);
  }, [routeMatchId, isSuperuser, load]);

  const refreshBackfill = useCallback(async () => {
    try {
      const r = await getMatchInsightsBackfillStatus(superuserKey);
      setBackfillStatus(r.state);
    } catch (_) { /* ignore */ }
  }, [superuserKey]);

  useEffect(() => {
    if (!isSuperuser) return;
    refreshBackfill();
    const id = setInterval(refreshBackfill, 5000);
    return () => clearInterval(id);
  }, [isSuperuser, refreshBackfill]);

  const onSubmit = (e) => {
    e.preventDefault();
    const id = matchIdInput.trim();
    if (!id) return;
    navigate(`/admin/match-insights/${encodeURIComponent(id)}`);
    load(id);
  };

  const onBackfill = async () => {
    try {
      const r = await startMatchInsightsBackfill(superuserKey, 200);
      setBackfillStatus(r.state);
    } catch (e) {
      setError(e.message);
    }
  };

  if (!isSuperuser) {
    return (
      <div style={{ padding: 24, color: '#e2e8f0' }}>
        <h1>Match Insights v2</h1>
        <p style={{ color: '#94a3b8' }}>Superuser required.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 16px', maxWidth: 1100, margin: '0 auto', color: '#e2e8f0' }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>🔍 Match Insights v2</h1>
      <p style={{ color: '#94a3b8', marginBottom: 24 }}>
        Admin preview surface for rich per-match insights. Each card is gated by
        a <code>match_insights_*</code> feature flag — flip flags to <em>on</em>
        in the Admin Panel to ship individual insights to the public.
      </p>

      <form onSubmit={onSubmit} style={{ ...CARD, display: 'flex', gap: 8, alignItems: 'center' }}>
        <label htmlFor="match-id-input" style={{ color: '#94a3b8', fontSize: 13 }}>Match ID:</label>
        <input
          id="match-id-input"
          value={matchIdInput}
          onChange={e => setMatchIdInput(e.target.value)}
          placeholder="e.g. 7842910532"
          aria-label="Match ID"
          style={{
            flex: 1, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155',
            borderRadius: 6, padding: '6px 10px', fontSize: 14,
          }}
        />
        <button type="submit" style={BTN} aria-label="Load match insights">
          Load
        </button>
      </form>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 16 }}>Backfill runner</h2>
          <button
            type="button"
            onClick={onBackfill}
            aria-label="Start match insights backfill"
            style={BTN}
            disabled={backfillStatus?.inFlight}
          >
            {backfillStatus?.inFlight ? 'Running…' : '▶ Backfill 200'}
          </button>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          {backfillStatus ? (
            <>
              status: <strong>{backfillStatus.inFlight ? 'running' : 'idle'}</strong>
              {' · '}scanned: {backfillStatus.scanned}/{backfillStatus.total}
              {' · '}updated: {backfillStatus.updated}
              {' · '}errors: {backfillStatus.errors}
              {backfillStatus.lastMatchId && <> · last match: {backfillStatus.lastMatchId}</>}
              {backfillStatus.lastError && (
                <div style={{ color: '#f87171', marginTop: 4 }}>last error: {backfillStatus.lastError}</div>
              )}
            </>
          ) : 'loading status…'}
        </div>
      </div>

      {loading && <div style={{ color: '#94a3b8', padding: 20 }}>Loading insights…</div>}
      {error && (
        <div style={{ ...CARD, color: '#f87171', border: '1px solid #7f1d1d' }}>
          Error: {error}
        </div>
      )}
      {data && (
        <>
          <div style={{ ...CARD, fontSize: 13, color: '#94a3b8' }}>
            <strong>Match {data.match_id}</strong>
            {' · '}{data.match.duration ? `${Math.round(data.match.duration / 60)} min` : 'n/a'}
            {' · '}{data.match.radiant_win ? 'Radiant win' : 'Dire win'}
          </div>
          {data.insights.map(ins => (
            <InsightCard
              key={ins.key}
              insight={ins}
              matchId={data.match_id}
              superuserKey={superuserKey}
            />
          ))}
        </>
      )}
    </div>
  );
}
