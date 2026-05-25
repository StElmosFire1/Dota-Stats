import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getProMatches, getProMatchLeagues } from '../api';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ league_id: '', hero_id: '', q: '' });
  const [sortKey, setSortKey] = useState('start_time');
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
        q: filters.q || null,
        limit: 100,
      });
      setMatches(d.matches || []);
    } catch (e) {
      setError(e.message);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getProMatchLeagues()
      .then((d) => setLeagues(d.leagues || []))
      .catch(() => setLeagues([]));
  }, []);

  const sorted = useMemo(() => {
    const arr = [...matches];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
      return 0;
    });
    return arr;
  }, [matches, sortKey, sortDir]);

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
          <span style={{ color: 'var(--text-muted)' }}>Search teams / league</span>
          <input
            type="text"
            value={filters.q}
            placeholder="Team Liquid, ESL One…"
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            aria-label="Search team or league name"
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
                <SortableTh active={sortKey === 'start_time'} direction={sortDir} onSort={() => toggleSort('start_time')}>Date</SortableTh>
                <th>League</th>
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
                    {m.has_replay && (
                      <Link to={`/replay/${m.match_id}`} aria-label={`Open replay viewer for ${m.match_id}`}>Replay</Link>
                    )}
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
