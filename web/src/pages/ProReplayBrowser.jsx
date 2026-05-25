import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getProMatches, getProMatchLeagues, getProMatchPatches } from '../api';
import { getHeroName, getHeroImageUrl, ALL_HERO_IDS } from '../heroNames';
import SortableTh from '../components/SortableTh';

// Task #378 — Pro replay browser.
// Reads the cached OpenDota /proMatches snapshot from our DB (synced every
// ~6h by src/api/proMatchSyncer.js) so the filter UI doesn't burn the
// upstream 1-req/sec rate limit. Each row has an "Analyze in Draft" button
// that deep-links into the Draft Assistant with both teams' picks
// pre-populated, and a "Replay" link for matches with a stored OpenDota
// replay_url.

function HeroIcons({ picks }) {
  if (!Array.isArray(picks) || picks.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 2, flexWrap: 'wrap' }}>
      {picks.map((p, i) => {
        const id = p?.hero_id;
        const img = id ? getHeroImageUrl(id) : null;
        const name = id ? (getHeroName(id) || `Hero ${id}`) : '?';
        return img
          ? <img key={`${id}-${i}`} src={img} alt={name} title={name} style={{ width: 24, height: 24, borderRadius: 3 }} />
          : <span key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>{name}</span>;
      })}
    </span>
  );
}

function fmtDuration(s) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
function fmtDate(epoch) {
  if (!epoch) return '—';
  try { return new Date(epoch * 1000).toLocaleString(); } catch { return '—'; }
}

export default function ProReplayBrowser() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [patches, setPatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    league_id: '', hero_id: '', position: '', patch: '', team: '', q: '',
  });
  // Sort + direction are pushed to the server so pagination / row caps line
  // up. `start_time` keeps `desc` semantics; `prestige` defaults to highest
  // first; toggling a column you're already on flips the direction.
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getProMatches({
        league_id: filters.league_id || null,
        hero_id: filters.hero_id || null,
        position: filters.position || null,
        patch: filters.patch || null,
        team: filters.team || null,
        q: filters.q || null,
        sort: sortKey,
        dir: sortDir,
        limit: 100,
      });
      setMatches(d.matches || []);
    } catch (e) {
      setError(e.message);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [filters, sortKey, sortDir]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getProMatchLeagues()
      .then((d) => setLeagues(d.leagues || []))
      .catch(() => setLeagues([]));
    getProMatchPatches()
      .then((d) => setPatches(d.patches || []))
      .catch(() => setPatches([]));
  }, []);

  // Server handles ordering — render as-is.
  const sorted = matches;

  const heroOptions = useMemo(() => {
    return (ALL_HERO_IDS || [])
      .map((id) => ({ id, name: getHeroName(id) || `Hero ${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const analyzeInDraft = (m) => {
    const r = (m.radiant_picks || []).map((p) => p.hero_id).filter(Boolean).join(',');
    const d = (m.dire_picks || []).map((p) => p.hero_id).filter(Boolean).join(',');
    navigate(`/draft-assistant?radiant=${r}&dire=${d}`);
  };

  return (
    <div>
      <h1 className="page-title">Pro Replay Browser</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Recent pro/league matches cached from OpenDota — filter by league, hero,
        or team name, then jump straight into the Draft Assistant with both sides
        pre-loaded, or open the replay on OpenDota.
      </p>

      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>League</span>
          <select
            value={filters.league_id}
            onChange={(e) => setFilters((f) => ({ ...f, league_id: e.target.value }))}
            aria-label="Filter by league"
          >
            <option value="">All leagues</option>
            {leagues.map((l) => (
              <option key={l.league_id} value={l.league_id}>
                {l.league_name || `League ${l.league_id}`} ({l.match_count})
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Hero</span>
          <select
            value={filters.hero_id}
            onChange={(e) => setFilters((f) => ({ ...f, hero_id: e.target.value }))}
            aria-label="Filter by hero"
          >
            <option value="">All heroes</option>
            {heroOptions.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Position</span>
          <select
            value={filters.position}
            onChange={(e) => setFilters((f) => ({ ...f, position: e.target.value }))}
            aria-label="Filter by lane role"
            title={filters.hero_id ? '' : 'Position filter combines with the hero filter via per-match lane role data.'}
          >
            <option value="">Any position</option>
            <option value="1">Safe lane (1)</option>
            <option value="2">Mid (2)</option>
            <option value="3">Off lane (3)</option>
            <option value="4">Soft support (4)</option>
            <option value="5">Hard support (5)</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Patch</span>
          <select
            value={filters.patch}
            onChange={(e) => setFilters((f) => ({ ...f, patch: e.target.value }))}
            aria-label="Filter by patch"
          >
            <option value="">All patches</option>
            {patches.map((p) => <option key={p} value={p}>Patch {p}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Team name</span>
          <input
            type="text"
            value={filters.team}
            placeholder="Team Liquid"
            onChange={(e) => setFilters((f) => ({ ...f, team: e.target.value }))}
            aria-label="Filter by team name"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Search (any field)</span>
          <input
            type="text"
            value={filters.q}
            placeholder="ESL One, BetBoom…"
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            aria-label="Search any field"
          />
        </label>
      </div>

      {error && (
        <div className="card" style={{ padding: 12, marginBottom: 12, color: 'var(--accent-red, #f55)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : sorted.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No matches match these filters. The cache may still be warming up — check back in a few minutes.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <SortableTh active={sortKey === 'date'} direction={sortDir} onSort={() => toggleSort('date')}>Date</SortableTh>
                <SortableTh active={sortKey === 'prestige'} direction={sortDir} onSort={() => toggleSort('prestige')}>League</SortableTh>
                <th>Radiant</th>
                <th>Dire</th>
                <th>Radiant picks</th>
                <th>Dire picks</th>
                <SortableTh active={sortKey === 'duration'} direction={sortDir} onSort={() => toggleSort('duration')}>Length</SortableTh>
                <th>Winner</th>
                <th style={{ minWidth: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={m.match_id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(m.start_time)}</td>
                  <td>{m.league_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{m.radiant_team_name || <span style={{ color: 'var(--text-muted)' }}>Radiant</span>}</td>
                  <td>{m.dire_team_name || <span style={{ color: 'var(--text-muted)' }}>Dire</span>}</td>
                  <td><HeroIcons picks={m.radiant_picks} /></td>
                  <td><HeroIcons picks={m.dire_picks} /></td>
                  <td>{fmtDuration(m.duration)}</td>
                  <td style={{ fontWeight: 600, color: m.radiant_win ? 'var(--accent-green, #4caf50)' : 'var(--accent-red, #f44336)' }}>
                    {m.radiant_win == null ? '—' : (m.radiant_win ? 'Radiant' : 'Dire')}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => analyzeInDraft(m)}
                      style={{ marginRight: 6 }}
                      aria-label={`Analyze match ${m.match_id} in Draft Assistant`}
                    >
                      Analyze in Draft
                    </button>
                    {m.has_local_replay ? (
                      // In-app replay viewer only works when we've also
                      // recorded + parsed this match locally (timeline
                      // present in `matches`). Pro-only matches that
                      // exist solely on OpenDota fall through to the
                      // external link below so the row action is never
                      // a dead end.
                      <Link to={`/replay/${m.match_id}`} aria-label={`Open replay viewer for ${m.match_id}`}>Replay</Link>
                    ) : m.has_replay ? (
                      <a
                        href={`https://www.opendota.com/matches/${m.match_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open match ${m.match_id} on OpenDota (replay available)`}
                      >
                        Replay ↗
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
