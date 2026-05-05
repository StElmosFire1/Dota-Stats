import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';

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

// Court & Pitch palette anchors (kept here as constants so colour decisions
// match the global brand without depending on the theme being loaded yet).
const CP = {
  inkNavy: '#0d1424',
  cardSurface: '#152036',
  brass: '#c5a975',
  amber: '#f59e0b',
  parchment: '#f5efe2',
  radiant: '#22c55e',
  dire: '#ef4444',
};
const FONT_DISPLAY = '"Playfair Display", Georgia, serif';
const FONT_CONDENSED = '"Oswald", "Inter", sans-serif';

const POS_COLOR = {
  '1': CP.amber,
  '2': CP.radiant,
  '3': CP.dire,
  '4': '#60a5fa',
  '5': '#a78bfa',
};

// Floating tooltip card shown on player hover. Renders absolutely positioned
// over the card itself so it appears next to whatever was hovered without
// needing portal mechanics. Uses pointerEvents:'none' so it doesn't steal
// hover state from the underlying card.
function PlayerHoverCard({ p }) {
  const winColor = p.winRate >= 60 ? CP.radiant : p.winRate >= 50 ? CP.amber : CP.dire;
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50,
      width: 280, padding: '12px 14px', borderRadius: 6,
      background: `linear-gradient(180deg, ${CP.cardSurface} 0%, ${CP.inkNavy} 100%)`,
      border: `1px solid ${CP.brass}`, borderLeft: `3px solid ${CP.amber}`,
      boxShadow: `0 8px 24px ${CP.inkNavy}cc, 0 0 0 1px ${CP.brass}33`,
      pointerEvents: 'none', fontFamily: FONT_CONDENSED, color: CP.parchment,
    }}>
      <div style={{
        fontSize: 10, color: CP.brass, letterSpacing: 2,
        borderBottom: `1px solid ${CP.brass}33`, paddingBottom: 6, marginBottom: 8,
      }}>
        ━ PLAYER STATS ━
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: CP.brass, letterSpacing: 1.2 }}>KDA RATIO</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: CP.amber }}>{p.kda.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: CP.brass, letterSpacing: 1.2 }}>WIN RATE</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: winColor }}>{p.winRate}%</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: CP.brass, letterSpacing: 1.2 }}>GAMES</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: CP.parchment }}>{p.games}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: CP.brass, letterSpacing: 1.2 }}>MMR</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: CP.parchment }}>{p.mmr}</div>
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: CP.brass, letterSpacing: 1.2, marginBottom: 4 }}>PREFERRED POSITIONS</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {(p.prefPos || []).map(pos => (
            <span key={pos} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: '50%',
              background: POS_COLOR[pos] || '#888', color: CP.inkNavy,
              fontSize: 11, fontWeight: 800,
            }}>{pos}</span>
          ))}
        </div>
      </div>
      {p.topHeroes && p.topHeroes.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: CP.brass, letterSpacing: 1.2, marginBottom: 3 }}>TOP HEROES</div>
          <div style={{ fontSize: 12, color: CP.parchment, fontFamily: '"Inter", sans-serif', lineHeight: 1.4 }}>
            {p.topHeroes.join(' · ')}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerCard({ p, onPick, disabled, picked, team }) {
  const [hover, setHover] = useState(false);
  const teamColor = team === 1 ? CP.radiant
                  : team === 2 ? CP.dire
                  : `${CP.brass}55`;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
      position: 'relative',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 6,
      background: `linear-gradient(180deg, ${CP.cardSurface} 0%, ${CP.inkNavy} 100%)`,
      border: `1px solid ${hover ? CP.amber : teamColor}`,
      borderLeft: `3px solid ${hover ? CP.amber : teamColor}`,
      opacity: picked && !team ? 0.4 : 1,
      transition: 'transform 100ms, border-color 100ms',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: POS_COLOR[p.pos] || '#888',
        color: CP.inkNavy, fontWeight: 800, fontSize: 14, fontFamily: FONT_CONDENSED,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 0 2px ${CP.cardSurface}, 0 0 0 3px ${POS_COLOR[p.pos] || '#888'}66`,
      }}>{p.pos}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: CP.parchment, letterSpacing: 0.3 }}>{p.name}</div>
        <div style={{ fontSize: 12, color: `${CP.brass}cc`, fontFamily: FONT_CONDENSED, letterSpacing: 0.5 }}>
          <span style={{ color: CP.amber, fontWeight: 700 }}>{p.mmr}</span>
          <span style={{ opacity: 0.5 }}> MMR · </span>
          <span style={{ fontFamily: 'inherit' }}>{p.flair}</span>
        </div>
      </div>
      {team ? (
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 3,
          background: teamColor, color: CP.inkNavy, fontFamily: FONT_CONDENSED, letterSpacing: 1.5,
        }}>
          TEAM {team}
        </span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPick(p.id)}
          style={{
            padding: '6px 14px', borderRadius: 4, border: `1px solid ${CP.brass}`,
            background: disabled ? 'transparent' : `linear-gradient(180deg, ${CP.brass} 0%, #a08858 100%)`,
            color: disabled ? `${CP.brass}66` : CP.inkNavy,
            fontWeight: 800, fontSize: 12, letterSpacing: 1, fontFamily: FONT_CONDENSED,
            cursor: disabled ? 'not-allowed' : 'pointer', textTransform: 'uppercase',
          }}
        >
          PICK →
        </button>
      )}
      {hover && <PlayerHoverCard p={p} />}
    </div>
  );
}

