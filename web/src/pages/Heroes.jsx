import React, { useState, useEffect } from 'react';
import { getHeroStats, getHeroMeta, getHeroPlayers, getPlayerHeroProfiles, getHeroMatchups } from '../api';
import { getHeroName, getHeroImageUrl } from '../heroNames';
import { formatHeroName } from '../utils/heroes';
import { Link } from 'react-router-dom';
import { useSeason } from '../context/SeasonContext';

const ALL_HEROES = {
  1: 'Anti-Mage', 2: 'Axe', 3: 'Bane', 4: 'Bloodseeker', 5: 'Crystal Maiden',
  6: 'Drow Ranger', 7: 'Earthshaker', 8: 'Juggernaut', 9: 'Mirana', 10: 'Morphling',
  11: 'Shadow Fiend', 12: 'Phantom Lancer', 13: 'Puck', 14: 'Pudge', 15: 'Razor',
  16: 'Sand King', 17: 'Storm Spirit', 18: 'Sven', 19: 'Tiny', 20: 'Vengeful Spirit',
  21: 'Windranger', 22: 'Zeus', 23: 'Kunkka', 25: 'Lina', 26: 'Lion',
  27: 'Shadow Shaman', 28: 'Slardar', 29: 'Tidehunter', 30: 'Witch Doctor',
  31: 'Lich', 32: 'Riki', 33: 'Enigma', 34: 'Tinker', 35: 'Sniper',
  36: 'Necrophos', 37: 'Warlock', 38: 'Beastmaster', 39: 'Queen of Pain',
  40: 'Venomancer', 41: 'Faceless Void', 42: 'Wraith King', 43: 'Death Prophet',
  44: 'Phantom Assassin', 45: 'Pugna', 46: 'Templar Assassin', 47: 'Viper',
  48: 'Luna', 49: 'Dragon Knight', 50: 'Dazzle', 51: 'Clockwerk', 52: 'Leshrac',
  53: "Nature's Prophet", 54: 'Lifestealer', 55: 'Dark Seer', 56: 'Clinkz',
  57: 'Omniknight', 58: 'Enchantress', 59: 'Huskar', 60: 'Night Stalker',
  61: 'Broodmother', 62: 'Bounty Hunter', 63: 'Weaver', 64: 'Jakiro',
  65: 'Batrider', 66: 'Chen', 67: 'Spectre', 68: 'Ancient Apparition',
  69: 'Doom', 70: 'Ursa', 71: 'Spirit Breaker', 72: 'Gyrocopter',
  73: 'Alchemist', 74: 'Invoker', 75: 'Silencer', 76: 'Outworld Devourer',
  77: 'Lycan', 78: 'Brewmaster', 79: 'Shadow Demon', 80: 'Lone Druid',
  81: 'Chaos Knight', 82: 'Meepo', 83: 'Treant Protector', 84: 'Ogre Magi',
  85: 'Undying', 86: 'Rubick', 87: 'Disruptor', 88: 'Nyx Assassin',
  89: 'Naga Siren', 90: 'Keeper of the Light', 91: 'Io', 92: 'Visage',
  93: 'Slark', 94: 'Medusa', 95: 'Troll Warlord', 96: 'Centaur Warrunner',
  97: 'Magnus', 98: 'Timbersaw', 99: 'Bristleback', 100: 'Tusk',
  101: 'Skywrath Mage', 102: 'Abaddon', 103: 'Elder Titan', 104: 'Legion Commander',
  105: 'Techies', 106: 'Ember Spirit', 107: 'Earth Spirit', 108: 'Underlord',
  109: 'Terrorblade', 110: 'Phoenix', 111: 'Oracle', 112: 'Winter Wyvern',
  113: 'Arc Warden', 114: 'Monkey King', 119: 'Dark Willow', 120: 'Pangolier',
  121: 'Grimstroke', 123: 'Hoodwink', 126: 'Void Spirit', 128: 'Snapfire',
  129: 'Mars', 131: 'Ring Master', 135: 'Dawnbreaker', 136: 'Marci',
  137: 'Primal Beast', 138: 'Muerta', 145: 'Kez', 155: 'Largo',
};

const POSITIONS = { 1: 'Safe Lane Carry', 2: 'Mid Lane', 3: 'Offlane', 4: 'Soft Support', 5: 'Hard Support' };

