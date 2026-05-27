import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { superuserFetch } from '../api';

function fmtAge(ts) {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString(); } catch (_) { return '—'; }
}

function Tile({ title, status, children, spark }) {
  const dot = status === 'ok' ? '#4caf50' : status === 'warn' ? '#f59e0b' : status === 'err' ? '#f44336' : '#888';
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 14px', minWidth: 240,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span aria-hidden="true" style={{
          width: 10, height: 10, borderRadius: '50%', background: dot,
          boxShadow: status === 'ok' ? `0 0 6px ${dot}` : 'none',
        }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {children}
      </div>
      {spark}
    </div>
  );
}

// Task #423 — tiny inline SVG sparkline. `values` is an array of numbers
// (nulls allowed); we render only the defined points so a missing sample
// doesn't drag the line to zero. `windowHours` labels the axis below.
function Sparkline({ values, windowHours, color = 'var(--brass, #c5a975)', height = 28, label }) {
  const defined = values.filter(v => v != null && Number.isFinite(v));
  if (defined.length < 2) {
    return (
      <div style={{ marginTop: 8, height: height + 14, color: 'var(--text-muted)', fontSize: 11 }}>
        Trend ({windowHours}h): collecting…
      </div>
    );
  }
  const min = Math.min(...defined);
  const max = Math.max(...defined);
  const span = max - min || 1;
  const w = 240;
  const h = height;
  const n = values.length;
  let path = '';
  let started = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return;
    const x = n === 1 ? 0 : (i / (n - 1)) * w;
    const y = h - ((v - min) / span) * h;
    path += `${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    started = true;
  });
  const last = defined[defined.length - 1];
  return (
    <div style={{ marginTop: 8 }} aria-label={label || `Trend over last ${windowHours} hours`}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
           style={{ width: '100%', height, display: 'block' }} aria-hidden="true">
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
        <span>{windowHours}h</span>
        <span>min {Math.round(min)} · max {Math.round(max)} · now {Math.round(last)}</span>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
    </div>
  );
}

export default function AdminOps() {
  const { isSuperuser, setShowModal } = useSuperuser();
  const [snap, setSnap] = useState(null);
  const [err, setErr] = useState(null);
  const [source, setSource] = useState('');
  const [historyHours, setHistoryHours] = useState(24);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    if (!isSuperuser) { setShowModal(true); return; }
    let stopped = false;
    const load = async () => {
      try {
        const r = await superuserFetch('/admin/ops/state', {
          headers: { 'x-superuser-key': 'session' },
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'failed');
        if (!stopped) { setSnap(d); setErr(null); }
      } catch (e) {
        if (!stopped) setErr(e.message);
      }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => { stopped = true; clearInterval(t); };
  }, [isSuperuser, setShowModal]);

  // Task #423 — fetch the persisted history once on mount + when the
  // operator changes the window, and refresh every 60s (matches the
  // server-side snapshot cadence).
  useEffect(() => {
    if (!isSuperuser) return;
    let stopped = false;
    const load = async () => {
      try {
        const r = await superuserFetch(`/admin/ops/history?hours=${historyHours}`, {
          headers: { 'x-superuser-key': 'session' },
        });
        const d = await r.json();
        if (r.ok && !stopped) setHistory(d);
      } catch (_) { /* non-fatal — tiles still show live state */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { stopped = true; clearInterval(t); };
  }, [isSuperuser, historyHours]);

  // Pre-extract per-metric value arrays for the sparklines so we walk the
  // sample array exactly once per render rather than once per tile.
  const series = useMemo(() => {
    const empty = {
      http5xx: [], parserDur: [], parserQueue: [],
      stripeLag: [], provFail: [], provInFlight: [],
      discordLatency: [], pushSubs: [],
    };
    if (!history?.samples?.length) return empty;
    const out = { ...empty };
    let prevFail = null;
    for (const s of history.samples) {
      out.http5xx.push(s.http5xx);
      out.parserDur.push(s.parserLastDurationMs);
      out.parserQueue.push(s.parserQueueDepth);
      out.stripeLag.push(s.stripeMaxLagMs);
      out.provInFlight.push(s.provisionerInFlight);
      out.discordLatency.push(s.discordGatewayLatencyMs);
      out.pushSubs.push(s.pushSubscriptionCount);
      // Failure rate per sample = delta of cumulative counter. The very
      // first sample (or any after a process restart that reset the
      // counter) shows 0 rather than a spurious negative spike.
      if (prevFail == null || s.provisionerFailureTotal < prevFail) {
        out.provFail.push(0);
      } else {
        out.provFail.push(s.provisionerFailureTotal - prevFail);
      }
      prevFail = s.provisionerFailureTotal;
    }
    return out;
  }, [history]);

  const stripeRows = useMemo(() => {
    if (!snap) return [];
    return Object.entries(snap.stripeWebhooks.byType)
      .sort((a, b) => (b[1].lastReceivedAt || 0) - (a[1].lastReceivedAt || 0));
  }, [snap]);

  const sources = useMemo(() => {
    if (!snap) return [];
    return Array.from(new Set(snap.logs.map(l => l.source))).sort();
  }, [snap]);

  const filteredLogs = useMemo(() => {
    if (!snap) return [];
    return source ? snap.logs.filter(l => l.source === source) : snap.logs;
  }, [snap, source]);

  if (!isSuperuser) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Server-side Ops</h1>
        <p>Superuser login required.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Server-side Ops</h1>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <label>
            Trend window:&nbsp;
            <select
              value={historyHours}
              onChange={e => setHistoryHours(Number(e.target.value))}
              aria-label="Trend window length"
            >
              <option value={1}>1h</option>
              <option value={6}>6h</option>
              <option value={24}>24h</option>
              <option value={72}>3d</option>
              <option value={168}>7d</option>
            </select>
          </label>
          <span>Auto-refreshing every 10s · <Link to="/admin">← back to admin</Link></span>
        </div>
      </div>
      {err && (
        <div style={{ background: '#3a1010', border: '1px solid #f44336', padding: 10, borderRadius: 6, marginBottom: 12 }}>
          {err}
        </div>
      )}
      {!snap && !err && <div>Loading…</div>}
      {snap && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            <Tile
              title="Replay parser"
              status={snap.parser.ready ? (snap.parser.lastError ? 'warn' : 'ok') : 'err'}
              spark={<Sparkline values={series.parserDur} windowHours={historyHours} label="Parser last duration trend" />}
            >
              <Row k="Ready" v={snap.parser.ready ? 'yes' : 'no'} />
              <Row k="Queue depth" v={snap.parser.queueDepth} />
              <Row k="Last parse" v={fmtAge(snap.parser.lastParseMs)} />
              <Row k="Last duration" v={snap.parser.lastParseDurationMs != null ? `${snap.parser.lastParseDurationMs} ms` : '—'} />
              <Row k="Total parsed" v={snap.parser.totalParsed} />
              {snap.parser.lastError && <Row k="Last error" v={snap.parser.lastError} />}
            </Tile>

            <Tile
              title="Steam"
              status={snap.steam.connected ? 'ok' : 'err'}
            >
              <Row k="Connected" v={snap.steam.connected ? 'yes' : 'no'} />
              <Row k="Last event" v={snap.steam.lastEvent || '—'} />
              <Row k="Last event at" v={fmtAge(snap.steam.lastLobbyEventAt)} />
              {snap.steam.lastDisconnectReason && <Row k="Disconnect reason" v={snap.steam.lastDisconnectReason} />}
            </Tile>

            <Tile
              title="Discord bot"
              status={snap.discord.connected ? (snap.discord.gatewayLatencyMs != null && snap.discord.gatewayLatencyMs > 500 ? 'warn' : 'ok') : 'err'}
              spark={<Sparkline values={series.discordLatency} windowHours={historyHours} label="Discord gateway latency trend" />}
            >
              <Row k="Connected" v={snap.discord.connected ? 'yes' : 'no'} />
              <Row k="Gateway latency" v={snap.discord.gatewayLatencyMs != null ? `${snap.discord.gatewayLatencyMs} ms` : '—'} />
              <Row k="Last event" v={fmtAge(snap.discord.lastEventAt)} />
            </Tile>

            <Tile
              title="Provisioner"
              status={snap.provisioner.lastFailureAt && (!snap.provisioner.lastSuccessAt || snap.provisioner.lastFailureAt > snap.provisioner.lastSuccessAt) ? 'warn' : 'ok'}
              spark={<Sparkline values={series.provFail} windowHours={historyHours} color="#f08a8a" label="Provisioner failures per minute trend" />}
            >
              <Row k="In-flight" v={snap.provisioner.inFlight.length ? snap.provisioner.inFlight.join(', ') : 'none'} />
              <Row k="Last success" v={`${fmtAge(snap.provisioner.lastSuccessAt)}${snap.provisioner.lastSuccessSessionId ? ` (#${snap.provisioner.lastSuccessSessionId})` : ''}`} />
              <Row k="Last failure" v={`${fmtAge(snap.provisioner.lastFailureAt)}${snap.provisioner.lastFailureSessionId ? ` (#${snap.provisioner.lastFailureSessionId})` : ''}`} />
              {snap.provisioner.lastFailureError && <Row k="Failure reason" v={snap.provisioner.lastFailureError} />}
            </Tile>

            <Tile
              title="Push subscriptions"
              status={snap.push.webPushReady ? (snap.push.lastDeliveryError ? 'warn' : 'ok') : 'warn'}
              spark={<Sparkline values={series.pushSubs} windowHours={historyHours} label="Push subscription count trend" />}
            >
              <Row k="Web Push" v={snap.push.webPushReady ? 'configured' : 'not configured'} />
              <Row k="Subscriptions" v={snap.push.subscriptionCount != null ? snap.push.subscriptionCount : '—'} />
              <Row k="Last delivery" v={fmtAge(snap.push.lastDeliveryAt)} />
              {snap.push.lastDeliveryError && <Row k="Last error" v={snap.push.lastDeliveryError} />}
            </Tile>

            <Tile
              title="5xx (last 60 min)"
              status={snap.http.count5xxLast60m === 0 ? 'ok' : snap.http.count5xxLast60m < 10 ? 'warn' : 'err'}
              spark={<Sparkline values={series.http5xx} windowHours={historyHours} color="#f08a8a" label="5xx count trend" />}
            >
              <Row k="Count" v={snap.http.count5xxLast60m} />
              <Row k="Window" v={`${Math.round(snap.http.windowMs / 60000)} min`} />
            </Tile>
          </div>

          <h2 style={{ marginTop: 24, fontSize: 16 }}>Stripe webhooks</h2>
          {!stripeRows.length && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No events received this process.</div>}
          {stripeRows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Event type</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Count</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Last received</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Last lag</th>
                  </tr>
                </thead>
                <tbody>
                  {stripeRows.map(([type, info]) => (
                    <tr key={type} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 10px' }}>{type}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{info.count}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtAge(info.lastReceivedAt)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{info.lastLagMs != null ? `${info.lastLagMs} ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 style={{ marginTop: 24, fontSize: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            Recent warnings &amp; errors
            <label style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>
              Filter source:&nbsp;
              <select value={source} onChange={e => setSource(e.target.value)} aria-label="Filter logs by source">
                <option value="">All</option>
                {sources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </h2>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 8, maxHeight: 400, overflow: 'auto',
            fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12,
          }}>
            {!filteredLogs.length && <div style={{ color: 'var(--text-muted)', padding: 8 }}>No log entries.</div>}
            {filteredLogs.map((l, i) => (
              <div key={i} style={{
                padding: '4px 6px', borderBottom: '1px solid var(--border)',
                color: l.level === 'error' ? '#f08a8a' : l.level === 'warn' ? '#f5c46b' : 'var(--text-secondary)',
              }}>
                <span style={{ color: 'var(--text-muted)' }}>{fmtTime(l.at)}</span>
                {' '}<span style={{ color: 'var(--brass, #c5a975)' }}>[{l.source}]</span>
                {' '}<strong>{l.level.toUpperCase()}</strong>
                {' '}{l.message}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
