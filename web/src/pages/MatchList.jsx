import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getMatches, updateMatchMeta } from '../api';
import { useSeason } from '../context/SeasonContext';
import { useSuperuser } from '../context/SuperuserContext';

function formatDuration(seconds) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Australia/Sydney',
  });
}

export default function MatchList() {
  const { seasonId, seasons } = useSeason();
  const { isSuperuser, superuserKey, setShowModal } = useSuperuser();
  const [data, setData] = useState({ matches: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 20;

  // Inline season editing state
  const [editingSeason, setEditingSeason] = useState(null); // matchId being edited
  const [seasonInput, setSeasonInput] = useState('');
  const [savingSeason, setSavingSeason] = useState(null);

  // Bulk season state
  const [selected, setSelected] = useState(new Set());
  const [bulkSeason, setBulkSeason] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');

  useEffect(() => { setPage(0); }, [seasonId]);

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    getMatches(limit, page * limit, seasonId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, seasonId]);

  const reload = useCallback(() => {
    getMatches(limit, page * limit, seasonId).then(setData).catch(console.error);
  }, [page, seasonId]);

  const totalPages = Math.ceil(data.total / limit);

  const getSeasonName = (id) => {
    if (!id) return null;
    const s = seasons.find(x => x.id === id);
    return s ? s.name : null;
  };

  const startEditSeason = (e, match) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSuperuser) { setShowModal(true); return; }
    setEditingSeason(match.match_id);
    setSeasonInput(match.season_id ? String(match.season_id) : '');
  };

  const saveSeason = async (e, matchId) => {
    e.preventDefault();
    e.stopPropagation();
    setSavingSeason(matchId);
    try {
      await updateMatchMeta(matchId, { seasonId: seasonInput ? parseInt(seasonInput) : null }, superuserKey);
      setEditingSeason(null);
      reload();
    } catch (err) {
      alert('Failed to save season: ' + err.message);
    } finally {
      setSavingSeason(null);
    }
  };

  const cancelEdit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingSeason(null);
  };

  const toggleSelect = (e, matchId) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(matchId) ? next.delete(matchId) : next.add(matchId);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(data.matches.map(m => m.match_id)));
  const clearSelection = () => setSelected(new Set());

  const applyBulkSeason = async () => {
    if (!bulkSeason && !confirm('Remove season from selected matches?')) return;
    setBulkSaving(true);
    setBulkMsg('');
    let ok = 0, fail = 0;
    for (const matchId of selected) {
      try {
        await updateMatchMeta(matchId, { seasonId: bulkSeason ? parseInt(bulkSeason) : null }, superuserKey);
        ok++;
      } catch { fail++; }
    }
    setBulkMsg(`Done: ${ok} updated${fail ? `, ${fail} failed` : ''}`);
    setBulkSaving(false);
    setSelected(new Set());
    reload();
    setTimeout(() => setBulkMsg(''), 4000);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '0.5rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Match History</h1>
        {!isSuperuser && (
          <button className="btn btn-sm" onClick={() => setShowModal(true)} style={{ fontSize: '0.75rem', opacity: 0.7 }}>
            Admin Edit
          </button>
        )}
      </div>

      {isSuperuser && (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>BULK SEASON:</span>
          <select
            value={bulkSeason}
            onChange={e => setBulkSeason(e.target.value)}
            style={{ padding: '3px 8px', fontSize: '0.85rem', background: '#0f172a', border: '1px solid #475569', borderRadius: 4, color: '#f1f5f9' }}
          >
            <option value="">— Remove season —</option>
            {seasons.map(s => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </select>
          <button
            className="btn btn-sm"
            onClick={applyBulkSeason}
            disabled={bulkSaving || selected.size === 0}
            style={{ background: selected.size > 0 ? '#2563eb' : undefined }}
          >
            {bulkSaving ? 'Saving…' : `Apply to ${selected.size} selected`}
          </button>
          {selected.size > 0 ? (
            <button className="btn btn-sm" onClick={clearSelection} style={{ background: '#374151' }}>Clear</button>
          ) : (
            <button className="btn btn-sm" onClick={selectAll} style={{ background: '#374151' }}>Select All</button>
          )}
          {bulkMsg && <span style={{ fontSize: '0.8rem', color: '#4ade80' }}>{bulkMsg}</span>}
        </div>
      )}

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
            {data.matches.map((match) => {
              const isEditing = editingSeason === match.match_id;
              const isSelected = selected.has(match.match_id);

              return (
                <div key={match.match_id} style={{ position: 'relative' }}>
                  <Link
                    to={`/match/${match.match_id}`}
                    className="match-card"
                    style={{ display: 'block', textDecoration: 'none' }}
                  >
                    <div className="match-card-header">
                      <span className="match-id">#{match.match_id}</span>
                      <span className="match-date" style={{ textAlign: 'right', paddingRight: isSuperuser ? 28 : 0 }}>
                        <div>{formatDate(match.date)}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 1 }}>{formatTime(match.date)}</div>
                      </span>
                    </div>
                    <div className="match-card-body">
                      <span className={`match-winner ${match.radiant_win ? 'radiant' : 'dire'}`}>
                        {match.radiant_win ? 'Radiant' : 'Dire'} Victory
                      </span>
                      <span className="match-duration">{formatDuration(match.duration)}</span>
                      <span className="match-players">{match.player_count || '?'} players</span>
                    </div>
                    {(match.parse_method || match.patch || match.season_id || isSuperuser) && (
                      <div className="match-card-footer" style={{ alignItems: 'center' }}>
                        {match.parse_method && <span className="parse-badge">{match.parse_method}</span>}
                        {match.lobby_name && <span className="lobby-name">{match.lobby_name}</span>}
                        {match.patch && <span className="patch-badge">Patch {match.patch}</span>}

                        {isSuperuser && isEditing ? (
                          <span onClick={e => e.preventDefault()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <select
                              autoFocus
                              value={seasonInput}
                              onChange={e => setSeasonInput(e.target.value)}
                              style={{ padding: '1px 6px', fontSize: '0.78rem', background: '#0f172a', border: '1px solid #3b82f6', borderRadius: 4, color: '#f1f5f9' }}
                            >
                              <option value="">— No season —</option>
                              {seasons.map(s => (
                                <option key={s.id} value={String(s.id)}>{s.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={e => saveSeason(e, match.match_id)}
                              disabled={savingSeason === match.match_id}
                              style={{ fontSize: '0.72rem', padding: '1px 6px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                            >
                              {savingSeason === match.match_id ? '…' : '✓'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              style={{ fontSize: '0.72rem', padding: '1px 6px', background: '#374151', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <span
                            onClick={e => startEditSeason(e, match)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: isSuperuser ? 'pointer' : 'default' }}
                            title={isSuperuser ? 'Click to change season' : undefined}
                          >
                            {match.season_id
                              ? <span className="season-badge">{getSeasonName(match.season_id) || `Season ${match.season_id}`}</span>
                              : isSuperuser
                                ? <span style={{ fontSize: '0.75rem', color: '#64748b', border: '1px dashed #475569', borderRadius: 4, padding: '1px 6px' }}>+ season</span>
                                : null
                            }
                            {isSuperuser && match.season_id && (
                              <span style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: 1 }}>✎</span>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>

                  {/* Checkbox in bottom-right corner so it doesn't overlap the date */}
                  {isSuperuser && (
                    <div
                      onClick={e => toggleSelect(e, match.match_id)}
                      style={{
                        position: 'absolute', bottom: 10, right: 10, zIndex: 2,
                        width: 18, height: 18, borderRadius: 4,
                        border: `2px solid ${isSelected ? '#3b82f6' : '#475569'}`,
                        background: isSelected ? '#3b82f6' : 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isSelected && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn btn-sm">
                Previous
              </button>
              <span className="page-info">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn btn-sm">
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
