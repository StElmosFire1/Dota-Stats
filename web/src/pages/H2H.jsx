import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate, Navigate } from 'react-router-dom';
import { getH2HDetailed, getAllPlayers } from '../api';
import useRovingTabs from '../hooks/useRovingTabs';
import { useSteamAuth } from '../context/SteamAuthContext';
import { useSeason } from '../context/SeasonContext';
import HeroIcon from '../components/HeroIcon';
import PaywallCard from '../components/PaywallCard';
import { formatHeroName } from '../utils/heroes';

const TAB_DEFS = [
  { id: 'heroes', label: 'Hero matchups' },
  { id: 'lanes', label: 'Lane matchups' },
  { id: 'sides', label: 'Side breakdown' },
  { id: 'timeline', label: 'Timeline' },
];

function formatPerf(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toFixed(2);
}
function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' });
  } catch (_) { return String(d); }
}

// Task #442 — `/me/h2h/:other` shortcut. Resolves the viewer's account
// id from session and redirects to the canonical `/h2h/:a/:b` URL so the
// page itself can stay session-agnostic.
export function H2HMeRedirect() {
  const { other } = useParams();
  const { user, loading } = useSteamAuth();
  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;
  if (!user?.accountId) {
    return (
      <div style={{ padding: 32 }}>
        <h2>Sign in to compare</h2>
        <p>Sign in with Steam to use the “me vs them” shortcut.</p>
      </div>
    );
  }
  if (!other || !/^\d+$/.test(other)) {
    return <Navigate to="/" replace />;
  }
  return <Navigate to={`/h2h/${user.accountId}/${other}`} replace />;
}

