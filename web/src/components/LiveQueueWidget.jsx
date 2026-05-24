import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function fmtWait(sec) {
  const n = Math.max(parseInt(sec, 10) || 0, 0);
  if (n < 60) return `${n}s`;
  if (n < 3600) return `${Math.floor(n / 60)}m`;
  return `${Math.floor(n / 3600)}h${Math.floor((n % 3600) / 60)}m`;
}

function fmtPositions(raw) {
  if (!raw) return null;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr) && arr.length) return arr.map(p => `P${p}`).join('/');
  } catch {
    if (typeof raw === 'string' && raw) return raw;
  }
  return null;
}

export default function LiveQueueWidget({ emptyMode = 'hide' }) {
  const [sessions, setSessions] = useState([]);
  const [connected, setConnected] = useState(false);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/inhouse/queue/stream');
    es.addEventListener('snapshot', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        setConnected(true);
      } catch {}
    });
    es.onerror = () => setConnected(false);
    return () => { try { es.close(); } catch {} };
  }, []);

  // Empty-state fallback for the /inhouse mount: surface the last few
  // recorded matches so a quiet queue isn't a dead end. Suppressed on
  // pages that pass emptyMode="hide" (default — the homepage widget).
  useEffect(() => {
    if (emptyMode !== 'recent') return;
    if (sessions.length) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/matches?limit=5', { credentials: 'same-origin' });
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled && Array.isArray(j.matches)) setRecent(j.matches.slice(0, 5));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [emptyMode, sessions.length]);

  if (!sessions.length) {
    if (emptyMode !== 'recent') return null;
    return (
      <section
        aria-label="Live inhouse queue (empty)"
        style={{
          border: '1px solid var(--border)', borderRadius: 10,
          padding: 12, marginBottom: 8, background: 'var(--bg-secondary, transparent)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span aria-hidden="true" style={{
            width: 8, height: 8, borderRadius: 4,
            background: connected ? '#4caf50' : '#888', display: 'inline-block',
          }} />
          <strong style={{ fontFamily: 'var(--font-condensed)' }}>Live inhouse queue</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No active sessions</span>
        </div>
        {recent.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Recent matches:&nbsp;
            {recent.map((m, i) => (
              <React.Fragment key={m.match_id || m.id || i}>
                {i > 0 && <span>·&nbsp;</span>}
                <Link to={`/match/${m.match_id || m.id}`} style={{ color: 'var(--accent)' }}>
                  #{m.match_id || m.id}
                </Link>
                &nbsp;
              </React.Fragment>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Live inhouse queue"
      style={{
        border: '1px solid var(--border)', borderRadius: 10,
        padding: 12, marginBottom: 8, background: 'var(--bg-secondary, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 8, height: 8, borderRadius: 4,
            background: connected ? '#4caf50' : '#888',
            display: 'inline-block',
          }}
        />
        <strong style={{ fontFamily: 'var(--font-condensed)' }}>Live inhouse queue</strong>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {sessions.length} active session{sessions.length === 1 ? '' : 's'}
        </span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {sessions.map(s => {
          const min = s.min_players || 10;
          const needed = typeof s.needed === 'number' ? s.needed : Math.max(min - (s.players || 0), 0);
          return (
            <li key={s.id} style={{
              border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
            }}>
              <Link
                to="/inhouse"
                style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                  alignItems: 'center', gap: 10,
                  textDecoration: 'none', color: 'var(--text-primary)',
                }}
              >
                <span>Session #{s.id}</span>
                <span style={{
                  fontSize: 12, padding: '2px 8px', borderRadius: 999,
                  background: 'var(--accent, #c5a975)', color: 'var(--ink-navy, #0d1424)',
                }}>{s.status}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {s.players}/{min}
                </span>
                <span style={{
                  fontSize: 12, color: needed > 0 ? 'var(--amber, #f59e0b)' : 'var(--text-muted)',
                }}>
                  {needed > 0 ? `${needed} more needed` : 'Full'}
                </span>
              </Link>
              {Array.isArray(s.queued) && s.queued.length > 0 && (
                <ul style={{
                  listStyle: 'none', padding: 0, margin: '6px 0 0 0',
                  display: 'flex', flexWrap: 'wrap', gap: 6,
                }}>
                  {s.queued.slice(0, 10).map(p => (
                    <li key={p.account_id} style={{
                      fontSize: 11, padding: '2px 6px', borderRadius: 999,
                      background: 'var(--bg-primary, #0d1424)', color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                    }}>
                      {p.nickname}
                      {p.rating ? <span style={{ color: 'var(--text-muted)' }}> · {Math.round(p.rating)}</span> : null}
                      {fmtPositions(p.preferred_positions) ? <span style={{ color: 'var(--brass)' }}> · {fmtPositions(p.preferred_positions)}</span> : null}
                      {p.wait_seconds != null ? <span style={{ color: 'var(--text-muted)' }}> · {fmtWait(p.wait_seconds)}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
