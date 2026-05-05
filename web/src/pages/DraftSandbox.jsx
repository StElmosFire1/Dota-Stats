import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';

const PLACEHOLDER_PLAYERS = [
  { id: 1001, name: 'Miracle-',     mmr: 8200, pos: '1', flair: 'Carry GOAT' },
  { id: 1002, name: 'Topson',       mmr: 7950, pos: '2', flair: 'Mid lord' },
  { id: 1003, name: 'Ceb',          mmr: 7100, pos: '3', flair: 'Off-lane bruiser' },
  { id: 1004, name: 'JerAx',        mmr: 6900, pos: '4', flair: 'Roamer' },
  { id: 1005, name: 'N0tail',       mmr: 7400, pos: '5', flair: 'Captain' },
  { id: 1006, name: 'Arteezy',      mmr: 8050, pos: '1', flair: 'Mr. Farm' },
  { id: 1007, name: 'SumaiL',       mmr: 7800, pos: '2', flair: 'King of Mid' },
  { id: 1008, name: 'Universe',     mmr: 6800, pos: '3', flair: '6m Echo' },
  { id: 1009, name: 'Cr1t-',        mmr: 6700, pos: '4', flair: 'Vision king' },
  { id: 1010, name: 'Fly',          mmr: 7000, pos: '5', flair: 'Captain' },
];

// Captain pick order for a 1-2-2-2-1 alternating format (8 picks total).
// Index: 0..7 — value: which captain picks (1 or 2).
const PICK_SEQUENCE = [1, 2, 2, 1, 1, 2, 2, 1];

const POS_COLOR = {
  '1': '#f59e0b',
  '2': '#22c55e',
  '3': '#ef4444',
  '4': '#60a5fa',
  '5': '#a78bfa',
};

function PlayerCard({ p, onPick, disabled, picked, team }) {
  const teamColor = team === 1 ? 'var(--radiant-color, #22c55e)'
                  : team === 2 ? 'var(--dire-color, #ef4444)'
                  : 'var(--border)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 8,
      background: 'var(--bg-card)',
      border: `1px solid ${teamColor}`,
      opacity: picked && !team ? 0.4 : 1,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: POS_COLOR[p.pos] || '#888',
        color: '#000', fontWeight: 800, fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{p.pos}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {p.mmr} MMR · {p.flair}
        </div>
      </div>
      {team ? (
        <span style={{
          fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 4,
          background: teamColor, color: '#000',
        }}>
          TEAM {team}
        </span>
      ) : (
        <button className="btn btn-sm" disabled={disabled} onClick={() => onPick(p.id)}>
          Pick →
        </button>
      )}
    </div>
  );
}

