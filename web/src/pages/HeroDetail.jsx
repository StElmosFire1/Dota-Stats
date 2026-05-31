import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getHeroStats, getHeroPlayers } from '../api';
import { getHeroName, getHeroImageUrl } from '../heroNames';
import { formatHeroName } from '../utils/heroes';
import { useSeason } from '../context/SeasonContext';

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

  const heroName = getHeroName(heroId);
  const heroImg = getHeroImageUrl(heroId);
  const validHero = Number.isFinite(heroId) && heroName && !heroName.startsWith('Hero #');

  useEffect(() => {
    if (!validHero) { setLoading(false); setPlayersLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setPlayersLoading(true);
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
        </>
      )}
    </div>
  );
}
