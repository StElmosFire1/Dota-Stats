import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getGameDaily, getGameEndless, getGameLeaderboard, submitGameGuess, gameImageUrl, gameAudioUrl,
} from '../api';
import { getHeroImageUrl, getItemImageUrl } from '../heroNames';
import './games.css';

// Task #451 — Daily Dota mini-games play surface. One component drives all
// games; the clue renderer switches on the puzzle's clue shape. The backend
// keeps the answer secret until the player finishes, so this component only
// ever knows the choices list + a leak-free clue.
//
// Heroguessr is the exception: it's a Dotadle-style attribute game. There is no
// upfront clue — each guess returns a `compare` row (server-computed) telling
// the player how their pick stacks up against the mystery hero.

const TITLES = {
  heroguessr: 'Heroguessr',
  'item-zoom': 'Item-zoom',
  statline: 'Statline',
  talent: 'Talent guesser',
  voiceline: 'Voiceline daily',
  'mystery-player': 'Mystery Player',
};

// Games whose guesses/answers are heroes (so we can show hero portraits).
const HERO_GAMES = new Set(['heroguessr', 'statline', 'talent', 'voiceline']);

function fmtDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Dotadle comparison grid (Heroguessr) ────────────────────────────────────
const DL_COLS = ['Attribute', 'Attack', 'Roles', 'Legs', 'Move spd', 'Atk range'];

function tileClass(f) {
  if (f.verdict === 'match') return 'dl-tile dl-tile--match';
  if (f.verdict === 'partial' || f.close) return 'dl-tile dl-tile--warm';
  return 'dl-tile';
}

function fieldAria(f) {
  if (f.kind === 'num') {
    if (f.verdict === 'match') return `${f.label}: ${f.value}, exact match`;
    const dir = f.verdict === 'higher' ? 'the answer is higher' : 'the answer is lower';
    return `${f.label}: ${f.value}, ${dir}${f.close ? ', close' : ''}`;
  }
  if (f.kind === 'roles') {
    const list = (f.value || []).join(', ') || 'none';
    const v = f.verdict === 'match' ? 'all roles match'
      : f.verdict === 'partial' ? 'some roles match' : 'no roles match';
    return `${f.label}: ${list}; ${v}`;
  }
  return `${f.label}: ${f.value}, ${f.verdict === 'match' ? 'match' : 'no match'}`;
}

function CompareTile({ f }) {
  return (
    <div className={tileClass(f)} role="img" aria-label={fieldAria(f)}>
      {f.kind === 'roles' ? (
        <div className="dl-chips" aria-hidden="true">
          {(f.value || []).length
            ? f.value.map((r, i) => (
                <span key={i} className={`dl-chip${(f.shared || []).includes(r) ? ' dl-chip--on' : ''}`}>{r}</span>
              ))
            : <span className="dl-chip">—</span>}
        </div>
      ) : (
        <>
          <span className="dl-tile__val" aria-hidden="true">{f.value == null ? '—' : f.value}</span>
          {f.kind === 'num' && (f.verdict === 'higher' || f.verdict === 'lower') && (
            <span className="dl-tile__arrow" aria-hidden="true">{f.verdict === 'higher' ? '▲' : '▼'}</span>
          )}
        </>
      )}
    </div>
  );
}

function HeroCompareGrid({ guessed }) {
  const rows = guessed.filter(g => g.compare).slice().reverse(); // newest first
  if (!rows.length) return null;
  return (
    <div className="dotadle__scroll">
      <div className="dotadle__grid" aria-hidden="true">
        <div className="dl-head dl-head--hero">Hero</div>
        {DL_COLS.map(c => <div key={c} className="dl-head">{c}</div>)}
      </div>
      {rows.map((g, i) => (
        <div className="dotadle__grid" key={`${g.id}-${i}`}>
          <div className="dl-hero">
            <img className="dl-hero__img" src={getHeroImageUrl(g.id, g.name)} alt="" loading="lazy" />
            <span className="dl-hero__name">{g.name}</span>
          </div>
          {(g.compare.fields || []).map(f => <CompareTile key={f.key} f={f} />)}
        </div>
      ))}
      <div className="dl-legend">
        <span><span className="dl-swatch dl-swatch--match" aria-hidden="true" /> Exact match</span>
        <span><span className="dl-swatch dl-swatch--warm" aria-hidden="true" /> Partial / close</span>
        <span><span aria-hidden="true">▲▼</span> Arrow points toward the answer</span>
      </div>
    </div>
  );
}

