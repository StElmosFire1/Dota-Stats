import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getGamesHub } from '../api';

// Task #451 — Daily mini-games summary tile for the player profile. Shows the
// viewer's own streaks + solved counts and links into the hub. Renders nothing
// if the player hasn't played any game (keeps the profile uncluttered).
export default function GamesProfileWidget() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    getGamesHub()
      .then(d => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data || !data.signedIn) return null;
  const active = data.games.filter(g => g.available);
  const played = active.filter(g => g.dailyPlayed > 0);
  if (!played.length) return null;

  return (
    <div className="card" style={{ padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-condensed)' }}>🎮 Daily Mini-Games</h3>
        <Link to="/games" style={{ fontSize: 13 }}>Play →</Link>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 6 }}>
        {played.map(g => (
          <li key={g.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span>
              <span aria-hidden="true">{g.emoji}</span> {g.title}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {g.streak && g.streak.current ? (
                <span style={{ color: 'var(--amber)', fontWeight: 600 }}>🔥 {g.streak.current}</span>
              ) : null}
              <span style={{ marginLeft: 8 }}>{g.dailyWon}/{g.dailyPlayed}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
