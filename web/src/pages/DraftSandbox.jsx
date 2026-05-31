import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import '../styles/pressbox-inhouse.css';

// Placeholder players for the sandbox. `kda` / `winRate` / `games` /
// `prefPos` / `topHeroes` are all fabricated demo numbers — nothing here is
// pulled from the live database. They exist purely to populate the hover
// tooltip in the captain-pick UI so admins can preview the layout.
const PLACEHOLDER_PLAYERS = [
  { id: 1001, name: 'Miracle-',  mmr: 8200, pos: '1', flair: 'Carry GOAT',       kda: 4.8, winRate: 64, games: 412, prefPos: ['1', '2'], topHeroes: ['Anti-Mage', 'Invoker', 'Phantom Lancer'] },
  { id: 1002, name: 'Topson',    mmr: 7950, pos: '2', flair: 'Mid lord',         kda: 3.9, winRate: 61, games: 388, prefPos: ['2', '3'], topHeroes: ['Monkey King', 'Magnus', 'Tiny'] },
  { id: 1003, name: 'Ceb',       mmr: 7100, pos: '3', flair: 'Off-lane bruiser', kda: 3.2, winRate: 58, games: 356, prefPos: ['3', '4'], topHeroes: ['Mars', 'Centaur', 'Beastmaster'] },
  { id: 1004, name: 'JerAx',     mmr: 6900, pos: '4', flair: 'Roamer',           kda: 4.1, winRate: 60, games: 340, prefPos: ['4', '5'], topHeroes: ['Earth Spirit', 'Tusk', 'Pudge'] },
  { id: 1005, name: 'N0tail',    mmr: 7400, pos: '5', flair: 'Captain',          kda: 3.6, winRate: 63, games: 401, prefPos: ['5', '4'], topHeroes: ['IO', 'Treant', 'Grimstroke'] },
  { id: 1006, name: 'Arteezy',   mmr: 8050, pos: '1', flair: 'Mr. Farm',         kda: 4.5, winRate: 59, games: 470, prefPos: ['1', '2'], topHeroes: ['Spectre', 'Naga Siren', 'Terrorblade'] },
  { id: 1007, name: 'SumaiL',    mmr: 7800, pos: '2', flair: 'King of Mid',      kda: 4.2, winRate: 60, games: 433, prefPos: ['2', '1'], topHeroes: ['Storm Spirit', 'Ember', 'Lina'] },
  { id: 1008, name: 'Universe',  mmr: 6800, pos: '3', flair: '6m Echo',          kda: 2.9, winRate: 56, games: 318, prefPos: ['3'],      topHeroes: ['Earthshaker', 'Tidehunter', 'Dark Seer'] },
  { id: 1009, name: 'Cr1t-',     mmr: 6700, pos: '4', flair: 'Vision king',      kda: 3.4, winRate: 57, games: 295, prefPos: ['4', '5'], topHeroes: ['Rubick', 'Mirana', 'Snapfire'] },
  { id: 1010, name: 'Fly',       mmr: 7000, pos: '5', flair: 'Captain',          kda: 3.1, winRate: 62, games: 367, prefPos: ['5'],      topHeroes: ['Disruptor', 'Hoodwink', 'Ogre Magi'] },
];

// Captain pick order for a 1-2-2-2-1 alternating format (8 picks total).
// Index: 0..7 — value: which captain picks (1 or 2).
const PICK_SEQUENCE = [1, 2, 2, 1, 1, 2, 2, 1];

// Position role colours (QOL — lets admins read a player's natural role at a
// glance). Uses theme tokens so the chip tracks light/dark like the rest of
// the Press Box surface.
const POS_COLOR = {
  '1': 'var(--pb-amber)',
  '2': 'var(--pb-radiant)',
  '3': 'var(--pb-dire)',
  '4': '#60a5fa',
  '5': '#a78bfa',
};
const POS_LABEL = {
  '1': 'Carry',
  '2': 'Mid',
  '3': 'Offlane',
  '4': 'Soft Sup',
  '5': 'Hard Sup',
};

