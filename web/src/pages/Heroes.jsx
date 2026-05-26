import React, { useState, useEffect } from 'react';
import SortableTh from '../components/SortableTh';
import { getHeroStats, getHeroMeta, getHeroPlayers, getPlayerHeroProfiles, getHeroMatchups, getHeroTierList, getHeroSynergyMatrix, getHeroCounterScores, getHeroPatchTrends, getAvailableHeroPatches, getHeroPatchDiff } from '../api';
import PaywallCard from '../components/PaywallCard';
import PaywallBlur from '../components/PaywallBlur';
import { getHeroName, getHeroImageUrl } from '../heroNames';
import { formatHeroName } from '../utils/heroes';
import { Link } from 'react-router-dom';
import { useSeason } from '../context/SeasonContext';
import { useFeatureFlag } from '../context/FeatureFlagsContext';

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
        <button onClick={expandAll} className="btn btn-sm">
          Expand All
        </button>
        <button onClick={collapseAll} className="btn btn-sm">
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
                    onClick={(e) => { if (e.target.closest('a,button')) return; toggleExpanded(p.player_key); }}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); toggleExpanded(p.player_key); } }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={!!isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${p.nickname || p.persona_name} stats`}
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

function HeroPortrait({ src, alt }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, color: 'var(--text-muted)',
      }}>🦸</div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      onError={() => setErrored(true)}
    />
  );
}

const TIER_DEFS = [
  { key: 'S', label: 'S Tier', color: '#ff6b35', bg: 'rgba(255,107,53,0.12)', desc: '≥58% win rate' },
  { key: 'A', label: 'A Tier', color: '#f7c059', bg: 'rgba(247,192,89,0.12)', desc: '53–58%' },
  { key: 'B', label: 'B Tier', color: '#a3e635', bg: 'rgba(163,230,53,0.10)', desc: '48–53%' },
  { key: 'C', label: 'C Tier', color: '#60a5fa', bg: 'rgba(96,165,250,0.10)', desc: '43–48%' },
  { key: 'D', label: 'D Tier', color: '#f87171', bg: 'rgba(248,113,113,0.10)', desc: 'Below 43%' },
];

const POS_LABELS = { 0: 'All', 1: 'Pos 1', 2: 'Pos 2', 3: 'Pos 3', 4: 'Pos 4', 5: 'Pos 5' };

function HeroTierTab({ patch = null }) {
  const { seasonId } = useSeason();
  const [tiers, setTiers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterPos, setFilterPos] = useState(0);
  const [prevPatch, setPrevPatch] = useState(null);

  useEffect(() => {
    setLoading(true);
    getHeroTierList(seasonId, patch)
      .then(d => { setTiers(d.tiers || null); setPrevPatch(d.prev_patch || null); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seasonId, patch]);

  const totalHeroes = tiers ? Object.values(tiers).reduce((n, arr) => n + arr.length, 0) : 0;

  if (loading) return <div className="loading">Loading tier list…</div>;
  if (!tiers || totalHeroes === 0) {
    return <p style={{ color: 'var(--text-muted)', padding: 20 }}>Not enough data yet (need at least 2 games per hero).</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0, flex: 1 }}>
          {patch
            ? <>Patch <strong>{patch}</strong> win rates{prevPatch && <> — movement arrows vs patch <strong>{prevPatch}</strong></>}. Heroes need 1+ pick on this patch to appear.</>
            : <>Heroes with 2+ picks, ranked by inhouse win rate. Tier boundaries: S≥58% · A≥53% · B≥48% · C≥43% · D&lt;43%.</>}
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[0, 1, 2, 3, 4, 5].map(pos => (
            <button
              key={pos}
              onClick={() => setFilterPos(pos)}
              style={{
                padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                border: '1px solid var(--border)',
                background: filterPos === pos ? 'var(--accent-blue)' : 'var(--bg-card)',
                color: filterPos === pos ? '#fff' : 'var(--text-muted)',
                fontWeight: filterPos === pos ? 700 : 400,
              }}
            >{POS_LABELS[pos]}</button>
          ))}
        </div>
      </div>

      {TIER_DEFS.map(tier => {
        const tierHeroes = (tiers[tier.key] || []).filter(
          h => filterPos === 0 || h.primary_position === filterPos
        );
        if (tierHeroes.length === 0) return null;
        return (
          <div key={tier.key} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{
                background: tier.color, color: '#111', fontWeight: 800, fontSize: 17,
                padding: '3px 14px', borderRadius: 6, minWidth: 46, textAlign: 'center',
                letterSpacing: 1,
              }}>{tier.key}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{tier.desc}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 4 }}>· {tierHeroes.length} hero{tierHeroes.length !== 1 ? 'es' : ''}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tierHeroes.map(h => {
                const heroImg = getHeroImageUrl(h.hero_id, h.hero_name);
                const wrPct = (h.win_rate * 100).toFixed(1);
                const heroDisplayName = formatHeroName(h.hero_name);
                return (
                  <div key={h.hero_id} style={{
                    background: tier.bg, border: `1px solid ${tier.color}44`,
                    borderRadius: 8, overflow: 'hidden', minWidth: 140, maxWidth: 180,
                    display: 'flex', flexDirection: 'column', flex: '0 0 auto',
                    position: 'relative',
                  }}>
                    {h.is_overridden && (
                      <span title="Tier manually set by admin" style={{
                        position: 'absolute', top: 4, right: 6, zIndex: 1,
                        fontSize: 10, color: 'var(--text-muted)',
                      }}>✏️</span>
                    )}
                    <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(0,0,0,0.4)', overflow: 'hidden', flexShrink: 0 }}>
                      <HeroPortrait src={heroImg} alt={heroDisplayName} />
                    </div>
                    <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.2 }}>{heroDisplayName}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${h.win_rate * 100}%`, height: '100%', background: tier.color, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: tier.color, fontWeight: 700, flexShrink: 0 }}>{wrPct}%</span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {h.games}G · {h.wins}W
                        {h.bans > 0 && ` · ${h.bans} bans`}
                        {h.primary_position > 0 && filterPos === 0 && ` · Pos${h.primary_position}`}
                        {h.win_rate_delta != null && Math.abs(h.win_rate_delta) >= 0.01 && (
                          <span
                            title={`Previous patch: ${(h.prev_win_rate * 100).toFixed(1)}%`}
                            style={{ marginLeft: 6, color: h.win_rate_delta > 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}
                          >
                            {h.win_rate_delta > 0 ? '▲' : '▼'} {(Math.abs(h.win_rate_delta) * 100).toFixed(1)}%
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
        {totalHeroes} heroes with data. Minimum 2 games required. ✏️ = admin override.
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
  const [paywall, setPaywall] = useState(null);

  const heroOptions = Object.entries(ALL_HEROES).sort((a, b) => a[1].localeCompare(b[1]));

  useEffect(() => {
    if (!selectedHero) return;
    setLoading(true);
    setPaywall(null);
    getHeroMatchups(selectedHero, seasonId)
      .then(d => setMatchups(d.matchups || []))
      .catch(err => {
        if (err.paywall) { setPaywall(err); setMatchups([]); }
        else setMatchups([]);
      })
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

  if (paywall) {
    return <PaywallCard feature={paywall.feature || 'hero_matchups'} signedIn={paywall.signedIn} />;
  }

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
                <SortableTh className="col-player" active={sortField === 'opp_hero_name'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('opp_hero_name')}>Opponent{si('opp_hero_name')}</SortableTh>
                <SortableTh className="col-stat" active={sortField === 'matchups'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('matchups')}>Games{si('matchups')}</SortableTh>
                <SortableTh className="col-stat" active={sortField === 'wins'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('wins')}>Wins{si('wins')}</SortableTh>
                <SortableTh className="col-stat" active={sortField === 'wr'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('wr')}>Win %{si('wr')}</SortableTh>
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

// Task #382 — Hero synergy matrix tab (pairs + trios). Heat-mapped by win
// rate, clickable cell wires to /matches?heroes=a,b. Public, all-position.
function HeroSynergyTab({ patch = null }) {
  const { seasonId } = useSeason();
  const [data, setData] = useState({ pairs: [], trios: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('pairs');
  const [sortField, setSortField] = useState('games');
  const [sortDir, setSortDir] = useState(-1);

  useEffect(() => {
    setLoading(true);
    getHeroSynergyMatrix(seasonId, patch)
      .then(d => setData({ pairs: d.pairs || [], trios: d.trios || [] }))
      .catch(() => setData({ pairs: [], trios: [] }))
      .finally(() => setLoading(false));
  }, [seasonId, patch]);

  const handleSort = (f) => {
    if (sortField === f) setSortDir(d => -d);
    else { setSortField(f); setSortDir(-1); }
  };
  const sortIcon = (f) => sortField === f ? (sortDir > 0 ? ' ▲' : ' ▼') : '';
  const wrColor = (wr) => wr >= 0.6 ? '#4ade80' : wr >= 0.5 ? 'var(--text-primary)' : wr >= 0.4 ? 'var(--text-muted)' : '#f87171';
  const wrBg = (wr) => `rgba(${wr >= 0.5 ? '74,222,128' : '248,113,113'}, ${Math.min(0.45, Math.abs(wr - 0.5) * 1.2)})`;

  const rows = (view === 'pairs' ? data.pairs : data.trios).slice().sort((a, b) => {
    const av = sortField === 'win_rate' ? a.win_rate : a[sortField];
    const bv = sortField === 'win_rate' ? b.win_rate : b[sortField];
    return ((av ?? -1) - (bv ?? -1)) * sortDir;
  });

  if (loading) return <div className="loading">Loading synergy matrix…</div>;
  const empty = (view === 'pairs' ? data.pairs : data.trios).length === 0;

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Hero teammates ranked by games played together — click a row to see the underlying matches.
        Heat-mapped by win rate. Includes only pairs/trios with ≥2 shared games.
      </p>
      <div role="radiogroup" aria-label="Synergy view" style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['pairs', 'Pairs'], ['trios', 'Trios']].map(([k, l]) => (
          <button
            key={k}
            role="radio"
            aria-checked={view === k}
            onClick={() => setView(k)}
            style={{
              padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
              border: '1px solid var(--border)',
              background: view === k ? 'var(--accent-blue)' : 'var(--bg-card)',
              color: view === k ? '#fff' : 'var(--text-primary)',
              fontWeight: view === k ? 700 : 400,
            }}
          >{l}</button>
        ))}
      </div>
      {empty ? (
        <div className="empty-state"><p>Not enough data yet for {view}.</p></div>
      ) : (
        <div className="scoreboard-wrapper">
          <table className="scoreboard">
            <thead>
              <tr>
                <th className="col-player">{view === 'pairs' ? 'Hero pair' : 'Hero trio'}</th>
                <SortableTh className="col-stat" active={sortField === 'games'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('games')}>Games{sortIcon('games')}</SortableTh>
                <SortableTh className="col-stat" active={sortField === 'wins'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('wins')}>Wins{sortIcon('wins')}</SortableTh>
                <SortableTh className="col-stat" active={sortField === 'win_rate'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('win_rate')}>Win %{sortIcon('win_rate')}</SortableTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ids = view === 'pairs' ? [r.hero_a, r.hero_b] : [r.hero_a, r.hero_b, r.hero_c];
                const names = view === 'pairs'
                  ? [r.hero_a_name, r.hero_b_name]
                  : [r.hero_a_name, r.hero_b_name, r.hero_c_name];
                const key = ids.join('-');
                return (
                  <tr key={key} style={{ background: wrBg(r.win_rate) }}>
                    <td className="col-player">
                      <Link
                        to={`/matches?heroes=${ids.join(',')}`}
                        style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                        aria-label={`See matches with ${names.join(' + ')}`}
                      >
                        {ids.map((id, i) => {
                          const img = getHeroImageUrl(id, names[i]);
                          return (
                            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {img && <img src={img} alt="" style={{ width: 24, height: 14, borderRadius: 2 }} />}
                              <span>{formatHeroName(names[i] || `Hero ${id}`)}</span>
                              {i < ids.length - 1 && <span style={{ color: 'var(--text-muted)' }}>+</span>}
                            </span>
                          );
                        })}
                      </Link>
                    </td>
                    <td className="col-stat">{r.games}</td>
                    <td className="col-stat">{r.wins}</td>
                    <td className="col-stat" style={{ color: wrColor(r.win_rate), fontWeight: 700 }}>{(r.win_rate * 100).toFixed(1)}%</td>
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

// Task #382 — Counter-pick scorer tab. Pick up to 5 enemy heroes + an
// optional position; see the strongest heroes to pick into them ranked
// by blended (counter WR × base WR) score with sample-size shrinkage.
function HeroCounterTab({ patch = null }) {
  const { seasonId } = useSeason();
  const [enemies, setEnemies] = useState([]);
  const [position, setPosition] = useState(null);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const allHeroEntries = Object.entries(ALL_HEROES).sort((a, b) => a[1].localeCompare(b[1]));
  const filtered = search.length >= 1
    ? allHeroEntries.filter(([id, name]) =>
        name.toLowerCase().includes(search.toLowerCase()) && !enemies.includes(parseInt(id))
      ).slice(0, 12)
    : [];

  const addEnemy = (id) => {
    if (enemies.length >= 5 || enemies.includes(id)) return;
    setEnemies([...enemies, id]);
    setSearch('');
  };
  const removeEnemy = (id) => setEnemies(enemies.filter(x => x !== id));

  const compute = async () => {
    if (enemies.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const d = await getHeroCounterScores({ enemies, position, seasonId, patch });
      setSuggestions(d.suggestions || []);
    } catch (e) {
      setError(e.message || 'Failed to compute counter scores');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Pick up to 5 enemy heroes and an optional position, then get a ranked list of heroes that
        win most often when facing this lineup. Powered by inhouse match history.
      </p>

      <div className="stat-card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Enemy heroes ({enemies.length}/5)</div>
        <div style={{ minHeight: 36, marginBottom: 10 }}>
          {enemies.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No enemy heroes yet</span>}
          {enemies.map((id) => {
            const name = getHeroName(id) || `Hero ${id}`;
            const img = getHeroImageUrl(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => removeEnemy(id)}
                aria-label={`Remove ${name}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(244,67,54,0.2)', border: '1px solid var(--accent-red)', borderRadius: 16, padding: '3px 8px 3px 4px', margin: 2, cursor: 'pointer', fontSize: 12, color: 'inherit', font: 'inherit' }}
              >
                {img && <img src={img} alt="" style={{ width: 20, height: 20, borderRadius: 3 }} />}
                <span>{name}</span>
                <span style={{ color: '#888', marginLeft: 2 }}>✕</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }} htmlFor="counter-hero-search">Add enemy hero</label>
            <input
              id="counter-hero-search"
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type hero name…"
              disabled={enemies.length >= 5}
              style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }} htmlFor="counter-position">My position</label>
            <select
              id="counter-position"
              value={position || ''}
              onChange={e => setPosition(e.target.value ? parseInt(e.target.value) : null)}
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}
            >
              <option value="">Any position</option>
              {[1,2,3,4,5].map(p => <option key={p} value={p}>Pos {p} — {POSITIONS[p]}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={compute} disabled={loading || enemies.length === 0}>
            {loading ? 'Computing…' : 'Rank counters'}
          </button>
        </div>
        {filtered.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {filtered.map(([id, name]) => {
              const img = getHeroImageUrl(parseInt(id));
              return (
                <button key={id} className="btn btn-small" onClick={() => addEnemy(parseInt(id))} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {img && <img src={img} alt="" style={{ width: 18, height: 18, borderRadius: 2 }} />}
                  {name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && <div className="error-state" style={{ marginBottom: 12 }}>{error}</div>}
      {suggestions && (
        suggestions.length === 0 ? (
          <div className="empty-state"><p>No inhouse history yet for these enemies at this position.</p></div>
        ) : (
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th className="col-rank">#</th>
                  <th className="col-player">Hero</th>
                  <th className="col-stat" title="Win rate vs these enemies">vs Enemies</th>
                  <th className="col-stat" title="Overall win rate at this position">Base WR</th>
                  <th className="col-stat" title="Sample size facing these enemies">Games</th>
                  <th className="col-stat" title="Blended counter + base score with sample-size shrinkage">Score</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s, i) => {
                  const name = formatHeroName(getHeroName(s.hero_id) || s.hero_name || `Hero ${s.hero_id}`);
                  const img = getHeroImageUrl(s.hero_id);
                  const scoreColor = s.score > 0.55 ? '#4ade80' : s.score < 0.45 ? '#f87171' : 'var(--text-primary)';
                  return (
                    <tr key={s.hero_id}>
                      <td className="col-rank">{i + 1}</td>
                      <td className="col-player">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {img && <img src={img} alt={name} style={{ width: 28, height: 16, borderRadius: 2 }} />}
                          <span>{name}</span>
                        </div>
                      </td>
                      <td className="col-stat" style={{ color: s.counter_wr >= 0.5 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                        {(s.counter_wr * 100).toFixed(1)}%
                      </td>
                      <td className="col-stat" style={{ color: 'var(--text-muted)' }}>{(s.base_wr * 100).toFixed(1)}%</td>
                      <td className="col-stat" style={{ color: 'var(--text-muted)' }}>{s.games}</td>
                      <td className="col-stat" style={{ color: scoreColor, fontWeight: 700 }}>{(s.score * 100).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// Task #382 — Patch trends tab. Pick a hero, see pick rate + win rate
// over the last N patches as a simple bar chart. Empty state nudges
// admin to run the backfill if no patched rows exist yet.
function HeroPatchTrendsTab() {
  const { seasonId } = useSeason();
  const [heroId, setHeroId] = useState('');
  const [patches, setPatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const heroOptions = Object.entries(ALL_HEROES).sort((a, b) => a[1].localeCompare(b[1]));

  useEffect(() => {
    if (!heroId) { setPatches([]); return; }
    setLoading(true);
    getHeroPatchTrends(heroId, { limit: 8, seasonId })
      .then(d => setPatches(d.patches || []))
      .catch(() => setPatches([]))
      .finally(() => setLoading(false));
  }, [heroId, seasonId]);

  const ordered = patches.slice().reverse(); // chronological for the chart
  const maxPickRate = Math.max(0.0001, ...ordered.map(p => p.pick_rate));

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Pick + win rate per patch for one hero, oldest to newest (up to last 8 patches with data).
      </p>
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }} htmlFor="trends-hero">Hero</label>
        <select
          id="trends-hero"
          value={heroId}
          onChange={e => setHeroId(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}
        >
          <option value="">— Select a hero —</option>
          {heroOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      {loading && <div className="loading">Loading patch trends…</div>}
      {!loading && heroId && ordered.length === 0 && (
        <div className="empty-state">
          <p>No patched matches yet for this hero. Older uploads may not have <code>patch</code> set —
            an admin can run the patch backfill (<code>POST /api/admin/heroes/backfill-patch</code>)
            to populate older rows.</p>
        </div>
      )}
      {!loading && ordered.length > 0 && (
        <div className="scoreboard-wrapper">
          <table className="scoreboard">
            <thead>
              <tr>
                <th>Patch</th>
                <th className="col-stat">Picks</th>
                <th className="col-stat">Wins</th>
                <th className="col-stat">Win %</th>
                <th className="col-stat">Pick %</th>
                <th>Pick-rate trend</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map(p => {
                const wrPct = (p.win_rate * 100).toFixed(1);
                const prPct = (p.pick_rate * 100).toFixed(1);
                const barWidth = (p.pick_rate / maxPickRate) * 100;
                const wrColor = p.win_rate >= 0.55 ? '#4ade80' : p.win_rate >= 0.45 ? 'var(--text-primary)' : '#f87171';
                return (
                  <tr key={p.patch}>
                    <td style={{ fontWeight: 700 }}>{p.patch}</td>
                    <td className="col-stat">{p.picks}</td>
                    <td className="col-stat">{p.wins}</td>
                    <td className="col-stat" style={{ color: wrColor, fontWeight: 600 }}>{wrPct}%</td>
                    <td className="col-stat" style={{ color: 'var(--text-muted)' }}>{prPct}%</td>
                    <td>
                      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 3, height: 8, width: 140, overflow: 'hidden' }}>
                        <div style={{ width: `${barWidth}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: 3 }} />
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
  // Task #382 — patch picker (shared across Tier / Synergy / Counter tabs).
  // Empty string = "All patches" (default for back-compat with the existing
  // all-time tier list); first non-empty patch option from the DB is the
  // current patch and is the first non-default item the user sees.
  const [patch, setPatch] = useState('');
  const [availablePatches, setAvailablePatches] = useState([]);

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

  useEffect(() => {
    getAvailableHeroPatches(seasonId)
      .then((d) => {
        const list = d.patches || [];
        setAvailablePatches(list);
        // Task #382 — default the picker to the current (latest) patch when
        // one is available; users can still pick "All patches" explicitly.
        if (list.length > 0 && list[0]) setPatch(list[0]);
      })
      .catch(() => setAvailablePatches([]));
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
    { key: 'synergy', label: '🤝 Synergy' },
    { key: 'counter', label: '🎯 Counter-pick' },
    { key: 'trends', label: '📈 Patch Trends' },
    { key: 'matchups', label: '⚔️ Matchups' },
    { key: 'diff', label: '📊 Patch Diff' },
    { key: 'meta', label: '★ Position Meta', pro: true },
    { key: 'breakdown', label: '★ Hero Breakdown', pro: true },
  ];

  return (
    <div>
      <h1 className="page-title">Heroes</h1>

      {(tab === 'tier' || tab === 'synergy' || tab === 'counter') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <label htmlFor="heroes-patch-picker" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Patch:</label>
          <select
            id="heroes-patch-picker"
            value={patch}
            onChange={(e) => setPatch(e.target.value)}
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 13 }}
          >
            <option value="">All patches</option>
            {availablePatches.length > 0 && availablePatches[0] && (
              <option value={availablePatches[0]}>{availablePatches[0]} (current)</option>
            )}
            {availablePatches.slice(1).map((pv) => (
              <option key={pv} value={pv}>{pv}</option>
            ))}
          </select>
          {availablePatches.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              No patched matches yet — an admin can run the patch backfill to enable per-patch filtering.
            </span>
          )}
        </div>
      )}

      <div
        role="tablist"
        aria-label="Hero stats views"
        style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0, flexWrap: 'wrap' }}
      >
        {TABS.map(t => {
          const isActive = tab === t.key;
          // Gold-tint Pro tabs so members see at-a-glance which features are part of their subscription.
          const proColor = '#fbbf24';
          const activeColor = t.pro ? proColor : 'var(--accent-blue)';
          const restColor = t.pro ? 'rgba(251,191,36,0.65)' : 'var(--text-muted)';
          return (
            <button
              key={t.key}
              id={`heroes-tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`heroes-tabpanel-${t.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(t.key)}
              title={t.pro ? 'Pro feature' : undefined}
              style={{
                padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: isActive || t.pro ? 700 : 400,
                background: 'none', border: 'none',
                borderBottom: isActive ? `2px solid ${activeColor}` : '2px solid transparent',
                color: isActive ? activeColor : restColor,
                borderRadius: 0, marginBottom: -1,
              }}
            >{t.label}</button>
          );
        })}
      </div>

      {tab === 'tier' && (
        <div role="tabpanel" id="heroes-tabpanel-tier" aria-labelledby="heroes-tab-tier"><HeroTierTab patch={patch || null} /></div>
      )}
      {tab === 'synergy' && (
        <div role="tabpanel" id="heroes-tabpanel-synergy" aria-labelledby="heroes-tab-synergy"><HeroSynergyTab patch={patch || null} /></div>
      )}
      {tab === 'counter' && (
        <div role="tabpanel" id="heroes-tabpanel-counter" aria-labelledby="heroes-tab-counter"><HeroCounterTab patch={patch || null} /></div>
      )}
      {tab === 'trends' && (
        <div role="tabpanel" id="heroes-tabpanel-trends" aria-labelledby="heroes-tab-trends"><HeroPatchTrendsTab /></div>
      )}
      {tab === 'matchups' && (
        <div role="tabpanel" id="heroes-tabpanel-matchups" aria-labelledby="heroes-tab-matchups"><HeroMatchupsTab /></div>
      )}
      {tab === 'diff' && (
        <div role="tabpanel" id="heroes-tabpanel-diff" aria-labelledby="heroes-tab-diff">
          <HeroPatchDiffTab availablePatches={availablePatches} />
        </div>
      )}
      {tab === 'meta' && (
        <div role="tabpanel" id="heroes-tabpanel-meta" aria-labelledby="heroes-tab-meta">
          <PaywallBlur feature="hero_position_meta" minHeight={520}>
            <HeroMetaTab />
          </PaywallBlur>
        </div>
      )}
      {tab === 'breakdown' && (
        <div role="tabpanel" id="heroes-tabpanel-breakdown" aria-labelledby="heroes-tab-breakdown">
          <PaywallBlur feature="hero_breakdown" minHeight={520}>
            <HeroBreakdownTab />
          </PaywallBlur>
        </div>
      )}

      {tab === 'stats' && !loading && (
        <div role="tabpanel" id="heroes-tabpanel-stats" aria-labelledby="heroes-tab-stats">
          <p style={{ color: '#888', marginBottom: '1rem' }}>
            {playedCount} of {totalCount} heroes played &mdash; {totalMatches} matches
            {hasDraftData && `, ${draftMatches} with draft data`}
            <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-muted)' }}>Click any played hero to see who's played it</span>
          </p>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <SortableTh className="col-player" title="Hero name" active={sortField === 'hero_name'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('hero_name')}>
                    Hero{sortIcon('hero_name')}
                  </SortableTh>
                  <SortableTh className="col-stat" title="Times picked" active={sortField === 'games'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('games')}>
                    Picks{sortIcon('games')}
                  </SortableTh>
                  <SortableTh className="col-stat" title="Pick rate" active={sortField === 'pick_rate'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('pick_rate')}>
                    Pick%{sortIcon('pick_rate')}
                  </SortableTh>
                  <SortableTh className="col-stat" title="Win rate" active={sortField === 'win_rate'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('win_rate')}>
                    Win%{sortIcon('win_rate')}
                  </SortableTh>
                  {hasDraftData && (
                    <>
                      <SortableTh className="col-stat" title="Times banned" active={sortField === 'bans'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('bans')}>
                        Bans{sortIcon('bans')}
                      </SortableTh>
                      <SortableTh className="col-stat" title="Ban rate" active={sortField === 'ban_rate'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('ban_rate')}>
                        Ban%{sortIcon('ban_rate')}
                      </SortableTh>
                      <SortableTh className="col-stat" title="Contest rate" active={sortField === 'contest_rate'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('contest_rate')}>
                        Contest%{sortIcon('contest_rate')}
                      </SortableTh>
                    </>
                  )}
                  <SortableTh className="col-stat" active={sortField === 'avg_kills'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_kills')}>K{sortIcon('avg_kills')}</SortableTh>
                  <SortableTh className="col-stat" active={sortField === 'avg_deaths'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_deaths')}>D{sortIcon('avg_deaths')}</SortableTh>
                  <SortableTh className="col-stat" active={sortField === 'avg_assists'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_assists')}>A{sortIcon('avg_assists')}</SortableTh>
                  <SortableTh className="col-stat" active={sortField === 'avg_gpm'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_gpm')}>GPM{sortIcon('avg_gpm')}</SortableTh>
                  <SortableTh className="col-stat" active={sortField === 'avg_hero_damage'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_hero_damage')}>HD{sortIcon('avg_hero_damage')}</SortableTh>
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
                        onKeyDown={(e) => {
                          if (h.games > 0 && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            toggleHeroExpand(h.hero_id);
                          }
                        }}
                        role={h.games > 0 ? 'button' : undefined}
                        tabIndex={h.games > 0 ? 0 : undefined}
                        aria-expanded={h.games > 0 ? isExpanded : undefined}
                        aria-label={h.games > 0 ? `${isExpanded ? 'Collapse' : 'Expand'} players for ${formatHeroName(h.hero_name)}` : undefined}
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
        </div>
      )}

      {tab === 'stats' && loading && (
        <div role="tabpanel" id="heroes-tabpanel-stats" aria-labelledby="heroes-tab-stats" className="loading">Loading hero stats...</div>
      )}

      <HeroMetaV2Panel />
    </div>
  );
}

// Task #409 — Patch Diff tab. Side-by-side patch comparison with
// per-hero deltas in WR, pick rate, ban rate, and position-distribution.
// Default sort is by |Δ win rate|; top movers float to the top with a
// gold accent. Public, no paywall — same trust as the other diff/list
// tabs on this page.
function HeroPatchDiffTab({ availablePatches }) {
  const { seasonId } = useSeason();
  const [fromPatch, setFromPatch] = useState('');
  const [toPatch, setToPatch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [sortBy, setSortBy] = useState('wr_delta');
  const [minGames, setMinGames] = useState(3);

  useEffect(() => {
    if (!fromPatch && !toPatch && availablePatches.length >= 2) {
      setToPatch(availablePatches[0]);
      setFromPatch(availablePatches[1]);
    }
  }, [availablePatches, fromPatch, toPatch]);

  useEffect(() => {
    if (!fromPatch || !toPatch || fromPatch === toPatch) { setData(null); return; }
    setLoading(true);
    setErr('');
    getHeroPatchDiff({ from: fromPatch, to: toPatch, seasonId })
      .then((d) => setData(d))
      .catch((e) => { setErr(e.message || 'Failed to load diff'); setData(null); })
      .finally(() => setLoading(false));
  }, [fromPatch, toPatch, seasonId]);

  if (availablePatches.length < 2) {
    return (
      <p style={{ color: 'var(--text-muted)' }}>
        Patch diff needs at least two patches of matches. An admin can run the patch backfill to enable this view.
      </p>
    );
  }

  const rows = (data?.heroes || []).filter((h) => Math.max(h.from.games, h.to.games) >= minGames);
  const sorted = [...rows].sort((a, b) => {
    const av = sortMetric(a, sortBy);
    const bv = sortMetric(b, sortBy);
    return Math.abs(bv) - Math.abs(av);
  });
  const topMoverIds = new Set(sorted.slice(0, 5).map((r) => r.hero_id));

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label htmlFor="diff-from" style={{ fontSize: 13, color: 'var(--text-muted)' }}>From:</label>
        <select id="diff-from" value={fromPatch} onChange={(e) => setFromPatch(e.target.value)}
          style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px' }}>
          {availablePatches.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label htmlFor="diff-to" style={{ fontSize: 13, color: 'var(--text-muted)' }}>To:</label>
        <select id="diff-to" value={toPatch} onChange={(e) => setToPatch(e.target.value)}
          style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px' }}>
          {availablePatches.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label htmlFor="diff-min" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Min games:</label>
        <input id="diff-min" type="number" min={1} max={50} value={minGames}
          onChange={(e) => setMinGames(Math.max(1, parseInt(e.target.value) || 1))}
          style={{ width: 60, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px' }} />
        <label htmlFor="diff-sort" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sort by |Δ|:</label>
        <select id="diff-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px' }}>
          <option value="wr_delta">Win rate</option>
          <option value="pick_delta">Pick rate</option>
          <option value="ban_delta">Ban rate</option>
        </select>
      </div>
      {err && <p style={{ color: '#f87171', fontSize: 13 }}>{err}</p>}
      {fromPatch === toPatch && <p style={{ color: 'var(--text-muted)' }}>Pick two different patches to compare.</p>}
      {loading && <div className="loading">Loading patch diff…</div>}
      {!loading && data && (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 0 }}>
            {data.from_patch} ({data.from_total_matches} matches) → {data.to_patch} ({data.to_total_matches} matches).
            Top 5 movers highlighted in gold.
          </p>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Hero</th>
                  <th>{data.from_patch} WR</th>
                  <th>{data.to_patch} WR</th>
                  <th>Δ WR</th>
                  <th>Δ Pick%</th>
                  <th>Δ Ban%</th>
                  <th>Position shift</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 80).map((h) => {
                  const isMover = topMoverIds.has(h.hero_id);
                  const wrA = h.from.win_rate;
                  const wrB = h.to.win_rate;
                  const dWr = h.delta.win_rate;
                  const dPick = h.delta.pick_rate;
                  const dBan = h.delta.ban_rate;
                  const img = getHeroImageUrl(h.hero_id);
                  const posLabels = ['1','2','3','4','5'];
                  const biggestShift = h.delta.pos_shift.reduce((acc, v, i) => Math.abs(v) > Math.abs(acc.v) ? { v, i } : acc, { v: 0, i: 0 });
                  return (
                    <tr key={h.hero_id} style={{ background: isMover ? 'rgba(245,158,11,0.08)' : '' }}>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {img && <img src={img} alt={h.hero_name || ''} style={{ width: 28, height: 16, borderRadius: 2 }} />}
                          <span style={{ color: isMover ? 'var(--gold, #c5a975)' : undefined, fontWeight: isMover ? 700 : 400 }}>
                            {formatHeroName(h.hero_name || getHeroName(h.hero_id))}
                          </span>
                        </div>
                      </td>
                      <td>{wrA != null ? `${(wrA * 100).toFixed(0)}%` : '—'} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({h.from.games})</span></td>
                      <td>{wrB != null ? `${(wrB * 100).toFixed(0)}%` : '—'} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({h.to.games})</span></td>
                      <td style={{ color: dWr == null ? '#555' : dWr >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                        {dWr == null ? '—' : `${dWr >= 0 ? '+' : ''}${(dWr * 100).toFixed(1)}pp`}
                      </td>
                      <td style={{ color: dPick >= 0 ? '#4ade80' : '#f87171' }}>
                        {`${dPick >= 0 ? '+' : ''}${(dPick * 100).toFixed(1)}%`}
                      </td>
                      <td style={{ color: dBan >= 0 ? '#fb923c' : 'var(--text-muted)' }}>
                        {`${dBan >= 0 ? '+' : ''}${(dBan * 100).toFixed(1)}%`}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {Math.abs(biggestShift.v) < 0.05 ? <span style={{ color: 'var(--text-muted)' }}>—</span> : (
                          <span style={{ color: biggestShift.v > 0 ? '#4ade80' : '#f87171' }}>
                            Pos {posLabels[biggestShift.i]} {biggestShift.v > 0 ? '+' : ''}{(biggestShift.v * 100).toFixed(0)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
function sortMetric(h, key) {
  if (key === 'pick_delta') return h.delta.pick_rate || 0;
  if (key === 'ban_delta') return h.delta.ban_rate || 0;
  return h.delta.win_rate || 0;
}

function HeroMetaV2Panel() {
  const enabled = useFeatureFlag('hero_meta_v2');
  const { seasonId } = useSeason();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    setPaywall(null);
    // Direct fetch (not fetchJson) so we can read 402 status manually.
    fetch(`/api/heroes/meta-v2${seasonId ? `?season=${seasonId}` : ''}`)
      .then(async r => {
        if (r.status === 402) {
          const data = await r.json().catch(() => ({}));
          if (data?.paywall) {
            setPaywall({ feature: data.feature || 'hero_meta_v2', signedIn: Boolean(data.signed_in) });
          }
          return { heroes: [] };
        }
        return r.ok ? r.json() : { heroes: [] };
      })
      .then(d => setRows(d.heroes || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [enabled, seasonId]);
  if (!enabled) return null;
  if (paywall) {
    return (
      <section style={{ marginTop: 28 }}>
        <PaywallCard feature={paywall.feature} signedIn={paywall.signedIn} />
      </section>
    );
  }
  return (
    <section style={{ marginTop: 28, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>📊 Hero Meta V2</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
        Win rates by lane role and pick frequency, including breakdown by IH tier.
      </p>
      {loading ? <div className="loading">Loading meta…</div> : (
        <div className="scoreboard-wrapper">
          <table className="scoreboard">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Hero</th>
                <th>Picks</th>
                <th>Win %</th>
                <th>Safe Lane WR</th>
                <th>Mid WR</th>
                <th>Off WR</th>
                <th>Soft Sup WR</th>
                <th>Hard Sup WR</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map(h => (
                <tr key={h.hero_id}>
                  <td style={{ textAlign: 'left' }}>{formatHeroName(getHeroName(h.hero_id))}</td>
                  <td>{h.picks ?? 0}</td>
                  <td>{h.win_rate != null ? `${(h.win_rate * 100).toFixed(1)}%` : '—'}</td>
                  <td>{h.lane_wr?.[1] != null ? `${(h.lane_wr[1] * 100).toFixed(0)}%` : '—'}</td>
                  <td>{h.lane_wr?.[2] != null ? `${(h.lane_wr[2] * 100).toFixed(0)}%` : '—'}</td>
                  <td>{h.lane_wr?.[3] != null ? `${(h.lane_wr[3] * 100).toFixed(0)}%` : '—'}</td>
                  <td>{h.lane_wr?.[4] != null ? `${(h.lane_wr[4] * 100).toFixed(0)}%` : '—'}</td>
                  <td>{h.lane_wr?.[5] != null ? `${(h.lane_wr[5] * 100).toFixed(0)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