function HeroMetaTab() {
  const { seasonId } = useSeason();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePos, setActivePos] = useState(1);

  useEffect(() => {
    setLoading(true);
    getHeroMeta(seasonId)
      .then(d => setRows(d.rows || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seasonId]);

  const byPos = {};
  for (const r of rows) {
    const p = parseInt(r.position);
    if (!byPos[p]) byPos[p] = [];
    byPos[p].push(r);
  }

  const posRows = (byPos[activePos] || []).sort((a, b) => Number(b.games) - Number(a.games));

  if (loading) return <div className="loading">Loading hero meta…</div>;

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Win rates by position across all non-legacy matches with ≥2 games on that hero at that position.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map(pos => (
          <button
            key={pos}
            onClick={() => setActivePos(pos)}
            style={{
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
              border: '1px solid var(--border)',
              background: activePos === pos ? 'var(--accent-blue)' : 'var(--bg-card)',
              color: activePos === pos ? '#fff' : 'var(--text-primary)',
              fontWeight: activePos === pos ? 700 : 400,
            }}
          >
            Pos {pos} — {POSITIONS[pos]}
          </button>
        ))}
      </div>
      {posRows.length === 0 ? (
        <div className="empty-state"><p>Not enough data for this position yet.</p></div>
      ) : (
        <div className="scoreboard-wrapper">
          <table className="scoreboard">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-player">Hero</th>
                <th className="col-stat">Games</th>
                <th className="col-stat">Wins</th>
                <th className="col-stat">Win %</th>
              </tr>
            </thead>
            <tbody>
              {posRows.map((r, i) => {
                const wr = Number(r.win_rate);
                const color = wr >= 60 ? '#4ade80' : wr >= 50 ? 'var(--text-primary)' : wr < 40 ? '#f87171' : 'var(--text-muted)';
                const heroImg = getHeroImageUrl(r.hero_id);
                return (
                  <tr key={`${r.hero_id}-${r.position}`}>
                    <td className="col-rank">{i + 1}</td>
                    <td className="col-player">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {heroImg && <img src={heroImg} alt={r.hero_name} style={{ width: 28, height: 16, borderRadius: 2 }} />}
                        <span>{formatHeroName(r.hero_name)}</span>
                      </div>
                    </td>
                    <td className="col-stat">{r.games}</td>
                    <td className="col-stat">{r.wins}</td>
                    <td className="col-stat" style={{ color, fontWeight: 700 }}>{wr}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HeroBreakdownTab() {
  const { seasonId } = useSeason();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    setLoading(true);
    getPlayerHeroProfiles(seasonId)
      .then(data => setPlayers(data.players || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seasonId]);

  const toggleExpanded = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  const expandAll = () => { const k = {}; players.forEach(p => { k[p.player_key] = true; }); setExpanded(k); };
  const collapseAll = () => setExpanded({});

  const playerLink = (p) => p.account_id > 0 ? `/player/${p.account_id}` : `/player/${encodeURIComponent(p.player_key)}`;

  if (loading) return <div className="loading">Loading hero breakdown...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={expandAll} style={{ background: '#1e293b', color: '#e0e0e0', border: '1px solid #334155', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          Expand All
        </button>
        <button onClick={collapseAll} style={{ background: '#1e293b', color: '#e0e0e0', border: '1px solid #334155', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          Collapse All
        </button>
      </div>
      <p style={{ color: '#888', marginBottom: '1rem' }}>{players.length} players — click a player to see their hero history</p>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th className="col-hero" style={{ minWidth: '120px' }}>Hero</th>
              <th className="col-stat">Avg K / D / A</th>
              <th className="col-stat">Games</th>
              <th className="col-stat">Win % (Overall / Dire / Radiant)</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const displayName = p.nickname || p.persona_name;
              const totalWinPct = p.total_games > 0 ? Math.round((p.total_wins / p.total_games) * 100) : 0;
              const isExpanded = expanded[p.player_key];
              const diversification = p.total_games > 0 ? Math.round((p.unique_heroes / p.total_games) * 100) : 0;
              return (
                <React.Fragment key={p.player_key}>
                  <tr
                    onClick={() => toggleExpanded(p.player_key)}
                    style={{ cursor: 'pointer', background: isExpanded ? 'rgba(59,130,246,0.1)' : 'transparent' }}
                    className="player-profile-header"
                  >
                    <td className="col-player" style={{ fontWeight: 'bold' }}>
                      <Link to={playerLink(p)} style={{ color: '#60a5fa', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                        {displayName}
                      </Link>
                    </td>
                    <td className="col-hero" style={{ color: '#888', fontSize: '0.85rem' }}>
                      {isExpanded ? '▲ Collapse' : `▼ ${p.unique_heroes} heroes`}
                    </td>
                    <td className="col-stat" style={{ color: '#888' }}>
                      {parseFloat(p.avg_kills || 0).toFixed(1)} / {parseFloat(p.avg_deaths || 0).toFixed(1)} / {parseFloat(p.avg_assists || 0).toFixed(1)}
                    </td>
                    <td className="col-stat">{p.total_games}</td>
                    <td className="col-stat" style={{ color: totalWinPct >= 50 ? '#4ade80' : '#f87171' }}>
                      {totalWinPct}%
                      <span style={{ color: '#888', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                        ({p.total_wins}W / {p.total_games - p.total_wins}L)
                      </span>
                    </td>
                  </tr>
                  {isExpanded && p.heroes && p.heroes.map((h) => {
                    const heroWinPct = h.games > 0 ? Math.round((h.wins / h.games) * 100) : 0;
                    const heroImg = getHeroImageUrl(h.hero_id);
                    return (
                      <tr key={`${p.player_key}-${h.hero_id}`} style={{ background: 'rgba(59,130,246,0.05)' }}>
                        <td className="col-player" style={{ paddingLeft: '2rem', color: '#888', fontSize: '0.85rem' }}></td>
                        <td className="col-hero">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {heroImg && <img src={heroImg} alt={h.hero_name} style={{ width: '24px', height: '14px', borderRadius: '2px' }} />}
                            <span style={{ fontSize: '0.9rem' }}>{formatHeroName(h.hero_name)}</span>
                          </div>
                        </td>
                        <td className="col-stat" style={{ fontSize: '0.85rem' }}>
                          {parseFloat(h.avg_kills || 0).toFixed(1)} / {parseFloat(h.avg_deaths || 0).toFixed(1)} / {parseFloat(h.avg_assists || 0).toFixed(1)}
                        </td>
                        <td className="col-stat" style={{ fontSize: '0.85rem' }}>{h.games}</td>
                        <td className="col-stat" style={{ color: heroWinPct >= 50 ? '#4ade80' : '#f87171', fontSize: '0.85rem' }}>
                          {heroWinPct}%
                          <span style={{ color: '#888', fontSize: '0.75rem', marginLeft: '0.3rem' }}>
                            (D: {h.dire_wins}/{h.dire_games} | R: {h.radiant_wins}/{h.radiant_games})
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeroTierTab({ playedHeroes, totalMatches }) {
  const TIER_DEFS = [
    { key: 'S', label: 'S Tier', min: 0.60, color: '#ff6b35', desc: '60%+ win rate' },
    { key: 'A', label: 'A Tier', min: 0.55, color: '#f7c59f', desc: '55–60%' },
    { key: 'B', label: 'B Tier', min: 0.48, color: '#efefd0', desc: '48–55%' },
    { key: 'C', label: 'C Tier', min: 0.42, color: '#99b2dd', desc: '42–48%' },
    { key: 'D', label: 'D Tier', min: 0,    color: '#f45b69', desc: 'Below 42%' },
  ];
  const qualified = playedHeroes
    .map(h => ({
      ...h,
      games: parseInt(h.games) || 0,
      wins: parseInt(h.wins) || 0,
    }))
    .filter(h => h.games >= 2)
    .map(h => ({ ...h, wr: h.wins / h.games }))
    .sort((a, b) => b.wr - a.wr);

  const tiers = TIER_DEFS.map(tier => {
    const heroes = qualified.filter(h => {
      const idx = TIER_DEFS.indexOf(tier);
      const nextMin = idx > 0 ? TIER_DEFS[idx - 1].min : Infinity;
      return h.wr >= tier.min && h.wr < nextMin;
    });
    return { ...tier, heroes };
  });

  if (qualified.length === 0) {
    return <p style={{ color: 'var(--text-muted)', padding: 20 }}>Not enough data yet (need at least 2 games per hero).</p>;
  }

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13 }}>
        Heroes with 2+ picks, ranked by inhouse win rate. Left = more recent season context adjusts thresholds.
      </p>
      {tiers.map(tier => tier.heroes.length > 0 && (
        <div key={tier.key} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{
              background: tier.color, color: '#111', fontWeight: 700, fontSize: 18,
              padding: '2px 14px', borderRadius: 6, minWidth: 48, textAlign: 'center',
            }}>{tier.key}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{tier.desc}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tier.heroes.map(h => (
              <div key={h.hero_id} style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '8px 12px', minWidth: 140,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{formatHeroName(h.hero_name)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {(h.wr * 100).toFixed(1)}% ({h.wins}W–{h.games - h.wins}L)
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
        {qualified.length} heroes with data out of {Object.keys(ALL_HEROES).length} total. Minimum 2 games required.
      </p>
    </div>
  );
}

function HeroMatchupsTab() {
  const { seasonId } = useSeason();
  const [selectedHero, setSelectedHero] = useState('');
  const [matchups, setMatchups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('matchups');
  const [sortDir, setSortDir] = useState(-1);

  const heroOptions = Object.entries(ALL_HEROES).sort((a, b) => a[1].localeCompare(b[1]));

  useEffect(() => {
    if (!selectedHero) return;
    setLoading(true);
    getHeroMatchups(selectedHero, seasonId)
      .then(d => setMatchups(d.matchups || []))
      .catch(() => setMatchups([]))
      .finally(() => setLoading(false));
  }, [selectedHero, seasonId]);

  const handleSort = (f) => {
    if (sortField === f) setSortDir(d => -d);
    else { setSortField(f); setSortDir(-1); }
  };

  const displayed = [...matchups]
    .filter(r => !search || r.opp_hero_name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = sortField === 'wr' ? (parseInt(a.matchups) > 0 ? parseInt(a.wins) / parseInt(a.matchups) : -1) : (parseFloat(a[sortField]) ?? -1);
      const bv = sortField === 'wr' ? (parseInt(b.matchups) > 0 ? parseInt(b.wins) / parseInt(b.matchups) : -1) : (parseFloat(b[sortField]) ?? -1);
      return (av - bv) * sortDir;
    });

  const si = (f) => sortField === f ? (sortDir > 0 ? ' ▲' : ' ▼') : '';

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 13 }}>
        Select a hero to see how it performs against every opponent faced in inhousees.
      </p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={selectedHero}
          onChange={e => setSelectedHero(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}
        >
          <option value="">— Select a hero —</option>
          {heroOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        {matchups.length > 0 && (
          <input
            placeholder="Filter opponent…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14, width: 180 }}
          />
        )}
      </div>
      {loading && <div className="loading">Loading matchup data…</div>}
      {!loading && selectedHero && matchups.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No matchup data found for this hero.</p>
      )}
      {!loading && displayed.length > 0 && (
        <div className="scoreboard-wrapper">
          <table className="scoreboard">
            <thead>
              <tr>
                <th className="col-player" style={{ cursor: 'pointer' }} onClick={() => handleSort('opp_hero_name')}>Opponent{si('opp_hero_name')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('matchups')}>Games{si('matchups')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('wins')}>Wins{si('wins')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('wr')}>Win %{si('wr')}</th>
                <th className="col-stat" title="Win rate bar">Advantage</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(r => {
                const games = parseInt(r.matchups) || 0;
                const wins = parseInt(r.wins) || 0;
                const wr = games > 0 ? wins / games : 0;
                const colour = wr >= 0.55 ? 'var(--accent-green, #4caf50)' : wr <= 0.45 ? 'var(--accent-red, #f44336)' : 'var(--text-muted)';
                return (
                  <tr key={r.opp_hero_id}>
                    <td className="col-player">{formatHeroName(r.opp_hero_name)}</td>
                    <td className="col-stat">{games}</td>
                    <td className="col-stat wins">{wins}</td>
                    <td className="col-stat" style={{ color: colour, fontWeight: 600 }}>{(wr * 100).toFixed(1)}%</td>
                    <td className="col-stat">
                      <div style={{ background: '#333', borderRadius: 4, height: 8, width: 80, overflow: 'hidden' }}>
                        <div style={{ width: `${wr * 100}%`, height: '100%', background: colour, borderRadius: 4 }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Heroes({ defaultTab }) {
  const { seasonId } = useSeason();
  const [playedHeroes, setPlayedHeroes] = useState([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [draftMatches, setDraftMatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('hero_name');
  const [sortDir, setSortDir] = useState(1);
  const [tab, setTab] = useState(defaultTab || 'stats');
  const [expandedHero, setExpandedHero] = useState(null);
  const [heroPlayerCache, setHeroPlayerCache] = useState({});
  const [heroPlayerLoading, setHeroPlayerLoading] = useState({});

  useEffect(() => {
    setLoading(true);
    setExpandedHero(null);
    setHeroPlayerCache({});
    getHeroStats(seasonId)
      .then(data => {
        setPlayedHeroes(data.heroes || []);
        setTotalMatches(data.totalMatches || 0);
        setDraftMatches(data.draftMatches || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seasonId]);

  const toggleHeroExpand = async (heroId) => {
    if (expandedHero === heroId) {
      setExpandedHero(null);
      return;
    }
    setExpandedHero(heroId);
    if (!heroPlayerCache[heroId] && !heroPlayerLoading[heroId]) {
      setHeroPlayerLoading(prev => ({ ...prev, [heroId]: true }));
      try {
        const data = await getHeroPlayers(heroId, seasonId);
        setHeroPlayerCache(prev => ({ ...prev, [heroId]: data.players || [] }));
      } catch {}
      setHeroPlayerLoading(prev => ({ ...prev, [heroId]: false }));
    }
  };

  const playedMap = {};
  for (const h of playedHeroes) {
    playedMap[h.hero_id] = h;
  }

  const allHeroes = Object.entries(ALL_HEROES).map(([id, name]) => {
    const heroId = parseInt(id);
    const played = playedMap[heroId];
    return {
      hero_id: heroId,
      hero_name: name,
      games: played ? parseInt(played.games) : 0,
      wins: played ? parseInt(played.wins) : 0,
      bans: played ? parseInt(played.bans) : 0,
      avg_kills: played ? parseFloat(played.avg_kills) : null,
      avg_deaths: played ? parseFloat(played.avg_deaths) : null,
      avg_assists: played ? parseFloat(played.avg_assists) : null,
      avg_gpm: played ? parseFloat(played.avg_gpm) : null,
      avg_hero_damage: played ? parseFloat(played.avg_hero_damage) : null,
      avg_tower_damage: played ? parseFloat(played.avg_tower_damage) : null,
      avg_hero_healing: played ? parseFloat(played.avg_hero_healing) : null,
    };
  });

  const sorted = [...allHeroes].sort((a, b) => {
    if (sortField === 'hero_name') return a.hero_name.localeCompare(b.hero_name) * sortDir;
    if (sortField === 'win_rate') {
      const va = a.games > 0 ? a.wins / a.games : -1;
      const vb = b.games > 0 ? b.wins / b.games : -1;
      return (va - vb) * sortDir;
    }
    if (sortField === 'pick_rate') {
      const va = totalMatches > 0 ? a.games / totalMatches : -1;
      const vb = totalMatches > 0 ? b.games / totalMatches : -1;
      return (va - vb) * sortDir;
    }
    if (sortField === 'ban_rate') {
      const va = draftMatches > 0 ? a.bans / draftMatches : -1;
      const vb = draftMatches > 0 ? b.bans / draftMatches : -1;
      return (va - vb) * sortDir;
    }
    if (sortField === 'contest_rate') {
      const va = draftMatches > 0 ? (a.games + a.bans) / draftMatches : -1;
      const vb = draftMatches > 0 ? (b.games + b.bans) / draftMatches : -1;
      return (va - vb) * sortDir;
    }
    const va = a[sortField] ?? -1;
    const vb = b[sortField] ?? -1;
    return (va - vb) * sortDir;
  });

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => -d);
    else { setSortField(field); setSortDir(field === 'hero_name' ? 1 : -1); }
  };

  const sortIcon = (field) => {
    if (sortField !== field) return '';
    return sortDir > 0 ? ' ▲' : ' ▼';
  };

  const playedCount = playedHeroes.length;
  const totalCount = Object.keys(ALL_HEROES).length;
  const hasDraftData = draftMatches > 0;

  const colCount = 4 + (hasDraftData ? 3 : 0) + 5;

  const TABS = [
    { key: 'stats', label: 'Hero Stats' },
    { key: 'tier', label: '🏅 Tier List' },
    { key: 'matchups', label: '⚔️ Matchups' },
    { key: 'meta', label: '📍 Position Meta' },
    { key: 'breakdown', label: '🏛️ Hero Breakdown' },
  ];

  return (
    <div>
      <h1 className="page-title">Heroes</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: tab === t.key ? 700 : 400,
              background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: tab === t.key ? 'var(--accent-blue)' : 'var(--text-muted)',
              borderRadius: 0, marginBottom: -1,
            }}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'tier' && <HeroTierTab playedHeroes={playedHeroes} totalMatches={totalMatches} />}
      {tab === 'matchups' && <HeroMatchupsTab />}
      {tab === 'meta' && <HeroMetaTab />}
      {tab === 'breakdown' && <HeroBreakdownTab />}

      {tab === 'stats' && !loading && (
        <>
          <p style={{ color: '#888', marginBottom: '1rem' }}>
            {playedCount} of {totalCount} heroes played &mdash; {totalMatches} matches
            {hasDraftData && `, ${draftMatches} with draft data`}
            <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-muted)' }}>Click any played hero to see who's played it</span>
          </p>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th className="col-player" style={{ cursor: 'pointer' }} onClick={() => handleSort('hero_name')} title="Hero name">
                    Hero{sortIcon('hero_name')}
                  </th>
                  <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('games')} title="Times picked">
                    Picks{sortIcon('games')}
                  </th>
                  <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('pick_rate')} title="Pick rate">
                    Pick%{sortIcon('pick_rate')}
                  </th>
                  <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('win_rate')} title="Win rate">
                    Win%{sortIcon('win_rate')}
                  </th>
                  {hasDraftData && (
                    <>
                      <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('bans')} title="Times banned">
                        Bans{sortIcon('bans')}
                      </th>
                      <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('ban_rate')} title="Ban rate">
                        Ban%{sortIcon('ban_rate')}
                      </th>
                      <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('contest_rate')} title="Contest rate">
                        Contest%{sortIcon('contest_rate')}
                      </th>
                    </>
                  )}
                  <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_kills')}>K{sortIcon('avg_kills')}</th>
                  <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_deaths')}>D{sortIcon('avg_deaths')}</th>
                  <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_assists')}>A{sortIcon('avg_assists')}</th>
                  <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_gpm')}>GPM{sortIcon('avg_gpm')}</th>
                  <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_hero_damage')}>HD{sortIcon('avg_hero_damage')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((h) => {
                  const winRate = h.games > 0 ? ((h.wins / h.games) * 100).toFixed(0) : '';
                  const pickRate = totalMatches > 0 ? ((h.games / totalMatches) * 100).toFixed(0) : '';
                  const banRate = hasDraftData && draftMatches > 0 ? ((h.bans / draftMatches) * 100).toFixed(0) : '';
                  const contestRate = hasDraftData && draftMatches > 0 ? (((h.games + h.bans) / draftMatches) * 100).toFixed(0) : '';
                  const heroImg = getHeroImageUrl(h.hero_id);
                  const unplayed = h.games === 0 && h.bans === 0;
                  const isExpanded = expandedHero === h.hero_id;
                  const heroPlayers = heroPlayerCache[h.hero_id] || [];
                  const isLoadingPlayers = heroPlayerLoading[h.hero_id];

                  return (
                    <React.Fragment key={h.hero_id}>
                      <tr
                        style={{ opacity: unplayed ? 0.4 : 1, cursor: h.games > 0 ? 'pointer' : 'default', background: isExpanded ? 'rgba(59,130,246,0.08)' : '' }}
                        onClick={() => h.games > 0 && toggleHeroExpand(h.hero_id)}
                        title={h.games > 0 ? 'Click to see who played this hero' : ''}
                      >
                        <td className="col-player">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {heroImg && <img src={heroImg} alt={h.hero_name} style={{ width: '28px', height: '16px', borderRadius: '2px' }} />}
                            <span>{formatHeroName(h.hero_name)}</span>
                            {h.games > 0 && (
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>
                                {isExpanded ? '▲' : '▼'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="col-stat">{h.games || ''}</td>
                        <td className="col-stat" style={{ color: h.games > 0 ? '#94a3b8' : '' }}>
                          {pickRate ? `${pickRate}%` : ''}
                        </td>
                        <td className="col-stat" style={{ color: h.games > 0 ? (parseInt(winRate) >= 50 ? '#4ade80' : '#f87171') : '#555' }}>
                          {winRate ? `${winRate}%` : ''}
                        </td>
                        {hasDraftData && (
                          <>
                            <td className="col-stat" style={{ color: h.bans > 0 ? '#f87171' : '' }}>{h.bans || ''}</td>
                            <td className="col-stat" style={{ color: h.bans > 0 ? '#f87171' : '' }}>{banRate ? `${banRate}%` : ''}</td>
                            <td className="col-stat" style={{ color: parseInt(contestRate) >= 50 ? '#fb923c' : (parseInt(contestRate) >= 20 ? '#facc15' : '') }}>
                              {contestRate ? `${contestRate}%` : ''}
                            </td>
                          </>
                        )}
                        <td className="col-stat">{h.avg_kills ?? ''}</td>
                        <td className="col-stat">{h.avg_deaths ?? ''}</td>
                        <td className="col-stat">{h.avg_assists ?? ''}</td>
                        <td className="col-stat gpm">{h.avg_gpm != null ? parseInt(h.avg_gpm).toLocaleString() : ''}</td>
                        <td className="col-stat">{h.avg_hero_damage != null ? parseInt(h.avg_hero_damage).toLocaleString() : ''}</td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ background: 'rgba(59,130,246,0.04)' }}>
                          <td colSpan={colCount} style={{ padding: '8px 16px 12px 36px' }}>
                            {isLoadingPlayers ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading players…</span>
                            ) : heroPlayers.length === 0 ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No player data found.</span>
                            ) : (
                              <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%', maxWidth: 800 }}>
                                <thead>
                                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                                    <th style={{ padding: '2px 10px 6px 0', fontWeight: 600 }}>Player</th>
                                    <th style={{ padding: '2px 10px 6px 0', fontWeight: 600 }}>Games</th>
                                    <th style={{ padding: '2px 10px 6px 0', fontWeight: 600 }}>Wins</th>
                                    <th style={{ padding: '2px 10px 6px 0', fontWeight: 600 }}>Win%</th>
                                    <th style={{ padding: '2px 10px 6px 0', fontWeight: 600 }}>K/D/A</th>
                                    <th style={{ padding: '2px 10px 6px 0', fontWeight: 600 }}>GPM</th>
                                    {h.hero_id === 14 && <th style={{ padding: '2px 10px 6px 0', fontWeight: 600, color: '#fb923c' }} title="Hook hits / attempts (accuracy %)">Hook Acc</th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {heroPlayers.map(p => {
                                    const pName = p.nickname || p.persona_name || p.player_key;
                                    const wr = parseInt(p.games) > 0 ? Math.round(parseInt(p.wins) / parseInt(p.games) * 100) : 0;
                                    const link = p.account_id > 0 ? `/player/${p.account_id}` : null;
                                    const hookAttempts = parseInt(p.total_hook_attempts || 0);
                                    const hookHits = parseInt(p.total_hook_hits || 0);
                                    const hookAcc = hookAttempts > 0 ? Math.round(hookHits / hookAttempts * 100) : null;
                                    return (
                                      <tr key={p.player_key}>
                                        <td style={{ padding: '3px 10px 3px 0' }}>
                                          {link
                                            ? <a href={link} style={{ color: '#60a5fa', textDecoration: 'none' }}>{pName}</a>
                                            : <span style={{ color: 'var(--text-primary)' }}>{pName}</span>
                                          }
                                        </td>
                                        <td style={{ padding: '3px 10px 3px 0', color: 'var(--text-secondary)' }}>{p.games}</td>
                                        <td style={{ padding: '3px 10px 3px 0', color: '#4ade80' }}>{p.wins}</td>
                                        <td style={{ padding: '3px 10px 3px 0', color: wr >= 50 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{wr}%</td>
                                        <td style={{ padding: '3px 10px 3px 0', color: 'var(--text-secondary)' }}>
                                          {parseFloat(p.avg_kills||0).toFixed(1)}/{parseFloat(p.avg_deaths||0).toFixed(1)}/{parseFloat(p.avg_assists||0).toFixed(1)}
                                        </td>
                                        <td style={{ padding: '3px 10px 3px 0', color: 'var(--text-muted)' }}>{p.avg_gpm ? parseInt(p.avg_gpm).toLocaleString() : '—'}</td>
                                        {h.hero_id === 14 && (
                                          <td style={{ padding: '3px 0 3px 0', color: hookAcc != null ? (hookAcc >= 40 ? '#4ade80' : hookAcc >= 25 ? '#facc15' : '#f87171') : '#334155' }}>
                                            {hookAcc != null ? `${hookHits}/${hookAttempts} (${hookAcc}%)` : '—'}
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'stats' && loading && <div className="loading">Loading hero stats...</div>}
    </div>
  );
}
