import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getMatch, deleteMatch } from '../api';
import { getHeroName } from '../heroNames';

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

function TeamTable({ players, teamName, isWinner }) {
  const hasDetailedStats = players.some(p => p.gpm > 0 || p.hero_damage > 0);

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
              <th className="col-player">Player</th>
              <th className="col-hero">Hero</th>
              <th className="col-stat">K</th>
              <th className="col-stat">D</th>
              <th className="col-stat">A</th>
              {hasDetailedStats && (
                <>
                  <th className="col-stat">LH</th>
                  <th className="col-stat">DN</th>
                  <th className="col-stat">GPM</th>
                  <th className="col-stat">XPM</th>
                  <th className="col-stat">HD</th>
                  <th className="col-stat">TD</th>
                  <th className="col-stat">HH</th>
                  <th className="col-stat">NW</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={i}>
                <td className="col-player">
                  {p.account_id > 0 ? (
                    <Link to={`/player/${p.account_id}`} className="player-link">
                      {getDisplayName(p, i)}
                    </Link>
                  ) : p.persona_name ? (
                    <Link to={`/player/${encodeURIComponent(p.persona_name)}`} className="player-link">
                      {getDisplayName(p, i)}
                    </Link>
                  ) : (
                    getDisplayName(p, i)
                  )}
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
              </tr>
            ))}
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
