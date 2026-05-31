import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getHeroStats, getHeroPlayers, getHeroMatchups, getHeroRecentMatches } from '../api';
import { getHeroName, getHeroImageUrl } from '../heroNames';
import { formatHeroName } from '../utils/heroes';
import { useSeason } from '../context/SeasonContext';
import PaywallCard from '../components/PaywallCard';

// Task #589 — per-hero detail route (/heroes/:heroId). Gives the global
// command palette a real "jump to hero" target instead of bouncing every
// hero result to the shared /heroes list. Public, no paywall — same trust
// as the Hero Stats tab it summarises.
export default function HeroDetail() {
  const { heroId: rawId } = useParams();
  const heroId = parseInt(rawId, 10);
  const { seasonId } = useSeason();

  const [stats, setStats] = useState(null);
  const [totalMatches, setTotalMatches] = useState(0);
  const [draftMatches, setDraftMatches] = useState(0);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [recentMatches, setRecentMatches] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [matchups, setMatchups] = useState([]);
  const [matchupsLoading, setMatchupsLoading] = useState(true);
  const [matchupsPaywall, setMatchupsPaywall] = useState(null);

  const heroName = getHeroName(heroId);
  const heroImg = getHeroImageUrl(heroId);
  const validHero = Number.isFinite(heroId) && heroName && !heroName.startsWith('Hero #');

  useEffect(() => {
    if (!validHero) {
      setLoading(false); setPlayersLoading(false);
      setRecentLoading(false); setMatchupsLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPlayersLoading(true);
    setRecentLoading(true);
    setMatchupsLoading(true);
    setMatchupsPaywall(null);
    getHeroStats(seasonId)
      .then(data => {
        if (cancelled) return;
        const row = (data.heroes || []).find(h => parseInt(h.hero_id) === heroId) || null;
        setStats(row);
        setTotalMatches(data.totalMatches || 0);
        setDraftMatches(data.draftMatches || 0);
      })
      .catch(() => { if (!cancelled) setStats(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    getHeroPlayers(heroId, seasonId)
      .then(data => { if (!cancelled) setPlayers(data.players || []); })
      .catch(() => { if (!cancelled) setPlayers([]); })
      .finally(() => { if (!cancelled) setPlayersLoading(false); });
    getHeroRecentMatches(heroId, seasonId, 10)
      .then(data => { if (!cancelled) setRecentMatches(data.matches || []); })
      .catch(() => { if (!cancelled) setRecentMatches([]); })
      .finally(() => { if (!cancelled) setRecentLoading(false); });
    getHeroMatchups(heroId, seasonId)
      .then(data => { if (!cancelled) setMatchups(data.matchups || []); })
      .catch(err => {
        if (cancelled) return;
        setMatchups([]);
        if (err.paywall) setMatchupsPaywall(err);
      })
      .finally(() => { if (!cancelled) setMatchupsLoading(false); });
    return () => { cancelled = true; };
  }, [heroId, seasonId, validHero]);

  if (!validHero) {
    return (
      <div>
        <h1 className="page-title">Hero not found</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          We don't have a hero with that id. <Link to="/heroes" style={{ color: '#60a5fa' }}>Back to all heroes</Link>.
        </p>
      </div>
    );
  }

  const games = stats ? parseInt(stats.games) || 0 : 0;
  const wins = stats ? parseInt(stats.wins) || 0 : 0;
  const bans = stats ? parseInt(stats.bans) || 0 : 0;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : null;
  const pickRate = totalMatches > 0 ? Math.round((games / totalMatches) * 100) : null;
  const banRate = draftMatches > 0 ? Math.round((bans / draftMatches) * 100) : null;

  const statCards = [
    { label: 'Picks', value: games ? games.toLocaleString() : '—' },
    { label: 'Win rate', value: winRate != null ? `${winRate}%` : '—', color: winRate != null ? (winRate >= 50 ? '#4ade80' : '#f87171') : undefined },
    { label: 'Pick rate', value: pickRate != null && games > 0 ? `${pickRate}%` : '—' },
    { label: 'Bans', value: draftMatches > 0 ? (bans ? bans.toLocaleString() : '0') : '—' },
    { label: 'Ban rate', value: banRate != null && draftMatches > 0 ? `${banRate}%` : '—' },
  ];

  const avg = (v) => (v != null && v !== '' ? parseFloat(v).toFixed(1) : '—');

  const fmtDuration = (secs) => {
    const s = parseInt(secs);
    if (!Number.isFinite(s) || s <= 0) return '—';
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };
  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Best/worst opponents: only consider matchups with >= 2 games so a single
  // lucky/unlucky game doesn't dominate. Sorted by win rate.
  const rankedMatchups = matchups
    .map(m => {
      const g = parseInt(m.matchups) || 0;
      const w = parseInt(m.wins) || 0;
      return { ...m, g, w, wr: g > 0 ? w / g : 0 };
    })
    .filter(m => m.g >= 2);
  const bestOpponents = [...rankedMatchups].sort((a, b) => b.wr - a.wr || b.g - a.g).slice(0, 5);
  const worstOpponents = [...rankedMatchups].sort((a, b) => a.wr - b.wr || b.g - a.g).slice(0, 5);

  return (
    <div>
      <p style={{ marginBottom: 12 }}>
        <Link to="/heroes" style={{ color: '#60a5fa', textDecoration: 'none', fontSize: 13 }}>← All heroes</Link>
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 96, height: 54, borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.4)', flexShrink: 0 }}>
          {heroImg
            ? <img src={heroImg} alt={heroName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
            : null}
        </div>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{formatHeroName(heroName)}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0' }}>
            Inhouse performance across {games > 0 ? `${games} pick${games === 1 ? '' : 's'}` : 'all recorded matches'}.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading hero stats…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
            {statCards.map(c => (
              <div key={c.label} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '14px 18px', minWidth: 110,
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{c.label}</div>
                <div className="pb-num" style={{ fontSize: 22, fontWeight: 700, color: c.color || 'var(--text-primary)' }}>{c.value}</div>
              </div>
            ))}
          </div>

          {games > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, marginBottom: 10 }}>Averages</h2>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { label: 'Kills', value: avg(stats?.avg_kills) },
                  { label: 'Deaths', value: avg(stats?.avg_deaths) },
                  { label: 'Assists', value: avg(stats?.avg_assists) },
                  { label: 'GPM', value: stats?.avg_gpm != null ? parseInt(stats.avg_gpm).toLocaleString() : '—' },
                  { label: 'Hero dmg', value: stats?.avg_hero_damage != null ? parseInt(stats.avg_hero_damage).toLocaleString() : '—' },
                ].map(c => (
                  <div key={c.label} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
                    padding: '12px 16px', minWidth: 96,
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{c.label}</div>
                    <div className="pb-num" style={{ fontSize: 18, fontWeight: 600 }}>{c.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Who's played {formatHeroName(heroName)}</h2>
          {playersLoading ? (
            <div className="loading">Loading players…</div>
          ) : players.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No player data for this hero yet.</p>
          ) : (
            <div className="scoreboard-wrapper">
              <table className="scoreboard">
                <thead>
                  <tr>
                    <th className="col-player">Player</th>
                    <th className="col-stat">Games</th>
                    <th className="col-stat">Wins</th>
                    <th className="col-stat">Win%</th>
                    <th className="col-stat">K / D / A</th>
                    <th className="col-stat">GPM</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(p => {
                    const pName = p.nickname || p.persona_name || p.player_key;
                    const pGames = parseInt(p.games) || 0;
                    const wr = pGames > 0 ? Math.round((parseInt(p.wins) || 0) / pGames * 100) : 0;
                    const link = p.account_id > 0 ? `/player/${p.account_id}` : null;
                    return (
                      <tr key={p.player_key}>
                        <td className="col-player">
                          {link
                            ? <Link to={link} style={{ color: '#60a5fa', textDecoration: 'none' }}>{pName}</Link>
                            : <span>{pName}</span>}
                        </td>
                        <td className="col-stat">{p.games}</td>
                        <td className="col-stat" style={{ color: '#4ade80' }}>{p.wins}</td>
                        <td className="col-stat" style={{ color: wr >= 50 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{wr}%</td>
                        <td className="col-stat">
                          {avg(p.avg_kills)} / {avg(p.avg_deaths)} / {avg(p.avg_assists)}
                        </td>
                        <td className="col-stat gpm">{p.avg_gpm != null ? parseInt(p.avg_gpm).toLocaleString() : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h2 style={{ fontSize: 16, margin: '28px 0 10px' }}>Recent matches</h2>
          {recentLoading ? (
            <div className="loading">Loading recent matches…</div>
          ) : recentMatches.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No recorded matches with this hero yet.</p>
          ) : (
            <div className="scoreboard-wrapper">
              <table className="scoreboard">
                <thead>
                  <tr>
                    <th className="col-stat">Result</th>
                    <th className="col-player">Player</th>
                    <th className="col-stat">K / D / A</th>
                    <th className="col-stat">Duration</th>
                    <th className="col-player">Lobby</th>
                    <th className="col-stat">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMatches.map(m => {
                    const pName = m.nickname || m.persona_name || (m.account_id > 0 ? String(m.account_id) : 'Unknown');
                    const won = m.hero_won === true || m.hero_won === 't';
                    const pLink = m.account_id > 0 ? `/player/${m.account_id}` : null;
                    return (
                      <tr key={m.match_id}>
                        <td className="col-stat" style={{ color: won ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                          {won ? 'Win' : 'Loss'}
                        </td>
                        <td className="col-player">
                          {pLink
                            ? <Link to={pLink} style={{ color: '#60a5fa', textDecoration: 'none' }}>{pName}</Link>
                            : <span>{pName}</span>}
                        </td>
                        <td className="col-stat">{m.kills ?? '—'} / {m.deaths ?? '—'} / {m.assists ?? '—'}</td>
                        <td className="col-stat">{fmtDuration(m.duration)}</td>
                        <td className="col-player" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {m.lobby_name || '—'}
                          {fmtDate(m.date) ? <span style={{ marginLeft: 6 }}>· {fmtDate(m.date)}</span> : null}
                        </td>
                        <td className="col-stat">
                          <Link to={`/match/${m.match_id}`} style={{ color: '#60a5fa', textDecoration: 'none' }}>View →</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h2 style={{ fontSize: 16, margin: '28px 0 10px' }}>Matchups</h2>
          {matchupsLoading ? (
            <div className="loading">Loading matchups…</div>
          ) : matchupsPaywall ? (
            <PaywallCard feature={matchupsPaywall.feature || 'hero_matchups'} signedIn={matchupsPaywall.signedIn} compact />
          ) : rankedMatchups.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Not enough matchup data yet — needs at least two games against an opponent.</p>
          ) : (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <MatchupColumn title="Best against" rows={bestOpponents} good />
              <MatchupColumn title="Worst against" rows={worstOpponents} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MatchupColumn({ title, rows, good = false }) {
  return (
    <div style={{ flex: '1 1 280px', minWidth: 260 }}>
      <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>{title}</h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-player">Opponent</th>
              <th className="col-stat">Games</th>
              <th className="col-stat">Win %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const pct = Math.round(r.wr * 100);
              return (
                <tr key={r.opp_hero_id}>
                  <td className="col-player">{formatHeroName(r.opp_hero_name)}</td>
                  <td className="col-stat">{r.g}</td>
                  <td className="col-stat" style={{ color: r.wr >= 0.5 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
