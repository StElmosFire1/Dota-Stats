import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import {
  getSmurfWatch,
  setSmurfThreshold,
  recomputeSmurfWatch,
  acknowledgeSmurfAccount,
} from '../api';

function SignalRow({ k, sig }) {
  const noData = sig?.value == null;
  return (
    <tr>
      <td style={{ fontFamily: 'monospace', fontSize: 12, padding: '4px 8px' }}>{k}</td>
      <td style={{ padding: '4px 8px', color: noData ? 'var(--text-muted)' : 'var(--text-primary)' }}>
        {noData ? '—' : sig.value}
      </td>
      <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {noData ? '—' : `${sig.contribution} / ${sig.weight}`}
      </td>
      <td style={{ padding: '4px 8px', color: 'var(--text-muted)', fontSize: 12 }}>{sig?.detail || ''}</td>
    </tr>
  );
}

function FlaggedRow({ row, onAcknowledge, busy }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const signals = row.signals || {};
  return (
    <>
      <tr>
        <td style={{ padding: '8px 10px' }}>
          <Link to={`/player/${row.account_id}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
            {row.nickname || `#${row.account_id}`}
          </Link>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.account_id}</div>
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: 16 }}>
          <span style={{
            display: 'inline-block', minWidth: 38, padding: '2px 8px', borderRadius: 4,
            background: row.score >= 80 ? '#7a1a1a' : row.score >= 70 ? '#7a4a1a' : '#4a4a1a',
            color: '#fff',
          }}>{row.score}</span>
        </td>
        <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date(row.computed_at).toLocaleString()}
        </td>
        <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
          {row.last_ack_at ? `${new Date(row.last_ack_at).toLocaleDateString()} by ${row.last_ack_operator || '?'}` : '—'}
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-small"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide signal breakdown' : 'Show signal breakdown'}
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} style={{ padding: '8px 10px 16px', background: 'var(--bg-elevated)' }}>
            <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>Signal breakdown</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px' }}>Signal</th>
                  <th style={{ padding: '4px 8px' }}>Value</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Contribution</th>
                  <th style={{ padding: '4px 8px' }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(signals).map(k => (<SignalRow key={k} k={k} sig={signals[k]} />))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ flex: 1, minWidth: 240 }}>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Acknowledgement note (optional)
                </span>
                <input
                  type="text"
                  className="input"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. reviewed — known returning player"
                  style={{ width: '100%' }}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => onAcknowledge(row.account_id, note)}
              >
                ✓ Acknowledge / Dismiss
              </button>
              {row.last_ack_note && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  last note: <em>{row.last_ack_note}</em>
                </span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminSmurfWatch() {
  const { isSuperuser, superuserKey } = useSuperuser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showAck, setShowAck] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('');
  const [recomputing, setRecomputing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!isSuperuser) return;
    setLoading(true);
    setErr('');
    try {
      const d = await getSmurfWatch({ includeAcknowledged: showAck, superuserKey });
      setData(d);
      if (thresholdInput === '') setThresholdInput(String(d.threshold));
    } catch (e) {
      setErr(e.message || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [isSuperuser, superuserKey, showAck, thresholdInput]);

  useEffect(() => { load(); }, [load]);

  const handleSaveThreshold = async () => {
    setBusy(true); setMsg('');
    try {
      await setSmurfThreshold(parseInt(thresholdInput, 10), superuserKey);
      setMsg('Threshold updated.');
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const handleRecompute = async () => {
    setRecomputing(true); setMsg('');
    try {
      await recomputeSmurfWatch(superuserKey);
      setMsg('Recompute started — refreshing in ~10 seconds…');
      setTimeout(load, 10_000);
    } catch (e) { setErr(e.message); }
    finally { setRecomputing(false); }
  };

  const handleAck = async (accountId, note) => {
    setBusy(true); setMsg('');
    try {
      await acknowledgeSmurfAccount(accountId, note, superuserKey);
      setMsg(`Acknowledged ${accountId}.`);
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (!isSuperuser) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <h2>🔒 Smurf Watch</h2>
        <p style={{ color: 'var(--text-muted)' }}>You must be logged in as superuser to access this page.</p>
      </div>
    );
  }

  const flagged = data?.flagged || [];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🕵️ Smurf Watch</h1>
        <Link to="/admin" className="btn btn-small">← Back to Admin</Link>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 18, maxWidth: 760 }}>
        Advisory-only heuristic scorer. Flags accounts likely to be smurfs based on shared-lobby graph,
        hero-pool entropy, early-game PERF outliers, account age vs MMR climb, and (best-effort)
        session fingerprint overlap. <strong>No automatic action is taken</strong> — review and decide.
      </p>

      <section style={{ marginBottom: 20, padding: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              Threshold (0–100)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              className="input"
              value={thresholdInput}
              onChange={e => setThresholdInput(e.target.value)}
              style={{ width: 100 }}
            />
          </label>
          <button type="button" className="btn" disabled={busy} onClick={handleSaveThreshold}>
            Save threshold
          </button>
          <button type="button" className="btn btn-primary" disabled={recomputing} onClick={handleRecompute}>
            {recomputing ? '⏳ Recomputing…' : '🔄 Recompute now'}
          </button>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showAck}
              onChange={e => setShowAck(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Show acknowledged accounts</span>
          </label>
          {msg && <span style={{ fontSize: 13, color: 'var(--accent)' }}>{msg}</span>}
        </div>
        {data && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            Default threshold: <strong>{data.threshold}</strong> ·
            currently showing accounts with score ≥ <strong>{data.effective_threshold}</strong> ·
            {flagged.length} flagged.
          </div>
        )}
      </section>

      {err && <div style={{ padding: 10, background: '#3a1a1a', color: '#f8b8b8', borderRadius: 6, marginBottom: 12 }}>{err}</div>}

      {loading && <div style={{ padding: 20 }}>Loading…</div>}

      {!loading && flagged.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 8 }}>
          No accounts flagged above the current threshold.
        </div>
      )}

      {!loading && flagged.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
              <th style={{ padding: '8px 10px' }}>Player</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Score</th>
              <th style={{ padding: '8px 10px' }}>Computed</th>
              <th style={{ padding: '8px 10px' }}>Last ack</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {flagged.map(row => (
              <FlaggedRow key={row.account_id} row={row} onAcknowledge={handleAck} busy={busy} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
