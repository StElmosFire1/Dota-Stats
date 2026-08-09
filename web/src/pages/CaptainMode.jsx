// Task #846 — Captain's Mode game. Graduated from the approved 5-screen
// canvas mockup (Hub, Draft, Strategy, Simulator, Atlas) into a working
// solo-vs-AI feature. Frontend-driven: hero data is the real OpenDota
// /heroStats dataset (server-cached), draft follows the real 24-step CM
// ban/pick order, and the simulator + captain rating derive from the drafted
// lineups and the chosen win plan (see web/src/lib/captainMode.js).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getCaptainModeHeroMeta, saveCaptainModeRun, getCaptainModeStats } from '../api';
import {
  CM_ORDER, ROLE_LABELS, HERO_IMG, STRATEGY_SLIDERS, DEFAULT_PLAN,
  powerCurve, powerSpike, heroIdentity, likelyPositions,
  aiChoose, suggestions, draftFit, planCoherence, simulateMatch,
  loadRating, loadHistory, recordResult,
} from '../lib/captainMode';
import './CaptainMode.css';

const ATTR_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'str', label: 'STR' },
  { key: 'agi', label: 'AGI' },
  { key: 'int', label: 'INT' },
  { key: 'all-attr', label: 'Uni' },
];

function attrMatch(hero, filter) {
  if (filter === 'all') return true;
  if (filter === 'all-attr') return hero.attr === 'all';
  return hero.attr === filter;
}

function fmtTime(min) {
  return `${String(Math.max(0, min)).padStart(2, '0')}:00`;
}

