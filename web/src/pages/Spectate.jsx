import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getHeroName, getHeroImageUrl } from '../heroNames';

// Task #315 — Public live spectator for in-progress inhouse matches.
// Consumes the /api/spectate/:matchId SSE endpoint:
//   • `snapshot` events every ~3s carrying current lobby + GC draft state
//     and (when STEAM_API_KEY is configured) a slimmed realtime-stats payload
//     with live scoreboard, kill counts, and per-team net worth.
//   • `end` when the lobby is no longer active.

function formatGameTime(s) {
  s = Math.max(0, Math.round(s || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function Spectate() {
  const { matchId } = useParams();
  const [snapshot, setSnapshot] = useState(null);
  const [history, setHistory] = useState([]); // last few snapshots for kill-feed diffing
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState(null);
  const esRef = useRef(null);

  useEffect(() => {
    let alive = true;
    let es;
    try {
      es = new EventSource(`/api/spectate/${encodeURIComponent(String(matchId))}`, { withCredentials: true });
      esRef.current = es;
    } catch (err) {
      setError(err.message || 'Failed to open live stream');
      return;
    }
    es.addEventListener('snapshot', (e) => {
      if (!alive) return;
      try {
        const snap = JSON.parse(e.data);
        setSnapshot(snap);
        setHistory((prev) => [...prev.slice(-9), snap]);
      } catch (_) {}
    });
    es.addEventListener('end', () => {
      if (!alive) return;
      setEnded(true);
      es.close();
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED && !snapshot) {
        setError('Live stream unavailable');
      }
    };
    return () => {
      alive = false;
      try { es.close(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const lobby = snapshot?.lobby || null;
  const realtime = snapshot?.realtime || null;

  // Build a synthetic kill feed by diffing kill counts between snapshots.
  // The realtime endpoint doesn't expose individual kill events, so we use
  // per-player kill_count jumps to build "X scored a kill" lines.
  const killFeed = useMemo(() => {
    const feed = [];
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1]?.realtime;
      const cur = history[i]?.realtime;
      if (!prev || !cur) continue;
      for (const team of (cur.teams || [])) {
        const prevTeam = (prev.teams || []).find((t) => t.teamNumber === team.teamNumber);
        if (!prevTeam) continue;
        for (const pl of (team.players || [])) {
          const prevPl = (prevTeam.players || []).find((pp) => pp.accountId === pl.accountId);
          if (!prevPl) continue;
          const newKills = (pl.kills || 0) - (prevPl.kills || 0);
          if (newKills > 0) {
            feed.push({
              ts: history[i].ts,
              team: team.teamNumber,
              name: pl.name || `Hero ${pl.heroId}`,
              heroId: pl.heroId,
              count: newKills,
            });
          }
        }
      }
    }
    return feed.slice(-8).reverse();
  }, [history]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Live Spectator · Match {matchId}</h2>
        <Link to="/inhouse" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← inhouse</Link>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: lobby ? '#22c55e' : '#64748b',
            boxShadow: lobby ? '0 0 8px rgba(34,197,94,0.7)' : 'none',
          }} />
          {lobby ? `LIVE${realtime ? ` · ${formatGameTime(realtime.matchTime)}` : ''}` : (ended ? 'Ended' : 'Connecting…')}
        </span>
      </div>

      {error && (
        <div style={{ padding: 12, border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#fecaca' }}>
          {error}
        </div>
      )}
      {ended && !error && (
        <div style={{ padding: 12, border: '1px solid var(--border, #334155)', borderRadius: 8 }}>
          This match is no longer in progress. <Link to={`/match/${matchId}`}>View match scoreboard →</Link>
        </div>
      )}

      {lobby && (
        <>
          {realtime ? (
            <LiveScoreboard realtime={realtime} />
          ) : (
            <LobbySeats lobby={lobby} />
          )}
          <DraftPanel picksBans={lobby.picksBans || []} />
          {realtime && <KillFeed feed={killFeed} />}
        </>
      )}

      {lobby && (
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
          State: {lobby.state || 'unknown'}
          {!realtime && ' · live scoreboard requires the bot host to have STEAM_API_KEY set'}
          {' · Last update: '}{snapshot?.ts ? new Date(snapshot.ts).toLocaleTimeString() : '—'}
        </div>
      )}
      <p style={{ marginTop: 18, fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
        Lobby seats + draft from the in-bot game-coordinator session, refreshing every 3 s.
        Live scoreboard / net worth from the Steam realtime stats API, refreshed every 10 s.
      </p>
    </div>
  );
}

function NetWorthLead({ rad, dire }) {
  const lead = (rad || 0) - (dire || 0);
  const cap = 25000;
  const pct = Math.max(-1, Math.min(1, lead / cap));
  const color = lead >= 0 ? '#22c55e' : '#ef4444';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted, #64748b)' }}>
        <span>Dire {Math.round((dire || 0) / 100) / 10}k</span>
        <span>Net worth lead: <strong style={{ color }}>{lead >= 0 ? '+' : ''}{Math.round(lead / 100) / 10}k</strong></span>
        <span>Radiant {Math.round((rad || 0) / 100) / 10}k</span>
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

function LiveScoreboard({ realtime }) {
  const radiant = (realtime.teams || []).find((t) => t.teamNumber === 2) || { players: [] };
  const dire    = (realtime.teams || []).find((t) => t.teamNumber === 3) || { players: [] };
  return (
    <>
      <NetWorthLead rad={radiant.netWorth} dire={dire.netWorth} />
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: 10, border: '1px solid var(--border, #334155)', borderRadius: 8, marginBottom: 10,
        background: 'rgba(13,20,36,0.6)',
      }}>
        <strong style={{ color: '#22c55e', fontSize: 22 }}>{radiant.score || 0}</strong>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>SCORE</span>
        <strong style={{ color: '#ef4444', fontSize: 22 }}>{dire.score || 0}</strong>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <TeamScoreboard label="Radiant" color="#22c55e" team={radiant} />
        <TeamScoreboard label="Dire"    color="#ef4444" team={dire} />
      </div>
    </>
  );
}

function TeamScoreboard({ label, color, team }) {
  return (
    <div style={{ border: '1px solid var(--border, #334155)', borderRadius: 8, padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <strong style={{ color }}>{label}</strong>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Math.round((team.netWorth || 0) / 100) / 10}k NW</span>
      </div>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            <th style={{ textAlign: 'left', padding: '2px 4px' }}>Hero</th>
            <th style={{ padding: '2px 4px' }}>Lv</th>
            <th style={{ padding: '2px 4px' }}>K/D/A</th>
            <th style={{ padding: '2px 4px', textAlign: 'right' }}>NW</th>
          </tr>
        </thead>
        <tbody>
          {(team.players || []).map((p) => (
            <tr key={p.accountId || p.heroId} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <img
                  src={getHeroImageUrl ? getHeroImageUrl(p.heroId) : ''}
                  alt={getHeroName ? getHeroName(p.heroId) : `Hero ${p.heroId}`}
                  style={{ width: 26, height: 14, objectFit: 'cover', borderRadius: 2 }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                  {p.name || (getHeroName ? getHeroName(p.heroId) : `Hero ${p.heroId}`)}
                </span>
              </td>
              <td style={{ padding: '2px 4px', textAlign: 'center' }}>{p.level || 0}</td>
              <td style={{ padding: '2px 4px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: '#fbbf24' }}>{p.kills}</span>/<span style={{ color: '#ef4444' }}>{p.deaths}</span>/<span style={{ color: '#94a3b8' }}>{p.assists}</span>
              </td>
              <td style={{ padding: '2px 4px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round((p.networth || 0) / 100) / 10}k
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LobbySeats({ lobby }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
      {[0, 1].map((team) => {
        const players = (lobby.players || []).filter((p) => p.team === team);
        return (
          <div key={team} style={{
            border: '1px solid var(--border, #334155)', borderRadius: 8, padding: 12,
            background: team === 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          }}>
            <h3 style={{ margin: '0 0 8px', color: team === 0 ? '#22c55e' : '#ef4444' }}>
              {team === 0 ? 'Radiant' : 'Dire'} ({players.length}/5)
            </h3>
            {players.length === 0 && (
              <div style={{ color: 'var(--text-muted, #64748b)', fontSize: 13 }}>No players seated yet.</div>
            )}
            {players.map((p) => (
              <div key={p.steamId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                <span style={{ flex: 1, fontWeight: 600 }}>{p.name || `Steam ${String(p.steamId).slice(-5)}`}</span>
                {p.heroId
                  ? <span style={{ color: 'var(--amber, #f59e0b)' }}>{getHeroName ? getHeroName(p.heroId) : `Hero #${p.heroId}`}</span>
                  : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>picking…</span>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DraftPanel({ picksBans }) {
  if (!picksBans || picksBans.length === 0) return null;
  const byTeam = (team) => picksBans.filter((pb) => pb.team === team);
  const TeamCol = ({ team, label, color }) => {
    const list = byTeam(team);
    const picks = list.filter((p) => p.isPick);
    const bans = list.filter((p) => !p.isPick);
    return (
      <div style={{ border: '1px solid var(--border, #334155)', borderRadius: 8, padding: 8 }}>
        <strong style={{ color }}>{label} draft</strong>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Picks ({picks.length})</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {picks.map((p) => (
            <img
              key={p.order} src={getHeroImageUrl ? getHeroImageUrl(p.heroId) : ''}
              alt={getHeroName ? getHeroName(p.heroId) : `Hero ${p.heroId}`}
              title={`${getHeroName ? getHeroName(p.heroId) : 'Hero'} · pick #${p.order}`}
              style={{ width: 40, height: 24, objectFit: 'cover', borderRadius: 3 }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Bans ({bans.length})</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {bans.map((p) => (
            <img
              key={p.order} src={getHeroImageUrl ? getHeroImageUrl(p.heroId) : ''}
              alt={`Banned: ${getHeroName ? getHeroName(p.heroId) : `Hero ${p.heroId}`}`}
              title={`Ban #${p.order}`}
              style={{ width: 40, height: 24, objectFit: 'cover', borderRadius: 3, filter: 'grayscale(1) brightness(0.6)' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ))}
        </div>
      </div>
    );
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
      <TeamCol team={0} label="Radiant" color="#22c55e" />
      <TeamCol team={1} label="Dire"    color="#ef4444" />
    </div>
  );
}

function KillFeed({ feed }) {
  return (
    <div style={{ marginTop: 12, border: '1px solid var(--border, #334155)', borderRadius: 8, padding: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Kill feed</div>
      {feed.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No kills since the stream opened.</div>
      ) : (
        feed.map((ev, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
            <span>
              <span style={{ color: ev.team === 2 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                {ev.name}
              </span> scored {ev.count > 1 ? `${ev.count} kills` : 'a kill'}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{new Date(ev.ts).toLocaleTimeString()}</span>
          </div>
        ))
      )}
    </div>
  );
}
