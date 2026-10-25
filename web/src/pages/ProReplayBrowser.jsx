import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getProMatches, getProMatchLeagues, getProMatchPatches } from '../api';
import { getHeroName, getHeroImageUrl, ALL_HERO_IDS } from '../heroNames';
import SortableTh from '../components/SortableTh';
import './ProReplayBrowser.css';

// Task #378 — Pro replay browser.
// Reads the cached OpenDota /proMatches snapshot from our DB (synced every
// ~6h by src/api/proMatchSyncer.js) so the filter UI doesn't burn the
// upstream 1-req/sec rate limit. Each row has an "Analyze in Draft" button
// that deep-links into the Draft Assistant with both teams' picks
// pre-populated, and a "Replay" link for matches with a stored OpenDota
// replay_url.

function HeroIcons({ picks }) {
  if (!Array.isArray(picks) || picks.length === 0) return <span className="pr-hero-fallback">No picks recorded</span>;
  return (
    <span className="pr-heroes" aria-label={`${picks.length} heroes`}>
      {picks.map((p, i) => {
        const id = p?.hero_id;
        const img = id ? getHeroImageUrl(id) : null;
        const name = id ? (getHeroName(id) || `Hero ${id}`) : '?';
        return img
          ? <img className="pr-hero-icon" key={`${id}-${i}`} src={img} alt={name} title={name} loading="lazy" />
          : <span className="pr-hero-fallback" key={i}>{name}</span>;
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
  const hasFilters = Object.values(filters).some(Boolean);
  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };
  const clearFilters = () => setFilters({
    league_id: '', hero_id: '', position: '', patch: '', team: '', q: '',
  });

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
    <main className="pro-replay">
      <header className="pr-heading">
        <div className="pr-heading-copy">
          <div className="pr-eyebrow">Match archive / Pro circuit</div>
          <h1 className="pr-title">Pro Replay Browser</h1>
          <p className="pr-description">
            Study recent professional drafts and inhouse replays. Narrow the archive by event, hero, role, patch, or team, then carry any draft into the Draft Assistant.
          </p>
        </div>
        <div className="pr-snapshot" aria-label="Maximum of one hundred matches shown">
          <strong>{sorted.length}</strong> matches in view
        </div>
      </header>

      <section className="pr-filter-panel" aria-labelledby="pr-filter-title">
        <div className="pr-filter-head">
          <div>
            <span className="pr-section-label" id="pr-filter-title">Match filters</span>
            <span className="pr-filter-caption">Combine filters to focus your review.</span>
          </div>
          <button className="pr-reset" type="button" onClick={clearFilters} disabled={!hasFilters}>
            Clear filters
          </button>
        </div>
        <div className="pr-filter-grid">
        <label className="pr-field">
          <span>League</span>
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
        <label className="pr-field">
          <span>Hero</span>
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
        <label className="pr-field">
          <span>Position</span>
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
        <label className="pr-field">
          <span>Patch</span>
          <select
            value={filters.patch}
            onChange={(e) => setFilters((f) => ({ ...f, patch: e.target.value }))}
            aria-label="Filter by patch"
          >
            <option value="">All patches</option>
            {patches.map((p) => <option key={p} value={p}>Patch {p}</option>)}
          </select>
        </label>
        <label className="pr-field">
          <span>Team name</span>
          <input
            type="text"
            value={filters.team}
            placeholder="Team Liquid"
            autoComplete="off"
            onChange={(e) => setFilters((f) => ({ ...f, team: e.target.value }))}
            aria-label="Filter by team name"
          />
        </label>
        <label className="pr-field">
          <span>Search archive</span>
          <input
            type="text"
            value={filters.q}
            placeholder="Event, team, or match"
            autoComplete="off"
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            aria-label="Search any field"
          />
        </label>
        </div>
      </section>

      {error && (
        <div className="pr-error" role="alert">
          <p>{error}</p>
          <button className="pr-retry" type="button" onClick={load}>Try again</button>
        </div>
      )}

      <div className="pr-status" aria-live="polite">
        <strong>{loading ? 'Updating match archive…' : error ? 'Archive unavailable' : `${sorted.length} ${sorted.length === 1 ? 'match' : 'matches'} found`}</strong>
        <div className="pr-sort-mobile" aria-label="Sort matches">
          <label htmlFor="pr-mobile-sort">Sort</label>
          <select id="pr-mobile-sort" value={sortKey} onChange={(e) => {
            setSortKey(e.target.value);
            setSortDir('desc');
          }}>
            <option value="date">Date</option>
            <option value="prestige">League</option>
            <option value="duration">Length</option>
          </select>
          <button type="button" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} aria-label={`Sort ${sortDir === 'asc' ? 'descending' : 'ascending'}`} title={`Current order: ${sortDir === 'asc' ? 'ascending' : 'descending'}`}>
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="pr-results" aria-label="Loading matches" aria-busy="true">
          <div className="pr-table-scroll"><table className="pr-table"><tbody>
            {[0, 1, 2, 3].map((row) => (
              <tr className="pr-skeleton-row" key={row}>
                <td><span className="pr-skeleton short" /></td>
                <td><span className="pr-skeleton" /></td>
                <td><span className="pr-skeleton" /></td>
                <td><span className="pr-skeleton" /></td>
                <td><span className="pr-skeleton wide" /></td>
                <td><span className="pr-skeleton wide" /></td>
                <td><span className="pr-skeleton short" /></td>
                <td><span className="pr-skeleton short" /></td>
                <td><span className="pr-skeleton" /></td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      ) : !error && sorted.length === 0 ? (
        <div className="pr-empty">
          <h2>No matches in this view</h2>
          <p>Try broadening or clearing your filters. The cached pro match archive may also be warming up; check back shortly.</p>
        </div>
      ) : !error && (
        <div className="pr-results">
          <div className="pr-table-scroll">
          <table className="pr-table">
            <thead>
              <tr>
                <SortableTh active={sortKey === 'date'} direction={sortDir} onSort={() => toggleSort('date')}>Date</SortableTh>
                <SortableTh active={sortKey === 'prestige'} direction={sortDir} onSort={() => toggleSort('prestige')}>League</SortableTh>
                <th scope="col">Radiant</th>
                <th scope="col">Dire</th>
                <th scope="col">Radiant draft</th>
                <th scope="col">Dire draft</th>
                <SortableTh active={sortKey === 'duration'} direction={sortDir} onSort={() => toggleSort('duration')}>Length</SortableTh>
                <th scope="col">Winner</th>
                <th scope="col" style={{ minWidth: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={m.match_id}>
                  <td className="pr-date" data-label="Date">{fmtDate(m.start_time)}</td>
                  <td className="pr-league" data-label="League">{m.league_name || '—'}</td>
                  <td className="pr-team pr-team-radiant" data-label="Radiant">{m.radiant_team_name || 'Radiant'}</td>
                  <td className="pr-team pr-team-dire" data-label="Dire">{m.dire_team_name || 'Dire'}</td>
                  <td className="pr-hero-cell" data-label="Radiant draft"><HeroIcons picks={m.radiant_picks} /></td>
                  <td className="pr-hero-cell" data-label="Dire draft"><HeroIcons picks={m.dire_picks} /></td>
                  <td className="pr-duration" data-label="Length">{fmtDuration(m.duration)}</td>
                  <td className={`pr-winner ${m.radiant_win ? 'pr-winner-radiant' : 'pr-winner-dire'}`} data-label="Winner">
                    {m.radiant_win == null ? '—' : (m.radiant_win ? 'Radiant' : 'Dire')}
                  </td>
                  <td className="pr-actions" data-label="Actions">
                    <div className="pr-action-group">
                    <button
                      type="button"
                      onClick={() => analyzeInDraft(m)}
                      className="pr-action pr-action-primary"
                      aria-label={`Analyze match ${m.match_id} in Draft Assistant`}
                    >
                      Analyze draft
                    </button>
                    {m.has_local_replay ? (
                      // In-app replay viewer only works when we've also
                      // recorded + parsed this match locally (timeline
                      // present in `matches`). Pro-only matches that
                      // exist solely on OpenDota fall through to the
                      // external link below so the row action is never
                      // a dead end.
                      <Link className="pr-action" to={`/replay/${m.match_id}`} aria-label={`Open replay viewer for ${m.match_id}`}>View replay</Link>
                    ) : m.has_replay ? (
                      <a className="pr-action"
                        href={`https://www.opendota.com/matches/${m.match_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open match ${m.match_id} on OpenDota (replay available)`}
                      >
                        OpenDota
                      </a>
                    ) : <span className="pr-no-replay">No replay</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </main>
  );
}