function Rail({ stage }) {
  const steps = [
    { key: 'draft', label: 'Draft' },
    { key: 'strategy', label: 'Strategy' },
    { key: 'sim', label: 'Simulate' },
  ];
  const idx = steps.findIndex((s) => s.key === stage);
  return (
    <div className="cmx-rail">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          {i > 0 && <div className="cmx-rail-line" />}
          <div className={`cmx-rail-step ${i === idx ? 'active' : i < idx ? 'done' : ''}`}>
            <span className="cmx-rail-dot" />
            <span>{s.label}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function Sparkline({ values }) {
  const getY = (v) => 20 - (v / 100) * 20;
  const d = `M 0,${getY(values[0])} L 25,${getY(values[1])} L 50,${getY(values[2])}`;
  return (
    <svg width="50" height="20" viewBox="0 0 50 20" aria-hidden="true" style={{ overflow: 'visible' }}>
      <path d="M 0,10 L 50,10" className="cmx-sparkline-bg" />
      <path d={d} className="cmx-sparkline-path" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Hub

function Hub({ heroes, rating, history, onStart, onAtlas }) {
  const wins = history.filter((h) => h.won).length;
  return (
    <div>
      <div className="cmx-hub-hero">
        <div>
          <span className="pb-eyebrow">Captain Sim · OCE</span>
          <h1 className="cmx-hub-title">
            Draft.<br /><span className="cmx-amber">Simulate.</span><br />Climb.
          </h1>
          <p className="cmx-hub-copy">
            Draft a full Captain&apos;s Mode game against an AI captain, then watch our
            sim — powered by OpenDota&apos;s live win-rate dataset — play it out.
          </p>
          <div className="cmx-hub-ctas">
            <button type="button" className="cmx-btn cmx-btn-amber" onClick={onStart}>
              Start a draft
            </button>
            <button type="button" className="cmx-btn cmx-btn-ghost" onClick={onAtlas}>
              Open the Atlas
            </button>
          </div>
          <span className="cmx-fineprint">Browser · no install.</span>
        </div>
        <div className="pb-card" style={{ padding: '1.5rem' }}>
          <div className="cmx-eyebrow-row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span className="pb-eyebrow">Your captain card</span>
            <span className="cmx-rating-pill">
              Captain rating <span className="cmx-num">{rating}</span>
            </span>
          </div>
          <div className="cmx-stat-strip" style={{ margin: 0, border: 'none', padding: '0.5rem 0' }}>
            <div className="cmx-stat-cell">
              <span className="cmx-stat-value">{history.length}</span>
              <span className="pb-eyebrow">Runs</span>
            </div>
            <div className="cmx-stat-cell">
              <span className="cmx-stat-value">{wins}</span>
              <span className="pb-eyebrow">Wins</span>
            </div>
            <div className="cmx-stat-cell">
              <span className="cmx-stat-value">
                {history.length ? `${Math.round((wins / history.length) * 100)}%` : '—'}
              </span>
              <span className="pb-eyebrow">Win rate</span>
            </div>
            <div className="cmx-stat-cell">
              <span className="cmx-stat-value">
                {history[0] ? `${history[0].delta > 0 ? '+' : ''}${history[0].delta}` : '—'}
              </span>
              <span className="pb-eyebrow">Last delta</span>
            </div>
          </div>
        </div>
      </div>

      <div className="cmx-stat-strip">
        <div className="cmx-stat-cell">
          <span className="cmx-stat-value">{heroes.length}</span>
          <span className="pb-eyebrow">Draftable heroes</span>
        </div>
        <div className="cmx-stat-cell">
          <span className="cmx-stat-value">{CM_ORDER.length}</span>
          <span className="pb-eyebrow">Draft steps</span>
        </div>
        <div className="cmx-stat-cell">
          <span className="cmx-stat-value">OpenDota</span>
          <span className="pb-eyebrow">Live winrate dataset</span>
        </div>
        <div className="cmx-stat-cell">
          <span className="cmx-stat-value">Solo</span>
          <span className="pb-eyebrow">vs AI captain</span>
        </div>
      </div>

      <div className="cmx-feature-grid">
        <div className="pb-card cmx-feature-card">
          <h3>Draft board</h3>
          <p>Navigate the complete Captain&apos;s Mode phase — 14 bans, 10 picks, real
            order — against an adaptive AI that counters your picks.</p>
        </div>
        <div className="pb-card cmx-feature-card">
          <h3>Strategy</h3>
          <p>Assign roles and dial in a win plan. The sim rewards plans that match
            what your five heroes are actually built to do.</p>
        </div>
        <div className="pb-card cmx-feature-card">
          <h3>Simulator</h3>
          <p>Run the finished draft through the OpenDota win-rate model to see the
            projected outcome — and earn (or lose) captain rating.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft

function DraftStage({ heroes, heroesById, draft, onAction, onComplete }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const step = CM_ORDER[draft.stepIndex];
  const done = !step;

  const taken = useMemo(() => {
    const s = new Set(draft.bans);
    draft.picks[0].forEach((id) => s.add(id));
    draft.picks[1].forEach((id) => s.add(id));
    return s;
  }, [draft]);

  const available = useMemo(
    () => heroes.filter((h) => !taken.has(h.id)),
    [heroes, taken]
  );

  const userPicks = draft.picks[0].map((id) => heroesById[id]);
  const aiPicks = draft.picks[1].map((id) => heroesById[id]);

  const suggested = useMemo(() => {
    if (done || step.team !== 0) return new Set();
    return new Set(suggestions(step.action, available, userPicks, aiPicks));
  }, [done, step, available, userPicks, aiPicks]);

  // AI turn: act after a short beat so the exchange reads as a real draft.
  useEffect(() => {
    if (done) { onComplete(); return undefined; }
    if (step.team !== 1) return undefined;
    const t = setTimeout(() => {
      const choice = aiChoose(step.action, available, aiPicks, userPicks);
      onAction(choice.id);
    }, 700);
    return () => clearTimeout(t);
  }, [done, step, available, aiPicks, userPicks, onAction, onComplete]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available.filter(
      (h) => attrMatch(h, filter) && (!q || h.name.toLowerCase().includes(q))
    );
  }, [available, search, filter]);

  const yourTurn = !done && step.team === 0;

  return (
    <div>
      <Rail stage="draft" />
      <div className="cmx-draft-grid">
        {/* Teams */}
        <div>
          <TeamPanel label="Radiant" note="(you)" side="radiant" picks={userPicks} heroesById={heroesById} />
          <TeamPanel label="Dire" note="(AI)" side="dire" picks={aiPicks} heroesById={heroesById} />
        </div>

        {/* Board */}
        <div className="cmx-board">
          <div className="cmx-board-head">
            <div>
              <span className="cmx-phase-dot" aria-hidden="true" />
              <span className="pb-eyebrow">
                {done ? 'Draft complete' : `${step.action === 'ban' ? 'Ban' : 'Pick'} phase ${step.phase}`}
              </span>
              <span className="cmx-turn-note">
                {done ? '' : yourTurn ? ' · your turn' : ' · AI is thinking…'}
              </span>
            </div>
            <span className="cmx-step-count">
              Step {Math.min(draft.stepIndex + 1, CM_ORDER.length)} / {CM_ORDER.length}
            </span>
          </div>

          <div className="cmx-board-filters">
            <input
              type="search"
              className="cmx-search"
              placeholder="Search heroes…"
              aria-label="Search heroes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {ATTR_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="cmx-pill"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="cmx-hero-grid">
            {shown.map((h) => (
              <button
                key={h.id}
                type="button"
                className="cmx-tile"
                disabled={!yourTurn}
                onClick={() => yourTurn && onAction(h.id)}
                title={`${h.name} — ${(h.winRate * 100).toFixed(1)}% WR`}
              >
                <img src={HERO_IMG(h.slug)} alt="" loading="lazy" />
                <span className="cmx-tile-name">{h.name}</span>
                {suggested.has(h.id) && (
                  <span className="cmx-tile-badge">
                    {step && step.action === 'ban' ? 'Deny' : 'Pick'}
                  </span>
                )}
              </button>
            ))}
            {shown.length === 0 && (
              <p style={{ color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                No heroes match that search.
              </p>
            )}
          </div>

          <div className="cmx-ban-strip">
            <span className="pb-eyebrow" style={{ marginRight: '0.5rem' }}>Banned</span>
            {draft.bans.length === 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No bans yet.</span>
            )}
            {draft.bans.map((id) => (
              <span key={id} className="cmx-ban-chip" title={heroesById[id]?.name}>
                <img src={HERO_IMG(heroesById[id]?.slug)} alt={`Banned: ${heroesById[id]?.name}`} />
              </span>
            ))}
          </div>
        </div>

        {/* Enemy brief */}
        <div className="pb-card" style={{ padding: '1.15rem' }}>
          <div className="cmx-eyebrow-row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span className="pb-serif" style={{ fontSize: '1.05rem' }}>Enemy Brief</span>
            <span className="pb-eyebrow" style={{ color: 'var(--amber)' }}>Live coaching</span>
          </div>
          <div className="cmx-brief-item">
            <span className="cmx-brief-icon" aria-hidden="true">◆</span>
            <div>
              <div className="cmx-brief-label">AI captain style</div>
              <div className="cmx-brief-value">Counter-drafter</div>
            </div>
          </div>
          <div className="cmx-brief-item">
            <span className="cmx-brief-icon" aria-hidden="true">⚔</span>
            <div>
              <div className="cmx-brief-label">Plan</div>
              <div className="cmx-brief-value">
                {aiPicks.length >= 2 ? heroIdentity(aiPicks[0]) : 'Reading your bans'}
              </div>
            </div>
          </div>
          <div className="cmx-brief-item">
            <span className="cmx-brief-icon" aria-hidden="true">◎</span>
            <div>
              <div className="cmx-brief-label">Likely next move</div>
              <div className="cmx-brief-value" style={{ color: 'var(--amber)' }}>
                {done
                  ? 'Draft locked'
                  : step.action === 'ban'
                    ? 'Deny the highest win-rate core still open'
                    : 'Counter your last pick'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                The AI scores every hero against your lineup using the same
                OpenDota win-rate data you see in the Atlas.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamPanel({ label, note, side, picks, heroesById }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h2 className="cmx-team-title">{label} <small>{note}</small></h2>
      {ROLE_LABELS.map((role, i) => {
        const hero = picks[i];
        return (
          <div key={role} className={`cmx-slot ${side}`}>
            <div className="cmx-slot-role">{role}</div>
            <div className="cmx-slot-box">
              {hero ? (
                <>
                  <img src={HERO_IMG(hero.slug)} alt="" />
                  <span className="cmx-slot-name">{hero.name}</span>
                </>
              ) : (
                <span className="cmx-slot-empty">Picking…</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strategy

function StrategyStage({ userPicks, aiPicks, plan, setPlan, roles, setRoles, onSimulate }) {
  const fit = draftFit(userPicks, aiPicks);
  const coherence = planCoherence(userPicks, plan);
  const dupRoles = new Set(
    roles.filter((r, i) => roles.indexOf(r) !== i)
  );

  return (
    <div>
      <Rail stage="strategy" />
      <div className="cmx-strategy-grid">
        <div>
          <h1 className="pb-page-title" style={{ fontSize: '2rem', marginBottom: '0.35rem' }}>Define Strategy</h1>
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontFamily: 'var(--font-serif)', marginBottom: '1.5rem' }}>
            Assign roles and dictate the match tempo before simulating.
          </p>

          <span className="pb-eyebrow">Lineup &amp; roles</span>
          <div className="cmx-lineup-grid" style={{ marginTop: '0.75rem' }}>
            {userPicks.map((h, i) => (
              <div key={h.id} className="cmx-lineup-card">
                <div className="cmx-lineup-img pb-card-sm" style={{ overflow: 'hidden' }}>
                  <img src={HERO_IMG(h.slug)} alt={h.name} loading="lazy" />
                  <span className="cmx-lineup-name">{h.name}</span>
                </div>
                <select
                  className="cmx-role-select"
                  aria-label={`Role for ${h.name}`}
                  value={roles[i]}
                  onChange={(e) => {
                    const next = roles.slice();
                    next[i] = e.target.value;
                    setRoles(next);
                  }}
                >
                  {ROLE_LABELS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            ))}
          </div>
          {dupRoles.size > 0 && (
            <p className="cmx-role-warn">
              Two heroes share the same role ({Array.from(dupRoles).join(', ')}) —
              the sim will treat your lineup as less coherent.
            </p>
          )}

          <div className="pb-card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
            <div className="cmx-eyebrow-row" style={{ justifyContent: 'space-between' }}>
              <span className="pb-eyebrow">Win plan</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Adjust the macroscopic directives
              </span>
            </div>
            <div className="cmx-sliders">
              {STRATEGY_SLIDERS.map((s) => (
                <div key={s.key} className="cmx-slider-row">
                  <label className="pb-eyebrow" htmlFor={`cmx-slider-${s.key}`}>{s.label}</label>
                  <div className="cmx-slider-ends">
                    <span>{s.left}</span>
                    <input
                      id={`cmx-slider-${s.key}`}
                      className="cmx-range"
                      type="range"
                      min="-50"
                      max="50"
                      step="5"
                      value={plan[s.key]}
                      onChange={(e) => setPlan({ ...plan, [s.key]: Number(e.target.value) })}
                    />
                    <span>{s.right}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pb-card" style={{ padding: '1.25rem' }}>
          <span className="pb-eyebrow">Predictions</span>
          <div style={{ marginTop: '1.25rem' }}>
            <div className="cmx-meter-row">
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Draft Fit</span>
              <span className="cmx-meter-num">{fit}%</span>
            </div>
            <div className="cmx-meter-track">
              <div className="cmx-meter-fill" style={{ width: `${fit}%` }} />
            </div>
            <p className="cmx-meter-note">
              {fit >= 65
                ? 'Strong draft — your five answer theirs well.'
                : fit >= 45
                  ? 'Even draft. Execution and plan will decide it.'
                  : 'Uphill draft — the AI out-countered you.'}
            </p>
          </div>
          <div style={{ marginTop: '1.5rem' }}>
            <div className="cmx-meter-row">
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Coherence</span>
              <span className="cmx-meter-num" style={{ color: 'var(--pb-brass)' }}>{coherence}%</span>
            </div>
            <div className="cmx-meter-track">
              <div className="cmx-meter-fill brass" style={{ width: `${coherence}%` }} />
            </div>
            <p className="cmx-meter-note">
              {coherence >= 70
                ? 'The plan matches what this lineup is built for.'
                : 'The plan fights your draft — adjust tempo or map style.'}
            </p>
          </div>
          <div style={{ borderTop: '1px solid var(--pb-line)', marginTop: '1.75rem', paddingTop: '1.25rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'var(--font-serif)', marginBottom: '1rem' }}>
              &ldquo;A good plan violently executed now is better than a perfect plan
              executed next week.&rdquo;
            </p>
            <button type="button" className="cmx-btn cmx-btn-amber" style={{ width: '100%' }} onClick={onSimulate}>
              Lock in &amp; simulate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simulator

function SimulatorStage({ result, rating, onRematch, onHome }) {
  // Reveal events one at a time so the sim reads as a live playout.
  const [shownCount, setShownCount] = useState(1);
  const doneRef = useRef(false);
  useEffect(() => {
    if (shownCount >= result.events.length) return undefined;
    const t = setTimeout(() => setShownCount((c) => c + 1), 550);
    return () => clearTimeout(t);
  }, [shownCount, result.events.length]);
  const finished = shownCount >= result.events.length;

  // Record the rating change exactly once, when the playout completes.
  const [newRating, setNewRating] = useState(null);
  useEffect(() => {
    if (finished && !doneRef.current) {
      doneRef.current = true;
      const nr = recordResult(result.delta, result.won);
      setNewRating(nr);
      // Server-side stat tracking — fire-and-forget; anonymous players just
      // get a 401 we ignore (localStorage remains their record).
      saveCaptainModeRun({ won: result.won, delta: result.delta, rating: nr, runKey: result.runKey }).catch(() => {});
    }
  }, [finished, result]);

  const momentum = Math.round(35 + (result.winProb - 50) * 0.6 + (result.won ? 15 : -5));

  return (
    <div>
      <Rail stage="sim" />
      <div className="pb-card cmx-sim-top">
        <div className="cmx-sim-metric">
          <div className="pb-eyebrow">Draft fit</div>
          <div className="cmx-num">{result.fit}%</div>
        </div>
        <div className="cmx-sim-metric">
          <div className="pb-eyebrow">Coherence</div>
          <div className="cmx-num">{result.coherence}%</div>
        </div>
        <div className="cmx-sim-metric">
          <div className="pb-eyebrow">Discipline</div>
          <div className="cmx-num">{result.discipline}%</div>
        </div>
        <div className="cmx-sim-metric">
          <div className="pb-eyebrow">Pre-match win odds</div>
          <div className="cmx-num">{result.winProb}%</div>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="pb-eyebrow" style={{ marginBottom: '0.4rem' }}>Momentum</div>
          <div className="cmx-momentum">
            <div style={{ width: `${momentum}%`, background: 'var(--radiant-color)' }} />
            <div style={{ width: `${100 - momentum}%`, background: 'var(--dire-color)' }} />
          </div>
        </div>
      </div>

      <div className="cmx-sim-grid" style={{ marginTop: '1.25rem' }}>
        <div>
          <span className="pb-eyebrow">Match event log</span>
          <div style={{ marginTop: '0.75rem' }} aria-live="polite">
            {result.events.slice(0, shownCount).map((ev, i) => (
              <div key={i} className="cmx-event shown">
                <span className="cmx-event-time">{fmtTime(ev.time)}</span>
                <span className="cmx-event-text">{ev.text}</span>
                <span className={`cmx-event-badge ${ev.type}`}>
                  {{ 'on-plan': 'On plan', 'off-script': 'Off script', stress: 'Plan stress', payoff: 'Plan payoff', neutral: 'Neutral' }[ev.type]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          {finished ? (
            <div className="pb-card cmx-verdict">
              <div className="pb-eyebrow" style={{ color: 'var(--amber)', marginBottom: '0.5rem' }}>
                Match verdict — {result.won ? 'Victory' : 'Defeat'}
              </div>
              <h2>{result.verdict}</h2>
              <div style={{ marginTop: '1rem' }}>
                <div className="pb-eyebrow">Captain rating</div>
                <div className={`cmx-verdict-delta ${result.delta >= 0 ? 'up' : 'down'}`}>
                  {result.delta >= 0 ? '+' : ''}{result.delta}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  New rating: <span className="pb-num" style={{ color: 'var(--parchment)' }}>{newRating ?? rating}</span>
                </div>
              </div>
              <div className="cmx-verdict-stats">
                <span>Duration<span className="cmx-num">{result.duration}m</span></span>
                {result.pivotal != null && (
                  <span>Pivotal moment<span className="cmx-num">{fmtTime(result.pivotal)}</span></span>
                )}
                <span>XP<span className="cmx-num">+{result.xp}</span></span>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                <button type="button" className="cmx-btn cmx-btn-amber" onClick={onRematch}>
                  Draft again
                </button>
                <button type="button" className="cmx-btn cmx-btn-ghost" onClick={onHome}>
                  Back to hub
                </button>
              </div>
            </div>
          ) : (
            <div className="pb-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>Simulating the match from your draft and win plan…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Atlas

function AtlasStage({ heroes }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return heroes
      .filter((h) => attrMatch(h, filter))
      .filter((h) =>
        !q ||
        h.name.toLowerCase().includes(q) ||
        (h.roles || []).some((r) => r.toLowerCase().includes(q)) ||
        heroIdentity(h).toLowerCase().includes(q)
      )
      .slice()
      .sort((a, b) => b.winRate - a.winRate);
  }, [heroes, search, filter]);

  return (
    <div>
      <span className="pb-eyebrow">OpenDota intelligence</span>
      <h1 className="pb-page-title" style={{ fontSize: '2.2rem', margin: '0.35rem 0 1.25rem' }}>Draft Atlas</h1>
      <div className="cmx-atlas-toolbar">
        {ATTR_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="cmx-pill"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <input
          type="search"
          className="cmx-search"
          placeholder="Search heroes, roles, identities…"
          aria-label="Search heroes, roles, identities"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Showing <span className="pb-num" style={{ color: 'var(--parchment)' }}>{shown.length}</span> of{' '}
          <span className="pb-num" style={{ color: 'var(--parchment)' }}>{heroes.length}</span>
        </span>
      </div>

      <div className="cmx-atlas-grid">
        {shown.map((h) => (
          <div key={h.id} className="pb-card cmx-atlas-card">
            <div className="cmx-atlas-img">
              <img src={HERO_IMG(h.slug)} alt="" loading="lazy" />
              <div className="cmx-atlas-roles">
                {(h.roles || []).slice(0, 2).map((r) => (
                  <span key={r} className="cmx-atlas-role">{r}</span>
                ))}
              </div>
            </div>
            <div className="cmx-atlas-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                <div>
                  <div className="cmx-atlas-name">{h.name}</div>
                  <div className="cmx-atlas-id">{heroIdentity(h)} · {likelyPositions(h).join(' / ')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="cmx-atlas-stat-label">Power spike</span>
                  <Sparkline values={powerCurve(h)} />
                  <div className="pb-cond" style={{ fontSize: '0.62rem', color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    {powerSpike(h)}
                  </div>
                </div>
              </div>
              <div className="cmx-atlas-stats">
                <div>
                  <span className="cmx-atlas-stat-label">Winrate</span>
                  <span className={`cmx-atlas-stat-value ${h.winRate > 0.5 ? 'hot' : ''}`}>
                    {(h.winRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="cmx-atlas-stat-label">Pick rate</span>
                  <span className="cmx-atlas-stat-value">{(h.pickRate * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="cmx-atlas-stat-label">Pro P/B</span>
                  <span className="cmx-atlas-stat-value">{(h.pbRate * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell

const EMPTY_DRAFT = { stepIndex: 0, bans: [], picks: [[], []] };

export default function CaptainMode() {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('hub'); // hub | draft | strategy | sim | atlas
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [roles, setRoles] = useState(ROLE_LABELS);
  const [result, setResult] = useState(null);
  const [rating, setRating] = useState(loadRating);
  const [history, setHistory] = useState(loadHistory);
  // Server-synced record (signed-in players only; null when anonymous).
  const [serverStats, setServerStats] = useState(null);

  const refreshServerStats = () => {
    getCaptainModeStats().then(setServerStats).catch(() => {});
  };
  useEffect(refreshServerStats, []);

  useEffect(() => {
    let alive = true;
    getCaptainModeHeroMeta()
      .then((d) => { if (alive) setMeta(d); })
      .catch((e) => { if (alive) setError(e.message || 'Failed to load hero dataset'); });
    return () => { alive = false; };
  }, []);

  const heroes = meta?.heroes || [];
  const heroesById = useMemo(() => {
    const m = {};
    for (const h of heroes) m[h.id] = h;
    return m;
  }, [heroes]);

  const applyAction = (heroId) => {
    setDraft((d) => {
      const step = CM_ORDER[d.stepIndex];
      if (!step) return d;
      if (step.action === 'ban') {
        return { ...d, stepIndex: d.stepIndex + 1, bans: [...d.bans, heroId] };
      }
      const picks = [d.picks[0].slice(), d.picks[1].slice()];
      picks[step.team].push(heroId);
      return { ...d, stepIndex: d.stepIndex + 1, picks };
    });
  };

  const startDraft = () => {
    setDraft(EMPTY_DRAFT);
    setPlan(DEFAULT_PLAN);
    setRoles(ROLE_LABELS);
    setResult(null);
    setStage('draft');
  };

  const runSimulation = () => {
    const userPicks = draft.picks[0].map((id) => heroesById[id]);
    const aiPicks = draft.picks[1].map((id) => heroesById[id]);
    // Duplicate role assignments dent coherence via the plan (documented in
    // planCoherence); fold them in by nudging the risk axis.
    const dup = roles.length - new Set(roles).size;
    const effPlan = dup > 0 ? { ...plan, risk: plan.risk + dup * 10 } : plan;
    const sim = simulateMatch({
      myPicks: userPicks,
      enemyPicks: aiPicks,
      plan: effPlan,
      seed: Date.now() % 2147483647,
    });
    // Per-simulation idempotency key — the server dedupes on it so retries or
    // component remounts can never double-count a run.
    sim.runKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setResult(sim);
    setStage('sim');
  };

  const backToHub = () => {
    setRating(loadRating());
    setHistory(loadHistory());
    refreshServerStats();
    setStage('hub');
  };

  if (error) {
    return (
      <div className="cmx-root">
        <p className="cmx-error">
          Captain&apos;s Mode needs the OpenDota hero dataset and it could not be
          loaded ({error}). Try again in a minute.
        </p>
      </div>
    );
  }
  if (!meta) return <div className="loading">Loading the hero dataset…</div>;

  const userPicks = draft.picks[0].map((id) => heroesById[id]);
  const aiPicks = draft.picks[1].map((id) => heroesById[id]);

  return (
    <div className="cmx-root">
      {stage === 'hub' && serverStats && serverStats.games > 0 && (
        <div className="pb-card" style={{ padding: '10px 16px', marginBottom: 12, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span className="pb-eyebrow">Synced record</span>
          <span style={{ fontSize: 14 }}>
            <b className="cmx-num">{serverStats.games}</b> games ·{' '}
            <b className="cmx-num">{serverStats.wins}</b>–<b className="cmx-num">{serverStats.losses}</b> ·{' '}
            rating <b className="cmx-num">{serverStats.current_rating}</b>
            {serverStats.best_rating > serverStats.current_rating ? <> (best {serverStats.best_rating})</> : null}
          </span>
        </div>
      )}
      {stage === 'hub' && (
        <Hub
          heroes={heroes}
          rating={rating}
          history={history}
          onStart={startDraft}
          onAtlas={() => setStage('atlas')}
        />
      )}
      {stage === 'draft' && (
        <DraftStage
          heroes={heroes}
          heroesById={heroesById}
          draft={draft}
          onAction={applyAction}
          onComplete={() => setStage('strategy')}
        />
      )}
      {stage === 'strategy' && (
        <StrategyStage
          userPicks={userPicks}
          aiPicks={aiPicks}
          plan={plan}
          setPlan={setPlan}
          roles={roles}
          setRoles={setRoles}
          onSimulate={runSimulation}
        />
      )}
      {stage === 'sim' && result && (
        <SimulatorStage
          result={result}
          rating={rating}
          onRematch={startDraft}
          onHome={backToHub}
        />
      )}
      {stage === 'atlas' && (
        <div>
          <button
            type="button"
            className="cmx-btn cmx-btn-ghost"
            style={{ marginBottom: '1rem' }}
            onClick={backToHub}
          >
            ← Back to hub
          </button>
          <AtlasStage heroes={heroes} />
        </div>
      )}
    </div>
  );
}
