import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getGameDaily, getGameEndless, getGameLeaderboard, submitGameGuess, gameImageUrl,
} from '../api';

// Task #451 — Daily Dota mini-games play surface. One component drives all
// games; the clue renderer switches on the puzzle's clue shape. The backend
// keeps the answer secret until the player finishes, so this component only
// ever knows the choices list + a leak-free clue.

const TITLES = {
  heroguessr: 'Heroguessr',
  'item-zoom': 'Item-zoom',
  statline: 'Statline',
  talent: 'Talent guesser',
  voiceline: 'Voiceline daily',
};

function fmtDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Clue renderers ──────────────────────────────────────────────────────────
function HeroguessrClue({ clue, revealCount }) {
  if (!clue || !clue.hints) return null;
  const shown = clue.hints.slice(0, revealCount);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {shown.map(h => (
        <div key={h.key} className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {h.label}
          </div>
          {h.abilityTokens ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {h.abilityTokens.map((t, i) => (
                <img
                  key={i}
                  src={gameImageUrl(t)}
                  alt={`Ability icon ${i + 1}`}
                  width={48}
                  height={48}
                  style={{ borderRadius: 6, background: 'var(--bg-secondary)' }}
                />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{h.value}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function ItemZoomClue({ clue, zoomLevel }) {
  if (!clue || !clue.imageToken) return null;
  return (
    <div
      style={{
        width: 260, height: 260, margin: '0 auto', overflow: 'hidden',
        borderRadius: 10, border: '2px solid var(--brass)', background: 'var(--bg-secondary)',
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
  // Reveal from the top of the tree (25) downward as guesses are spent, so the
  // most distinctive talents show first.
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

function ClueArea({ game, clue, guessCount }) {
  if (game === 'heroguessr') return <HeroguessrClue clue={clue} revealCount={Math.min(6, guessCount + 1)} />;
  if (game === 'item-zoom') {
    // Zoom out a bit with each wrong guess to make it progressively easier.
    const base = clue && clue.zoom ? clue.zoom : 8;
    const zoom = Math.max(1.2, base - guessCount * 1.1);
    return <ItemZoomClue clue={clue} zoomLevel={zoom} />;
  }
  if (game === 'talent') return <TalentClue clue={clue} revealCount={guessCount + 1} />;
  if (game === 'statline') return <StatlineClue clue={clue} />;
  return null;
}

// ── Guess input with autocomplete from the choices list ────────────────────
function GuessInput({ choices, disabled, onGuess, guessedIds }) {
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
    <div ref={wrapRef} style={{ position: 'relative', maxWidth: 420, margin: '16px auto 0' }}>
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
          width: '100%', padding: '10px 12px', fontSize: 15, borderRadius: 8,
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
            borderRadius: 8, maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
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
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                  background: i === active ? 'var(--bg-secondary)' : 'transparent',
                  border: 'none', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontSize: 14,
                }}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Leaderboard ─────────────────────────────────────────────────────────────
function Leaderboard({ game }) {
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
                <span style={{ float: 'right', color: 'var(--amber)', fontWeight: 600 }}>{r.guesses}/6</span>
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

// ── Main page ───────────────────────────────────────────────────────────────
export default function GamePlay() {
  const { game } = useParams();
  const title = TITLES[game] || 'Mini-Game';

  const [mode, setMode] = useState('daily');
  const [puzzle, setPuzzle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Per-attempt state.
  const [guessed, setGuessed] = useState([]); // [{id, name, correct}]
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
        // Daily puzzle the player already finished: hydrate the end state.
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
      // Optimistically we don't know correctness until the server responds.
      const resp = await submitGameGuess(game, {
        mode,
        guessId: choice.id,
        guesses: nextCount,
        finished: false, // determined after we know correctness
        answerToken: puzzle.answerToken,
      });
      const correct = resp.correct;
      const entry = { id: choice.id, name: choice.name, correct };
      const newGuessed = [...guessed, entry];
      setGuessed(newGuessed);

      const done = correct || willFinish;
      if (done) {
        // Submit the terminal result so it's recorded + revealed.
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

  // Voiceline / unavailable game.
  if (puzzle && puzzle.available === false) {
    return (
      <div className="container" style={{ padding: '24px 0', maxWidth: 640 }}>
        <Link to="/games" style={{ fontSize: 14 }}>← All games</Link>
        <h1>{puzzle.title || title}</h1>
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48 }} aria-hidden="true">🔊</div>
          <h2>Coming soon</h2>
          <p style={{ color: 'var(--text-muted)' }}>{puzzle.blurb}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            We’re still sourcing the audio clips for this one. Check back later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '24px 0', maxWidth: 720 }}>
      <Link to="/games" style={{ fontSize: 14 }}>← All games</Link>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: '8px 0' }}>
          {title}
          {puzzle && puzzle.number ? (
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> #{String(puzzle.number).padStart(3, '0')}</span>
          ) : null}
        </h1>
        <div role="group" aria-label="Game mode" style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="btn"
            aria-pressed={mode === 'daily'}
            onClick={() => setMode('daily')}
            style={{ background: mode === 'daily' ? 'var(--accent)' : undefined }}
          >
            Daily
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={mode === 'endless'}
            onClick={() => setMode('endless')}
            style={{ background: mode === 'endless' ? 'var(--accent)' : undefined }}
          >
            Endless
          </button>
        </div>
      </header>

      {error && <p style={{ color: '#e57373' }}>{error}</p>}
      {loading && <p className="loading">Loading puzzle…</p>}

      {puzzle && puzzle.notReady && (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <p>{puzzle.message || 'No puzzle available yet — check back soon.'}</p>
        </div>
      )}

      {puzzle && !loading && !puzzle.notReady && puzzle.available !== false && (
        <>
          <div style={{ margin: '20px 0' }}>
            <ClueArea game={game} clue={puzzle.clue} guessCount={guessed.length} />
          </div>

          {/* Guess history */}
          {guessed.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, maxWidth: 420, margin: '12px auto', display: 'grid', gap: 4 }}>
              {guessed.map((g, i) => (
                <li
                  key={i}
                  className="card"
                  style={{
                    padding: '8px 12px', display: 'flex', justifyContent: 'space-between',
                    borderLeft: `4px solid ${g.correct ? '#4caf50' : '#e57373'}`,
                  }}
                >
                  <span>{g.name}</span>
                  <span aria-hidden="true">{g.correct ? '✅' : '❌'}</span>
                </li>
              ))}
            </ul>
          )}

          {!finished && (
            <>
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Guess {guessed.length + 1} of {maxGuesses}
              </p>
              <GuessInput
                choices={puzzle.choices || []}
                guessedIds={guessedIds}
                disabled={finished}
                onGuess={handleGuess}
              />
            </>
          )}

          {finished && (
            <div className="card" style={{ padding: 20, textAlign: 'center', marginTop: 12 }}>
              <h2 style={{ marginTop: 0 }}>{won ? '🎉 Solved!' : '😖 Out of guesses'}</h2>
              {answer && (
                <p style={{ fontSize: 18 }}>
                  The answer was <strong>{answer.name}</strong>
                  {won ? ` — in ${guessed.length} ${guessed.length === 1 ? 'guess' : 'guesses'}.` : '.'}
                </p>
              )}
              {share && (
                <div style={{ marginTop: 12 }}>
                  <pre
                    style={{
                      fontFamily: 'var(--font)', whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)',
                      padding: 12, borderRadius: 8, display: 'inline-block', margin: 0, fontSize: 14,
                    }}
                  >
                    {share}
                  </pre>
                  <div style={{ marginTop: 10 }}>
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
        <Leaderboard game={game} />
      </section>
    </div>
  );
}