function TeamColumn({ label, color, captain, players }) {
  return (
    <div style={{
      flex: 1, minWidth: 240, background: 'var(--bg-card)',
      borderRadius: 10, padding: 14, border: `2px solid ${color}`,
    }}>
      <div style={{
        fontSize: 13, fontWeight: 800, color, letterSpacing: 1,
        marginBottom: 10, textAlign: 'center',
      }}>
        {label} ({players.length}/5)
      </div>
      <div style={{
        padding: '6px 8px', marginBottom: 8, borderRadius: 6,
        background: 'rgba(255,255,255,0.04)', fontSize: 12,
      }}>
        <strong>Captain:</strong> {captain ? captain.name : '—'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {players.map(p => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', borderRadius: 6,
            background: 'rgba(255,255,255,0.03)', fontSize: 13,
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%',
              background: POS_COLOR[p.pos] || '#888', color: '#000',
              fontSize: 11, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{p.pos}</span>
            <span style={{ flex: 1 }}>{p.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.mmr}</span>
          </div>
        ))}
        {Array.from({ length: 5 - players.length }).map((_, i) => (
          <div key={`slot-${i}`} style={{
            padding: '6px 8px', borderRadius: 6, fontSize: 12,
            color: 'var(--text-muted)', fontStyle: 'italic',
            background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)',
          }}>empty slot</div>
        ))}
      </div>
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

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>🎮 Draft Sandbox</h1>
        <Link to="/admin" className="btn btn-sm">← Back to Admin Panel</Link>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        Self-contained client-side simulator of the inhouse captain-pick draft. Uses 10 placeholder
        players (modeled on real Dota 2 pros) and the standard <strong>1-2-2-2-1</strong> alternating
        pick order. <strong>No backend writes</strong>: nothing here touches the live lobby, database,
        or Steam bot — purely for verifying the UX, the pick-order logic, and what an in-progress
        draft looks like end-to-end.
      </p>

      {/* Status bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
        padding: '12px 14px', marginBottom: 18, borderRadius: 8,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
      }}>
        <div>
          <strong>Pick #{Math.min(pickIdx + 1, PICK_SEQUENCE.length)}</strong> of {PICK_SEQUENCE.length}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          {draftDone ? (
            <span style={{ color: '#22c55e', fontWeight: 700 }}>✓ Draft complete</span>
          ) : (
            <span>
              <strong style={{ color: onClock === 1 ? 'var(--radiant-color, #22c55e)' : 'var(--dire-color, #ef4444)' }}>
                Captain {onClock} on the clock
              </strong>
              {' — '}
              {onClock === 1 ? c1?.name : c2?.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={autoPickNext} disabled={draftDone}>🤖 Auto-pick next</button>
          <button className="btn btn-sm" onClick={autoCompleteAll} disabled={draftDone}>⏩ Simulate to end</button>
          <button className="btn btn-sm" onClick={reroll}>🎲 Reroll captains</button>
          <button className="btn btn-sm" onClick={reset} disabled={pickHistory.length === 0}>↺ Reset picks</button>
        </div>
      </div>

      {/* Teams */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <TeamColumn label="TEAM 1 (Radiant)" color="var(--radiant-color, #22c55e)" captain={c1} players={team1} />
        <TeamColumn label="TEAM 2 (Dire)"    color="var(--dire-color, #ef4444)"    captain={c2} players={team2} />
      </div>

      {/* MMR balance summary */}
      {(team1.length > 0 || team2.length > 0) && (
        <div style={{
          padding: '10px 14px', marginBottom: 18, borderRadius: 8,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13,
        }}>
          <span><strong>Team 1 total MMR:</strong> {t1Mmr}</span>
          <span><strong>Team 2 total MMR:</strong> {t2Mmr}</span>
          <span style={{ color: Math.abs(t1Mmr - t2Mmr) < 1500 ? '#22c55e' : '#f59e0b' }}>
            <strong>Δ:</strong> {Math.abs(t1Mmr - t2Mmr)} MMR
            {Math.abs(t1Mmr - t2Mmr) < 1500 ? ' (balanced)' : ' (skewed)'}
          </span>
        </div>
      )}

      {/* Pool */}
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Available pool ({pool.length})</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
        {pool.map(p => (
          <PlayerCard
            key={p.id}
            p={p}
            picked={false}
            team={null}
            disabled={draftDone}
            onPick={(id) => pick(id)}
          />
        ))}
        {pool.length === 0 && (
          <div style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Pool is empty.
          </div>
        )}
      </div>

      {/* Pick order reference */}
      <div style={{ marginTop: 24, padding: 12, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
        <strong>Pick order:</strong>{' '}
        {PICK_SEQUENCE.map((c, i) => (
          <span key={i} style={{
            display: 'inline-block', padding: '2px 6px', margin: '0 3px', borderRadius: 4,
            background: i < pickIdx ? 'rgba(255,255,255,0.06)' : (i === pickIdx ? 'var(--accent)' : 'transparent'),
            color: i === pickIdx ? '#000' : (c === 1 ? 'var(--radiant-color, #22c55e)' : 'var(--dire-color, #ef4444)'),
            fontWeight: i === pickIdx ? 800 : 600,
            border: '1px solid var(--border)',
          }}>
            #{i + 1} → C{c}
          </span>
        ))}
      </div>
    </div>
  );
}
