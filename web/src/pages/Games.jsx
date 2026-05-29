import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getGamesHub } from '../api';

// Task #451 — Daily Dota mini-games hub. Lists every game with its blurb,
// the player's current streak + win record, and a play CTA. Daily puzzles
// refresh at Sydney midnight; the hub surfaces the active AEST date.

function StreakPill({ streak }) {
  if (!streak || !streak.current) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No streak</span>;
  }
  return (
    <span style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 600 }}>
      🔥 {streak.current}-day streak
      {streak.best > streak.current ? (
        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · best {streak.best}</span>
      ) : null}
    </span>
  );
}

function GameCard({ game }) {
  const unavailable = !game.available;
  return (
    <div
      className="card"
      style={{
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: unavailable ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 32 }} aria-hidden="true">{game.emoji}</span>
        <div>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-condensed)' }}>{game.title}</h3>
          {unavailable ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Coming soon</span>
          ) : (
            <StreakPill streak={game.streak} />
          )}
        </div>
      </div>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14, flex: 1 }}>{game.blurb}</p>
      {!unavailable && (game.dailyPlayed > 0) && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Solved {game.dailyWon}/{game.dailyPlayed}
          {game.avgGuesses != null ? ` · avg ${game.avgGuesses} guesses` : ''}
        </div>
      )}
      {unavailable ? (
        <button
          type="button"
          className="btn"
          disabled
          aria-label={`${game.title} is coming soon`}
          style={{ alignSelf: 'flex-start', cursor: 'not-allowed' }}
        >
          Coming soon
        </button>
      ) : (
        <Link
          to={`/games/${game.key}`}
          className="btn btn-primary"
          style={{ alignSelf: 'flex-start', textDecoration: 'none' }}
        >
          Play
        </Link>
      )}
    </div>
  );
}

export default function Games() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    getGamesHub()
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setError(e.message || 'Failed to load games'); });
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <div className="container" style={{ padding: '24px 0' }}>
        <h1>Daily Mini-Games</h1>
        <p style={{ color: 'var(--text-muted)' }}>Couldn’t load the games hub: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container" style={{ padding: '24px 0' }}>
        <h1>Daily Mini-Games</h1>
        <p className="loading">Loading…</p>
      </div>
    );
  }

  const todayLabel = new Date(`${data.date}T00:00:00`).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="container" style={{ padding: '24px 0' }}>
      <header style={{ marginBottom: 8 }}>
        <h1 style={{ marginBottom: 4 }}>Daily Mini-Games</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          A fresh Dota puzzle in each game every day — same for everyone, resets at midnight AEST.
          Today is <strong>{todayLabel}</strong>.
        </p>
        {!data.signedIn && (
          <p style={{ color: 'var(--amber)', fontSize: 13, marginTop: 8 }}>
            Sign in with Steam to save your streaks and appear on the leaderboards.
          </p>
        )}
      </header>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          marginTop: 20,
        }}
      >
        {data.games.map(g => <GameCard key={g.key} game={g} />)}
      </div>
    </div>
  );
}
