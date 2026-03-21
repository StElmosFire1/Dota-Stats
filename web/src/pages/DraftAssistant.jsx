import React, { useState, useCallback } from 'react';
import { getDraftSuggestions } from '../api';
import { getHeroName, getHeroImageUrl, ALL_HERO_IDS } from '../heroNames';
import { useSeason } from '../context/SeasonContext';

const POS = [null, 1, 2, 3, 4, 5];

function HeroChip({ heroId, onRemove, team }) {
  const img = getHeroImageUrl(heroId);
  const name = getHeroName(heroId) || `Hero ${heroId}`;
  const bg = team === 'ally' ? 'rgba(76,175,80,0.2)' : team === 'enemy' ? 'rgba(244,67,54,0.2)' : 'rgba(100,100,100,0.2)';
  const border = team === 'ally' ? 'var(--accent-green)' : team === 'enemy' ? 'var(--accent-red)' : '#555';
  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: '3px 8px 3px 4px', margin: '2px', cursor: 'pointer', fontSize: 12 }}
      onClick={() => onRemove(heroId)}
      title={`Remove ${name}`}
    >
      {img && <img src={img} alt="" style={{ width: 20, height: 20, borderRadius: 3 }} />}
      <span>{name}</span>
      <span style={{ color: '#888', marginLeft: 2 }}>✕</span>
    </div>
  );
}

export default function DraftAssistant() {
  const { seasonId } = useSeason();
  const [search, setSearch] = useState('');
  const [allies, setAllies] = useState([]);
  const [enemies, setEnemies] = useState([]);
  const [banned, setBanned] = useState([]);
  const [position, setPosition] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [addMode, setAddMode] = useState('ally');

  const allPicked = new Set([...allies, ...enemies, ...banned]);

  const filteredHeroes = search.length >= 2
    ? (ALL_HERO_IDS || []).filter(id => {
        const name = (getHeroName(id) || '').toLowerCase();
        return name.includes(search.toLowerCase()) && !allPicked.has(id);
      }).slice(0, 20)
    : [];

  const addHero = (id) => {
    if (allPicked.has(id)) return;
    if (addMode === 'ally') setAllies(a => [...a, id]);
    else if (addMode === 'enemy') setEnemies(e => [...e, id]);
    else setBanned(b => [...b, id]);
    setSearch('');
  };

  const getSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getDraftSuggestions({ allies, enemies, banned, position, seasonId });
      setSuggestions(d.suggestions || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [allies, enemies, banned, position, seasonId]);

  return (
    <div>
      <h1 className="page-title">Draft Assistant</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Add heroes to the draft, then get win-rate based suggestions powered by inhouse data.
      </p>

      <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div style={{ fontWeight: 600, color: 'var(--accent-green)', marginBottom: 8 }}>Your Team (Allies)</div>
          <div style={{ minHeight: 36 }}>
            {allies.map(id => <HeroChip key={id} heroId={id} team="ally" onRemove={id => setAllies(a => a.filter(x => x !== id))} />)}
            {allies.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No heroes yet</span>}
          </div>
        </div>
        <div className="stat-card">
          <div style={{ fontWeight: 600, color: 'var(--accent-red)', marginBottom: 8 }}>Enemy Team</div>
          <div style={{ minHeight: 36 }}>
            {enemies.map(id => <HeroChip key={id} heroId={id} team="enemy" onRemove={id => setEnemies(e => e.filter(x => x !== id))} />)}
            {enemies.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No heroes yet</span>}
          </div>
        </div>
        <div className="stat-card">
          <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Banned Heroes</div>
          <div style={{ minHeight: 36 }}>
            {banned.map(id => <HeroChip key={id} heroId={id} team="ban" onRemove={id => setBanned(b => b.filter(x => x !== id))} />)}
            {banned.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No heroes yet</span>}
          </div>
        </div>
      </div>

      <div className="stat-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Add as</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['ally', 'enemy', 'ban'].map(m => (
                <button key={m} className={`btn btn-small${addMode === m ? ' btn-primary' : ''}`} onClick={() => setAddMode(m)}>
                  {m === 'ally' ? '+ Ally' : m === 'enemy' ? '+ Enemy' : '+ Ban'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Search hero</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type hero name…"
              style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Suggest for position</label>
            <select
              value={position || ''}
              onChange={e => setPosition(e.target.value ? parseInt(e.target.value) : null)}
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}
            >
              <option value="">Any position</option>
              {[1,2,3,4,5].map(p => <option key={p} value={p}>Pos {p}</option>)}
            </select>
          </div>
        </div>

        {filteredHeroes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {filteredHeroes.map(id => {
              const img = getHeroImageUrl(id);
              const name = getHeroName(id) || `#${id}`;
              return (
                <button
                  key={id}
                  className="btn btn-small"
                  onClick={() => addHero(id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {img && <img src={img} alt="" style={{ width: 18, height: 18, borderRadius: 2 }} />}
                  {name}
                </button>
              );
            })}
          </div>
        )}
        {search.length >= 2 && filteredHeroes.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No matching heroes found</div>
        )}
      </div>

      <button className="btn btn-primary" onClick={getSuggestions} disabled={loading}>
        {loading ? 'Analyzing…' : 'Get Suggestions'}
      </button>

      {error && <div className="error-state" style={{ marginTop: '1rem' }}>{error}</div>}

      {suggestions && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
            Top {suggestions.length} Suggestions {position ? `(Pos ${position})` : ''}
          </h2>
          {suggestions.length === 0 ? (
            <div className="empty-state"><p>Not enough data for suggestions. Play more matches!</p></div>
          ) : (
            <div className="scoreboard-wrapper">
              <table className="scoreboard">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Hero</th>
                    <th title="Overall win rate in inhouse data">Win Rate</th>
                    <th title="Win rate when playing with your allies">With Allies</th>
                    <th title="Win rate when facing the enemy heroes">vs Enemies</th>
                    <th title="Combined recommendation score">Score</th>
                    <th title="Sample size">Games</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s, i) => {
                    const img = getHeroImageUrl(s.hero_id);
                    const name = getHeroName(s.hero_id) || `Hero ${s.hero_id}`;
                    const pct = v => (v * 100).toFixed(1) + '%';
                    const scoreColor = s.score > 0.55 ? 'var(--accent-green)' : s.score < 0.45 ? 'var(--accent-red)' : 'var(--text-primary)';
                    return (
                      <tr key={s.hero_id}>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {img && <img src={img} alt="" style={{ width: 28, height: 28, borderRadius: 4 }} />}
                            <span style={{ fontWeight: 500 }}>{name}</span>
                          </div>
                        </td>
                        <td>{pct(s.base_wr)}</td>
                        <td>{allies.length > 0 ? pct(s.synergy_wr) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td>{enemies.length > 0 ? pct(s.counter_wr) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td style={{ fontWeight: 700, color: scoreColor }}>{(s.score * 100).toFixed(1)}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.games}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