// Floating tooltip card shown on player hover. Renders absolutely positioned
// over the card itself so it appears next to whatever was hovered without
// needing portal mechanics. Uses pointerEvents:'none' so it doesn't steal
// hover state from the underlying card. (QOL — preserved from the original
// sandbox so admins can preview the captain-pick hover experience.)
function PlayerHoverCard({ p }) {
  const winColor = p.winRate >= 60 ? 'var(--pb-radiant)' : p.winRate >= 50 ? 'var(--pb-amber)' : 'var(--pb-dire)';
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, marginTop: 8, zIndex: 50,
      width: 282, padding: '14px 16px', borderRadius: 'var(--pb-radius-sm)',
      background: 'linear-gradient(180deg, var(--pb-surface) 0%, var(--pb-bg-2) 100%)',
      border: '1px solid var(--pb-line)', borderTop: '3px solid var(--pb-brass)',
      boxShadow: 'var(--pb-shadow)',
      pointerEvents: 'none', color: 'var(--pb-text)',
    }}>
      <div className="pb-eyebrow" style={{
        borderBottom: '1px solid var(--pb-line)', paddingBottom: 7, marginBottom: 10,
      }}>
        Player Stats
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 12 }}>
        <div>
          <div className="pb-eyebrow" style={{ fontSize: 9, letterSpacing: '0.14em' }}>KDA Ratio</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 700, color: 'var(--pb-brass-bright)' }}>{p.kda.toFixed(2)}</div>
        </div>
        <div>
          <div className="pb-eyebrow" style={{ fontSize: 9, letterSpacing: '0.14em' }}>Win Rate</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 700, color: winColor }}>{p.winRate}%</div>
        </div>
        <div>
          <div className="pb-eyebrow" style={{ fontSize: 9, letterSpacing: '0.14em' }}>Games</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 700, color: 'var(--pb-text)' }}>{p.games}</div>
        </div>
        <div>
          <div className="pb-eyebrow" style={{ fontSize: 9, letterSpacing: '0.14em' }}>MMR</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 700, color: 'var(--pb-text)' }}>{p.mmr}</div>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div className="pb-eyebrow" style={{ fontSize: 9, letterSpacing: '0.14em', marginBottom: 5 }}>Preferred Positions</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {(p.prefPos || []).map(pos => (
            <span key={pos} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: '50%',
              background: POS_COLOR[pos] || 'var(--pb-faint)', color: '#0d1424',
              fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-condensed)',
            }}>{pos}</span>
          ))}
        </div>
      </div>
      {p.topHeroes && p.topHeroes.length > 0 && (
        <div>
          <div className="pb-eyebrow" style={{ fontSize: 9, letterSpacing: '0.14em', marginBottom: 4 }}>Top Heroes</div>
          <div style={{ fontSize: 12, color: 'var(--pb-muted)', lineHeight: 1.5 }}>
            {p.topHeroes.join(' · ')}
          </div>
        </div>
      )}
    </div>
  );
}

// Position monogram chip — colour-coded role indicator reused across the pool
// and roster cards.
function PosChip({ pos, size = 30 }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: 8,
      background: 'var(--pb-elevated)',
      border: `1px solid ${POS_COLOR[pos] || 'var(--pb-line)'}`,
      color: POS_COLOR[pos] || 'var(--pb-brass)',
      fontSize: size > 26 ? 14 : 12, fontWeight: 800, fontFamily: 'var(--font-condensed)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{pos}</span>
  );
}

