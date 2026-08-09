import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { simulateDraftPick, saveDraftTrainerRun, getDraftTrainerAccuracy } from '../api';
import { getHeroName, getHeroImageUrl, ALL_HERO_IDS } from '../heroNames';
import { formatHeroName } from '../utils/heroes';
import { useSteamAuth } from '../context/SteamAuthContext';

// Task #409 — captain-draft simulator. The user picks one side ("A");
// the engine picks/bans for the other side using the existing counter
// scorer. CM-style sequence: 7 bans → 4 picks → 4 bans → 4 picks →
// 3 bans → 2 picks. Side A always acts first per phase (we don't
// model the radiant/dire coin flip — the side label is purely the
// user's). At the end we score the matchup using the same counter
// engine and persist the run so we can roll up accuracy on the user
// profile when the same draft is observed in a real match.

const SEQUENCE = [
  { action: 'ban', side: 'A' }, { action: 'ban', side: 'B' },
  { action: 'ban', side: 'A' }, { action: 'ban', side: 'B' },
  { action: 'ban', side: 'A' }, { action: 'ban', side: 'B' },
  { action: 'ban', side: 'A' },
  { action: 'pick', side: 'A' }, { action: 'pick', side: 'B' },
  { action: 'pick', side: 'B' }, { action: 'pick', side: 'A' },
  { action: 'ban', side: 'A' }, { action: 'ban', side: 'B' },
  { action: 'ban', side: 'A' }, { action: 'ban', side: 'B' },
  { action: 'pick', side: 'A' }, { action: 'pick', side: 'B' },
  { action: 'pick', side: 'B' }, { action: 'pick', side: 'A' },
  { action: 'ban', side: 'A' }, { action: 'ban', side: 'B' },
  { action: 'ban', side: 'A' },
  { action: 'pick', side: 'A' }, { action: 'pick', side: 'B' },
];

const POS_SLOTS = [1, 2, 3, 4, 5];

// Only real, mapped heroes — enumerating raw 1..145 produced "Hero #115"
// ghosts for IDs Valve never assigned (and imageless buttons).
const ALL_HEROES = ALL_HERO_IDS;

