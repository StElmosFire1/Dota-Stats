import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { getReplayTimeline, getVodReview, addVodNote, deleteVodNote } from '../api';
import { getHeroName, getItemImageUrl } from '../heroNames';
import { useSteamAuth } from '../context/SteamAuthContext';

// Task #315 — Pro-gated 2D minimap replay viewer.
// • Hero positions sampled every 10s, linearly interpolated for smooth playback.
// • Ward / smoke / objective overlays toggleable per layer.
// • Side panel: net worth / KDA / item state synced to the scrubbed time.
// • Gold/XP graph below the controls with a moving time cursor + objective dots.

const MAP_MIN = 64;
const MAP_MAX = 192;

function worldToPixel(x, y, imgSize) {
  const nx = Math.max(0, Math.min(1, (x - MAP_MIN) / (MAP_MAX - MAP_MIN)));
  const ny = Math.max(0, Math.min(1, (y - MAP_MIN) / (MAP_MAX - MAP_MIN)));
  return { px: nx * imgSize, py: (1 - ny) * imgSize };
}

function interpAt(positions, t) {
  if (!positions || positions.length === 0) return null;
  if (t <= positions[0].t) return positions[0];
  if (t >= positions[positions.length - 1].t) return positions[positions.length - 1];
  let lo = 0; let hi = positions.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (positions[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = positions[lo]; const b = positions[hi];
  const span = b.t - a.t || 1;
  const f = (t - a.t) / span;
  return { t, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

// Last sample at or before t (used for synced side panel values).
function sampleAt(samples, t) {
  if (!samples || samples.length === 0) return null;
  let lo = 0; let hi = samples.length - 1; let best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) { best = samples[mid]; lo = mid + 1; } else { hi = mid - 1; }
  }
  return best || samples[0];
}

function formatTime(s) {
  s = Math.max(0, Math.round(s));
  const sign = s < 0 ? '-' : '';
  s = Math.abs(s);
  const m = Math.floor(s / 60);
  return `${sign}${m}:${String(s % 60).padStart(2, '0')}`;
}

function shortItemName(n) {
  return (n || '').replace(/^item_/, '').replace(/_/g, ' ');
}

// Stable per-event-type meta for the side-feed and graph annotations.
const EVENT_META = {
  first_blood: { label: 'First Blood', color: '#fbbf24' },
  kill:        { label: 'Kill',        color: '#fbbf24' },
  tower_kill:  { label: 'Tower',       color: '#60a5fa' },
  rax_kill:    { label: 'Barracks',    color: '#a78bfa' },
  building:    { label: 'Building',    color: '#60a5fa' },
  roshan:      { label: 'Roshan',      color: '#ef4444' },
  roshan_kill: { label: 'Roshan',      color: '#ef4444' },
  tormenter:   { label: 'Tormentor',   color: '#f472b6' },
  aegis:       { label: 'Aegis',       color: '#22c55e' },
  smoke:       { label: 'Smoke',       color: '#94a3b8' },
};

export default function ReplayViewer() {
  const { matchId } = useParams();
  const location = useLocation();
  const { steamUser } = useSteamAuth();
  // Task #384 — Coaching v2: when opened with ?vodReview=ID&t=SECONDS,
  // overlay timestamped coach annotations onto the timeline and allow the
  // assigned coach to add/delete notes inline (no separate page needed).
  const qp = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const vodReviewId = qp.get('vodReview');
  const initialT = parseFloat(qp.get('t') || '0') || 0;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [t, setT] = useState(initialT);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [layers, setLayers] = useState({ wards: true, smoke: false, objectives: true });
  const [vodReview, setVodReview] = useState(null);
  const [vodNotes, setVodNotes] = useState([]);
  const [vodIsCoach, setVodIsCoach] = useState(false);
  const [vodErr, setVodErr] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const rafRef = useRef(null);
  const lastFrameRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getReplayTimeline(matchId)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch((err) => { if (alive) { setError(err.message || String(err)); setLoading(false); } });
    return () => { alive = false; };
  }, [matchId]);

  // Load VOD review + notes when ?vodReview=ID is present.
  const reloadVod = useCallback(() => {
    if (!vodReviewId) return;
    getVodReview(vodReviewId)
      .then((r) => {
        setVodReview(r.review);
        setVodNotes(r.notes || []);
        setVodIsCoach(!!r.is_coach);
        setVodErr(null);
      })
      .catch((e) => setVodErr(e.message || String(e)));
  }, [vodReviewId]);
  useEffect(() => { reloadVod(); }, [reloadVod]);

  const addNote = async () => {
    if (!noteDraft.trim() || noteSaving) return;
    setNoteSaving(true);
    try {
      await addVodNote(vodReviewId, { t_seconds: Math.round(t), text: noteDraft.trim() });
      setNoteDraft('');
      reloadVod();
    } catch (e) {
      setVodErr(e.message || String(e));
    } finally {
      setNoteSaving(false);
    }
  };
  const removeNote = async (noteId) => {
    try {
      await deleteVodNote(vodReviewId, noteId);
      reloadVod();
    } catch (e) {
      setVodErr(e.message || String(e));
    }
  };

  useEffect(() => {
    const img = new Image();
    img.src = '/minimap.jpg';
    img.onload = () => { imgRef.current = img; draw(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing || !data) return;
    lastFrameRef.current = performance.now();
    const tick = (now) => {
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      setT((prev) => {
        const next = prev + dt * speed;
        if (next >= (data.duration || 0)) { setPlaying(false); return data.duration || 0; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, speed, data]);

  // Active wards at time t: placed at or before t, and either no death info
  // or destruction time after t. Ward lifetime is ~6 min for obs, 7 for sen
  // — fall back to a 360s cap when we don't have a destruction record.
  const activeWardsAt = useCallback((time) => {
    if (!data) return [];
    const out = [];
    for (const p of data.players) {
      for (const w of (p.wards || [])) {
        if (w.t == null || w.t > time) continue;
        const expiry = w.t + (w.type === 'obs' ? 360 : 420);
        if (expiry < time) continue;
        out.push({ ...w, team: p.team, slot: p.slot });
      }
    }
    return out;
  }, [data]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !data) return;
    const size = canvas.width;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    // Wards overlay.
    if (layers.wards) {
      for (const w of activeWardsAt(t)) {
        if (w.x == null || w.y == null) continue;
        const { px, py } = worldToPixel(w.x, w.y, size);
        const color = w.type === 'obs' ? '#fbbf24' : '#22d3ee';
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    // Smoke pulses — 4s flash on the team's last known position when a smoke event fired.
    if (layers.smoke) {
      for (const ev of (data.events || [])) {
        if (ev.type !== 'smoke') continue;
        const dt = t - ev.t;
        if (dt < 0 || dt > 6) continue;
        const radius = 12 + dt * 6;
        // Place the pulse at the smoke caster's interpolated position.
        const caster = (data.players || []).find((p) => p.slot === ev.killerSlot);
        const pos = caster ? interpAt(caster.positions, ev.t) : null;
        if (!pos || pos.x == null) continue;
        const { px, py } = worldToPixel(pos.x, pos.y, size);
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(148,163,184,${Math.max(0, 1 - dt / 6)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // Hero markers.
    for (const p of data.players) {
      const pos = interpAt(p.positions, t);
      if (!pos) continue;
      const { px, py } = worldToPixel(pos.x, pos.y, size);
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fillStyle = p.team === 'radiant' ? '#22c55e' : '#ef4444';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0d1424';
      ctx.stroke();
      ctx.fillStyle = '#0d1424';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.slot + 1), px, py);
    }
  }, [data, t, layers, activeWardsAt]);

  useEffect(() => { draw(); }, [draw]);

  const onScrub = (e) => { setPlaying(false); setT(Number(e.target.value)); };
  const onPlayPause = () => setPlaying((v) => !v);
  const onSpeed = (v) => setSpeed(v);

  // Live side-panel values + objective feed up-to-t.
  const sidePanel = useMemo(() => {
    if (!data) return null;
    const radTeam = data.players.filter((p) => p.team === 'radiant');
    const direTeam = data.players.filter((p) => p.team === 'dire');
    const stats = (team) => team.map((p) => {
      const s = sampleAt(p.samples, t) || {};
      const itemsUpTo = (p.purchases || []).filter((pu) => pu.t <= t).slice(-6);
      return {
        slot: p.slot, name: p.name || `Slot ${p.slot + 1}`,
        heroId: p.heroId,
        k: s.k || 0, d: s.d || 0, a: s.a || 0,
        nw: s.nw || 0, lvl: s.level || 0,
        items: itemsUpTo,
      };
    });
    const radStats = stats(radTeam);
    const direStats = stats(direTeam);
    const radNw = radStats.reduce((sum, p) => sum + p.nw, 0);
    const direNw = direStats.reduce((sum, p) => sum + p.nw, 0);
    const feed = (data.events || [])
      .filter((e) => e.t <= t && EVENT_META[e.type])
      .slice(-12).reverse();
    return { radStats, direStats, radNw, direNw, feed };
  }, [data, t]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading replay timeline…</div>;
  if (error) {
    const proGate = /pro_required/.test(error) || /Pro membership/.test(error);
    return (
      <div style={{ padding: 40, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <h2>Replay viewer unavailable</h2>
        <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        {proGate && <Link to="/pro" style={{ color: 'var(--amber)' }}>→ See Pro tier</Link>}
        <div style={{ marginTop: 14 }}>
          <Link to={`/match/${matchId}`} style={{ color: 'var(--text-muted)' }}>← Back to match</Link>
        </div>
      </div>
    );
  }
  if (!data) return null;
  const duration = data.duration || 0;
  const nwLead = (sidePanel?.radNw || 0) - (sidePanel?.direNw || 0);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>2D Replay · Match {data.matchId}</h2>
        <Link to={`/match/${matchId}`} style={{ color: 'var(--text-muted)', fontSize: 13 }}>← back</Link>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {data.radiantWin ? 'Radiant victory' : 'Dire victory'} · {formatTime(duration)}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16 }}>
        <div>
          <canvas
            ref={canvasRef}
            width={640}
            height={640}
            style={{ width: '100%', maxWidth: 640, border: '1px solid var(--border, #334155)', borderRadius: 8, background: '#0d1424' }}
            aria-label="Match minimap with player position markers"
          />
          <LayerToggles layers={layers} setLayers={setLayers} />
          {vodReviewId && vodNotes.length > 0 && (
            <VodNoteMarkerStrip
              notes={vodNotes}
              duration={duration}
              onSeek={(time) => { setPlaying(false); setT(time); }}
            />
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onPlayPause}
              aria-label={playing ? 'Pause replay' : 'Play replay'}
              style={{ padding: '6px 14px', borderRadius: 6, fontWeight: 700, cursor: 'pointer',
                background: 'var(--amber, #f59e0b)', color: '#1a1a1a', border: 'none' }}
            >
              {playing ? '❚❚ Pause' : '▶ Play'}
            </button>
            <input
              type="range"
              min={0}
              max={duration}
              step={1}
              value={t}
              onChange={onScrub}
              aria-label="Scrub timeline"
              style={{ flex: 1, minWidth: 160 }}
            />
            <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 90, textAlign: 'right' }}>
              {formatTime(t)} / {formatTime(duration)}
            </span>
            <div role="radiogroup" aria-label="Playback speed" style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 4, 8].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={speed === s}
                  onClick={() => onSpeed(s)}
                  style={{
                    padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                    background: speed === s ? 'var(--amber, #f59e0b)' : 'transparent',
                    color: speed === s ? '#1a1a1a' : 'var(--text-muted, #64748b)',
                    border: '1px solid var(--border, #334155)', fontWeight: 600,
                  }}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <NetWorthBar lead={nwLead} />
          <GoldXpGraph data={data} t={t} onScrub={(time) => { setPlaying(false); setT(time); }} />
        </div>
        <aside aria-label="Live match panel" style={{ fontSize: 13 }}>
          {sidePanel && (
            <>
              <TeamPanel team="radiant" stats={sidePanel.radStats} totalNw={sidePanel.radNw} />
              <TeamPanel team="dire"    stats={sidePanel.direStats} totalNw={sidePanel.direNw} />
              <ObjectiveFeed feed={sidePanel.feed} now={t} />
              {vodReviewId && (
                <VodAnnotationPanel
                  review={vodReview}
                  notes={vodNotes}
                  isCoach={vodIsCoach}
                  signedIn={!!steamUser}
                  err={vodErr}
                  noteDraft={noteDraft}
                  setNoteDraft={setNoteDraft}
                  noteSaving={noteSaving}
                  onAddNote={addNote}
                  onDeleteNote={removeNote}
                  onSeek={(time) => { setPlaying(false); setT(time); }}
                  currentT={t}
                />
              )}
            </>
          )}
        </aside>
      </div>
      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
        Position samples every 10s · purchases / objectives from parsed combat log · ward placements from `player_stats.ward_placements` (old matches may be empty).
      </p>
    </div>
  );
}

function LayerToggles({ layers, setLayers }) {
  const toggle = (key) => setLayers((l) => ({ ...l, [key]: !l[key] }));
  const Item = ({ k, label, hint }) => (
    <button
      type="button"
      role="switch"
      aria-checked={!!layers[k]}
      aria-label={`${label} overlay${hint ? ' — ' + hint : ''}`}
      onClick={() => toggle(k)}
      style={{
        padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
        background: layers[k] ? 'rgba(99,102,241,0.18)' : 'transparent',
        color: layers[k] ? '#a5b4fc' : 'var(--text-muted, #64748b)',
        border: '1px solid var(--border, #334155)', fontWeight: 600,
      }}
    >{layers[k] ? '☑' : '☐'} {label}</button>
  );
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>Layers:</span>
      <Item k="wards" label="Wards" hint="active observer + sentry" />
      <Item k="smoke" label="Smoke" hint="pulse on smoke uses" />
      <Item k="objectives" label="Objectives feed" hint="towers, roshan, tormentor" />
    </div>
  );
}

function NetWorthBar({ lead }) {
  // Symmetric -25k..+25k display (Radiant lead is positive → green right).
  const cap = 25000;
  const pct = Math.max(-1, Math.min(1, lead / cap));
  const color = lead >= 0 ? '#22c55e' : '#ef4444';
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted, #64748b)' }}>
        <span>Dire</span>
        <span>Net worth lead: <strong style={{ color }}>{lead >= 0 ? '+' : ''}{Math.round(lead / 100) / 10}k</strong></span>
        <span>Radiant</span>
      </div>
      <div style={{ position: 'relative', height: 10, marginTop: 4, background: 'rgba(148,163,184,0.15)', borderRadius: 5 }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.4)' }} />
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: pct >= 0 ? '50%' : `${50 + pct * 50}%`,
          width: `${Math.abs(pct) * 50}%`,
          background: color, borderRadius: 5,
        }} />
      </div>
    </div>
  );
}

function GoldXpGraph({ data, t, onScrub }) {
  // Per-team-summed gold/xp curves so the chart stays readable; markers for
  // major objectives. Clickable for scrubbing.
  const ref = useRef(null);
  const W = 640; const H = 140; const PAD = 24;
  const duration = data.duration || 1;
  const teamSeries = useMemo(() => {
    const samplesByT = new Map();
    for (const p of data.players) {
      for (const s of (p.samples || [])) {
        const key = Math.round(s.t / 60) * 60;
        if (!samplesByT.has(key)) samplesByT.set(key, { rad: 0, dire: 0, radXp: 0, direXp: 0 });
        const bucket = samplesByT.get(key);
        if (p.team === 'radiant') { bucket.rad += s.nw || 0; bucket.radXp += s.xp || 0; }
        else { bucket.dire += s.nw || 0; bucket.direXp += s.xp || 0; }
      }
    }
    const sorted = [...samplesByT.entries()].sort((a, b) => a[0] - b[0]);
    return sorted.map(([t, v]) => ({ t, ...v }));
  }, [data]);
  const maxV = useMemo(() => {
    let m = 1;
    for (const s of teamSeries) m = Math.max(m, s.rad, s.dire);
    return m;
  }, [teamSeries]);
  const xAt = (time) => PAD + (time / duration) * (W - 2 * PAD);
  const yAt = (v) => H - PAD - (v / maxV) * (H - 2 * PAD);
  const line = (key) => teamSeries.map((s, i) => `${i === 0 ? 'M' : 'L'}${xAt(s.t).toFixed(1)},${yAt(s[key]).toFixed(1)}`).join(' ');

  const handleClick = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (x - PAD) / (W - 2 * PAD)));
    onScrub(ratio * duration);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginBottom: 4 }}>
        Team Net Worth over time · click to scrub
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ border: '1px solid var(--border, #334155)', borderRadius: 6, background: 'rgba(13,20,36,0.5)', cursor: 'crosshair' }}
        onClick={handleClick}
        role="img"
        aria-label="Team net worth over time"
      >
        {/* horizontal gridlines */}
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <line key={r} x1={PAD} x2={W - PAD} y1={yAt(maxV * r)} y2={yAt(maxV * r)} stroke="rgba(148,163,184,0.15)" />
        ))}
        <path d={line('rad')} stroke="#22c55e" strokeWidth="1.5" fill="none" />
        <path d={line('dire')} stroke="#ef4444" strokeWidth="1.5" fill="none" />
        {/* objective markers */}
        {(data.events || []).map((ev, i) => {
          const meta = EVENT_META[ev.type];
          if (!meta || ev.type === 'kill') return null;
          return <circle key={i} cx={xAt(ev.t)} cy={H - PAD + 6} r={2.5} fill={meta.color} />;
        })}
        {/* time cursor */}
        <line x1={xAt(t)} x2={xAt(t)} y1={PAD - 4} y2={H - PAD + 10} stroke="var(--amber, #f59e0b)" strokeWidth="1" />
        <text x={W - PAD} y={PAD - 8} fill="#94a3b8" fontSize="10" textAnchor="end">
          peak {Math.round(maxV / 1000)}k
        </text>
      </svg>
    </div>
  );
}

