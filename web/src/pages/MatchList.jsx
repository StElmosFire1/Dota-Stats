import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMatches } from '../api';

function formatDuration(seconds) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MatchList() {
  const [data, setData] = useState({ matches: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    getMatches(limit, page * limit)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(data.total / limit);

  return (
    <div>
      <h1 className="page-title">Match History</h1>
      {loading ? (
        <div className="loading">Loading matches...</div>
      ) : data.matches.length === 0 ? (
        <div className="empty-state">
          <p>No matches recorded yet.</p>
          <p>Upload a .dem replay file to get started!</p>
        </div>
      ) : (
        <>
          <div className="match-list">
            {data.matches.map((match) => (
              <Link
                to={`/match/${match.match_id}`}
                key={match.match_id}
                className="match-card"
              >
                <div className="match-card-header">
                  <span className="match-id">#{match.match_id}</span>
                  <span className="match-date">{formatDate(match.date)}</span>
                </div>
                <div className="match-card-body">
                  <span className={`match-winner ${match.radiant_win ? 'radiant' : 'dire'}`}>
                    {match.radiant_win ? 'Radiant' : 'Dire'} Victory
                  </span>
                  <span className="match-duration">{formatDuration(match.duration)}</span>
                  <span className="match-players">{match.player_count || '?'} players</span>
                </div>
                {match.parse_method && (
                  <div className="match-card-footer">
                    <span className="parse-badge">{match.parse_method}</span>
                    {match.lobby_name && <span className="lobby-name">{match.lobby_name}</span>}
                  </div>
                )}
              </Link>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-sm"
              >
                Previous
              </button>
              <span className="page-info">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn btn-sm"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