// Pool player card — Press Box surface with the hover tooltip preserved. The
// tooltip also opens on keyboard focus (the inner PICK button bubbles
// focus/blur up to the card) so the reveal isn't hover-only.
function PoolCard({ p, onPick, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHover(false); }}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px',
        background: hover ? 'var(--pb-elevated)' : 'var(--pb-surface)',
        border: `1px solid ${hover ? 'color-mix(in srgb, var(--pb-brass) 45%, var(--pb-line))' : 'var(--pb-line)'}`,
        borderRadius: 8,
        transition: 'background 120ms, border-color 120ms',
      }}
    >
      <PosChip pos={p.pos} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600, color: 'var(--pb-text)' }}>{p.name}</div>
        <div style={{ fontSize: 12, color: 'var(--pb-faint)', fontFamily: 'var(--font-condensed)' }}>
          <span style={{ color: 'var(--pb-brass-bright)', fontWeight: 700 }}>{p.mmr}</span> MMR · {POS_LABEL[p.pos] || `Pos ${p.pos}`} · {p.flair}
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick(p.id)}
        aria-label={`Pick ${p.name}`}
        style={{
          padding: '7px 14px', borderRadius: 5, border: '1px solid var(--pb-brass)',
          background: disabled ? 'transparent' : 'var(--pb-amber)',
          color: disabled ? 'var(--pb-faint)' : '#0d1424',
          fontWeight: 700, fontSize: 12, letterSpacing: '0.08em',
          fontFamily: 'var(--font-condensed)', textTransform: 'uppercase',
          cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
        }}
      >
        Pick →
      </button>
      {hover && <PlayerHoverCard p={p} />}
    </div>
  );
}

// Roster row — picked player on a team column. Mirrors the Inhouse roster
// PlayerRow surface treatment.
function RosterRow({ p, accent }) {
  return (
    <div style={{
      position: 'relative',
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 12px 9px 14px',
      background: 'var(--pb-surface)',
      border: '1px solid var(--pb-line)',
      borderRadius: 6, marginBottom: 6,
    }}>
      <span aria-hidden="true" style={{
        position: 'absolute', left: 0, top: 9, bottom: 9, width: 2, borderRadius: 2,
        background: `linear-gradient(to bottom, transparent, ${accent} 30%, ${accent} 70%, transparent)`,
        opacity: 0.7,
      }} />
      <PosChip pos={p.pos} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 14, fontWeight: 600, color: 'var(--pb-text)' }}>{p.name}</div>
        <div style={{ fontSize: 11, color: 'var(--pb-faint)', fontFamily: 'var(--font-condensed)' }}>
          {POS_LABEL[p.pos] || `Pos ${p.pos}`} · {p.flair}
        </div>
      </div>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 700, color: 'var(--pb-brass-bright)' }}>{p.mmr}</span>
    </div>
  );
}

// Team roster column — brass/accent top-rule card with serif captain lockup,
// matching the Inhouse captain-draft RosterPanel.
function RosterPanel({ label, accent, captain, players, totalMmr }) {
  return (
    <div className="pb-card" style={{
      borderTop: `3px solid ${accent}`,
      padding: '14px 12px 12px',
      minHeight: 320,
    }}>
      <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--pb-line)' }}>
        <div className="pb-eyebrow" style={{ letterSpacing: '0.16em', color: accent }}>{label}</div>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 8, flexWrap: 'wrap', marginTop: 4,
        }}>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 700, color: 'var(--pb-text)',
            display: 'flex', alignItems: 'baseline', gap: 6,
          }}>
            <span style={{ color: accent }}>★</span>
            <span>{captain ? captain.name : '—'}</span>
            <span className="pb-eyebrow" style={{ fontSize: 9 }}>Captain</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 700, color: 'var(--pb-brass-bright)' }}>{totalMmr.toLocaleString()}</div>
            <div className="pb-eyebrow" style={{ fontSize: 9, color: 'var(--pb-faint)' }}>Total · {players.length}/5</div>
          </div>
        </div>
      </div>
      {players.length === 0
        ? <div style={{ color: 'var(--pb-faint)', fontSize: 13, fontStyle: 'italic', padding: '6px 4px' }}>No picks yet</div>
        : players.map(p => <RosterRow key={p.id} p={p} accent={accent} />)}
      {players.length > 0 && Array.from({ length: 5 - players.length }).map((_, i) => (
        <div key={`slot-${i}`} style={{
          padding: '9px 12px', borderRadius: 6, marginBottom: 6, fontSize: 11,
          color: 'var(--pb-faint)', fontStyle: 'italic', textAlign: 'center',
          border: '1px dashed var(--pb-line)', fontFamily: 'var(--font-condensed)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>Awaiting pick</div>
      ))}
    </div>
  );
}