// ── Clue renderers (non-heroguessr games) ───────────────────────────────────
function ItemZoomClue({ clue, zoomLevel }) {
  if (!clue || !clue.imageToken) return null;
  return (
    <div
      style={{
        width: 260, height: 260, margin: '0 auto', overflow: 'hidden',
        borderRadius: 12, border: '2px solid var(--brass)', background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <img
        src={gameImageUrl(clue.imageToken)}
        alt="Zoomed-in mystery item icon"
        style={{
          width: '100%',
          transform: `scale(${zoomLevel})`,
          imageRendering: 'pixelated',
          transition: 'transform 0.3s ease',
        }}
      />
    </div>
  );
}

function TalentClue({ clue, revealCount }) {
  if (!clue || !clue.talents) return null;
  const ordered = clue.talents.slice().sort((a, b) => b.level - a.level);
  const shown = ordered.slice(0, Math.max(1, revealCount));
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 460, margin: '0 auto' }}>
      {shown.map(t => (
        <div key={t.level} className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 700 }}>Level {t.level}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {t.options.map((o, i) => (
              <span
                key={i}
                style={{
                  fontSize: 14, padding: '4px 8px', borderRadius: 6,
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                }}
              >
                {o}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatlineClue({ clue }) {
  if (!clue || !clue.statline) return null;
  const s = clue.statline;
  const rows = [
    ['K / D / A', `${s.kills} / ${s.deaths} / ${s.assists}`],
    ['Net worth', s.netWorth ? s.netWorth.toLocaleString() : '—'],
    ['GPM / XPM', `${s.gpm} / ${s.xpm}`],
    ['Last hits / denies', `${s.lastHits} / ${s.denies}`],
    ['Level', s.level || '—'],
    ['Hero damage', s.heroDamage ? s.heroDamage.toLocaleString() : '—'],
    ['Tower damage', s.towerDamage ? s.towerDamage.toLocaleString() : '—'],
    ['Hero healing', s.heroHealing ? s.heroHealing.toLocaleString() : '—'],
    ['Duration', fmtDuration(s.durationSec)],
    ['Result', s.win ? 'Victory' : 'Defeat'],
  ];
  return (
    <div className="card" style={{ padding: 16, maxWidth: 420, margin: '0 auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{k}</td>
              <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 600 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Mystery Player — the inverse of Statline. Hero, item build and the whole
// scoreboard line are revealed; the player guesses *who* it was.
function PlayerLineClue({ clue }) {
  if (!clue || !clue.playerLine) return null;
  const s = clue.playerLine;
  const rows = [
    ['K / D / A', `${s.kills} / ${s.deaths} / ${s.assists}`],
    ['Net worth', s.netWorth ? s.netWorth.toLocaleString() : '—'],
    ['GPM / XPM', `${s.gpm} / ${s.xpm}`],
    ['Last hits / denies', `${s.lastHits} / ${s.denies}`],
    ['Level', s.level || '—'],
    ['Hero damage', s.heroDamage ? s.heroDamage.toLocaleString() : '—'],
    ['Tower damage', s.towerDamage ? s.towerDamage.toLocaleString() : '—'],
    ['Hero healing', s.heroHealing ? s.heroHealing.toLocaleString() : '—'],
  ];
  const items = Array.isArray(s.items) ? s.items : [];
  return (
    <div className="card" style={{ padding: 16, maxWidth: 440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <img
          src={getHeroImageUrl(s.heroId, s.heroName)}
          alt=""
          style={{ width: 72, height: 40, objectFit: 'cover', borderRadius: 4 }}
          loading="lazy"
        />
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{s.heroName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {s.win ? 'Victory' : 'Defeat'} · {fmtDuration(s.durationSec)}
          </div>
        </div>
      </div>
      {items.length > 0 && (
        <div
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
          aria-label="Final item build"
        >
          {items.map((it, i) => {
            const label = (it.item_name || '').replace(/^item_/, '').replace(/_/g, ' ');
            const url = getItemImageUrl(it.item_name, it.item_id);
            return url ? (
              <img
                key={i}
                src={url}
                alt={label}
                title={label}
                style={{ width: 36, height: 27, borderRadius: 3, border: '1px solid var(--border)' }}
                loading="lazy"
              />
            ) : null;
          })}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '5px 0', color: 'var(--text-muted)' }}>{k}</td>
              <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 600 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VoicelineClue({ clue }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState(false);
  const src = clue && clue.audioToken ? gameAudioUrl(clue.audioToken) : null;

  useEffect(() => {
    setPlaying(false);
    setErr(false);
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.currentTime = 0; } catch (_) {}
    }
  }, [src]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.currentTime = 0;
      const p = el.play();
      if (p && p.catch) p.catch(() => setErr(true));
    } else {
      el.pause();
    }
  }, []);

  if (!src) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        Audio clip unavailable for this puzzle.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause the voice-line clip' : 'Play the voice-line clip'}
        className="btn"
        style={{
          width: 96, height: 96, borderRadius: '50%', fontSize: 36, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid var(--brass)', background: 'var(--bg-secondary)', color: 'var(--text)',
        }}
      >
        <span aria-hidden="true">{playing ? '⏸' : '▶'}</span>
      </button>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
        {err ? 'Couldn’t play the clip — try again.' : 'Tap play, then guess the hero.'}
      </p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onPlay={() => { setPlaying(true); setErr(false); }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setErr(true)}
      />
    </div>
  );
}

function ClueArea({ game, clue, guessCount }) {
  if (game === 'item-zoom') {
    const base = clue && clue.zoom ? clue.zoom : 8;
    const zoom = Math.max(1.2, base - guessCount * 1.1);
    return <ItemZoomClue clue={clue} zoomLevel={zoom} />;
  }
  if (game === 'talent') return <TalentClue clue={clue} revealCount={guessCount + 1} />;
  if (game === 'statline') return <StatlineClue clue={clue} />;
  if (game === 'mystery-player') return <PlayerLineClue clue={clue} />;
  if (game === 'voiceline') return <VoicelineClue clue={clue} />;
  return null;
}

// ── Guess input with autocomplete from the choices list ──────────────────────
function GuessInput({ choices, disabled, onGuess, guessedIds, showPortraits }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return choices
      .filter(c => c.name.toLowerCase().includes(term) && !guessedIds.includes(c.id))
      .slice(0, 8);
  }, [q, choices, guessedIds]);

  useEffect(() => { setActive(0); }, [q]);

  const choose = useCallback((c) => {
    if (!c) return;
    onGuess(c);
    setQ('');
    setOpen(false);
  }, [onGuess]);

  const onKeyDown = (e) => {
    if (!open || !matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(matches[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', maxWidth: 440, margin: '14px auto 0' }}>
      <label htmlFor="game-guess" style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
        Type your guess
      </label>
      <input
        id="game-guess"
        type="text"
        autoComplete="off"
        value={q}
        disabled={disabled}
        placeholder="Start typing a name…"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls="game-guess-list"
        aria-autocomplete="list"
        style={{
          width: '100%', padding: '11px 13px', fontSize: 15, borderRadius: 9,
          border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text)',
        }}
      />
      {open && matches.length > 0 && (
        <ul
          id="game-guess-list"
          role="listbox"
          style={{
            listStyle: 'none', margin: '4px 0 0', padding: 4, position: 'absolute', zIndex: 20,
            width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 9, maxHeight: 300, overflowY: 'auto', boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
          }}
        >
          {matches.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onClick={() => choose(c)}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '7px 10px', background: i === active ? 'var(--bg-secondary)' : 'transparent',
                  border: 'none', borderRadius: 7, color: 'var(--text)', cursor: 'pointer', fontSize: 14,
                }}
              >
                {showPortraits && (
                  <img
                    src={getHeroImageUrl(c.id, c.name)}
                    alt=""
                    style={{ width: 40, height: 23, objectFit: 'cover', borderRadius: 4, flex: '0 0 auto' }}
                  />
                )}
                <span>{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
function Leaderboard({ game, maxGuesses }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    getGameLeaderboard(game).then(d => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [game]);
  if (!data) return <p className="loading">Loading leaderboard…</p>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Today’s solvers</h3>
        {data.today && data.today.length ? (
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {data.today.map((r, i) => (
              <li key={i} style={{ padding: '3px 0' }}>
                <span>{r.name || `Player ${r.account_id}`}</span>
                <span style={{ float: 'right', color: 'var(--amber)', fontWeight: 600 }}>{r.guesses}/{maxGuesses}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No one’s solved today’s puzzle yet.</p>
        )}
      </div>
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>All-time (avg guesses)</h3>
        {data.allTime && data.allTime.length ? (
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {data.allTime.map((r, i) => (
              <li key={i} style={{ padding: '3px 0' }}>
                <span>{r.name || `Player ${r.account_id}`}</span>
                <span style={{ float: 'right', color: 'var(--text-muted)' }}>
                  {r.solved} solved · avg {r.avg_guesses}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No results yet.</p>
        )}
      </div>
    </div>
  );
}

// ── Guess-progress pips ──────────────────────────────────────────────────────
function ProgressPips({ used, max, won }) {
  return (
    <span className="gp-pips" aria-hidden="true">
      {Array.from({ length: max }).map((_, i) => {
        let cls = 'gp-pip';
        if (i < used) cls += won && i === used - 1 ? ' gp-pip--win' : ' gp-pip--used';
        return <span key={i} className={cls} />;
      })}
    </span>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function GamePlay() {
  const { game } = useParams();
  const title = TITLES[game] || 'Mini-Game';
  const isHeroguessr = game === 'heroguessr';
  const heroPortraits = HERO_GAMES.has(game);

  const [mode, setMode] = useState('daily');
  const [puzzle, setPuzzle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [guessed, setGuessed] = useState([]); // [{id, name, correct, compare?}]
  const [finished, setFinished] = useState(false);
  const [won, setWon] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [share, setShare] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadPuzzle = useCallback((m) => {
    setLoading(true);
    setError(null);
    setGuessed([]);
    setFinished(false);
    setWon(false);
    setAnswer(null);
    setShare(null);
    setCopied(false);
    const fetcher = m === 'endless' ? getGameEndless(game) : getGameDaily(game);
    fetcher
      .then(d => {
        setPuzzle(d);
        if (d.finished) {
          setFinished(true);
          setWon(d.won);
          setAnswer(d.answer);
          setShare(d.share);
        }
      })
      .catch(e => setError(e.message || 'Failed to load puzzle'))
      .finally(() => setLoading(false));
  }, [game]);

  useEffect(() => { loadPuzzle(mode); }, [mode, loadPuzzle]);

  const maxGuesses = (puzzle && puzzle.maxGuesses) || 6;
  const guessedIds = guessed.map(g => g.id);

  const handleGuess = useCallback(async (choice) => {
    if (finished || !puzzle) return;
    const nextCount = guessed.length + 1;
    try {
      const willFinish = nextCount >= maxGuesses;
      const resp = await submitGameGuess(game, {
        mode,
        guessId: choice.id,
        guesses: nextCount,
        finished: false,
        answerToken: puzzle.answerToken,
      });
      const correct = resp.correct;
      const entry = { id: choice.id, name: choice.name, correct, compare: resp.compare || null };
      const newGuessed = [...guessed, entry];
      setGuessed(newGuessed);

      const done = correct || willFinish;
      if (done) {
        const finalResp = await submitGameGuess(game, {
          mode,
          guessId: choice.id,
          guesses: newGuessed.length,
          finished: true,
          won: correct,
          answerToken: puzzle.answerToken,
        });
        setFinished(true);
        setWon(correct);
        setAnswer(finalResp.answer || null);
        setShare(finalResp.share || null);
      }
    } catch (e) {
      setError(e.message || 'Guess failed');
    }
  }, [finished, puzzle, guessed, maxGuesses, game, mode]);

  const copyShare = useCallback(() => {
    if (!share) return;
    const text = `${share}\noceinhouse.gg/games/${game}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  }, [share, game]);

  // Unavailable game (e.g. coming-soon).
  if (puzzle && puzzle.available === false) {
    return (
      <div className="container games-root" style={{ padding: '24px 0', maxWidth: 640 }}>
        <Link to="/games" className="gp-back">← All games</Link>
        <h1 className="gp-title">{puzzle.title || title}</h1>
        <div className="gp-reveal">
          <div style={{ fontSize: 48 }} aria-hidden="true">🔊</div>
          <h2>Coming soon</h2>
          <p style={{ color: 'var(--text-muted)' }}>{puzzle.blurb}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            We’re still sourcing the clips for this one. Check back later.
          </p>
        </div>
      </div>
    );
  }

  const answerImg = answer && answer.heroId ? getHeroImageUrl(answer.heroId, answer.name) : null;

  return (
    <div className="container games-root" style={{ padding: '24px 0', maxWidth: 760 }}>
      <Link to="/games" className="gp-back">← All games</Link>
      <header className="gp-head">
        <div>
          <h1 className="gp-title">
            {title}
            {puzzle && puzzle.number ? <span className="gp-num"> #{String(puzzle.number).padStart(3, '0')}</span> : null}
          </h1>
          {isHeroguessr && (
            <p className="gp-sub">Guess any hero — each guess reveals how its attributes compare to the mystery hero.</p>
          )}
        </div>
        <div className="gp-modes" role="group" aria-label="Game mode">
          <button type="button" className="gp-mode-btn" aria-pressed={mode === 'daily'} onClick={() => setMode('daily')}>
            Daily
          </button>
          <button type="button" className="gp-mode-btn" aria-pressed={mode === 'endless'} onClick={() => setMode('endless')}>
            Endless
          </button>
        </div>
      </header>

      {error && <p style={{ color: 'var(--accent-red)' }}>{error}</p>}
      {loading && <p className="loading">Loading puzzle…</p>}

      {puzzle && puzzle.notReady && (
        <div className="gp-reveal">
          <p>{puzzle.message || 'No puzzle available yet — check back soon.'}</p>
        </div>
      )}

      {puzzle && !loading && !puzzle.notReady && puzzle.available !== false && (
        <>
          <div className="gp-panel">
            {/* Clue (non-heroguessr) + progress + input stay anchored at the top
                so the input bar never shifts as guesses accumulate. Guesses
                render below the input. */}
            {!isHeroguessr && (
              <ClueArea game={game} clue={puzzle.clue} guessCount={guessed.length} />
            )}

            {!finished && (
              <>
                <p className="gp-progress">
                  Guess {guessed.length + 1} of {maxGuesses}
                  <ProgressPips used={guessed.length} max={maxGuesses} won={false} />
                </p>
                <GuessInput
                  choices={puzzle.choices || []}
                  guessedIds={guessedIds}
                  disabled={finished}
                  onGuess={handleGuess}
                  showPortraits={heroPortraits}
                />
              </>
            )}

            {isHeroguessr ? (
              <HeroCompareGrid guessed={guessed} />
            ) : (
              guessed.length > 0 && (
                <ul className="gp-history">
                  {guessed.slice().reverse().map((g, i) => (
                    <li key={i} className={`gp-history__item ${g.correct ? 'gp-history__item--right' : 'gp-history__item--wrong'}`}>
                      {heroPortraits && (
                        <img className="gp-history__img" src={getHeroImageUrl(g.id, g.name)} alt="" loading="lazy" />
                      )}
                      <span className="gp-history__name">{g.name}</span>
                      <span aria-hidden="true">{g.correct ? '✅' : '❌'}</span>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          {finished && (
            <div className={`gp-reveal${won ? ' gp-reveal--win' : ''}`}>
              <h2 className="gp-reveal__title">{won ? '🎉 Solved!' : '😖 Out of guesses'}</h2>
              {answer && (
                <div className="gp-reveal__hero">
                  {answerImg && <img src={answerImg} alt="" />}
                  <span>
                    The answer was <strong>{answer.name}</strong>
                    {won ? ` — in ${guessed.length} ${guessed.length === 1 ? 'guess' : 'guesses'}.` : '.'}
                  </span>
                </div>
              )}
              {share && (
                <div>
                  <pre className="gp-share">{share}</pre>
                  <div>
                    <button type="button" className="btn btn-primary" onClick={copyShare}>
                      {copied ? 'Copied!' : 'Copy result'}
                    </button>
                  </div>
                </div>
              )}
              {mode === 'endless' && (
                <div style={{ marginTop: 12 }}>
                  <button type="button" className="btn" onClick={() => loadPuzzle('endless')}>
                    Next puzzle →
                  </button>
                </div>
              )}
              {mode === 'daily' && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>
                  Come back tomorrow for a new daily, or switch to Endless to keep playing.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <section style={{ marginTop: 32 }}>
        <h2>Leaderboard</h2>
        <Leaderboard game={game} maxGuesses={maxGuesses} />
      </section>
    </div>
  );
}