export default function DraftTrainer() {
  const { steamUser } = useSteamAuth();
  const accountId = steamUser?.accountId;
  const [userSide, setUserSide] = useState('A');
  const [step, setStep] = useState(0);
  const [picksA, setPicksA] = useState([]);
  const [picksB, setPicksB] = useState([]);
  const [bans, setBans] = useState([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [advantage, setAdvantage] = useState(null);
  const [explanation, setExplanation] = useState('');
  const [accuracy, setAccuracy] = useState(null);
  const [saveMsg, setSaveMsg] = useState('');

  const phase = SEQUENCE[step];
  // Bans are stored side-attributed ({ side, heroId }) so the UI can show who
  // banned what; engine/save calls flatten to plain hero ids.
  const banIds = useMemo(() => bans.map((b) => b.heroId), [bans]);
  const used = useMemo(
    () => new Set([...picksA, ...picksB, ...banIds]),
    [picksA, picksB, banIds]
  );

  const loadAccuracy = useCallback(() => {
    if (!accountId) return;
    getDraftTrainerAccuracy(accountId).then(setAccuracy).catch(() => {});
  }, [accountId]);

  useEffect(() => { loadAccuracy(); }, [loadAccuracy]);

  // When it's the engine's turn, request a pick automatically.
  useEffect(() => {
    if (done || !phase) return;
    if (phase.side === userSide) return;
    setBusy(true);
    const engineSide = phase.side;
    const myPicks = engineSide === 'A' ? picksA : picksB;
    const oppPicks = engineSide === 'A' ? picksB : picksA;
    // The engine's "position" slot for picks = number of picks already
    // committed on its side (1..5).
    const position = phase.action === 'pick' ? POS_SLOTS[Math.min(myPicks.length, 4)] : null;
    simulateDraftPick({
      allies: oppPicks,        // from server POV "allies" = the *requestor's* allies, which is the user
      enemies: myPicks,
      bans: Array.from(used),
      action: phase.action,
      position,
    }).then((res) => {
      const heroId = res?.pick?.hero_id;
      if (!heroId) { advance(null, phase); return; }
      commit(engineSide, phase.action, heroId);
    }).catch(() => {
      // On failure pick a random unused legal hero so the trainer never wedges.
      const candidate = ALL_HEROES.find((h) => !used.has(h));
      if (candidate) commit(engineSide, phase.action, candidate);
    }).finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, userSide, done]);

  function commit(side, action, heroId) {
    if (action === 'ban') {
      setBans((b) => [...b, { side, heroId }]);
    } else if (side === 'A') {
      setPicksA((p) => [...p, heroId]);
    } else {
      setPicksB((p) => [...p, heroId]);
    }
    setStep((s) => s + 1);
  }

  function advance() {
    setStep((s) => s + 1);
  }

  function onUserPick(heroId) {
    if (busy || done) return;
    if (!phase || phase.side !== userSide) return;
    if (used.has(heroId)) return;
    commit(userSide, phase.action, heroId);
  }

  // Finalise — score advantage + persist.
  useEffect(() => {
    if (step < SEQUENCE.length || done) return;
    setDone(true);
    // Score advantage by asking the engine to evaluate the opposing
    // composition from the user's POV (counter scoring of user's picks
    // vs enemy picks). We use the average counter WR of user heroes
    // against the enemy line-up as the predictor.
    (async () => {
      const userPicks = userSide === 'A' ? picksA : picksB;
      const enemyPicks = userSide === 'A' ? picksB : picksA;
      try {
        const res = await simulateDraftPick({
          allies: enemyPicks,   // we ask "what counters the enemy lineup"
          enemies: [],
          bans: Array.from(used),
          action: 'pick',
        });
        // Score: how often do hypothetical counters into the enemy
        // line-up out-perform 50%? Sample the top-5 alternatives and
        // compare against the average counter WR of the user's actual
        // picks (computed separately).
        const top = [res?.pick, ...(res?.alternatives || [])].filter(Boolean);
        const baselineWr = top.length > 0
          ? top.reduce((s, t) => s + (t.counter_wr || t.base_wr || 0.5), 0) / top.length
          : 0.5;
        // Average base WR of user's actual heroes vs the same enemies.
        const userRes = await simulateDraftPick({
          allies: enemyPicks,
          enemies: [],
          bans: Array.from(used).concat(userPicks),
          action: 'pick',
        });
        const userBaseline = userRes?.pick?.counter_wr || userRes?.pick?.base_wr || 0.5;
        // Advantage = (your-team WR estimate) − (best-available WR baseline).
        // Range roughly [-0.3, +0.3]; we clamp & rescale to [-1, +1].
        const adv = Math.max(-1, Math.min(1, (userBaseline - baselineWr) * 4));
        setAdvantage(adv);
        const verdict = adv > 0.15 ? 'strong favourite' : adv > 0.04 ? 'slight edge' : adv > -0.04 ? 'coin flip' : adv > -0.15 ? 'slight underdog' : 'underdog';
        setExplanation(`Counter-WR estimate of your line-up vs the enemy is ${(userBaseline*100).toFixed(0)}% (best legal counter set averages ${(baselineWr*100).toFixed(0)}%). Verdict: ${verdict}.`);
        if (accountId) {
          try {
            await saveDraftTrainerRun({
              side: userSide,
              picksA, picksB, bans: banIds,
              predictedAdvantage: adv,
            });
            setSaveMsg('Saved — accuracy will update when a real match with this draft is recorded.');
            loadAccuracy();
          } catch (e) {
            setSaveMsg(e.message || 'Save failed');
          }
        } else {
          setSaveMsg('Sign in with Steam to save runs and track accuracy.');
        }
      } catch (_) {
        setAdvantage(0);
        setExplanation('Could not score the draft.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function reset() {
    setStep(0); setPicksA([]); setPicksB([]); setBans([]);
    setDone(false); setAdvantage(null); setExplanation(''); setSaveMsg('');
  }

  const filteredHeroes = ALL_HEROES.filter((h) => {
    if (used.has(h)) return false;
    if (!search.trim()) return true;
    const name = getHeroName(h);
    return formatHeroName(name).toLowerCase().includes(search.toLowerCase());
  });

  const yourTurn = !done && phase && phase.side === userSide;

  return (
    <div>
      <h1 className="page-title">Draft Trainer</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Captain-draft simulator. You play one side, the engine picks the other using the counter-pick scorer.
        Finish the draft to see the predicted advantage and explanation. Signed-in runs persist and accuracy is
        graded whenever the same draft appears in a real inhouse match.
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', margin: 0 }}>
          <legend style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }}>Your side</legend>
          <label style={{ marginRight: 12 }}>
            <input type="radio" name="side" value="A" checked={userSide === 'A'} onChange={() => { setUserSide('A'); reset(); }} disabled={step > 0 && !done} /> Side A
          </label>
          <label>
            <input type="radio" name="side" value="B" checked={userSide === 'B'} onChange={() => { setUserSide('B'); reset(); }} disabled={step > 0 && !done} /> Side B
          </label>
        </fieldset>
        <button type="button" onClick={reset} style={btnStyle}>↺ Reset draft</button>
        {accuracy && accuracy.matched > 0 && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Your rolling accuracy: <strong style={{ color: 'var(--gold, #c5a975)' }}>{(accuracy.accuracy * 100).toFixed(0)}%</strong> over {accuracy.matched} graded run{accuracy.matched === 1 ? '' : 's'}.
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <SidePanel label={`Side A${userSide === 'A' ? ' (you)' : ' (engine)'}`} picks={picksA} accent="#4ade80" />
        <SidePanel label={`Side B${userSide === 'B' ? ' (you)' : ' (engine)'}`} picks={picksB} accent="#60a5fa" />
      </div>

      <BansPanel bans={bans} userSide={userSide} />

      {/* `phase` is undefined for one render between the last commit and the
          completion effect flipping `done` — guard it or the page crashes. */}
      {!done && phase && (
        <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            Step {step + 1} of {SEQUENCE.length} — {phase.side === userSide ? 'your' : 'engine'} {phase.action}.
            {busy && phase.side !== userSide && <span style={{ marginLeft: 8, color: 'var(--gold, #c5a975)' }}>engine thinking…</span>}
          </p>
          {yourTurn && (
            <div style={{ marginTop: 10 }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search hero…"
                aria-label="Search heroes to pick"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', marginBottom: 10, width: 220 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {filteredHeroes.map((h) => {
                  const img = getHeroImageUrl(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => onUserPick(h)}
                      aria-label={`${phase.action} ${formatHeroName(getHeroName(h))}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-primary)', fontSize: 12, textAlign: 'left' }}
                    >
                      {img && <img src={img} alt="" style={{ width: 28, height: 16, borderRadius: 2 }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatHeroName(getHeroName(h))}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {done && (
        <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--gold, #c5a975)', borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Verdict</h2>
          <p style={{ fontSize: 28, fontWeight: 700, margin: '6px 0', color: advantage > 0 ? '#4ade80' : advantage < 0 ? '#f87171' : 'var(--text-primary)' }}>
            {advantage == null ? '—' : `${advantage > 0 ? '+' : ''}${(advantage * 100).toFixed(0)}`}
            {advantage != null && <span style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 6 }}>predicted advantage</span>}
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{explanation}</p>
          {saveMsg && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{saveMsg}</p>}
        </div>
      )}
    </div>
  );
}

function SidePanel({ label, picks, accent }) {
  return (
    <div style={{ padding: 10, background: 'var(--bg-card)', border: `1px solid ${accent}`, borderRadius: 8 }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: 14, color: accent }}>{label}</h3>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 40 }}>
        {picks.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No picks yet.</span>}
        {picks.map((h, i) => {
          const img = getHeroImageUrl(h);
          return (
            <div key={`${h}-${i}`} title={formatHeroName(getHeroName(h))} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              {img && <img src={img} alt={getHeroName(h)} style={{ width: 56, height: 32, borderRadius: 3 }} />}
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Pos {i + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Side-attributed bans: two labelled rows (matching the pick panels' colors)
// so it's always clear who removed which hero.
function BansPanel({ bans, userSide }) {
  if (bans.length === 0) return null;
  const sides = [
    { side: 'A', accent: '#4ade80' },
    { side: 'B', accent: '#60a5fa' },
  ];
  return (
    <div style={{ padding: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sides.map(({ side, accent }) => {
        const list = bans.filter((b) => b.side === side);
        if (list.length === 0) return null;
        return (
          <div key={side} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: accent, marginRight: 6, minWidth: 120 }}>
              Side {side}{side === userSide ? ' (you)' : ' (engine)'} bans:
            </span>
            {list.map((b, i) => {
              const name = formatHeroName(getHeroName(b.heroId));
              const img = getHeroImageUrl(b.heroId);
              return (
                <span key={`${b.heroId}-${i}`} title={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 6, opacity: 0.7 }}>
                  {img && <img src={img} alt="" style={{ width: 36, height: 20, borderRadius: 2, filter: 'grayscale(80%)' }} />}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{name}</span>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const btnStyle = {
  padding: '5px 12px',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
};