export default function DraftSandbox() {
  const { isSuperuser } = useSuperuser();

  // pickHistory: [{ pickIdx, captain, playerId }]
  const [pickHistory, setPickHistory] = useState([]);
  const [captains, setCaptains] = useState({ c1: 1005, c2: 1010 }); // N0tail vs Fly

  const teamMap = useMemo(() => {
    const m = new Map();
    m.set(captains.c1, 1);
    m.set(captains.c2, 2);
    for (const h of pickHistory) m.set(h.playerId, h.captain);
    return m;
  }, [captains, pickHistory]);

  const c1 = PLACEHOLDER_PLAYERS.find(p => p.id === captains.c1);
  const c2 = PLACEHOLDER_PLAYERS.find(p => p.id === captains.c2);
  const team1 = PLACEHOLDER_PLAYERS.filter(p => teamMap.get(p.id) === 1);
  const team2 = PLACEHOLDER_PLAYERS.filter(p => teamMap.get(p.id) === 2);
  const pool = PLACEHOLDER_PLAYERS.filter(p => !teamMap.has(p.id));

  const pickIdx = pickHistory.length;
  const draftDone = pickIdx >= PICK_SEQUENCE.length;
  const onClock = draftDone ? null : PICK_SEQUENCE[pickIdx];

  function pick(playerId, asCaptain = onClock) {
    if (draftDone || !asCaptain) return;
    setPickHistory(h => [...h, { pickIdx: h.length, captain: asCaptain, playerId }]);
  }

  function autoPickNext() {
    if (draftDone || !onClock) return;
    // Greedy heuristic: pick the highest-MMR player still in the pool whose
    // position the picking team is missing. Falls back to highest MMR.
    const team = onClock === 1 ? team1 : team2;
    const have = new Set(team.map(p => p.pos));
    const sorted = [...pool].sort((a, b) => b.mmr - a.mmr);
    const target = sorted.find(p => !have.has(p.pos)) || sorted[0];
    if (target) pick(target.id, onClock);
  }

  function autoCompleteAll() {
    let h = [...pickHistory];
    let p = [...pool];
    let t1 = [...team1];
    let t2 = [...team2];
    while (h.length < PICK_SEQUENCE.length && p.length > 0) {
      const cap = PICK_SEQUENCE[h.length];
      const team = cap === 1 ? t1 : t2;
      const have = new Set(team.map(x => x.pos));
      const sorted = [...p].sort((a, b) => b.mmr - a.mmr);
      const target = sorted.find(x => !have.has(x.pos)) || sorted[0];
      h.push({ pickIdx: h.length, captain: cap, playerId: target.id });
      p = p.filter(x => x.id !== target.id);
      if (cap === 1) t1.push(target); else t2.push(target);
    }
    setPickHistory(h);
  }

  function reset() {
    setPickHistory([]);
  }

  function reroll() {
    // Pick two random captains, reset history.
    const shuffled = [...PLACEHOLDER_PLAYERS].sort(() => Math.random() - 0.5);
    setCaptains({ c1: shuffled[0].id, c2: shuffled[1].id });
    setPickHistory([]);
  }

  if (!isSuperuser) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', padding: 24, textAlign: 'center' }}>
        <h1>🚫 Admin only</h1>
        <p>The Draft Sandbox is a superuser-only diagnostic tool.</p>
        <Link to="/admin" className="btn btn-primary">Go to Admin Panel</Link>
      </div>
    );
  }

  const t1Mmr = team1.reduce((s, p) => s + p.mmr, 0);
  const t2Mmr = team2.reduce((s, p) => s + p.mmr, 0);
  const mmrDelta = Math.abs(t1Mmr - t2Mmr);
  const balanced = mmrDelta < 1500;

  const team1Label = 'Team 1 · Radiant';
  const team2Label = 'Team 2 · Dire';

  // Shared control-button style (condensed, outlined brass).
  const ctrlBtn = (extra = {}) => ({
    padding: '8px 14px', borderRadius: 5, border: '1px solid var(--pb-line)',
    background: 'var(--pb-surface)', color: 'var(--pb-brass)',
    fontFamily: 'var(--font-condensed)', fontWeight: 600, fontSize: 12,
    letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
    ...extra,
  });

  return (
    <div className="pb-inhouse" style={{ padding: 20, maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
        paddingBottom: 14,
        background:
          'linear-gradient(to right, var(--pb-brass), transparent 30%) bottom/100% 2px no-repeat,' +
          'linear-gradient(to right, var(--pb-line), var(--pb-line)) bottom/100% 1px no-repeat',
      }}>
        <div>
          <div className="pb-eyebrow" style={{ marginBottom: 6 }}>Admin Tooling · Captain Draft</div>
          <h1 className="pb-page-title" style={{ margin: 0, fontSize: '2.1rem' }}>Draft Sandbox</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/inhouse" style={ctrlBtn({ textDecoration: 'none', display: 'inline-block', borderColor: 'var(--pb-amber)', color: 'var(--pb-amber)' })}>
            Try the live flow →
          </Link>
          <Link to="/admin" style={ctrlBtn({ textDecoration: 'none', display: 'inline-block' })}>← Admin Panel</Link>
        </div>
      </div>

      <p style={{ color: 'var(--pb-muted)', fontSize: 14, margin: '14px 0 22px', maxWidth: 760 }}>
        Self-contained client-side simulator of the inhouse captain-pick draft. Ten placeholder players
        (modeled on real Dota 2 pros) walk through the standard <strong style={{ color: 'var(--pb-amber)' }}>1-2-2-2-1</strong> alternating
        pick order. <strong style={{ color: 'var(--pb-brass)' }}>Zero backend writes</strong> — nothing here touches the live lobby, database, or Steam bot.
      </p>

      {/* Status / turn strip */}
      <div className="pb-card" style={{
        borderTop: '3px solid var(--pb-brass)',
        padding: '14px 16px', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 14, flexWrap: 'wrap',
      }}>
        <div>
          <div className="pb-eyebrow">On the Clock</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700, color: 'var(--pb-text)', marginTop: 2 }}>
            Pick <span style={{ color: 'var(--pb-brass-bright)' }}>#{Math.min(pickIdx + 1, PICK_SEQUENCE.length)}</span>
            <span style={{ color: 'var(--pb-faint)', fontSize: 16 }}> / {PICK_SEQUENCE.length}</span>
          </div>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 200 }}>
          {draftDone ? (
            <>
              <div className="pb-eyebrow">Status</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 700, color: 'var(--pb-radiant)', marginTop: 2 }}>
                ✓ Draft complete
              </div>
            </>
          ) : (
            <>
              <div className="pb-eyebrow">Next to Pick</div>
              <div style={{
                fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 700, marginTop: 2,
                color: onClock === 1 ? 'var(--pb-radiant)' : 'var(--pb-dire)',
              }}>
                Captain {onClock} — {onClock === 1 ? c1?.name : c2?.name}
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={autoPickNext} disabled={draftDone} style={ctrlBtn({ opacity: draftDone ? 0.4 : 1, cursor: draftDone ? 'not-allowed' : 'pointer' })}>🤖 Auto-pick</button>
          <button type="button" onClick={autoCompleteAll} disabled={draftDone} style={ctrlBtn({ opacity: draftDone ? 0.4 : 1, cursor: draftDone ? 'not-allowed' : 'pointer' })}>⏩ Simulate</button>
          <button type="button" onClick={reroll} style={ctrlBtn()}>🎲 Reroll</button>
          <button type="button" onClick={reset} disabled={pickHistory.length === 0} style={ctrlBtn({ opacity: pickHistory.length === 0 ? 0.4 : 1, cursor: pickHistory.length === 0 ? 'not-allowed' : 'pointer' })}>↺ Reset</button>
        </div>
      </div>

      {/* MMR balance summary */}
      {(team1.length > 0 || team2.length > 0) && (
        <div className="pb-card" style={{
          borderTop: `3px solid ${balanced ? 'var(--pb-brass)' : 'var(--pb-amber)'}`,
          padding: '12px 16px', marginBottom: 16,
          display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'center',
        }}>
          <div style={{ borderLeft: '3px solid var(--pb-radiant)', paddingLeft: 10 }}>
            <div className="pb-eyebrow" style={{ fontSize: 10 }}>{team1Label}</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700, color: 'var(--pb-brass-bright)' }}>{t1Mmr.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="pb-eyebrow" style={{ fontSize: 10 }}>Difference</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 700, color: balanced ? 'var(--pb-radiant)' : 'var(--pb-amber)' }}>
              Δ {mmrDelta}
            </div>
            <div className="pb-eyebrow" style={{ fontSize: 9, color: balanced ? 'var(--pb-radiant)' : 'var(--pb-amber)' }}>
              {balanced ? 'Balanced' : 'Skewed'}
            </div>
          </div>
          <div style={{ borderRight: '3px solid var(--pb-dire)', paddingRight: 10, textAlign: 'right' }}>
            <div className="pb-eyebrow" style={{ fontSize: 10 }}>{team2Label}</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700, color: 'var(--pb-brass-bright)' }}>{t2Mmr.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Three-column board: roster · pool · roster */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 1fr) minmax(260px, 1.4fr) minmax(220px, 1fr)',
        gap: 14,
      }} className="inhouse-draft-board">
        <RosterPanel label={team1Label} accent="var(--pb-radiant)" captain={c1} players={team1} totalMmr={t1Mmr} />

        {/* Centre pool */}
        <div className="pb-card" style={{
          borderTop: '3px solid var(--pb-brass)',
          padding: '14px 12px 12px',
          minHeight: 320,
        }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--pb-line)',
          }}>
            <div>
              <div className="pb-eyebrow" style={{ letterSpacing: '0.16em' }}>The Pool</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 700, color: 'var(--pb-text)', marginTop: 2 }}>
                Available players
              </div>
            </div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 700, color: 'var(--pb-brass-bright)' }}>
              {pool.length}<span style={{ color: 'var(--pb-faint)', fontSize: 13, fontFamily: 'var(--font-condensed)' }}> left</span>
            </span>
          </div>
          {pool.length === 0
            ? <div style={{ color: 'var(--pb-faint)', fontSize: 13, fontStyle: 'italic', padding: '6px 4px', textAlign: 'center' }}>Pool is empty</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pool.map(p => (
                  <PoolCard key={p.id} p={p} disabled={draftDone} onPick={(id) => pick(id)} />
                ))}
              </div>}
        </div>

        <RosterPanel label={team2Label} accent="var(--pb-dire)" captain={c2} players={team2} totalMmr={t2Mmr} />
      </div>

      {/* Pick order reference */}
      <div className="pb-card" style={{
        borderTop: '3px solid var(--pb-brass)',
        padding: '14px 16px', marginTop: 16,
      }}>
        <div className="pb-eyebrow" style={{ marginBottom: 10 }}>Pick Order · 1-2-2-2-1</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PICK_SEQUENCE.map((c, i) => {
            const past = i < pickIdx;
            const current = i === pickIdx;
            const teamColor = c === 1 ? 'var(--pb-radiant)' : 'var(--pb-dire)';
            return (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 5, fontFamily: 'var(--font-condensed)',
                background: current ? 'var(--pb-amber)' : (past ? 'var(--pb-elevated)' : 'transparent'),
                color: current ? '#0d1424' : (past ? 'var(--pb-faint)' : teamColor),
                fontWeight: current ? 800 : 700, fontSize: 12, letterSpacing: '0.06em',
                border: `1px solid ${current ? 'var(--pb-amber)' : (past ? 'var(--pb-line)' : teamColor)}`,
                opacity: past ? 0.6 : 1,
              }}>
                #{i + 1} · C{c}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