function StatPill({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--card, #181a23)',
      border: '1px solid var(--border, #2a2d3a)',
      borderRadius: 10,
      padding: '12px 16px',
      minWidth: 140,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function HeroMatchupsTab({ data, aName, bName }) {
  if (!data.hero_matchups?.length) {
    return <p style={{ color: 'var(--text-muted)' }}>No hero matchups yet.</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border, #2a2d3a)' }}>
            <th style={{ textAlign: 'left', padding: '10px 8px' }}>{aName}'s hero</th>
            <th style={{ textAlign: 'left', padding: '10px 8px' }}>{bName}'s hero</th>
            <th style={{ textAlign: 'right', padding: '10px 8px' }}>Games</th>
            <th style={{ textAlign: 'right', padding: '10px 8px' }}>{aName} W–L</th>
            <th style={{ textAlign: 'right', padding: '10px 8px' }}>{aName} WR</th>
          </tr>
        </thead>
        <tbody>
          {data.hero_matchups.map((m, i) => {
            const aWr = m.games > 0 ? Math.round((m.a_wins / m.games) * 100) : 0;
            const wrColor = aWr >= 60 ? '#22c55e' : aWr <= 40 ? '#ef4444' : 'var(--text-muted)';
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--border, #2a2d3a)' }}>
                <td style={{ padding: '8px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <HeroIcon heroId={m.a_hero_id} heroName={m.a_hero} size={24} />
                    {formatHeroName(m.a_hero) || `Hero ${m.a_hero_id}`}
                  </span>
                </td>
                <td style={{ padding: '8px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <HeroIcon heroId={m.b_hero_id} heroName={m.b_hero} size={24} />
                    {formatHeroName(m.b_hero) || `Hero ${m.b_hero_id}`}
                  </span>
                </td>
                <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.games}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {m.a_wins}–{m.games - m.a_wins}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: wrColor, fontWeight: 600 }}>
                  {aWr}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LaneMatchupsTab({ data, aName, bName }) {
  if (!data.lane_matchups?.length) {
    return <p style={{ color: 'var(--text-muted)' }}>
      No lane matchups recorded. Lane detection requires position + team data on both players.
    </p>;
  }
  const total = data.lane_matchups.length;
  const wlRows = data.lane_matchups.filter(r => r.lane_outcome != null);
  const laneWinsA = wlRows.filter(r => r.lane_outcome === 'W' || r.lane_outcome === 'w').length;
  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
        Faced in lane <strong>{total}</strong> time{total === 1 ? '' : 's'}.
        {wlRows.length > 0 && (
          <> Lane outcome (when parser data is present): <strong>{aName}</strong> won lane in {laneWinsA} / {wlRows.length}.</>
        )}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border, #2a2d3a)' }}>
              <th style={{ textAlign: 'left', padding: '10px 8px' }}>Date</th>
              <th style={{ textAlign: 'left', padding: '10px 8px' }}>Lane</th>
              <th style={{ textAlign: 'left', padding: '10px 8px' }}>{aName}</th>
              <th style={{ textAlign: 'left', padding: '10px 8px' }}>{bName}</th>
              <th style={{ textAlign: 'right', padding: '10px 8px' }}>Lane NW Δ</th>
              <th style={{ textAlign: 'center', padding: '10px 8px' }}>Lane</th>
              <th style={{ textAlign: 'center', padding: '10px 8px' }}>Match</th>
            </tr>
          </thead>
          <tbody>
            {data.lane_matchups.map((m, i) => {
              const delta = (m.a_laning_nw != null && m.b_laning_nw != null)
                ? m.a_laning_nw - m.b_laning_nw : null;
              const laneColor = m.lane_outcome === 'W' || m.lane_outcome === 'w' ? '#22c55e'
                : m.lane_outcome === 'L' || m.lane_outcome === 'l' ? '#ef4444' : 'var(--text-muted)';
              const matchColor = m.match_winner === 'a' ? '#22c55e' : '#ef4444';
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border, #2a2d3a)' }}>
                  <td style={{ padding: '8px' }}>
                    <Link to={`/match/${m.match_id}`} style={{ color: 'var(--accent, #c5a975)' }}>
                      {formatDate(m.date)}
                    </Link>
                  </td>
                  <td style={{ padding: '8px' }}>{m.lane}</td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <HeroIcon heroId={m.a_hero_id} heroName={m.a_hero} size={22} />
                      {formatHeroName(m.a_hero) || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <HeroIcon heroId={m.b_hero_id} heroName={m.b_hero} size={22} />
                      {formatHeroName(m.b_hero) || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {delta == null ? '—' : (delta > 0 ? `+${delta}` : String(delta))}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', color: laneColor, fontWeight: 700 }}>
                    {m.lane_outcome || '—'}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', color: matchColor, fontWeight: 700 }}>
                    {m.match_winner === 'a' ? 'W' : 'L'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SidesTab({ data, aName }) {
  const r = data.side_breakdown.a_radiant;
  const d = data.side_breakdown.a_dire;
  const rWr = r.games > 0 ? Math.round((r.wins / r.games) * 100) : null;
  const dWr = d.games > 0 ? Math.round((d.wins / d.games) * 100) : null;
  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
        How <strong>{aName}</strong> performs against this opponent on each side. (<strong>{aName}</strong>'s side is always the inverse of their opponent's.)
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={{
          background: 'rgba(34, 197, 94, 0.08)', border: '1px solid #22c55e',
          borderRadius: 10, padding: 16,
        }}>
          <div style={{ fontSize: 12, color: '#22c55e', textTransform: 'uppercase', letterSpacing: 0.5 }}>{aName} as Radiant</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {r.wins}–{r.games - r.wins}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {r.games} game{r.games === 1 ? '' : 's'}{rWr != null ? ` · ${rWr}% WR` : ''}
          </div>
        </div>
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)', border: '1px solid #ef4444',
          borderRadius: 10, padding: 16,
        }}>
          <div style={{ fontSize: 12, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.5 }}>{aName} as Dire</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {d.wins}–{d.games - d.wins}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {d.games} game{d.games === 1 ? '' : 's'}{dWr != null ? ` · ${dWr}% WR` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineTab({ data, aName, bName }) {
  if (!data.timeline?.length) {
    return <p style={{ color: 'var(--text-muted)' }}>No meetings yet.</p>;
  }
  // Chronological running score, oldest → newest, displayed newest-first.
  const chrono = data.timeline.slice().sort((x, y) => new Date(x.date) - new Date(y.date));
  let aRun = 0, bRun = 0;
  const running = chrono.map(r => {
    if (r.a_won) aRun++; else bRun++;
    return { ...r, score_after: `${aRun}–${bRun}` };
  });
  const newestFirst = running.slice().reverse();
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border, #2a2d3a)' }}>
            <th style={{ textAlign: 'left', padding: '10px 8px' }}>Date</th>
            <th style={{ textAlign: 'left', padding: '10px 8px' }}>{aName}</th>
            <th style={{ textAlign: 'left', padding: '10px 8px' }}>{bName}</th>
            <th style={{ textAlign: 'center', padding: '10px 8px' }}>Result</th>
            <th style={{ textAlign: 'right', padding: '10px 8px' }}>PERF</th>
            <th style={{ textAlign: 'right', padding: '10px 8px' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((r, i) => (
            <tr key={r.match_id || i} style={{ borderBottom: '1px solid var(--border, #2a2d3a)' }}>
              <td style={{ padding: '8px' }}>
                <Link to={`/match/${r.match_id}`} style={{ color: 'var(--accent, #c5a975)' }}>
                  {formatDate(r.date)}
                </Link>
              </td>
              <td style={{ padding: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <HeroIcon heroId={r.a_hero_id} heroName={r.a_hero} size={22} />
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {r.a_kills}/{r.a_deaths}/{r.a_assists}
                  </span>
                </span>
              </td>
              <td style={{ padding: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <HeroIcon heroId={r.b_hero_id} heroName={r.b_hero} size={22} />
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {r.b_kills}/{r.b_deaths}/{r.b_assists}
                  </span>
                </span>
              </td>
              <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: r.a_won ? '#22c55e' : '#ef4444' }}>
                {r.a_won ? 'W' : 'L'}
              </td>
              <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                {formatPerf(r.a_perf)} · {formatPerf(r.b_perf)}
              </td>
              <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {r.score_after}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function H2H() {
  const { playerA, playerB } = useParams();
  const navigate = useNavigate();
  const { seasonId } = useSeason();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paywall, setPaywall] = useState(null);
  const [tab, setTab] = useState('heroes');
  const { setRef: setTabRef, onKeyDown: onTabKeyDown } = useRovingTabs(TAB_DEFS, setTab);
  const [allPlayers, setAllPlayers] = useState([]);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setPaywall(null);
    getH2HDetailed(playerA, playerB, seasonId)
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(err => {
        if (!alive) return;
        if (err && err.paywall) {
          setPaywall(err);
        } else {
          setError(err?.message || 'Failed to load head-to-head');
        }
        setLoading(false);
      });
    return () => { alive = false; };
  }, [playerA, playerB, seasonId]);

  useEffect(() => {
    let alive = true;
    getAllPlayers().then(players => { if (alive) setAllPlayers(players || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const swapUrl = useMemo(() => `/h2h/${playerB}/${playerA}`, [playerA, playerB]);
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/h2h/${playerA}/${playerB}`;
  }, [playerA, playerB]);

  // Update document title + OG image once we know names.
  useEffect(() => {
    if (!data) return;
    const aName = data.a_name || `Player ${playerA}`;
    const bName = data.b_name || `Player ${playerB}`;
    document.title = `${aName} vs ${bName} · OCE Inhouse`;
    return () => { document.title = 'OCE Inhouse'; };
  }, [data, playerA, playerB]);

  if (loading) return <div style={{ padding: 32 }}>Loading head-to-head…</div>;
  if (paywall) return <div style={{ padding: 24 }}><PaywallCard feature={paywall.feature || 'head_to_head'} /></div>;
  if (error) return <div style={{ padding: 24, color: '#ef4444' }}>{error}</div>;
  if (!data) return null;

  const { header } = data;
  const aName = data.a_name || `Player ${playerA}`;
  const bName = data.b_name || `Player ${playerB}`;
  const aColor = header.a_wins > header.b_wins ? '#22c55e' : header.a_wins < header.b_wins ? '#ef4444' : 'var(--text)';
  const bColor = header.b_wins > header.a_wins ? '#22c55e' : header.b_wins < header.a_wins ? '#ef4444' : 'var(--text)';

  const handleChangeOpponent = (newId) => {
    if (!newId) return;
    if (String(newId) === String(playerA)) return;
    navigate(`/h2h/${playerA}/${newId}`);
  };
  const handleChangeMe = (newId) => {
    if (!newId) return;
    if (String(newId) === String(playerB)) return;
    navigate(`/h2h/${newId}/${playerB}`);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Head-to-Head
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
          <h1 style={{ margin: 0, fontSize: 28, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link to={`/player/${playerA}`} style={{ color: aColor, textDecoration: 'none' }}>{aName}</Link>
            <span style={{ color: 'var(--text-muted)' }}>vs</span>
            <Link to={`/player/${playerB}`} style={{ color: bColor, textDecoration: 'none' }}>{bName}</Link>
          </h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => navigate(swapUrl)}
              aria-label="Swap which player is on the left"
              style={{
                background: 'var(--card, #181a23)', color: 'var(--text)',
                border: '1px solid var(--border, #2a2d3a)', borderRadius: 8,
                padding: '6px 12px', cursor: 'pointer', fontSize: 13,
              }}>↔ Swap</button>
            <button type="button" onClick={() => {
              if (navigator.clipboard && shareUrl) {
                navigator.clipboard.writeText(shareUrl).then(() => setSwapping(true)).catch(() => {});
                setTimeout(() => setSwapping(false), 1500);
              }
            }}
              aria-label="Copy shareable head-to-head link"
              style={{
                background: 'var(--card, #181a23)', color: 'var(--text)',
                border: '1px solid var(--border, #2a2d3a)', borderRadius: 8,
                padding: '6px 12px', cursor: 'pointer', fontSize: 13,
              }}>{swapping ? '✓ Copied' : '🔗 Share'}</button>
          </div>
        </div>

        {/* Scoreboard */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <StatPill label="Record" value={`${header.a_wins}–${header.b_wins}`} />
          <StatPill
            label={`${aName} WR`}
            value={header.total > 0 ? `${Math.round((header.a_wins / header.total) * 100)}%` : '—'}
            color={aColor}
          />
          <StatPill
            label="Avg PERF Δ"
            value={header.perf_delta == null ? '—' : (header.perf_delta > 0 ? `+${header.perf_delta.toFixed(2)}` : header.perf_delta.toFixed(2))}
            color={header.perf_delta == null ? 'var(--text)' : header.perf_delta > 0 ? '#22c55e' : header.perf_delta < 0 ? '#ef4444' : 'var(--text)'}
          />
          <StatPill label={`${aName} streak`} value={header.a_longest_streak || 0} />
          <StatPill label={`${bName} streak`} value={header.b_longest_streak || 0} />
          <StatPill label="Total" value={header.total} />
        </div>

        {/* Compare-vs picker */}
        {allPlayers.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Change left:
              <select
                value={playerA}
                onChange={(e) => handleChangeMe(e.target.value)}
                aria-label="Change the left-hand player"
                style={{ marginLeft: 6, background: 'var(--card, #181a23)', color: 'var(--text)', border: '1px solid var(--border, #2a2d3a)', borderRadius: 6, padding: '4px 8px' }}
              >
                {allPlayers.map(p => (
                  <option key={p.account_id || p.player_key} value={p.account_id || ''}>
                    {p.nickname || p.persona_name || `Player ${p.account_id}`}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Change right:
              <select
                value={playerB}
                onChange={(e) => handleChangeOpponent(e.target.value)}
                aria-label="Change the right-hand player"
                style={{ marginLeft: 6, background: 'var(--card, #181a23)', color: 'var(--text)', border: '1px solid var(--border, #2a2d3a)', borderRadius: 6, padding: '4px 8px' }}
              >
                {allPlayers.map(p => (
                  <option key={p.account_id || p.player_key} value={p.account_id || ''}>
                    {p.nickname || p.persona_name || `Player ${p.account_id}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div role="tablist" aria-label="Head-to-head sections"
        style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border, #2a2d3a)', marginBottom: 20, flexWrap: 'wrap' }}>
        {TAB_DEFS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            ref={setTabRef(i)}
            aria-selected={tab === t.id}
            aria-controls={`h2h-panel-${t.id}`}
            id={`h2h-tab-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKeyDown(e, i)}
            style={{
              background: 'transparent',
              color: tab === t.id ? 'var(--accent, #c5a975)' : 'var(--text-muted)',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent, #c5a975)' : '2px solid transparent',
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >{t.label}</button>
        ))}
      </div>

      <div role="tabpanel" id={`h2h-panel-${tab}`} aria-labelledby={`h2h-tab-${tab}`}>
        {data.header.total === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>
            No meetings recorded between these two players yet
            {seasonId ? ' in this season' : ''}.
          </p>
        )}
        {data.header.total > 0 && tab === 'heroes' && <HeroMatchupsTab data={data} aName={aName} bName={bName} />}
        {data.header.total > 0 && tab === 'lanes' && <LaneMatchupsTab data={data} aName={aName} bName={bName} />}
        {data.header.total > 0 && tab === 'sides' && <SidesTab data={data} aName={aName} />}
        {data.header.total > 0 && tab === 'timeline' && <TimelineTab data={data} aName={aName} bName={bName} />}
      </div>
    </div>
  );
}
