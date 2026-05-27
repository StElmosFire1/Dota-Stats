import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import {
  listBrowserSmokeRuns, getBrowserSmokeRun, triggerBrowserSmokeRun,
  approveBrowserSmokeBaseline, browserSmokeImageUrl,
} from '../api';

// Task #426 — Browser smoke admin UI. Lists runs (latest first), per-run
// detail view with side-by-side current / baseline / diff PNGs per step,
// "Run smoke now" button (queues an async run on the server), and an
// "Approve new baseline" button per step that copies the current
// screenshot over tests/smoke/baselines/<step>.png. All routes are
// superuser-gated.

function fmtTime(ts) { try { return new Date(ts).toLocaleString(); } catch (_) { return '—'; } }
function fmtAge(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function fmtDur(ms) { return ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`; }

function StatusPill({ status }) {
  const map = {
    ok:       { bg: '#1f4d24', fg: '#7ee07e', label: 'OK' },
    failed:   { bg: '#4d1f1f', fg: '#ff8a8a', label: 'FAILED' },
    error:    { bg: '#4d1f1f', fg: '#ff8a8a', label: 'ERROR' },
    skipped:  { bg: '#3a3a3a', fg: '#bbb',    label: 'SKIPPED' },
    running:  { bg: '#1f3a4d', fg: '#7ec0ff', label: 'RUNNING' },
    queued:   { bg: '#2a2a2a', fg: '#aaa',    label: 'QUEUED' },
  };
  const s = map[status] || { bg: '#2a2a2a', fg: '#aaa', label: String(status || '—').toUpperCase() };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, background: s.bg, color: s.fg,
    }}>{s.label}</span>
  );
}

export default function AdminBrowserSmoke() {
  const { id } = useParams();
  const { isSuperuser, superuserKey, setShowModal } = useSuperuser() || {};
  const [runs, setRuns] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const reload = useCallback(async () => {
    if (!isSuperuser) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      if (id) {
        const d = await getBrowserSmokeRun(superuserKey, id);
        setDetail(d);
      } else {
        const r = await listBrowserSmokeRuns(superuserKey);
        setRuns(Array.isArray(r?.runs) ? r.runs : []);
      }
    } catch (e) { setError(e.message || 'Failed to load.'); }
    setLoading(false);
  }, [isSuperuser, superuserKey, id]);

  useEffect(() => { reload(); }, [reload]);

  // Auto-poll while a run is in flight so the UI flips from RUNNING → OK
  // without a manual refresh.
  useEffect(() => {
    const liveStatuses = ['running', 'queued'];
    const anyLive = id
      ? detail && detail.run && liveStatuses.includes(detail.run.status)
      : runs.some(r => liveStatuses.includes(r.status));
    if (!anyLive) return;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [id, detail, runs, reload]);

  const onRunNow = async () => {
    setRunning(true); setError(null);
    try { await triggerBrowserSmokeRun(superuserKey); await reload(); }
    catch (e) { setError(e.message || 'Run failed to start.'); }
    setRunning(false);
  };

  const onApprove = async (stepKey) => {
    if (!detail) return;
    try {
      await approveBrowserSmokeBaseline(superuserKey, detail.run.id, stepKey);
      await reload();
    } catch (e) { setError(e.message || 'Approval failed.'); }
  };

  if (!isSuperuser) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1>Browser smoke runs</h1>
        <p>Superuser access required.</p>
        <button type="button" className="btn" onClick={() => setShowModal?.(true)}>Log in as superuser</button>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>
          {id ? <>Browser smoke run #{id}</> : 'Browser smoke runs'}
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {id && <Link to="/admin/browser-smoke" className="btn">← All runs</Link>}
          <Link to="/admin/feature-health" className="btn">Feature health</Link>
          {!id && (
            <button
              type="button" className="btn btn-primary"
              onClick={onRunNow} disabled={running}
              aria-label="Run smoke test now"
            >
              {running ? 'Starting…' : '▶ Run smoke now'}
            </button>
          )}
        </div>
      </div>

      <p style={{ color: '#aaa', marginTop: 8 }}>
        Real-browser Playwright suite — runs ~12 user journeys and perceptual-diffs each
        page against a stored baseline. Triggers: weekly cron (Sun 03:00 OCE), this
        button, and post-merge when a patch note carries <code>major: true</code>.
      </p>

      {error && <div style={{ background: '#4d1f1f', color: '#ff8a8a', padding: 10, borderRadius: 6, marginTop: 12 }}>{error}</div>}
      {loading && <p>Loading…</p>}

      {!loading && !id && (
        <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #333' }}>
            <th style={{ padding: 8 }}>Run</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Trigger</th>
            <th style={{ padding: 8 }}>Started</th>
            <th style={{ padding: 8 }}>Duration</th>
            <th style={{ padding: 8 }}>Steps</th>
          </tr></thead>
          <tbody>
            {runs.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 16, color: '#888' }}>No smoke runs yet — click ▶ Run smoke now above.</td></tr>
            )}
            {runs.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: 8 }}><Link to={`/admin/browser-smoke/${r.id}`}>#{r.id}</Link></td>
                <td style={{ padding: 8 }}><StatusPill status={r.status} /></td>
                <td style={{ padding: 8, color: '#aaa' }}>{r.trigger}</td>
                <td style={{ padding: 8, color: '#aaa' }} title={fmtTime(r.started_at)}>{fmtAge(r.started_at)}</td>
                <td style={{ padding: 8, color: '#aaa' }}>{r.finished_at ? fmtDur(new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) : '—'}</td>
                <td style={{ padding: 8 }}>
                  <span style={{ color: '#7ee07e' }}>{r.passed_steps} ok</span>
                  {r.failed_steps > 0 && <> · <span style={{ color: '#ff8a8a' }}>{r.failed_steps} failed</span></>}
                  <span style={{ color: '#666' }}> / {r.total_steps}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && id && detail && (
        <RunDetail
          detail={detail}
          superuserKey={superuserKey}
          onApprove={onApprove}
        />
      )}
    </div>
  );
}

function RunDetail({ detail, superuserKey, onApprove }) {
  const { run, steps } = detail;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', padding: 12, background: '#181818', borderRadius: 6 }}>
        <StatusPill status={run.status} />
        <span style={{ color: '#aaa' }}>Trigger: <strong>{run.trigger}</strong></span>
        <span style={{ color: '#aaa' }}>Started: {fmtTime(run.started_at)}</span>
        <span style={{ color: '#aaa' }}>Finished: {run.finished_at ? fmtTime(run.finished_at) : '—'}</span>
        <span style={{ color: '#aaa' }}>
          <span style={{ color: '#7ee07e' }}>{run.passed_steps} ok</span>
          {run.failed_steps > 0 && <> · <span style={{ color: '#ff8a8a' }}>{run.failed_steps} failed</span></>}
          <span style={{ color: '#666' }}> / {run.total_steps}</span>
        </span>
      </div>
      {run.notes && (
        <pre style={{ background: '#1a1a1a', color: '#ddd', padding: 12, borderRadius: 6, marginTop: 12, whiteSpace: 'pre-wrap' }}>{run.notes}</pre>
      )}
      <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
        {steps.map(s => (
          <StepCard key={s.id} step={s} superuserKey={superuserKey} onApprove={onApprove} />
        ))}
      </div>
    </div>
  );
}

function StepCard({ step, superuserKey, onApprove }) {
  const cur = step.screenshot_path ? browserSmokeImageUrl(superuserKey, step.screenshot_path) : null;
  const base = step.baseline_path ? browserSmokeImageUrl(superuserKey, step.baseline_path) : null;
  const diff = step.diff_path ? browserSmokeImageUrl(superuserKey, step.diff_path) : null;
  return (
    <div style={{ background: '#161616', padding: 14, borderRadius: 8, border: '1px solid #2a2a2a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontSize: 14 }}>{step.label}</strong>
          <span style={{ color: '#888', marginLeft: 8, fontSize: 12 }}>({step.step_key})</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusPill status={step.status} />
          <span style={{ color: '#888', fontSize: 12 }}>{fmtDur(step.duration_ms)}</span>
          {cur && (
            <button
              type="button" className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => onApprove(step.step_key)}
              aria-label={`Approve new baseline for ${step.label}`}
            >✓ Approve new baseline</button>
          )}
        </div>
      </div>
      {step.reason && (
        <div style={{ color: '#ff8a8a', marginTop: 6, fontSize: 13 }}>{step.reason}</div>
      )}
      {step.diff_ratio != null && (
        <div style={{ color: '#aaa', marginTop: 4, fontSize: 12 }}>
          diff: {(step.diff_ratio * 100).toFixed(3)}% ({step.diff_pixels} px)
        </div>
      )}
      {(cur || base || diff) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10 }}>
          {cur && <ImageTile label="Current" src={cur} />}
          {base && <ImageTile label="Baseline" src={base} />}
          {diff && <ImageTile label="Diff" src={diff} />}
        </div>
      )}
    </div>
  );
}

function ImageTile({ label, src }) {
  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ color: '#aaa', fontSize: 11, marginBottom: 4 }}>{label}</figcaption>
      <a href={src} target="_blank" rel="noopener noreferrer">
        <img src={src} alt={label} loading="lazy" style={{ width: '100%', height: 'auto', border: '1px solid #2a2a2a', borderRadius: 4, display: 'block' }} />
      </a>
    </figure>
  );
}
