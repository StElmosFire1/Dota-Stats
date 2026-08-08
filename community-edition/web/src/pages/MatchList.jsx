import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getMatches, updateMatchMeta } from '../api';
import { useSeason } from '../context/SeasonContext';
import { useSuperuser } from '../context/SuperuserContext';
import { useSteamAuth } from '../context/SteamAuthContext';
import HeroIcon from '../components/HeroIcon';
import { MmrBadge } from '../components/RankBadge';
import { resolvePlayerDisplayName } from '../utils/displayName';
import { getHeroName } from '../heroNames';
import { deriveKillSeries } from '../utils/killSeries';

function formatDuration(seconds) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Australia/Sydney',
  });
}

// Average of a side's current stored MMR. Skips unranked (mmr null/0) players.
// Returns null when nobody on the side is ranked.
function avgSideMmr(side) {
  const vals = side
    .map(p => Number(p.mmr))
    .filter(v => Number.isFinite(v) && v > 0);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Split players into Radiant / Dire arrays.
function splitTeams(players) {
  if (!Array.isArray(players)) return { radiant: [], dire: [] };
  const radiant = players.filter(p => p.team === 'radiant' || p.team === 0 || p.team === '0');
  const dire    = players.filter(p => p.team === 'dire'    || p.team === 1 || p.team === '1');
  return { radiant, dire };
}

function sumKills(side) {
  return side.reduce((s, p) => s + (Number(p.kills) || 0), 0);
}

// Derive a one-word "story" label from kill margin + duration.
function storyLabel(killMargin, durationMins) {
  if (killMargin >= 20 || (killMargin >= 15 && durationMins > 0 && durationMins < 30)) return 'Stomp';
  if (killMargin >= 10) return 'Decisive';
  if (killMargin <= 3 && durationMins > 40) return 'Neck and Neck';
  if (killMargin <= 5) return 'Close Game';
  return null;
}

// Task #763 — tiny kill-advantage sparkline. Derives a cumulative
// Radiant-minus-Dire kill diff from game_timeline.events (kill events carry
// `t` seconds + victimSlot 0-4 = Radiant, 5-9 = Dire) and renders it as a
// step-line: green above the zero axis (Radiant ahead), red below (Dire
// ahead). Hides itself when no timestamped kill data exists for the match.
// Series derivation lives in utils/killSeries.js so it can be unit-tested.
function KillSparkline({ timeline, duration, width = 80, height = 20 }) {
  const series = deriveKillSeries(timeline, duration);
  if (!series) return null;
  const { points: pts, maxAbs, endT } = series;

  const mid = height / 2;
  const x = t => (t / endT) * width;
  const y = d => mid - (d / maxAbs) * (mid - 1);
  // Step-after path: hold the diff until the next kill.
  let path = `M0 ${y(0).toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    path += ` H${x(pts[i].t).toFixed(2)} V${y(pts[i].d).toFixed(2)}`;
  }

  const clipId = `ks-${Math.round(endT)}-${pts.length}-${maxAbs}`;
  return (
    <svg
      className="mc-kill-spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Kill advantage over time (green: Radiant ahead, red: Dire ahead)"
    >
      <title>Kill advantage over time — green: Radiant ahead, red: Dire ahead</title>
      <defs>
        <clipPath id={`${clipId}-top`}><rect x="0" y="0" width={width} height={mid} /></clipPath>
        <clipPath id={`${clipId}-bot`}><rect x="0" y={mid} width={width} height={mid} /></clipPath>
      </defs>
      <line x1="0" y1={mid} x2={width} y2={mid} stroke="#334155" strokeWidth="1" />
      <path d={path} fill="none" stroke="#4ade80" strokeWidth="1.5" clipPath={`url(#${clipId}-top)`} />
      <path d={path} fill="none" stroke="#f87171" strokeWidth="1.5" clipPath={`url(#${clipId}-bot)`} />
    </svg>
  );
}

// Story types players can filter by — mirrors the labels storyLabel() emits.
// Task #789 — filtering by these now happens server-side (across all matches);
// storyLabel() is still used per-card to render the story pill on each match.
const STORY_TYPES = ['Stomp', 'Decisive', 'Close Game', 'Neck and Neck'];

// Task #790 — helpers for the at-a-glance page summary next to the filters.
// matchResultFor: 'win' | 'loss' for the signed-in player, or null when they
// didn't play in the match. matchStory: the story label for a match (same
// derivation as the per-card pill), or null when it has no story.
function matchResultFor(match, accountId) {
  if (!accountId || !Array.isArray(match.players)) return null;
  const me = match.players.find(p => String(p.account_id) === String(accountId));
  if (!me) return null;
  const onRadiant = me.team === 'radiant' || me.team === 0 || me.team === '0';
  return onRadiant === !!match.radiant_win ? 'win' : 'loss';
}

function matchStory(match) {
  if (!Array.isArray(match.players) || match.players.length === 0) return null;
  const { radiant, dire } = splitTeams(match.players);
  const killMargin = Math.abs(sumKills(radiant) - sumKills(dire));
  const durationMins = match.duration ? match.duration / 60 : 0;
  return storyLabel(killMargin, durationMins);
}

// Hero lineup + MVP strip.
function MatchPlayersStrip({ players, radiantWin, radiantMmr, direMmr }) {
  if (!Array.isArray(players) || players.length === 0) return null;
  const { radiant, dire } = splitTeams(players);
  if (radiant.length === 0 && dire.length === 0) return null;

  // MVP — highest PERF score across both sides.
  let mvp = null;
  let mvpPerf = -Infinity;
  for (const p of players) {
    const perf = Number(p.perf);
    if (Number.isFinite(perf) && perf > mvpPerf) { mvpPerf = perf; mvp = p; }
  }

  const renderCol = (side, label, isWinner, sideMmr) => {
    if (side.length === 0) return <div className="mc-lineup-col" />;
    const top = side[0]; // server sorts kills DESC
    const topName = top ? resolvePlayerDisplayName(top) : null;
    const isDire = label === 'Dire';
    return (
      <div className={`mc-lineup-col${isWinner ? ' mc-lineup-col--winner' : ''}${isDire ? ' mc-lineup-col--dire' : ''}`}>
        <div className={`mc-lineup-label mc-lineup-label--${isDire ? 'dire' : 'radiant'}`}>
          {!isDire && <span>{label}</span>}
          {sideMmr != null && (
            <span
              className="mc-lineup-mmr"
              title="Average of these players' current MMR (live rating, not a per-match snapshot)"
            >
              <MmrBadge mmr={sideMmr} size="sm" />
            </span>
          )}
          {isDire && <span>{label}</span>}
        </div>
        <div className="mc-hero-row">
          {side.slice(0, 5).map((p, i) => (
            <HeroIcon key={`${p.account_id || 'a'}-${i}`} heroId={p.hero_id} heroName={p.hero} size="sm" />
          ))}
        </div>
        {topName && (
          <div className="mc-top-player">
            <span className="mc-top-name">{topName}</span>
            {Number.isFinite(Number(top?.kills)) && (
              <span className="mc-top-kda pb-num">{top.kills}/{top.deaths ?? '-'}/{top.assists ?? '-'}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mc-lineups">
      <div className="mc-lineups-grid">
        {renderCol(radiant, 'Radiant', radiantWin,  radiantMmr)}
        <div className="mc-lineups-vs" aria-hidden="true">VS</div>
        {renderCol(dire,    'Dire',    !radiantWin, direMmr)}
      </div>
      {mvp && (
        <div className="mc-mvp">
          <span className="mc-mvp-trophy" aria-hidden="true">🏆</span>
          <span className="mc-mvp-label">MVP</span>
          <HeroIcon heroId={mvp.hero_id} heroName={mvp.hero} size="sm" />
          <span className="mc-mvp-name">{resolvePlayerDisplayName(mvp)}</span>
          <span className="mc-mvp-sep" aria-hidden="true">·</span>
          <span className="mc-mvp-hero">{getHeroName(mvp.hero_id, mvp.hero)}</span>
          {Number.isFinite(Number(mvp.perf)) && (
            <span className="mc-mvp-perf pb-num">{Number(mvp.perf).toFixed(1)} PERF</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function MatchList() {
  const { seasonId, seasons } = useSeason();
  const { isSuperuser, superuserKey, setShowModal } = useSuperuser();
  const { steamUser } = useSteamAuth();
  const myAccountId = steamUser?.accountId || null;
  const [data, setData] = useState({ matches: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 20;

  // Task #789 — filters are now applied server-side (across ALL matches, not
  // just the current page) so pagination totals reflect the filtered set. The
  // selected values are passed straight through to getMatches() as query params.
  const [resultFilter, setResultFilter] = useState('all'); // all | win | loss
  const [storyFilter, setStoryFilter] = useState('all');   // all | <story label>

  // Inline season editing state
  const [editingSeason, setEditingSeason] = useState(null);
  const [seasonInput, setSeasonInput] = useState('');
  const [savingSeason, setSavingSeason] = useState(null);

  // Bulk season state
  const [selected, setSelected] = useState(new Set());
  const [bulkSeason, setBulkSeason] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');

  // Reset to the first page whenever the season or a filter changes — offsets
  // from the previous (differently-sized) result set would be meaningless.
  useEffect(() => { setPage(0); }, [seasonId, resultFilter, storyFilter]);

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    getMatches(limit, page * limit, seasonId, { result: resultFilter, accountId: myAccountId, story: storyFilter })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, seasonId, resultFilter, storyFilter, myAccountId]);

  const reload = useCallback(() => {
    getMatches(limit, page * limit, seasonId, { result: resultFilter, accountId: myAccountId, story: storyFilter })
      .then(setData).catch(console.error);
  }, [page, seasonId, resultFilter, storyFilter, myAccountId]);

  const totalPages = Math.ceil(data.total / limit);

  const filtersActive = resultFilter !== 'all' || storyFilter !== 'all';
  const clearFilters = () => { setResultFilter('all'); setStoryFilter('all'); };
  // Filtering is now done server-side (Task #789); the page we receive is
  // already the globally-filtered, correctly-paginated slice.
  const visibleMatches = data.matches;

  const getSeasonName = (id) => {
    if (!id) return null;
    const s = seasons.find(x => x.id === id);
    return s ? s.name : null;
  };

  const startEditSeason = (e, match) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSuperuser) { setShowModal(true); return; }
    setEditingSeason(match.match_id);
    setSeasonInput(match.season_id ? String(match.season_id) : '');
  };

  const saveSeason = async (e, matchId) => {
    e.preventDefault();
    e.stopPropagation();
    setSavingSeason(matchId);
    try {
      await updateMatchMeta(matchId, { seasonId: seasonInput ? parseInt(seasonInput) : null }, superuserKey);
      setEditingSeason(null);
      reload();
    } catch (err) {
      alert('Failed to save season: ' + err.message);
    } finally {
      setSavingSeason(null);
    }
  };

  const cancelEdit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingSeason(null);
  };

  const toggleSelect = (e, matchId) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(matchId) ? next.delete(matchId) : next.add(matchId);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(visibleMatches.map(m => m.match_id)));
  const clearSelection = () => setSelected(new Set());

  const applyBulkSeason = async () => {
    if (!bulkSeason && !confirm('Remove season from selected matches?')) return;
    setBulkSaving(true);
    setBulkMsg('');
    let ok = 0, fail = 0;
    let lastErr = '';
    for (const matchId of selected) {
      try {
        await updateMatchMeta(matchId, { seasonId: bulkSeason ? parseInt(bulkSeason) : null }, superuserKey);
        ok++;
      } catch (err) { fail++; lastErr = err.message; }
    }
    setBulkMsg(`Done: ${ok} updated${fail ? `, ${fail} failed${lastErr ? ` (${lastErr})` : ''}` : ''}`);
    setBulkSaving(false);
    setSelected(new Set());
    reload();
    setTimeout(() => setBulkMsg(''), 4000);
  };

  const chipLabelStyle = { fontSize: '0.72rem', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 };
  const chipStyle = (active) => ({
    padding: '4px 12px',
    fontSize: '0.78rem',
    fontWeight: 600,
    borderRadius: 999,
    border: `1px solid ${active ? '#2563eb' : '#334155'}`,
    background: active ? '#2563eb' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted, #94a3b8)',
    cursor: 'pointer',
  });

  // Task #790 / #868 — at-a-glance summary next to the filters. The server
  // now returns aggregate W/L + story counts across the FULL filtered set
  // (data.summary), so totals cover all matches, not just the current page.
  // Falls back to the old per-page derivation for older servers/caches.
  const renderPageSummary = () => {
    const s = data.summary;
    let label, parts, suffix = null;
    if (s && typeof s.total === 'number' && s.total > 0) {
      label = 'ALL MATCHES';
      const wins = Number(s.wins) || 0;
      const losses = Number(s.losses) || 0;
      const storyParts = STORY_TYPES.filter(t => s.stories?.[t]).map(t => `${s.stories[t]} ${t}`);
      parts = [];
      if (myAccountId && (wins > 0 || losses > 0)) parts.push(`${wins} W · ${losses} L`);
      if (storyParts.length > 0) parts.push(storyParts.join(', '));
      suffix = ` across ${s.total} match${s.total === 1 ? '' : 'es'}`;
    } else {
      if (visibleMatches.length === 0) return null;
      label = 'THIS PAGE';
      let wins = 0, losses = 0;
      const storyCounts = {};
      for (const m of visibleMatches) {
        const res = matchResultFor(m, myAccountId);
        if (res === 'win') wins++;
        else if (res === 'loss') losses++;
        const story = matchStory(m);
        if (story) storyCounts[story] = (storyCounts[story] || 0) + 1;
      }
      const storyParts = STORY_TYPES.filter(t => storyCounts[t]).map(t => `${storyCounts[t]} ${t}`);
      parts = [];
      if (myAccountId && (wins > 0 || losses > 0)) parts.push(`${wins} W · ${losses} L`);
      if (storyParts.length > 0) parts.push(storyParts.join(', '));
    }
    if (parts.length === 0) return null;
    return (
      <div
        aria-live="polite"
        style={{ fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)', margin: '-0.5rem 0 1rem', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}
      >
        <span style={{ fontWeight: 700, letterSpacing: '0.05em', fontSize: '0.72rem' }}>{label}</span>
        <span>{parts.join(' — ')}{suffix}</span>
      </div>
    );
  };

  const renderFilterBar = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
      {myAccountId && (
        <div role="group" aria-label="Filter by result" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={chipLabelStyle}>RESULT</span>
          {[['all', 'All'], ['win', 'Wins'], ['loss', 'Losses']].map(([val, label]) => (
            <button
              key={val}
              type="button"
              aria-pressed={resultFilter === val}
              onClick={() => setResultFilter(val)}
              style={chipStyle(resultFilter === val)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div role="group" aria-label="Filter by story type" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={chipLabelStyle}>STORY</span>
        <button
          type="button"
          aria-pressed={storyFilter === 'all'}
          onClick={() => setStoryFilter('all')}
          style={chipStyle(storyFilter === 'all')}
        >
          All
        </button>
        {STORY_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={storyFilter === t}
            onClick={() => setStoryFilter(t)}
            style={chipStyle(storyFilter === t)}
          >
            {t}
          </button>
        ))}
      </div>
      {filtersActive && (
        <button type="button" className="btn btn-sm" onClick={clearFilters} style={{ background: '#374151' }}>
          Clear filters
        </button>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '0.5rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Match History</h1>
        {!isSuperuser && (
          <button className="btn btn-sm" onClick={() => setShowModal(true)} style={{ fontSize: '0.75rem', opacity: 0.7 }}>
            Admin Edit
          </button>
        )}
      </div>

      {isSuperuser && (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>BULK SEASON:</span>
          <select
            value={bulkSeason}
            onChange={e => setBulkSeason(e.target.value)}
            style={{ padding: '3px 8px', fontSize: '0.85rem', background: '#0f172a', border: '1px solid #475569', borderRadius: 4, color: '#f1f5f9' }}
          >
            <option value="">— Remove season —</option>
            {seasons.map(s => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </select>
          <button
            className="btn btn-sm"
            onClick={applyBulkSeason}
            disabled={bulkSaving || selected.size === 0}
            style={{ background: selected.size > 0 ? '#2563eb' : undefined }}
          >
            {bulkSaving ? 'Saving…' : `Apply to ${selected.size} selected`}
          </button>
          {selected.size > 0 ? (
            <button className="btn btn-sm" onClick={clearSelection} style={{ background: '#374151' }}>Clear</button>
          ) : (
            <button className="btn btn-sm" onClick={selectAll} style={{ background: '#374151' }}>Select All</button>
          )}
          {bulkMsg && <span style={{ fontSize: '0.8rem', color: '#4ade80' }}>{bulkMsg}</span>}
        </div>
      )}

      {loading ? (
        <div className="loading">Loading matches...</div>
      ) : data.matches.length === 0 && !filtersActive ? (
        <div className="empty-state">
          <p>No matches recorded yet.</p>
          <p>Upload a .dem replay file to get started!</p>
        </div>
      ) : (
        <>
          {renderFilterBar()}
          {renderPageSummary()}
          {visibleMatches.length === 0 ? (
            <div className="empty-state">
              <p>No matches match these filters.</p>
              <button type="button" className="btn btn-sm" onClick={clearFilters}>Clear filters</button>
            </div>
          ) : (
          <div className="match-list">
            {visibleMatches.map((match) => {
              const isEditing = editingSeason === match.match_id;
              const isSelected = selected.has(match.match_id);

              // Derive story cues from existing list data
              const { radiant, dire } = splitTeams(match.players);
              const rKills = sumKills(radiant);
              const dKills = sumKills(dire);
              const hasKills = (match.players || []).length > 0;
              const killMargin = Math.abs(rKills - dKills);
              const durationMins = match.duration ? match.duration / 60 : 0;
              const story = hasKills ? storyLabel(killMargin, durationMins) : null;

              const rMmr = avgSideMmr(radiant);
              const dMmr = avgSideMmr(dire);
              const upset = rMmr != null && dMmr != null && (
                (match.radiant_win && dMmr > rMmr + 150) ||
                (!match.radiant_win && rMmr > dMmr + 150)
              );

              const winnerSide = match.radiant_win ? 'radiant' : 'dire';

              return (
                <div key={match.match_id} style={{ position: 'relative' }}>
                  <Link
                    to={`/match/${match.match_id}`}
                    className={`match-card match-card--${winnerSide}`}
                    style={{ display: 'block', textDecoration: 'none' }}
                  >
                    {/* 1. Meta row: match ID + date/time */}
                    <div className="mc-meta-row">
                      <span className="mc-match-id">#{match.match_id}</span>
                      <span className="mc-date" style={{ paddingRight: isSuperuser ? 28 : 0 }}>
                        {formatDate(match.date)}
                        {match.date && <span className="mc-time"> · {formatTime(match.date)}</span>}
                      </span>
                    </div>

                    {/* 2. Headline: scoreline + faction labels + story pills */}
                    <div className="mc-headline">
                      <div className={`mc-faction mc-faction--radiant${match.radiant_win ? ' mc-faction--winner' : ''}`}>
                        Radiant
                      </div>
                      {hasKills ? (
                        <div className="mc-scoreline" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline' }}>
                            <span className={`mc-score pb-num${match.radiant_win ? ' mc-score--winner' : ''}`}>{rKills}</span>
                            <span className="mc-score-sep" aria-hidden="true">–</span>
                            <span className={`mc-score pb-num${!match.radiant_win ? ' mc-score--winner' : ''}`}>{dKills}</span>
                          </div>
                          <KillSparkline timeline={match.game_timeline} duration={match.duration} />
                        </div>
                      ) : (
                        <div className="mc-victory-text">
                          {match.radiant_win ? 'Radiant' : 'Dire'} Victory
                        </div>
                      )}
                      <div className={`mc-faction mc-faction--dire${!match.radiant_win ? ' mc-faction--winner' : ''}`}>
                        Dire
                      </div>
                      <div className="mc-story-pills">
                        {story && <span className="mc-pill mc-pill--story">{story}</span>}
                        {upset && (
                          <span
                            className="mc-pill mc-pill--upset"
                            title="The lower-rated side won (based on live MMR averages, not a per-match snapshot)"
                          >
                            Upset
                          </span>
                        )}
                        {match.duration > 0 && (
                          <span className="mc-pill mc-pill--duration">{formatDuration(match.duration)}</span>
                        )}
                        {match.player_count > 0 && (
                          <span className="mc-pill mc-pill--players">{match.player_count} players</span>
                        )}
                      </div>
                    </div>

                    {/* 3. Hero lineups + MVP */}
                    <MatchPlayersStrip
                      players={match.players}
                      radiantWin={match.radiant_win}
                      radiantMmr={rMmr}
                      direMmr={dMmr}
                    />

                    {/* 4. Footer: patch, lobby, season editor — behaviour unchanged */}
                    {(match.parse_method || match.patch || match.season_id || match.lobby_name || isSuperuser) && (
                      <div className="match-card-footer" style={{ alignItems: 'center' }}>
                        {match.parse_method && <span className="parse-badge">{match.parse_method}</span>}
                        {match.lobby_name && <span className="lobby-name">{match.lobby_name}</span>}
                        {match.patch && <span className="patch-badge">Patch {match.patch}</span>}

                        {isSuperuser && isEditing ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <select
                              autoFocus
                              value={seasonInput}
                              onChange={e => setSeasonInput(e.target.value)}
                              style={{ padding: '1px 6px', fontSize: '0.78rem', background: '#0f172a', border: '1px solid #3b82f6', borderRadius: 4, color: '#f1f5f9' }}
                            >
                              <option value="">— No season —</option>
                              {seasons.map(s => (
                                <option key={s.id} value={String(s.id)}>{s.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={e => saveSeason(e, match.match_id)}
                              disabled={savingSeason === match.match_id}
                              style={{ fontSize: '0.72rem', padding: '1px 6px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                            >
                              {savingSeason === match.match_id ? '…' : '✓'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              aria-label="Cancel edit"
                              style={{ fontSize: '0.72rem', padding: '1px 6px', background: '#374151', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <span
                            {...(isSuperuser ? {
                              role: 'button',
                              tabIndex: 0,
                              'aria-label': 'Edit season',
                              onClick: (e) => startEditSeason(e, match),
                              onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEditSeason(e, match); } },
                            } : {})}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: isSuperuser ? 'pointer' : 'default' }}
                            title={isSuperuser ? 'Click to change season' : undefined}
                          >
                            {match.season_id
                              ? <span className="season-badge">{getSeasonName(match.season_id) || `Season ${match.season_id}`}</span>
                              : isSuperuser
                                ? <span style={{ fontSize: '0.75rem', color: '#64748b', border: '1px dashed #475569', borderRadius: 4, padding: '1px 6px' }}>+ season</span>
                                : null
                            }
                            {isSuperuser && match.season_id && (
                              <span style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: 1 }}>✎</span>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>

                  {/* Bulk-select checkbox — behaviour unchanged */}
                  {isSuperuser && (
                    <div
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={!!isSelected}
                      aria-label={`Select match ${match.match_id}`}
                      onClick={e => toggleSelect(e, match.match_id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(e, match.match_id); } }}
                      style={{
                        position: 'absolute', top: 10, right: 10, zIndex: 2,
                        width: 18, height: 18, borderRadius: 4,
                        border: `2px solid ${isSelected ? '#3b82f6' : '#475569'}`,
                        background: isSelected ? '#3b82f6' : 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isSelected && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn btn-sm">
                Previous
              </button>
              <span className="page-info">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn btn-sm">
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
