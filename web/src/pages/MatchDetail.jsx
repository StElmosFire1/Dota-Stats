import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getMatch, deleteMatch } from '../api';
import { getHeroName, getHeroImageUrl, getItemImageUrl } from '../heroNames';

function formatDuration(seconds) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

function TeamTable({ players, teamName, isWinner }) {
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
              <th className="col-player">Player</th>
              <th className="col-hero">Hero</th>
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
              {hasItems && <th className="col-items" style={{ minWidth: '180px' }}>Items</th>}
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
                      {p.has_scepter && <span className="badge aghs" title="Aghanim's Scepter">🟡</span>}
                      {p.has_shard && <span className="badge shard" title="Aghanim's Shard">🔵</span>}
                      {p.firstblood_claimed > 0 && <span className="badge fb" title="First Blood">FB</span>}
                      {p.first_death > 0 && <span className="badge fd" title="First Death">FD</span>}
                    </span>
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
                          const item = (p.items || []).find(i => i.item_slot === j);
                          return <ItemIcon key={j} itemName={item?.item_name} itemId={item?.item_id} />;
                        })}
                        {(p.items || []).filter(item => item.item_slot >= 6 && item.item_slot <= 8).map((item, j) => (
                          <ItemIcon key={`bp-${j}`} itemName={item.item_name} itemId={item.item_id} />
                        ))}
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
              <th className="col-player">Player</th>
              <th className="col-stat" title="Observer Wards">OBS</th>
              <th className="col-stat" title="Sentry Wards">SEN</th>
              <th className="col-stat" title="Wards Dewarded">DEW</th>
              <th className="col-stat" title="Camps Stacked">STK</th>
              <th className="col-stat" title="Rune Pickups">RUN</th>
              <th className="col-stat" title="Stun Duration (s)">STUN</th>
              <th className="col-stat" title="Damage Taken">DT</th>
              <th className="col-stat" title="Buybacks">BB</th>
              <th className="col-stat" title="Courier Kills">CK</th>
              <th className="col-stat" title="Kill Streak">KS</th>
              <th className="col-stat" title="Multi-kills">MK</th>
              <th className="col-stat" title="CS at 10 min">CS@10</th>
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
          <span>Duration: {formatDuration(match.duration)}</span>
          <span>
            {new Date(match.date).toLocaleDateString('en-AU', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
          {match.parse_method && <span className="parse-badge">{match.parse_method}</span>}
        </div>
      </div>

      <TeamTable players={radiant} teamName="radiant" isWinner={match.radiant_win === true} />
      <TeamTable players={dire} teamName="dire" isWinner={match.radiant_win === false} />

      <ExpandedStats players={allPlayers} />

      {allPlayers.some(p => p.abilities && p.abilities.length > 0) && (
        <div className="expanded-stats-section">
          <h3>Skill Builds</h3>
          <div className="scoreboard-wrapper">
            <table className="scoreboard compact">
              <thead>
                <tr>
                  <th className="col-player">Player</th>
                  <th>Skill Order</th>
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