function TeamPanel({ team, stats, totalNw }) {
  const color = team === 'radiant' ? '#22c55e' : '#ef4444';
  return (
    <div style={{
      border: '1px solid var(--border, #334155)', borderRadius: 8, padding: 8, marginBottom: 10,
      background: team === 'radiant' ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <strong style={{ color }}>{team === 'radiant' ? 'Radiant' : 'Dire'}</strong>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Math.round(totalNw / 100) / 10}k NW</span>
      </div>
      {stats.map((p) => (
        <div key={p.slot} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 6, padding: '3px 0', alignItems: 'center', fontSize: 12 }}>
          <span style={{ color, fontWeight: 700 }}>{p.slot + 1}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {getHeroName ? getHeroName(p.heroId) : `Hero ${p.heroId}`} · L{p.lvl}
            </div>
            <div style={{ display: 'flex', gap: 1, marginTop: 2 }}>
              {p.items.map((pu, i) => (
                <img
                  key={i}
                  src={getItemImageUrl ? getItemImageUrl(pu.item) : ''}
                  alt={shortItemName(pu.item)}
                  title={`${shortItemName(pu.item)} @ ${formatTime(pu.t)}`}
                  style={{ width: 22, height: 16, objectFit: 'cover', borderRadius: 2, background: '#0d1424' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ))}
            </div>
          </div>
          <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            <span style={{ color: '#fbbf24' }}>{p.k}</span>/<span style={{ color: '#ef4444' }}>{p.d}</span>/<span style={{ color: '#94a3b8' }}>{p.a}</span>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{Math.round(p.nw / 100) / 10}k</div>
          </span>
        </div>
      ))}
    </div>
  );
}

function VodNoteMarkerStrip({ notes, duration, onSeek }) {
  const sorted = [...notes].sort((a, b) => a.t_seconds - b.t_seconds);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginBottom: 4 }}>
        Coach annotations · click a marker to jump
      </div>
      <div style={{
        position: 'relative', height: 18,
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4,
      }}>
        {sorted.map((n) => {
          const pct = duration > 0 ? (n.t_seconds / duration) * 100 : 0;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => onSeek(n.t_seconds)}
              aria-label={`Jump to coach note at ${formatTime(n.t_seconds)}: ${(n.text || '').slice(0, 80)}`}
              title={`${formatTime(n.t_seconds)} — ${(n.text || '').slice(0, 120)}`}
              style={{
                position: 'absolute', top: 1, bottom: 1,
                left: `calc(${pct}% - 5px)`, width: 10,
                background: 'var(--amber, #f59e0b)', border: '1px solid #0d1424',
                borderRadius: 2, cursor: 'pointer', padding: 0,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function VodAnnotationPanel({
  review, notes, isCoach, signedIn, err,
  noteDraft, setNoteDraft, noteSaving, onAddNote, onDeleteNote, onSeek, currentT,
}) {
  return (
    <div style={{
      border: '1px solid rgba(245,158,11,0.5)', borderRadius: 8, padding: 10, marginTop: 10,
      background: 'rgba(245,158,11,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <strong style={{ color: 'var(--amber, #f59e0b)' }}>VOD Review</strong>
        {review && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {review.status}{isCoach ? ' · you are the coach' : ''}
          </span>
        )}
      </div>
      {!signedIn && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sign in with Steam to view this review.</p>
      )}
      {err && <p style={{ fontSize: 12, color: '#ef4444' }}>{err}</p>}
      {review?.question && (
        <div style={{ fontSize: 12, marginBottom: 8, padding: 6, background: 'rgba(13,20,36,0.4)', borderRadius: 4 }}>
          <em>{review.question}</em>
        </div>
      )}
      {notes.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No annotations yet{isCoach ? ' — add one below at the current scrub time.' : '.'}
        </p>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 220, overflowY: 'auto' }}>
          {[...notes].sort((a, b) => a.t_seconds - b.t_seconds).map((n) => (
            <li key={n.id} style={{ padding: '4px 0', borderBottom: '1px solid rgba(148,163,184,0.1)', fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => onSeek(n.t_seconds)}
                  aria-label={`Jump to ${formatTime(n.t_seconds)}`}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--amber, #f59e0b)',
                    cursor: 'pointer', fontWeight: 700, padding: 0, fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatTime(n.t_seconds)}
                </button>
                {isCoach && (
                  <button
                    type="button"
                    onClick={() => onDeleteNote(n.id)}
                    aria-label={`Delete note at ${formatTime(n.t_seconds)}`}
                    style={{
                      background: 'transparent', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 11, padding: 0,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{n.text || ''}</div>
            </li>
          ))}
        </ol>
      )}
      {isCoach && review && ['paid', 'in_progress'].includes(review.status) && (
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Add note at {formatTime(currentT)}
          </label>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="What should the student notice here?"
            rows={3}
            aria-label="Annotation text"
            style={{
              width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 12,
              background: 'rgba(13,20,36,0.6)', color: 'inherit',
              border: '1px solid var(--border, #334155)', borderRadius: 4, resize: 'vertical',
            }}
          />
          <button
            type="button"
            onClick={onAddNote}
            disabled={!noteDraft.trim() || noteSaving}
            style={{
              marginTop: 4, padding: '4px 12px', fontSize: 12, fontWeight: 700,
              background: 'var(--amber, #f59e0b)', color: '#1a1a1a', border: 'none',
              borderRadius: 4, cursor: noteDraft.trim() && !noteSaving ? 'pointer' : 'not-allowed',
              opacity: noteDraft.trim() && !noteSaving ? 1 : 0.5,
            }}
          >
            {noteSaving ? 'Saving…' : 'Add annotation'}
          </button>
        </div>
      )}
    </div>
  );
}

function ObjectiveFeed({ feed, now }) {
  if (!feed || feed.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: 8 }}>
        No objectives yet.
      </div>
    );
  }
  return (
    <div style={{ border: '1px solid var(--border, #334155)', borderRadius: 8, padding: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginBottom: 4 }}>Recent events</div>
      {feed.map((ev, i) => {
        const meta = EVENT_META[ev.type] || { label: ev.type, color: '#94a3b8' };
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
            <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(ev.t)} ({formatTime(ev.t - now)} ago)
            </span>
          </div>
        );
      })}
    </div>
  );
}
