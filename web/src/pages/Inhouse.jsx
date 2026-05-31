import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { useSteamAuth } from '../context/SteamAuthContext';
import { WhyIsThisSafeLink } from '../components/SteamTrustModal';
import { resolveDisplayName, resolvePlayerDisplayName } from '../utils/displayName';
import { useInhouseAlerts } from '../hooks/useInhouseAlerts';
import { superuserFetch, getCaptainAutoPickStats } from '../api';
import LiveQueueWidget from '../components/LiveQueueWidget';
import MoodFormWidget from '../components/MoodFormWidget';
import '../styles/pressbox-inhouse.css';

const POSITIONS = [
  { id: 1, label: 'P1 — Carry' },
  { id: 2, label: 'P2 — Mid' },
  { id: 3, label: 'P3 — Offlane' },
  { id: 4, label: 'P4 — Soft Support' },
  { id: 5, label: 'P5 — Hard Support' },
];

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const hasSuperuserHeader = Object.keys(headers).some(k => k.toLowerCase() === 'x-superuser-key');
  const fetcher = hasSuperuserHeader ? superuserFetch : fetch;
  const res = await fetcher(`/api${path}`, { ...opts, headers, credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Task #172 — accepts an `endsAt` ISO timestamp directly so callers
// (like the per-pick draft countdown) that already know the deadline
// don't have to fake a `startsAt`. Falls back to `startsAt + seconds`
// for the legacy accept-phase usage. `label` overrides the default
// "Accept phase" caption so the same component can render both timers.
function Countdown({ startsAt, seconds, onExpire, endsAt, label, variant }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endsAt && !startsAt) return;
    const end = endsAt
      ? new Date(endsAt).getTime()
      : new Date(startsAt).getTime() + seconds * 1000;
    const tick = () => {
      const r = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRemaining(r);
      if (r === 0 && onExpire) onExpire();
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [startsAt, seconds, onExpire, endsAt]);
  const pct = seconds > 0 ? (remaining / seconds) * 100 : 0;
  // Task T005 — "hero" variant renders the mockup's oversized serif mm:ss
  // dial (no progress bar) for the accept-window strip. The default variant
  // keeps the slim eyebrow + bar used by the per-pick draft timer.
  if (variant === 'hero') {
    const mm = Math.floor(remaining / 60);
    const ss = remaining % 60;
    return (
      <div
        className="pb-serif"
        style={{
          fontSize: 'clamp(2.6rem, 7vw, 3.6rem)',
          fontWeight: 500,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.01em',
          color: remaining < 15 ? 'var(--pb-dire)' : 'var(--pb-brass-bright)',
        }}
      >
        {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, marginBottom: 4 }}>
        <span className="pb-eyebrow">{label || 'Accept phase'}</span>
        <span className="pb-serif" style={{ fontWeight: 700, fontSize: 18, color: remaining < 10 ? '#f44336' : 'var(--pb-brass-bright)' }}>{remaining}s</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: remaining < 10 ? '#f44336' : '#4caf50', transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function PlayerRow({ player, session, isCurrentUser, isCaptain, isDrafting, canDraft, onDraftPick, balanceScore }) {
  const mmr = Math.round(Number(player.trueskill_mmr) || 0);
  const statusColors = {
    registered: { bg: 'rgba(120,120,120,0.15)', color: '#aaa', label: 'Waiting' },
    accepted: { bg: 'rgba(76,175,80,0.15)', color: '#4caf50', label: '✓ Ready' },
    declined: { bg: 'rgba(244,67,54,0.15)', color: '#f44336', label: '✗ Declined' },
    drafted: { bg: 'rgba(33,150,243,0.15)', color: '#2196f3', label: 'Drafted' },
  };
  const s = statusColors[player.status] || statusColors.registered;
  // v5.92 — every name routes through the shared resolver so we never
  // render `Player <raw id>` unless every other source is missing.
  const displayName = resolvePlayerDisplayName(player);

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px 10px 18px',
      background: isCurrentUser ? 'color-mix(in srgb, var(--pb-brass) 10%, var(--pb-surface))' : 'var(--pb-surface)',
      border: `1px solid ${isCurrentUser ? 'color-mix(in srgb, var(--pb-brass) 45%, var(--pb-line))' : 'var(--pb-line)'}`,
      borderRadius: 6,
      marginBottom: 6,
      boxShadow: isCurrentUser ? '0 1px 6px color-mix(in srgb, var(--pb-brass) 15%, transparent)' : 'none',
    }}>
      {/* Brass left-rule (Hybrid Court & Pitch motif). */}
      <span aria-hidden="true" style={{
        position: 'absolute', left: 0, top: 10, bottom: 10, width: 2, borderRadius: 2,
        background: `linear-gradient(to bottom, transparent, ${isCurrentUser ? 'var(--amber)' : 'var(--brass)'} 30%, ${isCurrentUser ? 'var(--amber)' : 'var(--brass)'} 70%, transparent)`,
        opacity: isCurrentUser ? 0.95 : 0.55,
      }} />
      {/* T005 — serif monogram avatar (mirrors the mockup's roster/pool cards). */}
      <span className="pb-avatar" aria-hidden="true">{(displayName || '?').trim().charAt(0) || '?'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-serif)', fontSize: 15 }}>
          <Link to={`/player/${player.account_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {displayName}
          </Link>
          {isCaptain && <span style={{ fontSize: 11, padding: '2px 6px', background: '#ff9800', color: '#000', borderRadius: 3, fontWeight: 700 }}>CAPTAIN</span>}
          {player.team > 0 && <span style={{ fontSize: 11, padding: '2px 6px', background: player.team === 1 ? '#2e7d32' : '#c62828', color: '#fff', borderRadius: 3 }}>Team {player.team}</span>}
          {/* Task #179 — flag picks made by the autoStartTicker deadline sweep
              so players can tell at a glance which slots their captain let
              the timer run on. Captain picks render no badge (the default). */}
          {player.pick_source === 'auto_deadline' && (
            <span
              title="Auto-picked by the deadline timer (captain didn't pick in time)"
              style={{
                fontSize: 10, padding: '2px 6px',
                background: 'color-mix(in srgb, var(--amber) 22%, transparent)',
                color: 'var(--amber)',
                border: '1px solid color-mix(in srgb, var(--amber) 55%, transparent)',
                borderRadius: 3, fontWeight: 700, letterSpacing: 0.5,
                fontFamily: 'var(--font-condensed, var(--font))', textTransform: 'uppercase',
              }}
            >
              ⏱ Auto-pick
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          MMR {mmr}
          {balanceScore != null && <span> · <span title="Auto-balance score that fed into the projected balance" style={{ color: 'var(--brass)', fontWeight: 600 }}>Score {balanceScore.toLocaleString()}</span></span>}
          {player.preferred_positions && <span> · Prefers {player.preferred_positions}</span>}
          {player.roll != null && <span> · Roll {player.roll}</span>}
          {player.voice_verified && <span> · 🎙 In voice</span>}
          {player.not_in_dota === false && player.status === 'accepted' && <span> · 🎮 In Dota</span>}
        </div>
      </div>
      <div style={{ padding: '4px 10px', background: s.bg, color: s.color, borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
        {s.label}
      </div>
      {canDraft && player.team === 0 && player.status !== 'declined' && (
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onDraftPick(player.account_id, 1)} style={{ padding: '4px 8px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}>→ T1</button>
          <button onClick={() => onDraftPick(player.account_id, 2)} style={{ padding: '4px 8px', background: '#c62828', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}>→ T2</button>
        </div>
      )}
    </div>
  );
}

// v6.03 — admin live-config editor for an in-flight inhouse session.
// Inlined here (not extracted into its own file) because it's the only
// caller and the form is a tiny PATCH /inhouse/:id/config wrapper.
function LiveConfigEditor({ session, onSaved }) {
  const [captainMode, setCaptainMode] = useState(session.captain_mode || 'highest_rank');
  const [acceptSec, setAcceptSec] = useState(session.accept_phase_seconds || 60);
  const [minPl, setMinPl] = useState(session.min_players || 10);
  const [grace, setGrace] = useState(session.lobby_fill_seconds || 30);
  // Task #172 — per-pick draft countdown budget. Default 30s if a legacy
  // session row predates the column.
  const [pickSec, setPickSec] = useState(session.draft_pick_seconds || 30);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const dirty = (
    captainMode !== (session.captain_mode || 'highest_rank') ||
    Number(acceptSec) !== Number(session.accept_phase_seconds || 60) ||
    Number(minPl) !== Number(session.min_players || 10) ||
    Number(grace) !== Number(session.lobby_fill_seconds || 30) ||
    Number(pickSec) !== Number(session.draft_pick_seconds || 30)
  );
  async function save() {
    setSaving(true); setErr(null);
    try {
      await api(`/inhouse/${session.id}/config`, {
        method: 'PATCH',
        body: JSON.stringify({
          captain_mode: captainMode,
          accept_phase_seconds: Number(acceptSec),
          min_players: Number(minPl),
          lobby_fill_seconds: Number(grace),
          draft_pick_seconds: Number(pickSec),
        }),
      });
      if (onSaved) await onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }
  return (
    <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 12 }}>Captain mode override:&nbsp;
        <select value={captainMode} onChange={e => setCaptainMode(e.target.value)} style={{ padding: 3, fontSize: 12 }}>
          <option value="highest_rank">Highest Rank</option>
          <option value="random">Random</option>
          <option value="highest_roll">Highest Roll (1-100)</option>
          <option value="auto_balance">Auto-balance (skill-based)</option>
          <option value="volunteer">Volunteer</option>
        </select>
        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>overrides the live vote</span>
      </label>
      <label style={{ fontSize: 12 }}>Accept timer:&nbsp;
        <input type="number" min={15} max={300} value={acceptSec} onChange={e => setAcceptSec(parseInt(e.target.value || '60', 10))} style={{ padding: 3, width: 60, fontSize: 12 }} /> sec
      </label>
      <label style={{ fontSize: 12 }}>Min players to auto-start:&nbsp;
        <input type="number" min={2} max={10} value={minPl} onChange={e => setMinPl(parseInt(e.target.value || '10', 10))} style={{ padding: 3, width: 50, fontSize: 12 }} />
      </label>
      <label style={{ fontSize: 12 }}>Lobby fill grace:&nbsp;
        <input type="number" min={0} max={300} value={grace} onChange={e => setGrace(parseInt(e.target.value || '30', 10))} style={{ padding: 3, width: 50, fontSize: 12 }} /> sec
      </label>
      <label style={{ fontSize: 12 }}>Per-pick draft timer:&nbsp;
        <input type="number" min={5} max={300} value={pickSec} onChange={e => setPickSec(parseInt(e.target.value || '30', 10))} style={{ padding: 3, width: 50, fontSize: 12 }} /> sec
        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>auto-picks highest-MMR remaining if captain stalls</span>
      </label>
      {err && <div style={{ fontSize: 11, color: '#f44336' }}>{err}</div>}
      <button onClick={save} disabled={!dirty || saving} style={{ alignSelf: 'flex-start', padding: '5px 12px', background: dirty ? 'var(--brass)' : 'var(--bg)', color: dirty ? '#0d1424' : 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 3, cursor: dirty && !saving ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 12 }}>
        {saving ? 'Saving…' : dirty ? 'Save Live Config' : 'No changes'}
      </button>
    </div>
  );
}

// Task #136 — tri-state Discord gate. Renders the appropriate CTA when a
// signed-in player can't yet join the inhouse lobby:
//   * not signed in        → "Sign in with Steam" (handled by parent: caller
//                            renders this component only when myAccountId is
//                            present, so this branch is implicit)
//   * needs Discord link   → "Link Discord" → /auth/discord
//   * not in OCE Inhouse   → "Join the OCE Inhouse Discord" → invite URL
// Returns null when the player is allowed to join. Soft-passes when guild
// membership is unknown (bot starting up, guild not configured) so a
// transient bot outage doesn't lock the lobby.
function DiscordJoinGate({ steamUser, refreshMe }) {
  if (!steamUser) return null;
  // Re-poll /auth/me every 8s while the gate is shown so the moment the
  // player completes the OAuth link or joins the Discord server, the gate
  // disappears without a manual refresh.
  React.useEffect(() => {
    if (!refreshMe) return;
    if (steamUser.needs_discord_link || steamUser.discord_in_guild === false) {
      const id = setInterval(() => { refreshMe().catch(() => {}); }, 8000);
      return () => clearInterval(id);
    }
  }, [steamUser?.needs_discord_link, steamUser?.discord_in_guild, refreshMe]);

  if (steamUser.needs_discord_link) {
    const oauthEnabled = !!steamUser.discord_oauth_enabled;
    return (
      <div style={{ marginTop: 8, padding: 14, background: 'color-mix(in srgb, #5865F2 12%, transparent)', border: '1px solid color-mix(in srgb, #5865F2 45%, transparent)', borderRadius: 6, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, color: '#5865F2', marginBottom: 4 }}>🔗 Link Discord to join the lobby</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
          Inhouse matches run on Discord voice. Link your Discord account so we can pull you into the right voice channel and DM you match results.
        </div>
        {oauthEnabled ? (
          <a href="/auth/discord" style={{ display: 'inline-block', padding: '8px 16px', background: '#5865F2', color: '#fff', borderRadius: 4, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Link Discord
          </a>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Discord linking isn't configured on this site. Open the Discord-link prompt from the homepage banner, or ask an admin.
          </div>
        )}
      </div>
    );
  }
  if (steamUser.discord_in_guild === false) {
    const invite = steamUser.discord_invite_url;
    return (
      <div style={{ marginTop: 8, padding: 14, background: 'color-mix(in srgb, var(--brass) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--brass) 45%, transparent)', borderRadius: 6, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, color: 'var(--brass)', marginBottom: 4 }}>🛡️ Join the OCE Inhouse Discord server</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
          We can see your Discord account ({steamUser.discord_id || 'linked'}), but you aren't currently a member of the OCE Inhouse server. Inhouse voice / DMs require it.
        </div>
        {invite ? (
          <a href={invite} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '8px 16px', background: 'var(--brass)', color: '#0d1424', borderRadius: 4, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Open the Discord invite ↗
          </a>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Discord invite URL isn't configured. Ask an admin for the OCE Inhouse server invite link.
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          This panel re-checks every few seconds — once you're in the server, the join button will appear automatically.
        </div>
      </div>
    );
  }
  return null;
}

// Task #445 — Live pick advisor panel. Non-blocking, opt-in surface that
// appears inside the lobby card once the viewer is drafted onto a team
// (team > 0) and the session is in `drafting` or `in_progress`. The panel
// polls /api/inhouse/:id/pick-advisor every 8s, renders up to three hero
// suggestions sorted by the viewer's personal WR, and exposes a single
// dismiss button whose state lives in the parent (keyed per session.id) so
// the dismissal sticks for THIS draft only — joining a new session brings
// the panel back without touching profile settings. Hidden by default; the
// caller only mounts this when `extras.pick_advisor_optin` is true.
function PickAdvisorPanel({ sessionId, onDismiss }) {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const d = await api(`/inhouse/${sessionId}/pick-advisor`);
        if (alive) { setData(d); setErr(null); }
      } catch (e) {
        if (alive) setErr(e.message);
      }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => { alive = false; clearInterval(id); };
  }, [sessionId]);
  if (err || !data) return null;
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  if (suggestions.length === 0) return null;
  const top = suggestions[0];
  const wrPct = Math.round((top.wr || 0) * 100);
  const missing = Array.isArray(data.missingPositions) ? data.missingPositions : [];
  const missingLabel = missing.length === 0
    ? 'every role looks claimed'
    : missing.length >= 5
      ? 'an open role'
      : `a ${missing.map(p => p).join(' / ')}`;
  return (
    <aside
      aria-label="Hero pick suggestions for this draft"
      style={{
        marginTop: 12,
        padding: '12px 14px',
        background: 'color-mix(in srgb, var(--brass) 8%, var(--bg-card))',
        border: '1px solid color-mix(in srgb, var(--brass) 35%, var(--border))',
        borderLeft: '3px solid var(--brass)',
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: 'var(--brass)', fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'var(--font-condensed, var(--font))' }}>
          🪄 Pick Advisor
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Your team needs {missingLabel}. You're <strong style={{ color: 'var(--text)' }}>{wrPct}% WR on {top.hero_name || `hero ${top.hero_id}`}</strong> (last {top.games}).
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss pick suggestions for this draft"
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            borderRadius: 4,
            padding: '3px 9px',
            fontSize: 11,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Dismiss
        </button>
      </div>
      {suggestions.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>Alternatives:</span>
          {suggestions.slice(1).map(s => (
            <span
              key={s.hero_id}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            >
              {s.hero_name || `hero ${s.hero_id}`} · {Math.round((s.wr || 0) * 100)}% ({s.games})
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
        Suggestions exclude heroes already picked or banned this match. Toggle off any time in <a href="/settings/profile" style={{ color: 'var(--brass)' }}>Settings → Profile</a>.
      </div>
    </aside>
  );
}

export default function Inhouse() {
  const { superuserKey } = useSuperuser();
  const { steamUser, refreshMe } = useSteamAuth();
  // Task #136 — tri-state gate. The "Sign In to Inhouse" / "Join Session"
  // buttons must stay disabled until the player is signed in, has Discord
  // linked, and is currently in the OCE Inhouse server. Unknown
  // (discord_in_guild === null) is treated as "allow" so a bot-side outage
  // doesn't lock everyone out — the server enforces the same rule.
  const discordGateBlocked = !!steamUser && (
    steamUser.needs_discord_link === true ||
    steamUser.discord_in_guild === false
  );
  const [session, setSession] = useState(null);
  const [players, setPlayers] = useState([]);
  const [pastSessions, setPastSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [serverStatus, setServerStatus] = useState(null);
  const [retryingServer, setRetryingServer] = useState(false);
  const [creating, setCreating] = useState(false);
  const [captainMode, setCaptainMode] = useState('highest_rank');
  const [acceptSeconds, setAcceptSeconds] = useState(60);
  const [minPlayers, setMinPlayers] = useState(10);
  const [lobbyFillSeconds, setLobbyFillSeconds] = useState(30);
  // Task #172 — per-pick draft countdown budget (seconds). Default 30s.
  const [draftPickSeconds, setDraftPickSeconds] = useState(30);
  const [myPositions, setMyPositions] = useState([]);
  const [draftStatus, setDraftStatus] = useState(null);
  // Task #445 — Live pick advisor opt-in. We fetch the signed-in viewer's
  // own profile customisation once (cheap GET /api/me/profile read) to
  // decide whether to mount the suggestions panel. Off by default → no
  // network traffic for anyone who hasn't opted in. Dismiss state is keyed
  // per session.id so closing it sticks for THIS draft only — joining a
  // new session brings the panel back without touching settings.
  const [pickAdvisorOptin, setPickAdvisorOptin] = useState(false);
  const [pickAdvisorDismissed, setPickAdvisorDismissed] = useState({});
  useEffect(() => {
    if (!myAccountId) { setPickAdvisorOptin(false); return; }
    let alive = true;
    fetch('/api/me/profile', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive) return;
        const extras = (d && d.customization && d.customization.extras) || {};
        setPickAdvisorOptin(!!extras.pick_advisor_optin);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [myAccountId]);

  // Task #190 — per-captain auto-pick rate over the last N completed sessions.
  // Keyed by accountId. Populated lazily when captains are known on the active
  // session, so we can flag chronic AFK captains in-lobby with a small badge.
  const [captainAutoStats, setCaptainAutoStats] = useState({});
  const isAdmin = !!superuserKey;
  // v5.84 — was `steamUser?.steamAccountId` (typo); the `/api/auth/me`
  // payload exposes the field as `accountId`. The mismatch made the lobby
  // think every signed-in user was anonymous, so it always rendered the
  // "Sign in with Steam to join" gate even after a successful sign-in.
  const myAccountId = steamUser?.accountId ? Number(steamUser.accountId) : null;
  const pollRef = useRef(null);
  // Task #325 — live spectator probe. Polls /api/inhouse/live-spectate so the
  // hub can surface a "Watch live" affordance whenever the lobbyManager has
  // an active match, regardless of whether the session row already has it.
  const [liveSpectate, setLiveSpectate] = useState({ matchId: null });
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const data = await api('/inhouse/live-spectate');
        if (alive) setLiveSpectate(data || { matchId: null });
      } catch (_) {
        if (alive) setLiveSpectate({ matchId: null });
      }
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // v5.92 — sound + browser-notification alerts on every event that needs
  // a human input. Mute toggle in the lobby header persists in localStorage.
  const { muted, toggleMute } = useInhouseAlerts({ session, players, myAccountId, draftStatus });

  // Task #190 — fetch each captain's auto-pick rate when the session has
  // captains assigned. Cached per-accountId so re-polls don't refetch.
  useEffect(() => {
    const ids = [];
    if (session?.captain1_account_id) ids.push(String(session.captain1_account_id));
    if (session?.captain2_account_id) ids.push(String(session.captain2_account_id));
    const missing = ids.filter(id => !(id in captainAutoStats));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(id => getCaptainAutoPickStats(id, 5).catch(() => null)))
      .then(results => {
        if (cancelled) return;
        setCaptainAutoStats(prev => {
          const next = { ...prev };
          missing.forEach((id, i) => { next[id] = results[i] || null; });
          return next;
        });
      });
    return () => { cancelled = true; };
  }, [session?.captain1_account_id, session?.captain2_account_id]);

  const refresh = useCallback(async () => {
    try {
      const data = await api('/inhouse/active');
      setSession(data.session);
      setPlayers(data.players || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPast = useCallback(async () => {
    try {
      const data = await api('/inhouse?limit=10');
      setPastSessions((data.sessions || []).filter(s => !['open','accepting','drafting','server_failed','in_progress'].includes(s.status)));
    } catch (_) {}
  }, []);

  const refreshServer = useCallback(async () => {
    try {
      const s = await api('/dedicated-server/status');
      setServerStatus(s);
    } catch (_) {}
  }, []);

  useEffect(() => {
    refresh();
    refreshPast();
    refreshServer();
    pollRef.current = setInterval(refresh, 4000);
    return () => clearInterval(pollRef.current);
  }, [refresh, refreshPast, refreshServer]);

  // v5.75: when a session is in drafting, poll /draft-status so we know
  // whose turn it is and can render the captain pick UI accordingly.
  useEffect(() => {
    if (!session || session.status !== 'drafting') {
      setDraftStatus(null);
      return;
    }
    let alive = true;
    const fetchStatus = async () => {
      try {
        const s = await api(`/inhouse/${session.id}/draft-status`);
        if (alive) setDraftStatus(s);
      } catch (_) {}
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [session?.id, session?.status]);

  const adminHeaders = isAdmin ? { 'x-superuser-key': superuserKey } : {};

  async function createSession() {
    if (!isAdmin) return;
    setCreating(true);
    try {
      await api('/inhouse', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ captainMode, acceptPhaseSeconds: acceptSeconds, minPlayers, lobbyFillSeconds, draftPickSeconds }) });
      await refresh();
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  }

  async function joinSession() {
    if (!myAccountId) return;
    try {
      // v6.03 — auto-running lobby. Always go through /inhouse/join (no id);
      // the backend auto-creates an open session with default settings if
      // none exists, so a player never sees a "no active session" empty
      // state. Falls back to the per-id route only if we already know the
      // session id and just need to add a preferred-positions update.
      if (!session) {
        await api('/inhouse/join', { method: 'POST', body: JSON.stringify({ preferredPositions: myPositions.join(',') || null }) });
      } else {
        await api(`/inhouse/${session.id}/join`, { method: 'POST', body: JSON.stringify({ accountId: myAccountId, preferredPositions: myPositions.join(',') || null }) });
      }
      await refresh();
    } catch (e) { alert(e.message); }
  }

  // v6.03 — captain-mode poll. One vote per player; clicking the same chip
  // again clears it. Tally is fetched via the dedicated endpoint while the
  // session is `open` so the chip counts stay live without polling the full
  // /inhouse/active payload more often.
  const [voteTally, setVoteTally] = useState({ tally: { highest_rank: 0, random: 0, auto_balance: 0, volunteer: 0 }, myVote: null, totalVotes: 0, winning: 'highest_rank' });
  const refreshVotes = useCallback(async () => {
    if (!session || session.status !== 'open') return;
    try {
      const data = await api(`/inhouse/${session.id}/captain-vote-tally`);
      setVoteTally(data);
    } catch (_) {}
  }, [session?.id, session?.status]);
  useEffect(() => {
    if (!session || session.status !== 'open') return;
    refreshVotes();
    const t = setInterval(refreshVotes, 4000);
    return () => clearInterval(t);
  }, [session?.id, session?.status, refreshVotes]);
  async function castCaptainVote(mode) {
    if (!session || !myAccountId) return;
    const isClearing = voteTally.myVote === mode;
    try {
      const r = await api(`/inhouse/${session.id}/captain-vote`, {
        method: 'POST',
        body: JSON.stringify(isClearing ? { clear: true } : { mode }),
      });
      setVoteTally({ tally: r.tally, myVote: r.myVote, totalVotes: Object.values(r.tally).reduce((a,b)=>a+b,0), winning: r.winning });
    } catch (e) { alert(e.message); }
  }

  // Task #119 — captain volunteer pool. Visible/usable only when the lobby's
  // resolved captain mode is 'volunteer' AND the player has accepted. Polls
  // alongside the rest of the session so the tally stays live.
  const [volunteerInfo, setVolunteerInfo] = useState({ count: 0, myVolunteer: false, volunteers: [] });
  const refreshVolunteers = useCallback(async () => {
    if (!session || !['open','accepting'].includes(session.status)) return;
    try {
      const data = await api(`/inhouse/${session.id}/captain-volunteers`);
      setVolunteerInfo(data);
    } catch (_) {}
  }, [session?.id, session?.status]);
  useEffect(() => {
    if (!session || !['open','accepting'].includes(session.status)) {
      setVolunteerInfo({ count: 0, myVolunteer: false, volunteers: [] });
      return;
    }
    refreshVolunteers();
    const t = setInterval(refreshVolunteers, 4000);
    return () => clearInterval(t);
  }, [session?.id, session?.status, refreshVolunteers]);
  async function toggleVolunteer() {
    if (!session || !myAccountId) return;
    try {
      const r = await api(`/inhouse/${session.id}/captain-volunteer`, {
        method: 'POST',
        body: JSON.stringify({ volunteer: !volunteerInfo.myVolunteer }),
      });
      setVolunteerInfo({ count: r.count, myVolunteer: r.myVolunteer, volunteers: r.volunteers });
    } catch (e) { alert(e.message); }
  }

  async function leaveSession() {
    if (!session || !myAccountId) return;
    try {
      await api(`/inhouse/${session.id}/leave`, { method: 'POST', body: JSON.stringify({ accountId: myAccountId }) });
      await refresh();
    } catch (e) { alert(e.message); }
  }

  async function acceptMatch() {
    if (!session || !myAccountId) return;
    try {
      await api(`/inhouse/${session.id}/accept`, { method: 'POST', body: JSON.stringify({ accountId: myAccountId }) });
      await refresh();
    } catch (e) { alert(e.message); }
  }

  async function declineMatch() {
    if (!session || !myAccountId) return;
    try {
      await api(`/inhouse/${session.id}/decline`, { method: 'POST', body: JSON.stringify({ accountId: myAccountId }) });
      await refresh();
    } catch (e) { alert(e.message); }
  }

  async function startAcceptPhase() {
    if (!isAdmin || !session) return;
    try {
      await api(`/inhouse/${session.id}/start-accept-phase`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ seconds: acceptSeconds }) });
      await refresh();
    } catch (e) { alert(e.message); }
  }

  async function selectCaptains() {
    if (!isAdmin || !session) return;
    try {
      await api(`/inhouse/${session.id}/select-captains`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ mode: captainMode }) });
      await refresh();
    } catch (e) { alert(e.message); }
  }

  async function draftPick(accountId, team) {
    if (!session) return;
    // v5.75: captains can pick directly. Send admin header only if signed-in
    // user has a superuser key — the backend will fall back to session-auth
    // and verify it's the right captain's turn.
    const teamPlayers = players.filter(p => p.team === team);
    try {
      await api(`/inhouse/${session.id}/draft-pick`, {
        method: 'POST',
        headers: isAdmin ? adminHeaders : {},
        body: JSON.stringify({ accountId, team, pickOrder: teamPlayers.length }),
      });
      await refresh();
    } catch (e) { alert(e.message); }
  }

  // Task #168 — captain-callable retry. After a `server_failed` transition
  // we expose this on /inhouse for both captains and superusers; the route
  // accepts captain session cookies as well as the superuser key.
  async function retryServerProvisioning() {
    if (!session) return;
    setRetryingServer(true);
    try {
      const headers = isAdmin ? adminHeaders : { 'Content-Type': 'application/json' };
      const r = await api(`/inhouse/${session.id}/server/retry`, { method: 'POST', headers, body: JSON.stringify({}) });
      if (r.rcon && !r.rcon.ok) {
        alert(`Retry sent — RCON push didn't go through (${r.rcon.error}). The lobby will stay in server_failed; try again or get a superuser to investigate.`);
      }
      await refresh();
    } catch (e) {
      alert('Retry failed: ' + e.message);
    } finally {
      setRetryingServer(false);
    }
  }

  async function provisionServer() {
    if (!isAdmin || !session) return;
    try {
      const r = await api(`/inhouse/${session.id}/server`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({}) });
      if (r.rcon && !r.rcon.ok) {
        // v5.90 — friendlier wording. The most common cause is that the
        // dedicated server isn't configured yet, in which case the connect
        // link below is the intended fallback path, not a failure state.
        const isMissing = /not.?configured|no.*server|missing|undefined|ENOTFOUND/i.test(String(r.rcon.error || ''));
        if (isMissing) {
          alert('Dedicated server is not configured yet — players will use the connect link below.\n\n(Admin: set DEDICATED_SERVER_IP to enable RCON push.)');
        } else {
          alert(`Server ready — players will use the connect link below.\nRCON push didn't go through (${r.rcon.error}), so you may need to bring them in manually.`);
        }
      }
      await refresh();
    } catch (e) { alert(e.message); }
  }

  async function cancelSession() {
    if (!isAdmin || !session) return;
    if (!confirm('Cancel this session?')) return;
    try {
      await api(`/inhouse/${session.id}/cancel`, { method: 'POST', headers: adminHeaders });
      await refresh();
    } catch (e) { alert(e.message); }
  }

  async function completeSession() {
    if (!isAdmin || !session) return;
    const matchId = prompt('Enter match ID (or leave blank):');
    try {
      await api(`/inhouse/${session.id}/complete`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ matchId: matchId || null }) });
      await refresh();
      await refreshPast();
    } catch (e) { alert(e.message); }
  }

  async function fetchReplayNow() {
    if (!isAdmin) return;
    try {
      const r = await api('/dedicated-server/fetch-replay', { method: 'POST', headers: adminHeaders, body: JSON.stringify({}) });
      alert(`Replay fetched: ${r.filename}\nLocal: ${r.localPath}`);
    } catch (e) { alert('Fetch failed: ' + e.message); }
  }

  // v5.89 — admin demo lobby. Fills empty slots with bot players (account
  // ids 9_000_001..9_000_010) so an admin can walk the full sign-in →
  // accept → captains → draft → ready flow end-to-end without needing 9
  // friends. Auto-draft fills remaining picks once captains are set.
  async function seedBots() {
    if (!isAdmin || !session) return;
    try {
      const r = await api(`/admin/inhouse/${session.id}/seed-bots`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({}) });
      await refresh();
      alert(`Added ${r.added} bot${r.added === 1 ? '' : 's'} (lobby now ${r.total}).`);
    } catch (e) { alert('Seed failed: ' + e.message); }
  }
  async function clearBots() {
    if (!isAdmin || !session) return;
    if (!confirm('Remove all demo bots from this session?')) return;
    try {
      const r = await api(`/admin/inhouse/${session.id}/clear-bots`, { method: 'POST', headers: adminHeaders });
      await refresh();
      alert(`Removed ${r.removed} bot${r.removed === 1 ? '' : 's'}.`);
    } catch (e) { alert('Clear failed: ' + e.message); }
  }
  async function autoDraft() {
    if (!isAdmin || !session) return;
    try {
      const r = await api(`/admin/inhouse/${session.id}/auto-draft`, { method: 'POST', headers: adminHeaders });
      await refresh();
      alert(`Auto-drafted ${r.picked} pick${r.picked === 1 ? '' : 's'}.`);
    } catch (e) { alert('Auto-draft failed: ' + e.message); }
  }

  const myPlayer = myAccountId ? players.find(p => Number(p.account_id) === myAccountId) : null;
  const isInSession = !!myPlayer;

  // Task #136 — liveness heartbeat. While the player is registered in an
  // open/accepting session, ping /api/inhouse/heartbeat every 15s so the
  // autoStartTicker sweep keeps their slot. Also fire a final beacon on
  // visibility-hide / page-unload so a closed tab releases the slot fast.
  // Server-side, the same endpoint is a cheap UPDATE — safe to spam.
  React.useEffect(() => {
    if (!isInSession || !session || !['open','accepting'].includes(session.status)) return;
    let cancelled = false;
    const send = () => {
      if (cancelled) return;
      fetch('/api/inhouse/heartbeat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
    };
    // Best-effort beacon for tab-close / page-hide. navigator.sendBeacon
    // delivers reliably even when the browser is tearing the page down,
    // where a normal fetch would be cancelled mid-flight. The endpoint is
    // session-cookie authenticated and ignores the request body, so an
    // empty Blob is fine.
    const beacon = () => {
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon('/api/inhouse/heartbeat', new Blob([''], { type: 'application/json' }));
        }
      } catch {}
    };
    send();
    const id = setInterval(send, 15000);
    const onVis = () => {
      if (document.visibilityState === 'visible') send();
      else beacon();
    };
    const onPageHide = () => beacon();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [isInSession, session?.id, session?.status]);
  const acceptedCount = players.filter(p => p.status === 'accepted').length;
  const draftedCount = players.filter(p => p.team > 0).length;
  const team1 = players.filter(p => p.team === 1);
  const team2 = players.filter(p => p.team === 2);
  const undrafted = players.filter(p => p.team === 0 && p.status !== 'declined');
  const connectLink = session?.server_ip && session?.match_password
    ? `steam://connect/${session.server_ip}:${session.server_port}/${encodeURIComponent(session.match_password)}`
    : null;

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;

  return (
    <div className="pb-inhouse" style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      {/* Task #316 — live queue widget: shows in-progress sessions + queued
          players, falls back to recent matches when the queue is empty. */}
      <LiveQueueWidget emptyMode="recent" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="pb-eyebrow" style={{ marginBottom: 6 }}>Live Lobby</div>
          <h1 className="pb-page-title" style={{ margin: 0, fontSize: '2.1rem' }}>Inhouse Lobby</h1>
          <div aria-hidden="true" style={{
            height: 4, marginTop: 8, width: 220, maxWidth: '100%',
            background:
              'linear-gradient(to right, var(--pb-brass), transparent 30%) top/100% 2px no-repeat,' +
              'linear-gradient(to right, var(--pb-line), var(--pb-line)) bottom/100% 1px no-repeat',
          }} />
          <p style={{ color: 'var(--pb-muted)', margin: '8px 0 0' }}>FACEIT-style match accept, captain draft, and direct server connect.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* v5.92 — mute toggle for inhouse sound alerts. */}
          <button
            onClick={toggleMute}
            title={muted
              ? 'Chime is muted — click to re-enable. Browser notifications still fire either way.'
              : 'Chime is on — click to mute. Browser notifications still fire either way.'}
            aria-pressed={!muted}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', fontSize: 12, fontWeight: 600, letterSpacing: 0.4,
              background: muted ? 'var(--bg-card)' : 'color-mix(in srgb, var(--brass) 14%, transparent)',
              color: muted ? 'var(--text-muted)' : 'var(--brass)',
              border: `1px solid ${muted ? 'var(--border)' : 'color-mix(in srgb, var(--brass) 45%, transparent)'}`,
              borderRadius: 4, cursor: 'pointer',
              fontFamily: 'var(--font-condensed, var(--font))', textTransform: 'uppercase',
            }}
          >
            <span aria-hidden="true">{muted ? '🔕' : '🔔'}</span>
            {muted ? 'Chime muted' : 'Chime on'}
          </button>
        {serverStatus && (
          <div className="pb-card pb-card-sm" style={{ padding: '10px 14px', fontSize: 12 }}>
            <div className="pb-eyebrow" style={{ marginBottom: 4 }}>Dedicated Server</div>
            <div style={{ fontFamily: 'var(--font-condensed)' }}>{serverStatus.ip}:{serverStatus.port}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <span style={{ color: serverStatus.rcon?.ok ? '#4caf50' : '#f44336' }}>● RCON</span>
              <span style={{ color: serverStatus.ssh?.ok ? '#4caf50' : '#f44336' }}>● SSH</span>
            </div>
          </div>
        )}
        </div>
      </div>

      {error && <div style={{ padding: 12, background: 'rgba(244,67,54,0.1)', border: '1px solid #f44336', borderRadius: 6, marginBottom: 16, color: '#f44336' }}>{error}</div>}

      {!session && (
        <div className="pb-card" style={{ padding: 30, textAlign: 'center', borderTop: '3px solid var(--pb-brass)' }}>
          {/* v6.03 — auto-running lobby. No more "An admin must open a session"
              empty state: any signed-in player joining auto-creates the open
              session via /inhouse/join, so the primary CTA is always present
              and the previous admin-only form is collapsed into <details>. */}
          <div className="pb-eyebrow" style={{ marginBottom: 6 }}>Open Queue</div>
          <h3 className="pb-serif" style={{ marginTop: 0, fontSize: '1.6rem' }}>Inhouse lobby is open</h3>
          <p style={{ color: 'var(--pb-muted)', marginBottom: 16 }}>
            Be the first to sign in — joining auto-starts the lobby. Once 10 players have queued
            we'll auto-open the accept phase.
          </p>
          {myAccountId ? (
            <>
              {/* Task #444 — Pre-match mood & form widget. Renders for the
                  signed-in viewer right above the position picker so the
                  vibe line lands the moment they're about to queue.
                  Self-gates on the `mood_widget` notification pref. */}
              <div style={{ maxWidth: 520, marginLeft: 'auto', marginRight: 'auto', textAlign: 'left' }}>
                <MoodFormWidget accountId={myAccountId} compact />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 }}>
                {POSITIONS.map(p => (
                  <button key={p.id} onClick={() => setMyPositions(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                    style={{ padding: '4px 10px', background: myPositions.includes(p.id) ? '#2196f3' : 'var(--bg)', color: myPositions.includes(p.id) ? '#fff' : 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                onClick={joinSession}
                disabled={discordGateBlocked}
                title={discordGateBlocked ? 'Link your Discord and join the OCE Inhouse server first.' : ''}
                style={{
                  padding: '10px 24px',
                  background: discordGateBlocked ? 'var(--bg)' : 'var(--brass)',
                  color: discordGateBlocked ? 'var(--text-muted)' : '#0d1424',
                  border: discordGateBlocked ? '1px solid var(--border)' : 'none',
                  borderRadius: 4,
                  cursor: discordGateBlocked ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: 15, letterSpacing: 0.4,
                }}>
                Sign In to Inhouse
              </button>
              <DiscordJoinGate steamUser={steamUser} refreshMe={refreshMe} />
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sign in with Steam to join.</p>
          )}
          {isAdmin && (
            <details style={{ marginTop: 24, textAlign: 'left', maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', letterSpacing: 0.5, fontWeight: 600 }}>
                ⚙ Admin override — open session with custom settings
              </summary>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 13 }}>
                  Captain mode:&nbsp;
                  <select value={captainMode} onChange={e => setCaptainMode(e.target.value)} style={{ padding: 4 }}>
                    <option value="highest_rank">Highest Rank</option>
                    <option value="random">Random</option>
                    <option value="highest_roll">Highest Roll (1-100)</option>
                    <option value="auto_balance">Auto-balance (skill-based)</option>
                    <option value="volunteer">Volunteer</option>
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>
                  Accept timer:&nbsp;
                  <input type="number" min={15} max={300} value={acceptSeconds} onChange={e => setAcceptSeconds(parseInt(e.target.value || '60', 10))} style={{ padding: 4, width: 70 }} /> sec
                </label>
                <label style={{ fontSize: 13 }}>
                  Min players to auto-start:&nbsp;
                  <input type="number" min={2} max={10} value={minPlayers} onChange={e => setMinPlayers(parseInt(e.target.value || '10', 10))} style={{ padding: 4, width: 60 }} />
                </label>
                <label style={{ fontSize: 13 }}>
                  Lobby fill grace period:&nbsp;
                  <input type="number" min={0} max={300} value={lobbyFillSeconds} onChange={e => setLobbyFillSeconds(parseInt(e.target.value || '30', 10))} style={{ padding: 4, width: 60 }} /> sec
                </label>
                <label style={{ fontSize: 13 }}>
                  Per-pick draft timer:&nbsp;
                  <input type="number" min={5} max={300} value={draftPickSeconds} onChange={e => setDraftPickSeconds(parseInt(e.target.value || '30', 10))} style={{ padding: 4, width: 60 }} /> sec
                  <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }}>auto-picks highest-MMR remaining if captain stalls</span>
                </label>
                <button onClick={createSession} disabled={creating} style={{ padding: '8px 16px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  {creating ? 'Creating…' : 'Open Session With These Settings'}
                </button>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Players don't need this — joining auto-creates a session with the standard 60s / 10-player / 30s defaults.
                </div>
              </div>
            </details>
          )}
        </div>
      )}

      {session && (() => {
        // v5.86 — session card redesign. Status pill, captain-mode badge,
        // player-count chip, and a slot-fill progress bar replace the bare
        // "Status: OPEN · Captain mode: …" plain-text line. The card itself
        // gets a brass top-rule and a slightly larger surface to anchor the
        // page. Inner content (countdown, accept/decline, player rosters) is
        // untouched.
        const minPlayers = session.min_players || 10;
        const fillPct = Math.min(100, Math.round((players.length / minPlayers) * 100));
        const statusStyle = ({
          open:        { bg: 'rgba(76,175,80,0.14)',  fg: '#4caf50', label: 'OPEN' },
          accepting:   { bg: 'rgba(255,152,0,0.14)',  fg: '#ff9800', label: 'ACCEPT PHASE' },
          drafting:    { bg: 'rgba(33,150,243,0.14)', fg: '#2196f3', label: 'DRAFTING' },
          server_failed: { bg: 'rgba(244,67,54,0.18)', fg: '#f44336', label: 'SERVER FAILED' },
          in_progress: { bg: 'rgba(197,169,117,0.18)', fg: 'var(--brass)', label: 'IN PROGRESS' },
          completed:   { bg: 'rgba(120,120,120,0.18)', fg: 'var(--text-muted)', label: 'COMPLETED' },
        })[session.status] || { bg: 'var(--bg)', fg: 'var(--text-muted)', label: String(session.status || '').toUpperCase() };
        return (
        <div className="pb-card" style={{
          padding: 20,
          borderTop: '3px solid var(--pb-brass)',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 className="pb-serif" style={{ margin: 0, fontSize: '1.5rem', letterSpacing: 0.2 }}>
                  Session <span style={{ color: 'var(--pb-brass-bright)' }}>#{session.id}</span>
                </h2>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '3px 10px', borderRadius: 999,
                  background: statusStyle.bg, color: statusStyle.fg,
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
                  border: `1px solid ${statusStyle.fg === 'var(--text-muted)' ? 'var(--border)' : statusStyle.fg}33`,
                }}>● {statusStyle.label}</span>
                {/* Task #325 — Watch live link. Shown whenever the bot's
                    lobbyManager reports an active matchId, which lines up
                    with the in-progress state of this session card. */}
                {liveSpectate.matchId && (
                  <Link
                    to={`/spectate/${liveSpectate.matchId}`}
                    aria-label={`Watch live match ${liveSpectate.matchId}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '3px 10px', borderRadius: 999,
                      background: 'rgba(244,67,54,0.16)', color: '#f44336',
                      fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
                      border: '1px solid #f4433655', textDecoration: 'none',
                    }}>
                    🔴 Watch live
                  </Link>
                )}
                {/* Task #450 — coin betting markets for the live match. */}
                {liveSpectate.matchId && (
                  <Link
                    to={`/inhouse/${liveSpectate.matchId}/markets`}
                    aria-label={`Coin betting markets for match ${liveSpectate.matchId}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '3px 10px', borderRadius: 999,
                      background: 'rgba(197,169,117,0.18)', color: 'var(--brass)',
                      fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
                      border: '1px solid #c5a97555', textDecoration: 'none',
                    }}>
                    🪙 Markets
                  </Link>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
                  padding: '3px 8px', borderRadius: 4,
                  background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)',
                }}>👑 {session.captain_mode}</span>
                <span style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
                  padding: '3px 8px', borderRadius: 4,
                  background: players.length >= minPlayers ? 'rgba(76,175,80,0.14)' : 'var(--bg)',
                  color:      players.length >= minPlayers ? '#4caf50' : 'var(--text-muted)',
                  border: `1px solid ${players.length >= minPlayers ? '#4caf5044' : 'var(--border)'}`,
                }}>
                  👥 {players.length} / {minPlayers} player{players.length === 1 ? '' : 's'}
                </span>
              </div>
              {/* Slot-fill bar — only useful before the match is in progress. */}
              {['open','accepting'].includes(session.status) && (
                <div style={{ marginTop: 10, height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{
                    height: '100%', width: `${fillPct}%`,
                    background: fillPct >= 100 ? 'linear-gradient(90deg, var(--brass), var(--amber))' : 'var(--brass)',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              )}
            </div>
            {isAdmin && (
              // v6.03 — collapse the entire admin override toolbar into a
              // <details> so the lobby reads as a player-driven space by
              // default. The auto-start ticker handles every transition for
              // a normal game; these buttons exist only for stuck/edge cases.
              <details style={{ flex: '0 0 auto' }}>
                <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.5, fontWeight: 700, padding: '4px 8px', border: '1px dashed var(--border)', borderRadius: 4 }}>
                  ⚙ ADMIN OVERRIDES
                </summary>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, padding: 10, background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 4 }}>
                  {session.status === 'open' && players.length >= 2 && (
                    <button
                      onClick={startAcceptPhase}
                      title="Force-start the accept phase before the auto-start timer fires."
                      style={{ padding: '6px 12px', background: '#ff9800', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                    >
                      Start Accept Phase
                    </button>
                  )}
                  {session.status === 'accepting' && acceptedCount >= 2 && (
                    <button onClick={selectCaptains} style={{ padding: '6px 12px', background: '#2196f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Select Captains ({acceptedCount} ready)</button>
                  )}
                  {(session.status === 'drafting' && undrafted.length === 0) || session.status === 'server_failed' ? (
                    <button onClick={provisionServer} style={{ padding: '6px 12px', background: session.status === 'server_failed' ? '#f44336' : '#4caf50', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                      {session.status === 'server_failed' ? '🔄 Retry Provisioning' : 'Provision Server'}
                    </button>
                  ) : null}
                  {/* v5.89 — demo lobby controls (admin only). */}
                  {['open','accepting'].includes(session.status) && players.length < (session.min_players || 10) && (
                    <button onClick={seedBots} title="Fill empty slots with bot players for end-to-end demo" style={{ padding: '6px 12px', background: 'transparent', color: 'var(--brass)', border: '1px dashed var(--brass)', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>🤖 Seed Bots</button>
                  )}
                  {['open','accepting','drafting'].includes(session.status) && players.some(p => Number(p.account_id) >= 9000001 && Number(p.account_id) <= 9000010) && (
                    <button onClick={clearBots} style={{ padding: '6px 12px', background: 'transparent', color: 'var(--text-muted)', border: '1px dashed var(--text-muted)', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Clear Bots</button>
                  )}
                  {session.status === 'drafting' && undrafted.length > 0 && (
                    <button onClick={autoDraft} title="Randomly distribute remaining picks across both teams (skips captains)" style={{ padding: '6px 12px', background: 'transparent', color: 'var(--brass)', border: '1px dashed var(--brass)', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>🎲 Auto-Draft</button>
                  )}
                  {session.status === 'in_progress' && (
                    <>
                      <button onClick={fetchReplayNow} style={{ padding: '6px 12px', background: '#2196f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Fetch Replay</button>
                      <button onClick={completeSession} style={{ padding: '6px 12px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Mark Complete</button>
                    </>
                  )}
                  <button onClick={cancelSession} style={{ padding: '6px 12px', background: 'transparent', color: '#f44336', border: '1px solid #f44336', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>

                  {/* v6.03 — live-config editor. Lets the admin retune the
                      auto-running lobby (captain mode override, accept
                      timer, min players, grace timer) without cancelling.
                      Fully optional — the lobby drives itself with the
                      defaults if no admin ever opens this. */}
                  {['open','accepting'].includes(session.status) && (
                    <details style={{ flexBasis: '100%', marginTop: 6 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.4, fontWeight: 700 }}>
                        ⚙ Live config (captain mode / timers / min players)
                      </summary>
                      <LiveConfigEditor session={session} onSaved={refresh} />
                    </details>
                  )}
                </div>
              </details>
            )}
          </div>

          {/* T005 — Accept / Ready bar. Mirrors the mockup's hero strip: an
              oversized serif accept-window dial on the left, then a "players
              ready" pip rail + waiting-on caption on the right. Pure re-skin
              of the existing accept countdown — the per-user Accept / Decline
              controls still live in the player panel below. */}
          {session.status === 'accepting' && session.accept_phase_starts_at && (() => {
            const readyCount = acceptedCount;
            const totalSlots = Math.max(players.length, readyCount);
            const waiting = players.filter(p => p.status !== 'accepted' && p.status !== 'declined');
            const waitingName = waiting.length > 0 ? resolvePlayerDisplayName(waiting[0]) : null;
            return (
              <div className="pb-card pb-accept-bar" style={{ borderColor: 'color-mix(in srgb, var(--pb-amber) 40%, var(--pb-line))' }}>
                <div className="pb-accept-grid">
                  <div className="pb-accept-timer">
                    <div>
                      <div className="pb-eyebrow" style={{ marginBottom: 4 }}>Accept Window</div>
                      <Countdown
                        startsAt={session.accept_phase_starts_at}
                        seconds={session.accept_phase_seconds || 60}
                        variant="hero"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div className="pb-eyebrow">Lobby Configuration</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontFamily: 'var(--font-condensed, var(--font))', textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 12, color: 'var(--pb-muted)' }}>
                        <span style={{ color: 'var(--pb-amber)' }}>Oceania</span>
                        <span style={{ color: 'var(--pb-faint)' }}>•</span>
                        <span>{String(session.captain_mode || 'captains draft').replace(/_/g, ' ')}</span>
                        <span style={{ color: 'var(--pb-faint)' }}>•</span>
                        <span>{session.accept_phase_seconds || 60}s phase</span>
                      </div>
                    </div>
                  </div>
                  <div className="pb-accept-ready">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span className="pb-eyebrow">Players Ready</span>
                      <span className="pb-serif" style={{ fontWeight: 700, fontSize: 18, color: 'var(--pb-brass-bright)' }}>
                        {readyCount} / {totalSlots}
                      </span>
                    </div>
                    <div className="pb-pips" role="img" aria-label={`${readyCount} of ${totalSlots} players ready`}>
                      {Array.from({ length: Math.max(totalSlots, 1) }).map((_, i) => (
                        <span key={i} className={`pb-pip${i < readyCount ? ' is-ready' : ''}`} />
                      ))}
                    </div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-condensed, var(--font))', letterSpacing: '0.08em', color: 'var(--pb-faint)' }}>
                      {waitingName
                        ? <>Waiting on <span style={{ color: 'var(--pb-amber)' }}>{waitingName}</span> to accept…</>
                        : 'All players have responded.'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* v6.03 — captain-mode poll. Open while the lobby is filling.
              Players in the lobby cast one vote (re-clicking clears it); the
              winning mode is materialised onto session.captain_mode by the
              auto-start ticker the moment we flip into the accept phase.
              Tie / zero-vote → Highest Rank. */}
          {session.status === 'open' && (
            <div className="pb-card-sm" style={{ marginTop: 14, padding: 14, background: 'var(--pb-surface)', border: '1px solid var(--pb-line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div className="pb-eyebrow" style={{ fontSize: 13 }}>👑 Captain Mode — Vote</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {voteTally.totalVotes} vote{voteTally.totalVotes === 1 ? '' : 's'} · winning: <strong style={{ color: 'var(--text)' }}>{({
                    highest_rank: 'Highest Rank',
                    random: 'Random',
                    auto_balance: 'Auto-balance',
                    volunteer: 'Volunteer',
                  })[voteTally.winning] || voteTally.winning}</strong>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                {[
                  { id: 'highest_rank', label: 'Highest Rank', hint: 'Top 2 by MMR / leaderboard / rank tier' },
                  { id: 'random',       label: 'Random',       hint: 'Two random captains from accepted players' },
                  { id: 'auto_balance', label: 'Auto-balance', hint: 'Skill-based 5v5 split with smallest projected MMR delta' },
                  { id: 'volunteer',    label: 'Volunteer',    hint: 'Self-nominate during accept phase — falls back to Highest Rank if <2 volunteer' },
                ].map(opt => {
                  const count = voteTally.tally[opt.id] || 0;
                  const isMine = voteTally.myVote === opt.id;
                  const disabled = !myAccountId || !isInSession;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => castCaptainVote(opt.id)}
                      disabled={disabled}
                      title={disabled ? 'Join the lobby to vote' : opt.hint}
                      style={{
                        padding: '10px 12px',
                        background: isMine ? 'color-mix(in srgb, var(--brass) 18%, transparent)' : 'var(--bg-elevated)',
                        border: `1px solid ${isMine ? 'var(--brass)' : 'var(--border)'}`,
                        borderRadius: 6,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.55 : 1,
                        textAlign: 'left',
                        color: 'var(--text)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          background: count > 0 ? 'var(--brass)' : 'var(--bg)',
                          color: count > 0 ? '#0d1424' : 'var(--text-muted)',
                        }}>{count}</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.hint}</span>
                      {isMine && <span style={{ fontSize: 10, color: 'var(--brass)', fontWeight: 700, letterSpacing: 0.4 }}>YOUR VOTE — click again to clear</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* v5.75: auto-start countdown — visible to everyone once min_players is reached. */}
          {session.status === 'open' && session.auto_start_at && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'color-mix(in srgb, var(--brass) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--brass) 35%, transparent)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontWeight: 600, color: 'var(--brass)' }}>
                ✓ Lobby is full ({players.length}/{session.min_players || 10}) — accept phase auto-starts soon
              </div>
              <Countdown startsAt={new Date(new Date(session.auto_start_at).getTime() - (session.lobby_fill_seconds || 30) * 1000).toISOString()} seconds={session.lobby_fill_seconds || 30} />
            </div>
          )}

          {/* Player accept/decline panel */}
          {myAccountId && (
            <div style={{ marginTop: 16, padding: 14, background: 'rgba(33,150,243,0.06)', borderRadius: 6, border: '1px solid rgba(33,150,243,0.2)' }}>
              {!isInSession && ['open','accepting'].includes(session.status) && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Join this inhouse</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {POSITIONS.map(p => (
                      <button key={p.id} onClick={() => setMyPositions(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                        style={{ padding: '4px 10px', background: myPositions.includes(p.id) ? '#2196f3' : 'var(--bg)', color: myPositions.includes(p.id) ? '#fff' : 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={joinSession}
                    disabled={discordGateBlocked}
                    title={discordGateBlocked ? 'Link your Discord and join the OCE Inhouse server first.' : ''}
                    style={{
                      padding: '8px 16px',
                      background: discordGateBlocked ? 'var(--bg)' : '#4caf50',
                      color: discordGateBlocked ? 'var(--text-muted)' : '#fff',
                      border: discordGateBlocked ? '1px solid var(--border)' : 'none',
                      borderRadius: 4,
                      cursor: discordGateBlocked ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                    }}>Join Session</button>
                  <DiscordJoinGate steamUser={steamUser} refreshMe={refreshMe} />
                </div>
              )}
              {isInSession && session.status === 'accepting' && myPlayer.status !== 'accepted' && myPlayer.status !== 'declined' && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Accept the match</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={acceptMatch} style={{ padding: '10px 20px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>✓ Accept</button>
                    <button onClick={declineMatch} style={{ padding: '10px 20px', background: 'transparent', color: '#f44336', border: '1px solid #f44336', borderRadius: 4, cursor: 'pointer' }}>✗ Decline</button>
                  </div>
                </div>
              )}
              {isInSession && myPlayer.status === 'accepted' && session.status === 'accepting' && (
                <div style={{ color: '#4caf50', fontWeight: 600 }}>✓ You're ready. Waiting for others…</div>
              )}
              {/* Task #119 — Volunteer captain signup. Visible only when the
                  resolved captain mode is 'volunteer' and the player has
                  accepted the match. Tally is shown to everyone in the
                  accept phase so players can see whether enough have
                  volunteered before the timer expires. */}
              {isInSession && session.status === 'accepting' && session.captain_mode === 'volunteer' && (
                <div style={{
                  marginTop: 12, padding: '10px 12px',
                  background: 'color-mix(in srgb, var(--brass) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--brass) 35%, transparent)',
                  borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: 8,
                }}>
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--brass)', letterSpacing: 0.4 }}>👑 VOLUNTEER MODE</div>
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {volunteerInfo.count} volunteer{volunteerInfo.count === 1 ? '' : 's'} so far ·{' '}
                      {volunteerInfo.count >= 2
                        ? (volunteerInfo.count === 2
                            ? 'these two will be captains'
                            : 'two will be picked at random from the pool')
                        : `need ${2 - volunteerInfo.count} more or it falls back to Highest Rank`}
                    </div>
                  </div>
                  {myPlayer.status === 'accepted' ? (
                    <button
                      onClick={toggleVolunteer}
                      style={{
                        padding: '8px 14px',
                        background: volunteerInfo.myVolunteer ? 'var(--brass)' : 'transparent',
                        color: volunteerInfo.myVolunteer ? '#0d1424' : 'var(--brass)',
                        border: '1px solid var(--brass)',
                        borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 12,
                        letterSpacing: 0.4, textTransform: 'uppercase',
                      }}
                    >
                      {volunteerInfo.myVolunteer ? '✓ Volunteering — click to withdraw' : '🙋 Captain me'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Accept the match to volunteer</span>
                  )}
                </div>
              )}
              {isInSession && session.status === 'open' && (
                <div>
                  <div style={{ color: '#aaa', marginBottom: 8 }}>Waiting for accept phase to start</div>
                  <button onClick={leaveSession} style={{ padding: '6px 12px', background: 'transparent', color: '#f44336', border: '1px solid #f44336', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Leave</button>
                </div>
              )}
              {/* Task #168 — auto-provisioning indicator + failure banner.
                  While the helper is in-flight (drafting + 8 picks) show a
                  pill so players don't think the lobby is stuck. On
                  server_failed show a red banner with a captain-visible
                  Retry button (admins also see it). */}
              {session.status === 'drafting' && undrafted.length === 0 && isInSession && (
                <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(33,150,243,0.12)', border: '1px solid rgba(33,150,243,0.4)', borderRadius: 6, fontSize: 13, color: '#66c0f4', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#66c0f4', animation: 'pulse 1.4s ease-in-out infinite' }} />
                  Provisioning server…
                </div>
              )}
              {session.status === 'server_failed' && (isInSession || isAdmin) && (
                <div role="alert" style={{ marginTop: 8, padding: 14, background: 'rgba(244,67,54,0.1)', border: '1px solid rgba(244,67,54,0.4)', borderRadius: 6 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: '#f44336' }}>⚠ Server provisioning failed</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    {session.notes || 'The dedicated server didn\'t accept the new password. Captains can retry below.'}
                  </div>
                  {(isAdmin || myAccountId === Number(session.captain1_account_id) || myAccountId === Number(session.captain2_account_id)) ? (
                    <button
                      type="button"
                      onClick={retryServerProvisioning}
                      disabled={retryingServer}
                      style={{ padding: '8px 16px', background: '#f44336', color: '#fff', border: 'none', borderRadius: 4, cursor: retryingServer ? 'wait' : 'pointer', fontWeight: 600 }}
                    >
                      {retryingServer ? 'Retrying…' : '🔄 Retry provisioning'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Waiting for a captain or admin to retry…</span>
                  )}
                </div>
              )}
              {/* Task #445 — Live pick advisor. Opt-in, non-blocking. Only
                  mounts when the viewer has flipped the toggle in Settings,
                  is drafted onto a team, and the draft is live (or the match
                  is in progress so they can plan their next pick). Dismiss
                  state is keyed per session so it resets next inhouse. */}
              {pickAdvisorOptin && isInSession && (myPlayer?.team === 1 || myPlayer?.team === 2)
                && (session.status === 'drafting' || session.status === 'in_progress')
                && !pickAdvisorDismissed[session.id] && (
                <PickAdvisorPanel
                  sessionId={session.id}
                  onDismiss={() => setPickAdvisorDismissed(prev => ({ ...prev, [session.id]: true }))}
                />
              )}
              {connectLink && session.status === 'in_progress' && isInSession && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Match is live — connect now</div>
                  <a href={connectLink} style={{ display: 'inline-block', padding: '12px 24px', background: '#171a21', color: '#66c0f4', textDecoration: 'none', borderRadius: 4, fontWeight: 700, border: '1px solid #66c0f4' }}>
                    🎮 Connect to Server
                  </a>
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                    Or paste in Dota console: <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 3 }}>connect {session.server_ip}:{session.server_port}; password {session.match_password}</code>
                  </div>
                </div>
              )}
            </div>
          )}

          {!myAccountId && (
            <div style={{ marginTop: 16, padding: 14, background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)', borderRadius: 6, fontSize: 13, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <a
                href="/auth/steam"
                style={{
                  background: '#1b2838', color: '#d6ff7a',
                  border: '1px solid #66c0f4',
                  padding: '6px 12px', fontSize: 12, fontWeight: 600,
                  borderRadius: 4,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  textDecoration: 'none',
                }}
              >
                <img src="https://store.steampowered.com/favicon.ico" alt="" style={{ width: 14, height: 14 }} />
                Sign in with Steam
                <span aria-hidden="true">🔒</span>
              </a>
              <span style={{ color: '#ffc107' }}>to join this lobby.</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                You sign in directly with Valve · <WhyIsThisSafeLink />
              </span>
            </div>
          )}

          {/* Players / teams */}
          {session.status === 'drafting' || session.status === 'in_progress' || session.status === 'completed' ? (() => {
            // v5.92 — Captain-draft layout brought up to the Hybrid · Court &
            // Pitch sandbox composition: a timer / turn-indicator strip
            // anchored at the top, then a three-column board with vertical
            // roster panels on the left and right and the unpicked-player
            // pool centred between them. Each roster panel inherits the
            // brass top-rule, navy card surface, and serif lockup that the
            // sandbox mockup uses for team blocks. We compute captain /
            // turn state once here so both the top strip and the centre
            // pool can label themselves consistently.
            const cap1Id = Number(session.captain1_account_id);
            const cap2Id = Number(session.captain2_account_id);
            const cap1Player = players.find(p => Number(p.account_id) === cap1Id);
            const cap2Player = players.find(p => Number(p.account_id) === cap2Id);
            const cap1Name = cap1Player ? resolvePlayerDisplayName(cap1Player) : resolveDisplayName(cap1Id);
            const cap2Name = cap2Player ? resolvePlayerDisplayName(cap2Player) : resolveDisplayName(cap2Id);
            const myCaptainTeam = myAccountId === cap1Id ? 1 : myAccountId === cap2Id ? 2 : null;
            const turn = draftStatus?.currentPickerTeam ?? null;
            const isMyTurn = myCaptainTeam !== null && turn === myCaptainTeam;
            const canDraft = isAdmin || isMyTurn;
            const turnName = turn === 1 ? cap1Name : turn === 2 ? cap2Name : null;
            const isDrafting = session.status === 'drafting';
            const team1Label = `Team 1${session.team1_is_radiant ? ' · Radiant' : ' · Dire'}`;
            const team2Label = `Team 2${session.team1_is_radiant ? ' · Dire' : ' · Radiant'}`;

            // Task #130 — auto_balance projected balance metadata. Only
            // populated when the captain mode is auto_balance and the route
            // ran the 5v5 enumeration (10 players present at the moment of
            // the split).
            const balanceMeta = (session.captain_mode === 'auto_balance' && session.auto_balance_meta)
              ? session.auto_balance_meta : null;
            const balanceScores = balanceMeta?.scores || null;
            const scoreFor = (accountId) => {
              if (!balanceScores) return null;
              const v = balanceScores[String(accountId)];
              return v == null ? null : Number(v);
            };

            const RosterPanel = ({ teamNum, label, accent, capName, picks }) => (
              <div className="pb-card" style={{
                position: 'relative',
                borderTop: `3px solid ${accent}`,
                padding: '14px 12px 12px',
                minHeight: 320,
              }}>
                <div style={{ marginBottom: 10 }}>
                  <div className="pb-eyebrow" style={{ letterSpacing: '0.16em' }}>{label}</div>
                  <div style={{
                    fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 700,
                    color: 'var(--text-primary)', marginTop: 2,
                    display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
                  }}>
                    <span style={{ color: accent }}>★</span>
                    <span>{capName}</span>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-condensed, var(--font))', letterSpacing: 1, color: 'var(--text-muted)' }}>CAPTAIN</span>
                    {(() => {
                      // Task #190 — flag chronic AFK captains in-lobby. Only
                      // surfaces when ratio crosses a noticeable threshold.
                      const capId = teamNum === 1 ? cap1Id : cap2Id;
                      const stats = captainAutoStats[String(capId)];
                      if (!stats || !(stats.picks > 0)) return null;
                      const ratioPct = stats.ratio * 100;
                      if (ratioPct < 25) return null;
                      const tone = ratioPct >= 50 ? '#f87171' : '#fbbf24';
                      return (
                        <span
                          title={`Auto-picked ${stats.autoPicks} of ${stats.picks} picks across last ${stats.sessionsConsidered} captain ${stats.sessionsConsidered === 1 ? 'run' : 'runs'}`}
                          style={{
                            fontSize: 10, fontFamily: 'var(--font-condensed, var(--font))',
                            letterSpacing: 1, color: tone, border: `1px solid ${tone}`,
                            borderRadius: 4, padding: '1px 6px', fontWeight: 700,
                          }}
                        >⏱ {ratioPct.toFixed(0)}% AUTO</span>
                      );
                    })()}
                  </div>
                </div>
                {picks.length === 0
                  ? <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', padding: '6px 4px' }}>No picks yet</div>
                  : picks.map(p => (
                      <PlayerRow
                        key={p.account_id} player={p} session={session}
                        isCurrentUser={Number(p.account_id) === myAccountId}
                        isCaptain={Number(p.account_id) === (teamNum === 1 ? cap1Id : cap2Id)}
                        balanceScore={scoreFor(p.account_id)}
                      />
                    ))}
              </div>
            );

            return (
              <div style={{ marginTop: 20 }}>
                {/* Timer / turn-indicator strip — anchored at the top of the draft board. */}
                {isDrafting && (
                  <div className="pb-card" style={{
                    borderTop: '3px solid var(--pb-brass)',
                    padding: '12px 16px',
                    marginBottom: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, flexWrap: 'wrap',
                  }}>
                    <div>
                      <div className="pb-eyebrow">Captain Draft</div>
                      <div style={{
                        fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700,
                        color: 'var(--text-primary)', marginTop: 2,
                      }}>
                        {undrafted.length > 0 ? `${undrafted.length} player${undrafted.length === 1 ? '' : 's'} remaining` : 'Draft complete'}
                      </div>
                    </div>
                    {turn && undrafted.length > 0 && (
                      <div style={{
                        padding: '8px 14px', borderRadius: 4, fontWeight: 700, fontSize: 13,
                        background: isMyTurn ? 'color-mix(in srgb, var(--amber) 18%, transparent)' : 'var(--bg-secondary)',
                        color: isMyTurn ? 'var(--amber)' : 'var(--text-secondary)',
                        border: `1px solid ${isMyTurn ? 'var(--amber)' : 'var(--border)'}`,
                        fontFamily: 'var(--font-condensed, var(--font))', letterSpacing: 0.6, textTransform: 'uppercase',
                      }}>
                        {isMyTurn ? '⚡ Your pick' : `On the clock · ${turnName} (Team ${turn})`}
                      </div>
                    )}
                    {/* Task #172 — per-pick countdown. When the deadline
                        elapses, the autoStartTicker auto-picks the highest-MMR
                        remaining player onto the picking captain's team via
                        the same /draft-pick handler (so the Task #168
                        auto-provision still fires on the 8th pick). */}
                    {undrafted.length > 0 && draftStatus?.pickDeadlineAt && (
                      <div style={{ flex: '1 1 220px', minWidth: 220 }}>
                        <Countdown
                          endsAt={draftStatus.pickDeadlineAt}
                          seconds={draftStatus.pickSeconds || 30}
                          label={isMyTurn ? 'Pick or get auto-picked' : 'Pick timer'}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Task #130 — Projected balance card. Shown only when the
                    captains were chosen via auto_balance and the route had a
                    full 5v5 to optimise. Surfaces team sums, |delta|, and a
                    rough Elo-style win probability so players can see how
                    balanced the auto-picked teams actually are. */}
                {balanceMeta && (() => {
                  const t1Sum = Number(balanceMeta.team1Sum) || 0;
                  const t2Sum = Number(balanceMeta.team2Sum) || 0;
                  const delta = Number(balanceMeta.delta) || 0;
                  const winProbT1 = Math.max(0, Math.min(1, Number(balanceMeta.winProbTeam1) || 0.5));
                  const winProbT2 = 1 - winProbT1;
                  // Tag balance quality in plain English so players know how
                  // tight the split is without needing to interpret the raw
                  // delta. Thresholds are loose — score units ≈ MMR points.
                  const quality = delta < 200 ? { label: 'Razor-thin', color: 'var(--amber)' }
                                : delta < 600 ? { label: 'Well balanced', color: '#4caf50' }
                                : delta < 1200 ? { label: 'Lean', color: 'var(--brass)' }
                                : { label: 'Skewed', color: '#f44336' };
                  const fmt = (n) => Math.round(n).toLocaleString();
                  const fmtPct = (p) => `${(p * 100).toFixed(1)}%`;
                  return (
                    <div className="pb-card" style={{
                      borderTop: '3px solid var(--pb-brass)',
                      padding: '12px 16px',
                      marginBottom: 14,
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                        gap: 12, flexWrap: 'wrap', marginBottom: 10,
                      }}>
                        <div>
                          <div className="pb-eyebrow">Auto-balance · Projected balance</div>
                          <div style={{
                            fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 700,
                            color: 'var(--text-primary)', marginTop: 2,
                          }}>
                            Smallest possible delta from {balanceMeta.playerCount || 10} players
                          </div>
                        </div>
                        <div style={{
                          padding: '6px 12px', borderRadius: 4, fontWeight: 700, fontSize: 12,
                          background: `color-mix(in srgb, ${quality.color} 18%, transparent)`,
                          color: quality.color,
                          border: `1px solid ${quality.color}`,
                          fontFamily: 'var(--font-condensed, var(--font))',
                          letterSpacing: 0.6, textTransform: 'uppercase',
                        }}>
                          {quality.label} · |Δ| {fmt(delta)}
                        </div>
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto 1fr',
                        gap: 12,
                        alignItems: 'center',
                      }}>
                        <div style={{ borderLeft: '3px solid #4caf50', paddingLeft: 10 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{team1Label}</div>
                          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700, color: 'var(--pb-brass-bright)' }}>{fmt(t1Sum)}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Win prob <strong style={{ color: 'var(--text-primary)' }}>{fmtPct(winProbT1)}</strong></div>
                        </div>
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-condensed, var(--font))', fontSize: 11, letterSpacing: 1.2 }}>VS</div>
                        <div style={{ borderRight: '3px solid #f44336', paddingRight: 10, textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{team2Label}</div>
                          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700, color: 'var(--pb-brass-bright)' }}>{fmt(t2Sum)}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Win prob <strong style={{ color: 'var(--text-primary)' }}>{fmtPct(winProbT2)}</strong></div>
                        </div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Per-player score appears next to each name in the rosters below. Higher = stronger. Win probability is an Elo-style estimate from the score delta.
                      </div>
                    </div>
                  );
                })()}

                {/* Three-column board: roster · pool · roster. Stacks on narrow screens. */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(220px, 1fr) minmax(260px, 1.4fr) minmax(220px, 1fr)',
                  gap: 14,
                }} className="inhouse-draft-board">
                  <RosterPanel
                    teamNum={1} label={team1Label} accent="#4caf50" capName={cap1Name}
                    picks={team1.sort((a,b)=>(a.pick_order||0)-(b.pick_order||0))}
                  />

                  {/* Centre pool — unpicked players. */}
                  <div className="pb-card" style={{
                    borderTop: '3px solid var(--pb-brass)',
                    padding: '14px 12px 12px',
                    minHeight: 320,
                  }}>
                    <div className="pb-eyebrow" style={{ letterSpacing: '0.16em', marginBottom: 2 }}>The Pool</div>
                    <div style={{
                      fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 700,
                      color: 'var(--text-primary)', marginBottom: 10,
                    }}>
                      Unpicked players {undrafted.length > 0 ? `(${undrafted.length})` : ''}
                    </div>
                    {isDrafting && isMyTurn && !isAdmin && undrafted.length > 0 && (
                      <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                        Click → T{myCaptainTeam} on the player you want to pick onto your team.
                      </div>
                    )}
                    {undrafted.length === 0
                      ? <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', padding: '6px 4px' }}>
                          {isDrafting ? 'All players drafted.' : 'No unpicked players.'}
                        </div>
                      : undrafted.sort((a,b)=>Number(b.trueskill_mmr)-Number(a.trueskill_mmr)).map(p => (
                          <PlayerRow key={p.account_id} player={p} session={session}
                            isCurrentUser={Number(p.account_id) === myAccountId}
                            canDraft={isDrafting && canDraft} onDraftPick={draftPick} />
                        ))}
                  </div>

                  <RosterPanel
                    teamNum={2} label={team2Label} accent="#f44336" capName={cap2Name}
                    picks={team2.sort((a,b)=>(a.pick_order||0)-(b.pick_order||0))}
                  />
                </div>
              </div>
            );
          })() : (
            <div style={{ marginTop: 20 }}>
              <h3 className="pb-section-title" style={{ marginBottom: 12 }}>Registered Players ({players.length})</h3>
              {players.sort((a,b)=>Number(b.trueskill_mmr)-Number(a.trueskill_mmr)).map(p => (
                <PlayerRow key={p.account_id} player={p} session={session} isCurrentUser={Number(p.account_id) === myAccountId} />
              ))}
              {players.length === 0 && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No players yet — sign in to be the first.</div>}
            </div>
          )}
        </div>
        );
      })()}

      {pastSessions.length > 0 && (
        <div>
          <h3 className="pb-section-title" style={{ marginBottom: 12 }}>Recent Sessions</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--pb-line)' }}>
                <th className="pb-eyebrow" style={{ textAlign: 'left', padding: '8px' }}>#</th>
                <th className="pb-eyebrow" style={{ textAlign: 'left', padding: '8px' }}>Status</th>
                <th className="pb-eyebrow" style={{ textAlign: 'left', padding: '8px' }}>Match</th>
                <th className="pb-eyebrow" style={{ textAlign: 'left', padding: '8px' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {pastSessions.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--pb-line)' }}>
                  <td style={{ padding: '8px' }}>{s.id}</td>
                  <td style={{ padding: '8px' }}>{s.status}</td>
                  <td style={{ padding: '8px' }}>{s.match_id ? <Link to={`/match/${s.match_id}`}>{s.match_id}</Link> : '—'}</td>
                  <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{new Date(s.created_at).toLocaleString('en-AU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
