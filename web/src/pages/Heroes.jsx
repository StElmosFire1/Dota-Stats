import React, { useState, useEffect } from 'react';
import { getHeroStats } from '../api';
import { getHeroName, getHeroImageUrl } from '../heroNames';

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

export default function Heroes() {
  const [playedHeroes, setPlayedHeroes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('hero_name');
  const [sortDir, setSortDir] = useState(1);

  useEffect(() => {
    getHeroStats()
      .then(data => setPlayedHeroes(data.heroes || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
    if (sortField === 'hero_name') {
      return a.hero_name.localeCompare(b.hero_name) * sortDir;
    }
    if (sortField === 'win_rate') {
      const va = a.games > 0 ? a.wins / a.games : -1;
      const vb = b.games > 0 ? b.wins / b.games : -1;
      return (va - vb) * sortDir;
    }
    const va = a[sortField] ?? -1;
    const vb = b[sortField] ?? -1;
    return (va - vb) * sortDir;
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => -d);
    } else {
      setSortField(field);
      setSortDir(field === 'hero_name' ? 1 : -1);
    }
  };

  const sortIcon = (field) => {
    if (sortField !== field) return '';
    return sortDir > 0 ? ' \u25B2' : ' \u25BC';
  };

  if (loading) return <div className="loading">Loading hero stats...</div>;

  const playedCount = playedHeroes.length;
  const totalCount = Object.keys(ALL_HEROES).length;

  return (
    <div>
      <h1 className="page-title">Hero Stats</h1>
      <p style={{ color: '#888', marginBottom: '1rem' }}>
        {playedCount} of {totalCount} heroes played across all matches
      </p>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-player" style={{ cursor: 'pointer' }} onClick={() => handleSort('hero_name')} title="Hero name (click to sort)">
                Hero{sortIcon('hero_name')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('games')} title="Total games played">
                Games{sortIcon('games')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('win_rate')} title="Win percentage">
                Win %{sortIcon('win_rate')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_kills')} title="Average kills per game">
                K{sortIcon('avg_kills')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_deaths')} title="Average deaths per game">
                D{sortIcon('avg_deaths')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_assists')} title="Average assists per game">
                A{sortIcon('avg_assists')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_gpm')} title="Average GPM">
                GPM{sortIcon('avg_gpm')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_hero_damage')} title="Average Hero Damage">
                HD{sortIcon('avg_hero_damage')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_tower_damage')} title="Average Tower Damage">
                TD{sortIcon('avg_tower_damage')}
              </th>
              <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_hero_healing')} title="Average Hero Healing">
                HH{sortIcon('avg_hero_healing')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => {
              const winRate = h.games > 0 ? ((h.wins / h.games) * 100).toFixed(0) : '';
              const heroImg = getHeroImageUrl(h.hero_id);
              const unplayed = h.games === 0;
              return (
                <tr key={h.hero_id} style={{ opacity: unplayed ? 0.4 : 1 }}>
                  <td className="col-player">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {heroImg && <img src={heroImg} alt={h.hero_name} style={{ width: '28px', height: '16px', borderRadius: '2px' }} />}
                      <span>{h.hero_name}</span>
                    </div>
                  </td>
                  <td className="col-stat">{h.games || ''}</td>
                  <td className="col-stat" style={{ color: !unplayed ? (parseInt(winRate) >= 50 ? '#4ade80' : '#f87171') : '#555' }}>
                    {winRate ? `${winRate}%` : ''}
                  </td>
                  <td className="col-stat">{h.avg_kills ?? ''}</td>
                  <td className="col-stat">{h.avg_deaths ?? ''}</td>
                  <td className="col-stat">{h.avg_assists ?? ''}</td>
                  <td className="col-stat gpm">{h.avg_gpm != null ? parseInt(h.avg_gpm).toLocaleString() : ''}</td>
                  <td className="col-stat">{h.avg_hero_damage != null ? parseInt(h.avg_hero_damage).toLocaleString() : ''}</td>
                  <td className="col-stat">{h.avg_tower_damage != null ? parseInt(h.avg_tower_damage).toLocaleString() : ''}</td>
                  <td className="col-stat">{h.avg_hero_healing != null ? parseInt(h.avg_hero_healing).toLocaleString() : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
