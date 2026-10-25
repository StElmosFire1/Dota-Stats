import React, { useEffect, useState } from 'react';
import { getHeroImageUrl, getHeroName } from '../heroNames';
import { loadLobbyPlayerScouting } from '../lib/lobbyPlayerScouting';

const ROLES = { 1: 'Carry', 2: 'Mid', 3: 'Offlane', 4: 'Soft support', 5: 'Hard support' };
export function roleLabel(position) { return ROLES[Number(position)] || 'Unknown role'; }

function Hero({ id }) {
  return <span className="lobby-scout-hero"><img src={getHeroImageUrl(id)} alt="" loading="lazy" />{getHeroName(id)}</span>;
}

export default function LobbyPlayerScouting({ accountId }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    const timer = setTimeout(() => {
      loadLobbyPlayerScouting(accountId).then(data => { if (alive) setState({ data }); })
        .catch(error => { if (alive) setState({ error: error.message }); });
    }, 150);
    return () => { alive = false; clearTimeout(timer); };
  }, [accountId]);
  if (state.loading) return <p role="status">Loading player scouting…</p>;
  if (state.error) return <p role="status">{state.error}</p>;
  const d = state.data;
  return <div className="lobby-player-scouting">
    {d.customTitle && <p className="lobby-scout-title">{d.customTitle}</p>}
    <section><h4>Best heroes <small>3+ games · ranked by win rate</small></h4>
      {d.bestHeroes.length ? d.bestHeroes.map(h => <div className="lobby-scout-line" key={h.hero_id}>
        <Hero id={h.hero_id} /><span>{h.winRate}% · {h.games} games</span>
      </div>) : <p>No heroes with three recorded games yet.</p>}
    </section>
    <section><h4>Preferred / comfort heroes <small>most played, not a declared preference</small></h4>
      {d.comfortHeroes.length ? d.comfortHeroes.map(h => <div className="lobby-scout-line" key={h.hero_id}>
        <Hero id={h.hero_id} /><span>{h.games} games · {h.winRate}% wins</span>
      </div>) : <p>No hero history recorded.</p>}
      {d.preferredHero && <p className="lobby-scout-featured">Profile pick: <Hero id={d.preferredHero} />{d.preferredHeroCaption && <span> — {d.preferredHeroCaption}</span>}</p>}
    </section>
    <section><h4>Recently played roles <small>last {d.recentSample} recorded matches</small></h4>
      <p>{d.recentRoles.length ? d.recentRoles.map(r => `${roleLabel(r.position)} (${r.games})`).join(' · ') : 'No recent role data.'}</p>
    </section>
    <section><h4>Recent performances <small>latest five</small></h4>
      {d.recentMatches.length ? d.recentMatches.map(m => <div className="lobby-scout-match" key={m.match_id}>
        <Hero id={m.hero_id} /><span className={m.won == null ? '' : m.won ? 'is-win' : 'is-loss'}>{m.won == null ? '—' : m.won ? 'W' : 'L'}</span>
        <span>{m.kills ?? '—'}/{m.deaths ?? '—'}/{m.assists ?? '—'}</span>
        <small>{roleLabel(m.position)}{m.gpm != null ? ` · ${Math.round(m.gpm)} GPM` : ''}</small>
      </div>) : <p>No recent matches recorded.</p>}
    </section>
  </div>;
}
