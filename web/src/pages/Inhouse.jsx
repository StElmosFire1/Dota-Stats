import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { useSteamAuth } from '../context/SteamAuthContext';

const POSITIONS = [
  { id: 1, label: 'P1 — Carry' },
  { id: 2, label: 'P2 — Mid' },
  { id: 3, label: 'P3 — Offlane' },
  { id: 4, label: 'P4 — Soft Support' },
  { id: 5, label: 'P5 — Hard Support' },
];

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await fetch(`/api${path}`, { ...opts, headers, credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function Countdown({ startsAt, seconds, onExpire }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!startsAt) return;
    const end = new Date(startsAt).getTime() + seconds * 1000;
    const tick = () => {
      const r = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRemaining(r);
      if (r === 0 && onExpire) onExpire();
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [startsAt, seconds, onExpire]);
  const pct = seconds > 0 ? (remaining / seconds) * 100 : 0;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-muted)' }}>Accept phase</span>
        <span style={{ fontWeight: 700, color: remaining < 10 ? '#f44336' : 'var(--text)' }}>{remaining}s</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: remaining < 10 ? '#f44336' : '#4caf50', transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function PlayerRow({ player, session, isCurrentUser, isCaptain, isDrafting, canDraft, onDraftPick }) {
  const mmr = Math.round(Number(player.trueskill_mmr) || 0);
  const statusColors = {
    registered: { bg: 'rgba(120,120,120,0.15)', color: '#aaa', label: 'Waiting' },
    accepted: { bg: 'rgba(76,175,80,0.15)', color: '#4caf50', label: '✓ Ready' },
    declined: { bg: 'rgba(244,67,54,0.15)', color: '#f44336', label: '✗ Declined' },
    drafted: { bg: 'rgba(33,150,243,0.15)', color: '#2196f3', label: 'Drafted' },
  };
  const s = statusColors[player.status] || statusColors.registered;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      background: isCurrentUser ? 'rgba(255,193,7,0.08)' : 'var(--bg-elevated)',
      border: `1px solid ${isCurrentUser ? 'rgba(255,193,7,0.3)' : 'var(--border)'}`,
      borderRadius: 6,
      marginBottom: 6,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link to={`/player/${player.account_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {player.nickname || `Player ${player.account_id}`}
          </Link>
          {isCaptain && <span style={{ fontSize: 11, padding: '2px 6px', background: '#ff9800', color: '#000', borderRadius: 3, fontWeight: 700 }}>CAPTAIN</span>}
          {player.team > 0 && <span style={{ fontSize: 11, padding: '2px 6px', background: player.team === 1 ? '#2e7d32' : '#c62828', color: '#fff', borderRadius: 3 }}>Team {player.team}</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          MMR {mmr}
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

export default function Inhouse() {
  const { superuserKey } = useSuperuser();
  const { steamUser } = useSteamAuth();
  const [session, setSession] = useState(null);
  const [players, setPlayers] = useState([]);
  const [pastSessions, setPastSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [serverStatus, setServerStatus] = useState(null);
  const [creating, setCreating] = useState(false);
  const [captainMode, setCaptainMode] = useState('highest_rank');
  const [acceptSeconds, setAcceptSeconds] = useState(60);
  const [minPlayers, setMinPlayers] = useState(10);
  const [lobbyFillSeconds, setLobbyFillSeconds] = useState(30);
  const [myPositions, setMyPositions] = useState([]);
  const [draftStatus, setDraftStatus] = useState(null);
  const isAdmin = !!superuserKey;
  const myAccountId = steamUser?.steamAccountId ? Number(steamUser.steamAccountId) : null;
  const pollRef = useRef(null);

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
      setPastSessions((data.sessions || []).filter(s => !['open','accepting','drafting','in_progress'].includes(s.status)));
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
      await api('/inhouse', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ captainMode, acceptPhaseSeconds: acceptSeconds, minPlayers, lobbyFillSeconds }) });
      await refresh();
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  }

  async function joinSession() {
    if (!session || !myAccountId) return;
    try {
      await api(`/inhouse/${session.id}/join`, { method: 'POST', body: JSON.stringify({ accountId: myAccountId, preferredPositions: myPositions.join(',') || null }) });
      await refresh();
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

  async function provisionServer() {
    if (!isAdmin || !session) return;
    try {
      const r = await api(`/inhouse/${session.id}/server`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({}) });
      if (r.rcon && !r.rcon.ok) {
        alert(`Server provisioned but RCON push failed: ${r.rcon.error}\nPlayers will still see the connect link.`);
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

  const myPlayer = myAccountId ? players.find(p => Number(p.account_id) === myAccountId) : null;
  const isInSession = !!myPlayer;
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
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Inhouse Lobby</h1>
          <p style={{ color: 'var(--text-muted)', margin: '6px 0 0' }}>FACEIT-style match accept, captain draft, and direct server connect.</p>
        </div>
        {serverStatus && (
          <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Dedicated Server</div>
            <div>{serverStatus.ip}:{serverStatus.port}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <span style={{ color: serverStatus.rcon?.ok ? '#4caf50' : '#f44336' }}>● RCON</span>
              <span style={{ color: serverStatus.ssh?.ok ? '#4caf50' : '#f44336' }}>● SSH</span>
            </div>
          </div>
        )}
      </div>

      {error && <div style={{ padding: 12, background: 'rgba(244,67,54,0.1)', border: '1px solid #f44336', borderRadius: 6, marginBottom: 16, color: '#f44336' }}>{error}</div>}

      {!session && (
        <div style={{ padding: 30, textAlign: 'center', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0 }}>No active inhouse session</h3>
          <p style={{ color: 'var(--text-muted)' }}>An admin can open a session below to start the FACEIT-style flow.</p>
          {isAdmin && (
            <div style={{ marginTop: 16, display: 'inline-flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start', textAlign: 'left' }}>
              <label style={{ fontSize: 13 }}>
                Captain mode:&nbsp;
                <select value={captainMode} onChange={e => setCaptainMode(e.target.value)} style={{ padding: 4 }}>
                  <option value="highest_rank">Highest Rank</option>
                  <option value="random">Random</option>
                  <option value="highest_roll">Highest Roll (1-100)</option>
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
              <button onClick={createSession} disabled={creating} style={{ padding: '8px 16px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                {creating ? 'Creating…' : 'Open Session'}
              </button>
            </div>
          )}
          {!isAdmin && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sign in as admin to open a session.</p>}
        </div>
      )}

      {session && (
        <div style={{ background: 'var(--bg-elevated)', padding: 20, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h2 style={{ margin: 0 }}>Session #{session.id}</h2>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                Status: <strong style={{ color: 'var(--text)' }}>{session.status.toUpperCase()}</strong>
                &nbsp;·&nbsp;Captain mode: {session.captain_mode}
                &nbsp;·&nbsp;{players.length} player{players.length === 1 ? '' : 's'}
              </div>
            </div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {session.status === 'open' && players.length >= 2 && (
                  <button onClick={startAcceptPhase} style={{ padding: '6px 12px', background: '#ff9800', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Start Accept Phase</button>
                )}
                {session.status === 'accepting' && acceptedCount >= 2 && (
                  <button onClick={selectCaptains} style={{ padding: '6px 12px', background: '#2196f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Select Captains ({acceptedCount} ready)</button>
                )}
                {session.status === 'drafting' && undrafted.length === 0 && (
                  <button onClick={provisionServer} style={{ padding: '6px 12px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Provision Server</button>
                )}
                {session.status === 'in_progress' && (
                  <>
                    <button onClick={fetchReplayNow} style={{ padding: '6px 12px', background: '#2196f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Fetch Replay</button>
                    <button onClick={completeSession} style={{ padding: '6px 12px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Mark Complete</button>
                  </>
                )}
                <button onClick={cancelSession} style={{ padding: '6px 12px', background: 'transparent', color: '#f44336', border: '1px solid #f44336', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
              </div>
            )}
          </div>

          {session.status === 'accepting' && session.accept_phase_starts_at && (
            <Countdown startsAt={session.accept_phase_starts_at} seconds={session.accept_phase_seconds || 60} />
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
                  <button onClick={joinSession} style={{ padding: '8px 16px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Join Session</button>
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
              {isInSession && session.status === 'open' && (
                <div>
                  <div style={{ color: '#aaa', marginBottom: 8 }}>Waiting for accept phase to start</div>
                  <button onClick={leaveSession} style={{ padding: '6px 12px', background: 'transparent', color: '#f44336', border: '1px solid #f44336', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Leave</button>
                </div>
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
            <div style={{ marginTop: 16, padding: 12, background: 'rgba(255,193,7,0.1)', borderRadius: 6, fontSize: 13 }}>
              <Link to="/auth/steam" style={{ color: '#ffc107' }}>Sign in with Steam</Link> to join.
            </div>
          )}

          {/* Players / teams */}
          {session.status === 'drafting' || session.status === 'in_progress' || session.status === 'completed' ? (
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <h3 style={{ marginTop: 0, color: '#4caf50' }}>Team 1{session.team1_is_radiant ? ' (Radiant)' : ' (Dire)'}</h3>
                {team1.sort((a,b)=>(a.pick_order||0)-(b.pick_order||0)).map(p => (
                  <PlayerRow key={p.account_id} player={p} session={session} isCurrentUser={Number(p.account_id) === myAccountId}
                    isCaptain={Number(session.captain1_account_id) === Number(p.account_id)} />
                ))}
                {team1.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No picks yet</div>}
              </div>
              <div>
                <h3 style={{ marginTop: 0, color: '#f44336' }}>Team 2{session.team1_is_radiant ? ' (Dire)' : ' (Radiant)'}</h3>
                {team2.sort((a,b)=>(a.pick_order||0)-(b.pick_order||0)).map(p => (
                  <PlayerRow key={p.account_id} player={p} session={session} isCurrentUser={Number(p.account_id) === myAccountId}
                    isCaptain={Number(session.captain2_account_id) === Number(p.account_id)} />
                ))}
                {team2.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No picks yet</div>}
              </div>
              {session.status === 'drafting' && undrafted.length > 0 && (() => {
                // v5.75: figure out whether the signed-in user is one of the
                // two captains and whether it's their turn to pick.
                const cap1Id = Number(session.captain1_account_id);
                const cap2Id = Number(session.captain2_account_id);
                const myCaptainTeam = myAccountId === cap1Id ? 1 : myAccountId === cap2Id ? 2 : null;
                const turn = draftStatus?.currentPickerTeam ?? null;
                const isMyTurn = myCaptainTeam !== null && turn === myCaptainTeam;
                const canDraft = isAdmin || isMyTurn;
                const cap1Name = players.find(p => Number(p.account_id) === cap1Id)?.nickname || 'Captain 1';
                const cap2Name = players.find(p => Number(p.account_id) === cap2Id)?.nickname || 'Captain 2';
                const turnName = turn === 1 ? cap1Name : turn === 2 ? cap2Name : null;
                return (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                      <h3 style={{ margin: 0 }}>Unpicked Players</h3>
                      {turn && (
                        <div style={{ padding: '6px 12px', borderRadius: 4, fontWeight: 700, fontSize: 13,
                          background: isMyTurn ? 'color-mix(in srgb, var(--amber) 18%, transparent)' : 'var(--bg-elevated)',
                          color: isMyTurn ? 'var(--amber)' : 'var(--text-muted)',
                          border: `1px solid ${isMyTurn ? 'var(--amber)' : 'var(--border)'}` }}>
                          {isMyTurn ? '⚡ Your pick!' : `Waiting for ${turnName} (Team ${turn})…`}
                        </div>
                      )}
                    </div>
                    {isMyTurn && !isAdmin && (
                      <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                        Click → T{myCaptainTeam} on the player you want to pick onto your team.
                      </div>
                    )}
                    {undrafted.sort((a,b)=>Number(b.trueskill_mmr)-Number(a.trueskill_mmr)).map(p => (
                      <PlayerRow key={p.account_id} player={p} session={session} isCurrentUser={Number(p.account_id) === myAccountId}
                        canDraft={canDraft} onDraftPick={draftPick} />
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div style={{ marginTop: 20 }}>
              <h3>Registered Players ({players.length})</h3>
              {players.sort((a,b)=>Number(b.trueskill_mmr)-Number(a.trueskill_mmr)).map(p => (
                <PlayerRow key={p.account_id} player={p} session={session} isCurrentUser={Number(p.account_id) === myAccountId} />
              ))}
              {players.length === 0 && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No players yet — sign in to be the first.</div>}
            </div>
          )}
        </div>
      )}

      {pastSessions.length > 0 && (
        <div>
          <h3>Recent Sessions</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Match</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {pastSessions.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
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
