import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { getReplayTimeline, getVodReview, addVodNote, deleteVodNote } from '../api';
import { getHeroName, getItemImageUrl } from '../heroNames';
import { useSteamAuth } from '../context/SteamAuthContext';
import { trackToolEvent } from '../hooks/usePageTracking';

// Task #411 — Replay viewer v3.
// New surfaces layered onto the v1 viewer:
//   * Team-gold delta sparkline above the timeline (synced to scrub cursor).
//   * Hover-to-show inventory tooltip on hero markers at the current t.
//   * Auto-detected team-fight chips along the scrub bar (jump-to-start).
//   * ?t=START&end=END&focus=heroId share-clip params + "Share clip" button.
//     When `end` is set, playback halts at that boundary so the clip loops
//     naturally inside the shared window. `focus=heroId` rings the matching
//     hero on the minimap so the viewer's attention lands there first.

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
  // Task #411 — share-clip params. `clipEnd` is null when only `?t=` is set,
  // in which case we autoplay from t without an upper bound. `focusHeroId`
  // highlights the matching hero on the minimap with a gold ring + the
  // sparkline's hover tooltip pre-selects it.
  const clipEnd = useMemo(() => {
    const v = parseFloat(qp.get('end') || '');
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [qp]);
  const focusHeroId = useMemo(() => {
    const v = parseInt(qp.get('focus') || '', 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [qp]);
  const autoplayFromUrl = useMemo(() => qp.has('t') || qp.has('end'), [qp]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [t, setT] = useState(initialT);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [layers, setLayers] = useState({ wards: true, smoke: false, objectives: true });
  const [hoveredSlot, setHoveredSlot] = useState(null); // hero hovered on minimap
  const [hoverPx, setHoverPx] = useState(null);         // {x,y} in canvas px for tooltip anchor
  const [shareMsg, setShareMsg] = useState('');
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
        const hardEnd = data.duration || 0;
        // Task #411 — share-clip end boundary. When `?end=` is present and
        // playback crosses it, pause so the clip loops the intended window.
        if (clipEnd != null && next >= clipEnd) { setPlaying(false); return clipEnd; }
        if (next >= hardEnd) { setPlaying(false); return hardEnd; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, speed, data, clipEnd]);

  // Task #869 — count one tool-usage event per viewer session, fired the
  // first time playback actually starts (manual play or share-clip autoplay).
  // Declared ABOVE the autoplay effect that depends on it — putting it lower
  // makes the dep array hit the TDZ and blank the page on every render.
  const trackedPlaybackRef = useRef(false);
  const trackPlaybackOnce = useCallback(() => {
    if (trackedPlaybackRef.current) return;
    trackedPlaybackRef.current = true;
    trackToolEvent('replay-viewer');
  }, []);

  // Task #411 — autoplay when the URL is a share-clip link. Fires once after
  // timeline data lands so the cursor is anchored at `?t=` before play starts.
  const autoplayedRef = useRef(false);
  useEffect(() => {
    if (!data || autoplayedRef.current) return;
    if (!autoplayFromUrl) return;
    autoplayedRef.current = true;
    setT(Math.max(0, Math.min(data.duration || 0, initialT)));
    setPlaying(true);
    trackPlaybackOnce();
  }, [data, autoplayFromUrl, initialT, trackPlaybackOnce]);

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
    // Hero markers. Task #411 — ring the `focusHeroId` hero in gold and add
    // a hover halo so the hover-tooltip anchor is unambiguous.
    for (const p of data.players) {
      const pos = interpAt(p.positions, t);
      if (!pos) continue;
      const { px, py } = worldToPixel(pos.x, pos.y, size);
      const isFocus = focusHeroId != null && p.heroId === focusHeroId;
      const isHover = hoveredSlot === p.slot;
      if (isFocus) {
        ctx.beginPath();
        ctx.arc(px, py, 11, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      if (isHover) {
        ctx.beginPath();
        ctx.arc(px, py, 13, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
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
  }, [data, t, layers, activeWardsAt, focusHeroId, hoveredSlot]);

  // Task #411 — minimap hover detection. Walk all hero markers, find the
  // closest one within HIT_RADIUS px of the cursor; null when the cursor
  // isn't over any hero. The tooltip layer reads `hoveredSlot` + `hoverPx`.
  const onCanvasMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const rect = canvas.getBoundingClientRect();
    // Canvas internal size != displayed size; scale the cursor accordingly.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const HIT_RADIUS = 12;
    let best = null; let bestDist = HIT_RADIUS * HIT_RADIUS;
    for (const p of data.players) {
      const pos = interpAt(p.positions, t);
      if (!pos) continue;
      const { px, py } = worldToPixel(pos.x, pos.y, canvas.width);
      const dx = px - cx; const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) { bestDist = d2; best = { slot: p.slot, px, py }; }
    }
    if (best) {
      setHoveredSlot(best.slot);
      // Translate canvas px back to displayed px for the absolute-positioned tooltip.
      setHoverPx({ x: best.px / scaleX, y: best.py / scaleY });
    } else if (hoveredSlot != null) {
      setHoveredSlot(null);
      setHoverPx(null);
    }
  }, [data, t, hoveredSlot]);
  const onCanvasLeave = useCallback(() => { setHoveredSlot(null); setHoverPx(null); }, []);

  useEffect(() => { draw(); }, [draw]);

  const onScrub = (e) => { setPlaying(false); setT(Number(e.target.value)); };
  const onPlayPause = () => setPlaying((v) => { if (!v) trackPlaybackOnce(); return !v; });
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
  // Task #411 — hovered player + inventory at `t`. Item snapshot is the
  // last 9 purchases up to `t` (6 inventory + 3 backpack, latest purchases
  // assumed in slots first — a reasonable proxy since real inventory state
  // isn't sampled).
  const hoveredPlayer = (hoveredSlot != null && data) ? data.players.find(p => p.slot === hoveredSlot) : null;
  const hoveredItems = hoveredPlayer
    ? (hoveredPlayer.purchases || []).filter(pu => pu.t <= t).slice(-9)
    : [];

  // Task #411 — Share-clip helper. Copies the current URL with `?t=` (and
  // optional `?end=` + `?focus=`) to the clipboard so any viewer landing on
  // the link autoplays the same window.
  async function handleShareClip() {
    try {
      const focusFromHover = hoveredPlayer ? hoveredPlayer.heroId : (focusHeroId || null);
      const params = new URLSearchParams();
      params.set('t', String(Math.max(0, Math.floor(t))));
      const end = Math.floor(Math.min(duration, t + 15));
      if (end > Math.floor(t)) params.set('end', String(end));
      if (focusFromHover) params.set('focus', String(focusFromHover));
      const url = `${window.location.origin}/replay/${encodeURIComponent(matchId)}?${params.toString()}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        setShareMsg('Link copied to clipboard');
      } else {
        // Fallback for older browsers — surface the URL inline so the user
        // can copy manually rather than failing silently.
        setShareMsg(url);
      }
      setTimeout(() => setShareMsg(''), 4000);
    } catch (e) {
      setShareMsg(`Copy failed: ${e.message}`);
    }
  }

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
          <div style={{ position: 'relative', maxWidth: 640 }}>
            <canvas
              ref={canvasRef}
              width={640}
              height={640}
              onMouseMove={onCanvasMove}
              onMouseLeave={onCanvasLeave}
              style={{ width: '100%', maxWidth: 640, border: '1px solid var(--border, #334155)', borderRadius: 8, background: '#0d1424', display: 'block', cursor: 'crosshair' }}
              aria-label="Match minimap with player position markers"
            />
            {hoveredPlayer && hoverPx && (
              <HeroItemTooltip
                player={hoveredPlayer}
                items={hoveredItems}
                t={t}
                anchorX={hoverPx.x}
                anchorY={hoverPx.y}
              />
            )}
          </div>
          <LayerToggles layers={layers} setLayers={setLayers} />
          {vodReviewId && vodNotes.length > 0 && (
            <VodNoteMarkerStrip
              notes={vodNotes}
              duration={duration}
              onSeek={(time) => { setPlaying(false); setT(time); }}
            />
          )}
          {/* Task #411 — team gold delta sparkline + fight chips, rendered above
              the scrub bar so both share the same x-axis as the timeline below. */}
          <GoldDeltaSparkline data={data} t={t} clipEnd={clipEnd} onScrub={(time) => { setPlaying(false); setT(time); }} />
          <FightChips fights={data.fights || []} duration={duration} t={t} onJump={(time) => { setPlaying(false); setT(time); }} />
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
            {/* Task #411 — Share clip. Copies a ?t/?end/?focus link from the
                current scrub position (with a 15s default window) so the
                recipient autoplays the same moment. */}
            <button
              type="button"
              onClick={handleShareClip}
              aria-label={`Share clip starting at ${formatTime(t)}${hoveredPlayer ? ` focused on ${getHeroName ? getHeroName(hoveredPlayer.heroId) : 'hovered hero'}` : ''}`}
              style={{
                padding: '6px 12px', borderRadius: 6, fontWeight: 700, cursor: 'pointer',
                background: 'transparent', color: 'var(--amber, #f59e0b)',
                border: '1px solid var(--amber, #f59e0b)', fontSize: 12,
              }}
            >
              🔗 Share clip
            </button>
            {shareMsg && (
              <span role="status" style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>{shareMsg}</span>
            )}
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

// Task #411 — hover tooltip showing the hovered hero's current items at `t`.
// Positioned absolutely over the canvas using anchor coords supplied by the
// parent's mouse handler. Inventory = last 6 purchases up to `t`, backpack
// = next 3 (when there are >= 7 items in the slice). Best-effort: the parser
// only stores purchase times, not slot occupancy, so this is an approximation.
function HeroItemTooltip({ player, items, t, anchorX, anchorY }) {
  const inventory = items.slice(-6);
  const backpack  = items.length > 6 ? items.slice(0, items.length - 6).slice(-3) : [];
  // Clamp to keep the tooltip inside the canvas wrapper for small viewports.
  const offsetX = anchorX > 320 ? -200 : 16;
  const left = Math.max(4, anchorX + offsetX);
  const top  = Math.max(4, anchorY - 60);
  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute', left, top, zIndex: 5, pointerEvents: 'none',
        background: 'rgba(13,20,36,0.95)', color: 'var(--text, #e2e8f0)',
        border: `1px solid ${player.team === 'radiant' ? '#22c55e' : '#ef4444'}`,
        borderRadius: 6, padding: '6px 8px', minWidth: 180, fontSize: 11,
        boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <strong style={{ color: player.team === 'radiant' ? '#22c55e' : '#ef4444' }}>
          {(getHeroName && getHeroName(player.heroId)) || `Hero ${player.heroId}`}
        </strong>
        <span style={{ color: 'var(--text-muted, #64748b)' }}>{formatTime(t)}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted, #64748b)', marginBottom: 3 }}>
        Slot {player.slot + 1}{player.name ? ` · ${player.name}` : ''}
      </div>
      {inventory.length === 0 ? (
        <div style={{ fontStyle: 'italic', color: 'var(--text-muted, #64748b)' }}>No items yet</div>
      ) : (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #64748b)', marginTop: 2 }}>Inventory</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 22px)', gap: 2, marginTop: 2 }}>
            {inventory.map((pu, i) => (
              <img
                key={`inv-${i}`}
                src={getItemImageUrl ? getItemImageUrl(pu.item) : ''}
                alt={shortItemName(pu.item)}
                title={`${shortItemName(pu.item)} @ ${formatTime(pu.t)}`}
                style={{ width: 22, height: 16, objectFit: 'cover', borderRadius: 2, background: '#0d1424' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ))}
          </div>
        </>
      )}
      {backpack.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>Backpack</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 22px)', gap: 2, marginTop: 2 }}>
            {backpack.map((pu, i) => (
              <img
                key={`bp-${i}`}
                src={getItemImageUrl ? getItemImageUrl(pu.item) : ''}
                alt={shortItemName(pu.item)}
                title={`${shortItemName(pu.item)} @ ${formatTime(pu.t)}`}
                style={{ width: 22, height: 16, objectFit: 'cover', borderRadius: 2, background: '#0d1424', opacity: 0.65 }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Task #411 — team net-worth delta sparkline. Reuses the per-minute samples
// already loaded for the GoldXpGraph but plots (rad - dire) as a single
// signed curve so a single glance shows momentum + lead changes.
function GoldDeltaSparkline({ data, t, clipEnd, onScrub }) {
  const ref = useRef(null);
  const W = 640; const H = 36; const PAD_X = 6;
  const duration = data.duration || 1;
  const points = useMemo(() => {
    const samplesByT = new Map();
    for (const p of data.players) {
      for (const s of (p.samples || [])) {
        const key = Math.round(s.t / 60) * 60;
        if (!samplesByT.has(key)) samplesByT.set(key, { rad: 0, dire: 0 });
        const bucket = samplesByT.get(key);
        if (p.team === 'radiant') bucket.rad += s.nw || 0;
        else bucket.dire += s.nw || 0;
      }
    }
    return [...samplesByT.entries()].sort((a, b) => a[0] - b[0]).map(([tt, v]) => ({ t: tt, d: v.rad - v.dire }));
  }, [data]);
  const maxAbs = useMemo(() => {
    let m = 1000;
    for (const p of points) m = Math.max(m, Math.abs(p.d));
    return m;
  }, [points]);
  const xAt = (time) => PAD_X + (time / duration) * (W - 2 * PAD_X);
  const yAt = (v) => (H / 2) - (v / maxAbs) * (H / 2 - 2);
  const path = points.length === 0
    ? ''
    : points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(p.t).toFixed(1)},${yAt(p.d).toFixed(1)}`).join(' ');
  // Build a filled area so the sparkline reads as a "river" of lead.
  const area = points.length === 0
    ? ''
    : `${path} L${xAt(points[points.length - 1].t).toFixed(1)},${(H / 2).toFixed(1)} L${xAt(points[0].t).toFixed(1)},${(H / 2).toFixed(1)} Z`;

  const handleClick = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (x - PAD_X) / (W - 2 * PAD_X)));
    onScrub(ratio * duration);
  };

  // Current delta at the scrub cursor — surfaced as a tiny label so the
  // sparkline + scrub cursor read together at a glance.
  const cursorDelta = useMemo(() => {
    if (points.length === 0) return 0;
    let best = points[0];
    for (const p of points) { if (p.t <= t) best = p; else break; }
    return best.d;
  }, [points, t]);

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, color: 'var(--text-muted, #64748b)' }}>
        <span>Team gold delta · click to scrub</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: cursorDelta >= 0 ? '#22c55e' : '#ef4444' }}>
          {cursorDelta >= 0 ? 'Rad +' : 'Dire +'}{Math.round(Math.abs(cursorDelta) / 100) / 10}k
        </span>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ marginTop: 4, border: '1px solid var(--border, #334155)', borderRadius: 4, background: 'rgba(13,20,36,0.5)', cursor: 'crosshair', display: 'block' }}
        onClick={handleClick}
        role="img"
        aria-label={`Team gold delta sparkline. Current delta ${cursorDelta >= 0 ? 'radiant +' : 'dire +'}${Math.round(Math.abs(cursorDelta))}.`}
      >
        {/* zero line */}
        <line x1={PAD_X} x2={W - PAD_X} y1={H / 2} y2={H / 2} stroke="rgba(148,163,184,0.25)" strokeDasharray="2 3" />
        {area && <path d={area} fill={cursorDelta >= 0 ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)'} />}
        {path && <path d={path} stroke={cursorDelta >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.5" fill="none" />}
        {/* clip window highlight */}
        {clipEnd != null && (
          <rect x={xAt(Math.max(0, t - 0))} y={1} width={Math.max(1, xAt(clipEnd) - xAt(t))} height={H - 2}
            fill="rgba(245,158,11,0.18)" stroke="rgba(245,158,11,0.6)" strokeDasharray="2 2" pointerEvents="none" />
        )}
        {/* scrub cursor */}
        <line x1={xAt(t)} x2={xAt(t)} y1={1} y2={H - 1} stroke="var(--amber, #f59e0b)" strokeWidth="1" />
      </svg>
    </div>
  );
}

// Task #411 — fight chips strip. One pill per detected team fight, sized
// proportionally to the fight's duration; clicking jumps the cursor to the
// fight's start. The chip's border colour encodes the winner so a glance
// across the bar reads as a series of green/red bumps in the brawl history.
function FightChips({ fights, duration, t, onJump }) {
  if (!fights || fights.length === 0) {
    return (
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted, #64748b)', fontStyle: 'italic' }}>
        No auto-detected team fights for this match.
      </div>
    );
  }
  const sorted = [...fights].sort((a, b) => a.start_s - b.start_s);
  const winnerColor = (w) => w === 'radiant' ? '#22c55e' : w === 'dire' ? '#ef4444' : '#94a3b8';
  const cap = Math.max(1, duration);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginBottom: 4 }}>
        Team fights · {sorted.length} detected · click to jump
      </div>
      <div style={{
        position: 'relative', height: 18,
        background: 'rgba(148,163,184,0.08)',
        border: '1px solid var(--border, #334155)', borderRadius: 4,
      }}>
        {sorted.map((f, i) => {
          const left = (f.start_s / cap) * 100;
          const width = Math.max(0.6, ((f.end_s - f.start_s) / cap) * 100);
          const active = t >= f.start_s && t <= f.end_s;
          return (
            <button
              key={`${f.start_s}-${i}`}
              type="button"
              onClick={() => onJump(f.start_s)}
              aria-label={`Jump to team fight at ${formatTime(f.start_s)} — ${f.heroes.length} heroes, ${f.winner || 'draw'} winner, ${f.radiant_deaths} radiant deaths, ${f.dire_deaths} dire deaths`}
              title={`${formatTime(f.start_s)}–${formatTime(f.end_s)} · ${f.heroes.length} heroes · ${(f.winner || 'draw').toUpperCase()} (R${f.radiant_deaths}/D${f.dire_deaths})`}
              style={{
                position: 'absolute', top: 1, bottom: 1,
                left: `${left}%`, width: `${width}%`, minWidth: 8,
                background: active ? winnerColor(f.winner) : 'rgba(13,20,36,0.5)',
                border: `1px solid ${winnerColor(f.winner)}`,
                borderRadius: 3, cursor: 'pointer', padding: 0,
                opacity: active ? 0.9 : 0.7,
              }}
            />
          );
        })}
        {/* scrub cursor */}
        <div style={{
          position: 'absolute', top: -2, bottom: -2,
          left: `calc(${(t / cap) * 100}% - 1px)`, width: 2,
          background: 'var(--amber, #f59e0b)', pointerEvents: 'none',
        }} />
      </div>
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
