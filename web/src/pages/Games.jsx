import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getGamesHub } from '../api';
import './games.css';

// Task #451 — Daily Dota mini-games hub. Lists every game with its blurb,
// the player's current streak + win record, and a play CTA. Daily puzzles
// refresh at Sydney midnight; the hub surfaces the active AEST date.

// A small accessible audio-preview button for the Voiceline card. Plays a
// generic announcer clip (never a daily answer) so the audio feature is
// discoverable from the hub.
function VoicelinePreview() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) { el.currentTime = 0; const p = el.play(); if (p && p.catch) p.catch(() => {}); }
    else { el.pause(); }
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause the voice-line preview' : 'Play a voice-line preview'}
        className="btn"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <span aria-hidden="true">{playing ? '⏸' : '🔊'}</span> {playing ? 'Pause' : 'Preview'}
      </button>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src="/games/voiceline-demo.mp3"
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </>
  );
}

function StreakPill({ streak }) {
  if (!streak || !streak.current) {
    return <span className="game-card__nostreak">No streak yet</span>;
  }
  return (
    <span className="game-card__streak">
      🔥 {streak.current}-day streak
      {streak.best > streak.current ? <span className="muted"> · best {streak.best}</span> : null}
    </span>
  );
}

function GameCard({ game }) {
  const unavailable = !game.available;
  return (
    <div className={`game-card${unavailable ? ' game-card--soon' : ''}`}>
      <div className="game-card__head">
        <span className="game-card__icon" aria-hidden="true">{game.emoji}</span>
        <div>
          <h2 className="game-card__title">{game.title}</h2>
          {unavailable
            ? <span className="game-card__nostreak">Coming soon</span>
            : <StreakPill streak={game.streak} />}
        </div>
      </div>
      <p className="game-card__blurb">{game.blurb}</p>
      {!unavailable && game.dailyPlayed > 0 && (
        <div className="game-card__stats">
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
        <div className="game-card__cta">
          <Link to={`/games/${game.key}`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Play
          </Link>
          {game.key === 'voiceline' && <VoicelinePreview />}
        </div>
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
      <div className="container games-root" style={{ padding: '24px 0' }}>
        <h1>Daily Mini-Games</h1>
        <p style={{ color: 'var(--text-muted)' }}>Couldn’t load the games hub: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container games-root" style={{ padding: '24px 0' }}>
        <h1>Daily Mini-Games</h1>
        <p className="loading">Loading…</p>
      </div>
    );
  }

  const todayLabel = new Date(`${data.date}T00:00:00`).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="container games-root" style={{ padding: '24px 0' }}>
      <header className="games-hero">
        <p className="games-hero__eyebrow">OCE Inhouse · Daily puzzles</p>
        <h1>Daily Mini-Games</h1>
        <p>
          A fresh Dota puzzle in every game, every day — the same for everyone, resetting at
          midnight AEST. Today is <strong>{todayLabel}</strong>.
        </p>
        {!data.signedIn && (
          <p className="signin-nudge">
            Sign in with Steam to save your streaks and appear on the leaderboards.
          </p>
        )}
      </header>
      <div className="games-grid">
        {data.games.map(g => <GameCard key={g.key} game={g} />)}
      </div>
    </div>
  );
}