function TeamColumn({ label, color, captain, players, totalMmr }) {
  return (
    <div style={{
      flex: 1, minWidth: 260,
      background: `linear-gradient(180deg, ${CP.cardSurface} 0%, ${CP.inkNavy} 100%)`,
      borderRadius: 8, padding: 0, border: `1px solid ${color}`,
      boxShadow: `inset 0 1px 0 ${CP.brass}33`,
      overflow: 'hidden',
    }}>
      {/* Heraldic header band */}
      <div style={{
        background: `linear-gradient(90deg, ${color}33 0%, transparent 100%)`,
        borderBottom: `1px solid ${color}66`,
        padding: '10px 14px',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color, letterSpacing: 2.5,
          textAlign: 'center', fontFamily: FONT_CONDENSED, textTransform: 'uppercase',
        }}>
          ━ {label} ━
        </div>
        <div style={{
          marginTop: 4, fontSize: 22, fontWeight: 800, color: CP.parchment,
          textAlign: 'center', fontFamily: FONT_CONDENSED, letterSpacing: 1,
        }}>
          {players.length}<span style={{ color: `${CP.brass}88`, fontSize: 16 }}> / 5</span>
        </div>
      </div>

      {/* Captain row */}
      <div style={{
        padding: '8px 14px', borderBottom: `1px solid ${CP.brass}22`,
        background: `${CP.inkNavy}88`,
      }}>
        <div style={{ fontSize: 10, color: CP.brass, letterSpacing: 1.5, fontFamily: FONT_CONDENSED }}>
          ⚜ CAPTAIN
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: CP.parchment }}>
          {captain ? captain.name : '—'}
          {captain && (
            <span style={{ marginLeft: 8, fontSize: 11, color: `${CP.brass}aa`, fontFamily: FONT_CONDENSED }}>
              {captain.mmr} MMR
            </span>
          )}
        </div>
      </div>

      {/* Roster */}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {players.map(p => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', borderRadius: 4,
            background: `${CP.cardSurface}cc`,
            borderLeft: `2px solid ${POS_COLOR[p.pos] || '#888'}`,
            fontSize: 13,
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: POS_COLOR[p.pos] || '#888', color: CP.inkNavy,
              fontSize: 11, fontWeight: 800, fontFamily: FONT_CONDENSED,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{p.pos}</span>
            <span style={{ flex: 1, color: CP.parchment }}>{p.name}</span>
            <span style={{ fontSize: 12, color: CP.amber, fontFamily: FONT_CONDENSED, fontWeight: 700 }}>{p.mmr}</span>
          </div>
        ))}
        {Array.from({ length: 5 - players.length }).map((_, i) => (
          <div key={`slot-${i}`} style={{
            padding: '7px 10px', borderRadius: 4, fontSize: 11,
            color: `${CP.brass}55`, fontStyle: 'italic', textAlign: 'center',
            border: `1px dashed ${CP.brass}33`, fontFamily: FONT_CONDENSED, letterSpacing: 1,
          }}>· EMPTY SLOT ·</div>
        ))}
      </div>

      {/* MMR footer */}
      {players.length > 0 && (
        <div style={{
          padding: '8px 14px', borderTop: `1px solid ${CP.brass}22`,
          background: `${CP.inkNavy}cc`, textAlign: 'center',
          fontFamily: FONT_CONDENSED, letterSpacing: 2,
        }}>
          <span style={{ fontSize: 10, color: CP.brass }}>TOTAL MMR </span>
          <span style={{ fontSize: 16, fontWeight: 800, color: CP.amber }}>{totalMmr}</span>
        </div>
      )}
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

  const btn = (extra = {}) => ({
    padding: '8px 14px', borderRadius: 4, border: `1px solid ${CP.brass}`,
    background: 'transparent', color: CP.brass,
    fontFamily: FONT_CONDENSED, fontWeight: 700, fontSize: 12,
    letterSpacing: 1.2, textTransform: 'uppercase', cursor: 'pointer',
    ...extra,
  });

  return (
    <div style={{
      maxWidth: 1280, margin: '0 auto', padding: '28px 16px 40px',
      background: CP.inkNavy, minHeight: '100vh', color: CP.parchment,
    }}>
      {/* Header band — heraldic */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 8,
        paddingBottom: 14, borderBottom: `1px solid ${CP.brass}55`,
      }}>
        <div>
          <div style={{
            fontSize: 11, color: CP.brass, letterSpacing: 4,
            fontFamily: FONT_CONDENSED, fontWeight: 700,
          }}>
            ⚔ OCE INHOUSE · ADMIN TOOLING
          </div>
          <h1 style={{
            margin: '4px 0 0', fontSize: 36, fontFamily: FONT_DISPLAY,
            color: CP.parchment, letterSpacing: 0.5, fontWeight: 700,
          }}>
            Draft Sandbox
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/inhouse" style={btn({ textDecoration: 'none', display: 'inline-block', borderColor: CP.amber, color: CP.amber })}>
            Try the live flow →
          </Link>
          <Link to="/admin" style={btn({ textDecoration: 'none', display: 'inline-block' })}>← Admin Panel</Link>
        </div>
      </div>

      <p style={{ color: `${CP.parchment}99`, fontSize: 14, marginTop: 14, marginBottom: 22, maxWidth: 760 }}>
        Self-contained client-side simulator of the inhouse captain-pick draft. Ten placeholder players
        (modeled on real Dota 2 pros) walk through the standard <strong style={{ color: CP.amber }}>1-2-2-2-1</strong> alternating
        pick order. <strong style={{ color: CP.brass }}>Zero backend writes</strong> — nothing here touches the live lobby, database, or Steam bot.
      </p>

      {/* Status bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
        padding: '14px 18px', marginBottom: 22, borderRadius: 6,
        background: `linear-gradient(180deg, ${CP.cardSurface} 0%, ${CP.inkNavy} 100%)`,
        border: `1px solid ${CP.brass}55`, borderLeft: `4px solid ${CP.amber}`,
      }}>
        <div style={{ fontFamily: FONT_CONDENSED }}>
          <div style={{ fontSize: 10, color: CP.brass, letterSpacing: 1.5 }}>ON THE CLOCK</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: CP.parchment, letterSpacing: 1 }}>
            PICK <span style={{ color: CP.amber }}>#{Math.min(pickIdx + 1, PICK_SEQUENCE.length)}</span>
            <span style={{ color: `${CP.brass}66`, fontSize: 16 }}> / {PICK_SEQUENCE.length}</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200, paddingLeft: 14, borderLeft: `1px solid ${CP.brass}33` }}>
          {draftDone ? (
            <div>
              <div style={{ fontSize: 10, color: CP.brass, letterSpacing: 1.5, fontFamily: FONT_CONDENSED }}>STATUS</div>
              <div style={{ fontSize: 18, color: CP.radiant, fontWeight: 700, fontFamily: FONT_CONDENSED, letterSpacing: 1 }}>
                ✓ DRAFT COMPLETE
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, color: CP.brass, letterSpacing: 1.5, fontFamily: FONT_CONDENSED }}>NEXT TO PICK</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: onClock === 1 ? CP.radiant : CP.dire, fontFamily: FONT_CONDENSED, letterSpacing: 1 }}>
                CAPTAIN {onClock} — {onClock === 1 ? c1?.name : c2?.name}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={autoPickNext} disabled={draftDone} style={btn({ opacity: draftDone ? 0.4 : 1, cursor: draftDone ? 'not-allowed' : 'pointer' })}>🤖 Auto-pick</button>
          <button onClick={autoCompleteAll} disabled={draftDone} style={btn({ opacity: draftDone ? 0.4 : 1, cursor: draftDone ? 'not-allowed' : 'pointer' })}>⏩ Simulate</button>
          <button onClick={reroll} style={btn()}>🎲 Reroll</button>
          <button onClick={reset} disabled={pickHistory.length === 0} style={btn({ opacity: pickHistory.length === 0 ? 0.4 : 1, cursor: pickHistory.length === 0 ? 'not-allowed' : 'pointer' })}>↺ Reset</button>
        </div>
      </div>

      {/* Teams */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
        <TeamColumn label="TEAM 1 · RADIANT" color={CP.radiant} captain={c1} players={team1} totalMmr={t1Mmr} />
        <TeamColumn label="TEAM 2 · DIRE"    color={CP.dire}    captain={c2} players={team2} totalMmr={t2Mmr} />
      </div>

      {/* MMR balance summary */}
      {(team1.length > 0 || team2.length > 0) && (
        <div style={{
          padding: '12px 18px', marginBottom: 22, borderRadius: 6,
          background: `linear-gradient(180deg, ${CP.cardSurface} 0%, ${CP.inkNavy} 100%)`,
          border: `1px solid ${balanced ? CP.brass : CP.amber}66`,
          display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center',
          fontFamily: FONT_CONDENSED,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10, color: CP.brass, letterSpacing: 1.5 }}>TEAM 1</span>
            <span style={{ fontSize: 20, color: CP.radiant, fontWeight: 800 }}>{t1Mmr}</span>
          </div>
          <div style={{ fontSize: 26, color: `${CP.brass}66`, fontWeight: 300 }}>vs</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10, color: CP.brass, letterSpacing: 1.5 }}>TEAM 2</span>
            <span style={{ fontSize: 20, color: CP.dire, fontWeight: 800 }}>{t2Mmr}</span>
          </div>
          <div style={{ flex: 1, paddingLeft: 18, borderLeft: `1px solid ${CP.brass}33` }}>
            <span style={{ fontSize: 10, color: CP.brass, letterSpacing: 1.5 }}>DIFFERENCE</span>
            <div style={{ fontSize: 22, fontWeight: 800, color: balanced ? CP.radiant : CP.amber, letterSpacing: 1 }}>
              Δ {mmrDelta} MMR
              <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, letterSpacing: 2, opacity: 0.8 }}>
                {balanced ? '· BALANCED' : '· SKEWED'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Pool */}
      <div style={{
        marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${CP.brass}33`,
        display: 'flex', alignItems: 'baseline', gap: 12, justifyContent: 'space-between',
      }}>
        <h2 style={{
          margin: 0, fontSize: 14, color: CP.brass, letterSpacing: 3,
          fontFamily: FONT_CONDENSED, fontWeight: 700,
        }}>
          ━ AVAILABLE POOL ━
        </h2>
        <span style={{ fontSize: 18, color: CP.amber, fontWeight: 800, fontFamily: FONT_CONDENSED }}>
          {pool.length}<span style={{ color: `${CP.brass}66`, fontSize: 14 }}> remaining</span>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
        {pool.map(p => (
          <PlayerCard key={p.id} p={p} picked={false} team={null}
            disabled={draftDone} onPick={(id) => pick(id)} />
        ))}
        {pool.length === 0 && (
          <div style={{
            padding: 18, textAlign: 'center', color: `${CP.brass}88`,
            fontStyle: 'italic', fontFamily: FONT_CONDENSED, letterSpacing: 1.5,
          }}>· POOL IS EMPTY ·</div>
        )}
      </div>

      {/* Pick order reference */}
      <div style={{
        marginTop: 28, padding: '14px 18px', borderRadius: 6,
        background: `linear-gradient(180deg, ${CP.cardSurface} 0%, ${CP.inkNavy} 100%)`,
        border: `1px solid ${CP.brass}55`,
      }}>
        <div style={{
          fontSize: 10, color: CP.brass, letterSpacing: 2.5, fontFamily: FONT_CONDENSED,
          fontWeight: 700, marginBottom: 8,
        }}>
          ━ PICK ORDER (1-2-2-2-1) ━
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PICK_SEQUENCE.map((c, i) => {
            const past = i < pickIdx;
            const current = i === pickIdx;
            return (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 4, fontFamily: FONT_CONDENSED,
                background: current ? CP.amber : (past ? `${CP.cardSurface}` : 'transparent'),
                color: current ? CP.inkNavy : (past ? `${CP.parchment}55` : (c === 1 ? CP.radiant : CP.dire)),
                fontWeight: current ? 800 : 700, fontSize: 12, letterSpacing: 1,
                border: `1px solid ${current ? CP.amber : (c === 1 ? CP.radiant : CP.dire)}66`,
                opacity: past ? 0.5 : 1,
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
