import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getMatch, deleteMatch, updatePlayerPosition } from '../api';
import { getHeroName, getHeroImageUrl, getItemImageUrl } from '../heroNames';

const POSITION_NAMES = {
  0: '-',
  1: 'Pos 1',
  2: 'Pos 2',
  3: 'Pos 3',
  4: 'Pos 4',
  5: 'Pos 5',
};

function formatDuration(seconds) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDurationLong(seconds) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  let str = `${m} minute${m !== 1 ? 's' : ''}`;
  if (s > 0) str += ` ${s} second${s !== 1 ? 's' : ''}`;
  return str;
}

function formatNumber(n) {
  if (n == null) return '-';
  return n.toLocaleString();
}

function getDisplayName(player, index) {
  return player.nickname || player.persona_name || `Player ${index + 1}`;
}

function PlayerLink({ player, index }) {
  const name = getDisplayName(player, index);
  if (player.account_id > 0) {
    return <Link to={`/player/${player.account_id}`} className="player-link">{name}</Link>;
  }
  if (player.persona_name) {
    return <Link to={`/player/${encodeURIComponent(player.persona_name)}`} className="player-link">{name}</Link>;
  }
  return <span>{name}</span>;
}

function ItemIcon({ itemName, itemId }) {
  if (!itemName && !itemId) return <div className="item-icon empty" />;
  const url = getItemImageUrl(itemName, itemId);
  if (!url) return <div className="item-icon empty" />;
  return (
    <img
      src={url}
      alt={itemName || ''}
      className="item-icon"
      title={itemName ? itemName.replace('item_', '').replace(/_/g, ' ') : ''}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

function PositionSelect({ player, matchId, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const pos = player.position || 0;

  if (!editing) {
    return (
      <span
        className="position-label editable"
        onClick={() => setEditing(true)}
        title="Click to edit position"
      >
        {POSITION_NAMES[pos] || '-'}
      </span>
    );
  }

  return (
    <select
      className="position-select"
      value={pos}
      autoFocus
      onChange={async (e) => {
        const newPos = parseInt(e.target.value);
        const uploadKey = localStorage.getItem('uploadKey');
        if (!uploadKey) {
          alert('Set an upload key first (Upload page)');
          setEditing(false);
          return;
        }
        try {
          await updatePlayerPosition(matchId, player.slot, newPos, uploadKey);
          onUpdate(player.slot, newPos);
        } catch (err) {
          alert('Failed: ' + err.message);
        }
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
    >
      {Object.entries(POSITION_NAMES).map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}

function TeamTable({ players, teamName, isWinner, matchId, onPositionUpdate }) {
  const hasDetailedStats = players.some(p => p.gpm > 0 || p.hero_damage > 0);
  const hasItems = players.some(p => p.items && p.items.length > 0);

  return (
    <div className={`team-section ${teamName}`}>
      <div className={`team-header ${teamName}`}>
        <span className="team-name">{teamName === 'radiant' ? 'Radiant' : 'Dire'}</span>
        {isWinner && <span className="winner-badge">Winner</span>}
      </div>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-hero-img" style={{ width: '36px' }}></th>
              <th className="col-player" title="Player name">Player</th>
              <th className="col-stat" title="Position (1-5) — click to edit" style={{ minWidth: '50px' }}>Pos</th>
              <th className="col-hero" title="Hero played">Hero</th>
              <th className="col-stat" title="Kills">K</th>
              <th className="col-stat" title="Deaths">D</th>
              <th className="col-stat" title="Assists">A</th>
              {hasDetailedStats && (
                <>
                  <th className="col-stat" title="Last Hits">LH</th>
                  <th className="col-stat" title="Denies">DN</th>
                  <th className="col-stat" title="Gold Per Minute">GPM</th>
                  <th className="col-stat" title="Experience Per Minute">XPM</th>
                  <th className="col-stat" title="Hero Damage">HD</th>
                  <th className="col-stat" title="Tower Damage">TD</th>
                  <th className="col-stat" title="Hero Healing">HH</th>
                  <th className="col-stat" title="Net Worth">NW</th>
                </>
              )}
              {hasItems && <th className="col-items" style={{ minWidth: '260px' }} title="End-game inventory (6 slots) | Backpack (3 slots) | Aghs status">Items</th>}
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const heroImg = getHeroImageUrl(p.hero_id, p.hero_name);
              return (
                <tr key={i}>
                  <td style={{ width: '36px', padding: '2px' }}>
                    {heroImg && (
                      <img
                        src={heroImg}
                        alt=""
                        style={{ width: '36px', height: '20px', objectFit: 'cover', borderRadius: '2px' }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    )}
                  </td>
                  <td className="col-player">
                    <PlayerLink player={p} index={i} />
                    <span className="player-badges">
                      {p.firstblood_claimed > 0 && <span className="badge fb" title="First Blood">FB</span>}
                      {p.first_death > 0 && <span className="badge fd" title="First Death">FD</span>}
                    </span>
                  </td>
                  <td className="col-stat">
                    <PositionSelect player={p} matchId={matchId} onUpdate={onPositionUpdate} />
                  </td>
                  <td className="col-hero">{getHeroName(p.hero_id, p.hero_name)}</td>
                  <td className="col-stat kills">{p.kills}</td>
                  <td className="col-stat deaths">{p.deaths}</td>
                  <td className="col-stat assists">{p.assists}</td>
                  {hasDetailedStats && (
                    <>
                      <td className="col-stat">{formatNumber(p.last_hits)}</td>
                      <td className="col-stat">{formatNumber(p.denies)}</td>
                      <td className="col-stat gpm">{formatNumber(p.gpm)}</td>
                      <td className="col-stat xpm">{formatNumber(p.xpm)}</td>
                      <td className="col-stat">{formatNumber(p.hero_damage)}</td>
                      <td className="col-stat">{formatNumber(p.tower_damage)}</td>
                      <td className="col-stat">{formatNumber(p.hero_healing)}</td>
                      <td className="col-stat nw">{formatNumber(p.net_worth)}</td>
                    </>
                  )}
                  {hasItems && (
                    <td className="col-items">
                      <div className="items-row">
                        {Array.from({ length: 6 }, (_, j) => {
                          const item = (p.items || []).find(it => it.item_slot === j);
                          return <ItemIcon key={j} itemName={item?.item_name} itemId={item?.item_id} />;
                        })}
                        <span className="aghs-indicators">
                          <img
                            src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/ultimate_scepter.png"
                            alt="Aghanim's Scepter"
                            title="Aghanim's Scepter"
                            className={`aghs-icon ${p.has_scepter ? 'active' : 'inactive'}`}
                          />
                          <img
                            src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/aghanims_shard.png"
                            alt="Aghanim's Shard"
                            title="Aghanim's Shard"
                            className={`aghs-icon ${p.has_shard ? 'active' : 'inactive'}`}
                          />
                        </span>
                        <span className="backpack-separator">|</span>
                        {Array.from({ length: 3 }, (_, j) => {
                          const item = (p.items || []).find(it => it.item_slot === (j + 6));
                          return <ItemIcon key={`bp-${j}`} itemName={item?.item_name} itemId={item?.item_id} />;
                        })}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SkillBuild({ abilities }) {
  if (!abilities || abilities.length === 0) return null;
  return (
    <div className="skill-build">
      {abilities.map((a, i) => (
        <span key={i} className="skill-pip" title={`Lvl ${a.ability_level}: ${a.ability_name.replace('special_bonus_', 'talent: ')}`}>
          {a.ability_name.includes('special_bonus') ? 'T' : a.ability_level}
        </span>
      ))}
    </div>
  );
}

function ExpandedStats({ players }) {
  const hasAny = players.some(p =>
    p.buybacks > 0 || p.courier_kills > 0 || p.double_kills > 0 || p.rampages > 0 ||
    p.smoke_kills > 0 || p.kill_streak > 0 || p.rune_pickups > 0 || p.stun_duration > 0 ||
    p.obs_placed > 0 || p.wards_killed > 0
  );
  if (!hasAny) return null;

  return (
    <div className="expanded-stats-section">
      <h3>Detailed Stats</h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact">
          <thead>
            <tr>
              <th className="col-player" title="Player name">Player</th>
              <th className="col-stat" title="Observer Wards placed">OBS</th>
              <th className="col-stat" title="Sentry Wards placed">SEN</th>
              <th className="col-stat" title="Enemy wards dewarded (destroyed)">DEW</th>
              <th className="col-stat" title="Camps stacked">STK</th>
              <th className="col-stat" title="Rune pickups">RUN</th>
              <th className="col-stat" title="Total stun duration dealt (seconds)">STUN</th>
              <th className="col-stat" title="Total damage taken from enemy heroes">DT</th>
              <th className="col-stat" title="Number of buybacks used">BB</th>
              <th className="col-stat" title="Enemy couriers killed">CK</th>
              <th className="col-stat" title="Longest kill streak">KS</th>
              <th className="col-stat" title="Multi-kills (double, triple, ultra, rampage)">MK</th>
              <th className="col-stat" title="Creep score (last hits) at 10 minutes">CS@10</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const mkParts = [];
              if (p.double_kills > 0) mkParts.push(`${p.double_kills}x2`);
              if (p.triple_kills > 0) mkParts.push(`${p.triple_kills}x3`);
              if (p.ultra_kills > 0) mkParts.push(`${p.ultra_kills}x4`);
              if (p.rampages > 0) mkParts.push(`${p.rampages}R`);
              return (
                <tr key={i}>
                  <td className="col-player">
                    <PlayerLink player={p} index={i} />
                  </td>
                  <td className="col-stat">{p.obs_placed || 0}</td>
                  <td className="col-stat">{p.sen_placed || 0}</td>
                  <td className="col-stat">{p.wards_killed || 0}</td>
                  <td className="col-stat">{p.camps_stacked || 0}</td>
                  <td className="col-stat">{p.rune_pickups || 0}</td>
                  <td className="col-stat">{p.stun_duration ? p.stun_duration.toFixed(1) : '0'}</td>
                  <td className="col-stat">{formatNumber(p.damage_taken)}</td>
                  <td className="col-stat">{p.buybacks || 0}</td>
                  <td className="col-stat">{p.courier_kills || 0}</td>
                  <td className="col-stat">{p.kill_streak || 0}</td>
                  <td className="col-stat">{mkParts.join(' ') || '-'}</td>
                  <td className="col-stat">{p.lane_cs_10min || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MatchDetail() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    getMatch(matchId)
      .then(setMatch)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [matchId]);

  const handlePositionUpdate = (slot, newPosition) => {
    setMatch(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.slot === slot ? { ...p, position: newPosition } : p
      ),
    }));
  };

  const handleDelete = async () => {
    const uploadKey = localStorage.getItem('uploadKey');
    if (!uploadKey) {
      alert('You need to set an upload key first (go to Upload page)');
      return;
    }
    setDeleting(true);
    try {
      await deleteMatch(matchId, uploadKey, deleteReason);
      navigate('/matches');
    } catch (err) {
      alert('Delete failed: ' + err.message);
      setDeleting(false);
    }
  };

  if (loading) return <div className="loading">Loading match...</div>;
  if (error) return <div className="error-state">Error: {error}</div>;
  if (!match) return <div className="error-state">Match not found</div>;

  const radiant = (match.players || []).filter(p => p.team === 'radiant');
  const dire = (match.players || []).filter(p => p.team === 'dire');
  const allPlayers = [...radiant, ...dire];

  return (
    <div>
      <Link to="/matches" className="back-link">&larr; Back to matches</Link>

      <div className="match-detail-header">
        <h1>Match #{match.match_id}</h1>
        <div className="match-meta">
          <span className={`match-result ${match.radiant_win ? 'radiant' : 'dire'}`}>
            {match.radiant_win ? 'Radiant' : 'Dire'} Victory
          </span>
          <span title={formatDuration(match.duration)}>Duration: {formatDurationLong(match.duration)}</span>
          <span>
            {new Date(match.date).toLocaleDateString('en-AU', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
          {match.parse_method && <span className="parse-badge">{match.parse_method}</span>}
        </div>
      </div>

      <TeamTable players={radiant} teamName="radiant" isWinner={match.radiant_win === true} matchId={matchId} onPositionUpdate={handlePositionUpdate} />
      <TeamTable players={dire} teamName="dire" isWinner={match.radiant_win === false} matchId={matchId} onPositionUpdate={handlePositionUpdate} />

      <ExpandedStats players={allPlayers} />

      {allPlayers.some(p => p.abilities && p.abilities.length > 0) && (
        <div className="expanded-stats-section">
          <h3>Skill Builds</h3>
          <div className="scoreboard-wrapper">
            <table className="scoreboard compact">
              <thead>
                <tr>
                  <th className="col-player" title="Player name">Player</th>
                  <th title="Order of ability level-ups throughout the game">Skill Order</th>
                </tr>
              </thead>
              <tbody>
                {allPlayers.filter(p => p.abilities && p.abilities.length > 0).map((p, i) => (
                  <tr key={i}>
                    <td className="col-player">
                      <PlayerLink player={p} index={i} />
                    </td>
                    <td>
                      <SkillBuild abilities={p.abilities} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            style={{
              background: 'transparent', color: '#666', border: '1px solid #444',
              padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            Delete Match
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Reason (optional)"
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              style={{
                background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #444',
                padding: '0.4rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem', flex: '1', minWidth: '150px',
              }}
            />
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                background: '#c0392b', color: 'white', border: 'none',
                padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              {deleting ? 'Deleting...' : 'Confirm Delete'}
            </button>
            <button
              onClick={() => setShowDelete(false)}
              style={{
                background: 'transparent', color: '#888', border: '1px solid #444',
                padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
