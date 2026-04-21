import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  getTournaments, getTournamentById, createTournament, addTournamentParticipant,
  removeTournamentParticipant, generateTournamentBracket, setTournamentMatchWinner,
  clearTournamentMatchWinner, deleteTournament, getAllPlayers,
} from '../api';
import { useSeason } from '../context/SeasonContext';
import { useSuperuser } from '../context/SuperuserContext';

const STATUS_LABELS = { upcoming: '⏳ Upcoming', active: '🏆 Active', completed: '✅ Completed' };
const STATUS_COLORS = { upcoming: 'var(--text-muted)', active: 'var(--accent-gold, #f59e0b)', completed: 'var(--radiant-color)' };
const FORMAT_LABELS = { single_elim: 'Single Elimination', double_elim: 'Double Elimination' };

function RoundName(round, totalRounds) {
  const remaining = totalRounds - round + 1;
  if (remaining === 1) return 'Grand Final';
  if (remaining === 2) return 'Semi Finals';
  if (remaining === 3) return 'Quarter Finals';
  return `Round ${round}`;
}

function LBRoundName(round, totalLBRounds) {
  if (round === totalLBRounds) return 'LB Final';
  if (round % 2 === 1) return `LB Round ${Math.ceil(round / 2)}`;
  return `LB Round ${round / 2} (Drop-in)`;
}

function ChampionBanner({ matches, tournament }) {
  let champion = null;
  if (tournament.format === 'double_elim') {
    const gf = matches.find(m => m.bracket === 'GF' && m.winner_id);
    if (gf) champion = { name: gf.winner_name, id: gf.winner_id };
  } else {
    const maxRound = Math.max(...matches.map(m => m.round));
    const final = matches.find(m => m.round === maxRound && m.winner_id);
    if (final) champion = { name: final.winner_name, id: final.winner_id };
  }
  if (!champion) return null;
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(245,158,11,0.08) 100%)',
      border: '2px solid rgba(251,191,36,0.5)',
      borderRadius: 16, padding: '24px 32px', marginBottom: 28, textAlign: 'center',
      boxShadow: '0 0 32px rgba(251,191,36,0.15)',
    }}>
      <div style={{ fontSize: 42, marginBottom: 8 }}>🏆</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>
        Tournament Champion
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#fde68a' }}>
        {champion.name || `Player #${champion.id}`}
      </div>
      <div style={{ fontSize: 13, color: 'rgba(251,191,36,0.6)', marginTop: 6 }}>
        {tournament.name}
      </div>
    </div>
  );
}

function BracketMatch({ match, superuserKey, onWinnerSet, isAdmin }) {
  const [loading, setLoading] = useState(false);
  const isBye = match.p1_id && !match.p2_id;

  const handleSetWinner = async (winnerId) => {
    if (!superuserKey) return;
    setLoading(true);
    try {
      const result = await setTournamentMatchWinner(match.id, winnerId, superuserKey);
      onWinnerSet(result.matches);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearWinner = async () => {
    if (!superuserKey) return;
    setLoading(true);
    try {
      const result = await clearTournamentMatchWinner(match.id, superuserKey);
      onWinnerSet(result.matches);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const p1Name = match.p1_name || (match.p1_id ? `#${match.p1_id}` : 'TBD');
  const p2Name = match.p2_name || (match.p2_id ? `#${match.p2_id}` : isBye ? 'BYE' : 'TBD');
  const isP1Winner = match.winner_id && String(match.winner_id) === String(match.p1_id);
  const isP2Winner = match.winner_id && String(match.winner_id) === String(match.p2_id);

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
      minWidth: 210, background: 'var(--bg-card)',
      boxShadow: match.winner_id ? '0 0 0 1px var(--accent-blue)' : 'none',
    }}>
      {[
        { id: match.p1_id, name: p1Name, isWinner: isP1Winner },
        { id: match.p2_id, name: p2Name, isWinner: isP2Winner, isBye },
      ].map((player, idx) => (
        <div
          key={idx}
          onClick={() => {
            if (loading || !isAdmin || !player.id || isBye || match.winner_id) return;
            if (window.confirm(`Set ${player.name} as winner?`)) handleSetWinner(player.id);
          }}
          style={{
            padding: '10px 14px',
            borderTop: idx === 1 ? '1px solid var(--border)' : 'none',
            background: player.isWinner
              ? 'rgba(34,197,94,0.12)'
              : match.winner_id && !player.isWinner
              ? 'rgba(239,68,68,0.08)'
              : 'transparent',
            cursor: isAdmin && player.id && !isBye && !match.winner_id ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'background 0.15s',
          }}
          title={isAdmin && player.id && !isBye && !match.winner_id ? `Click to set ${player.name} as winner` : ''}
        >
          <span style={{ fontSize: 14, color: player.isWinner
            ? 'var(--radiant-color)'
            : match.winner_id && !player.isWinner
            ? 'var(--text-muted)'
            : 'var(--text-primary)',
            fontWeight: player.isWinner ? 700 : 400,
            flex: 1,
          }}>
            {player.isWinner ? '🏆 ' : ''}{player.name}
          </span>
          {player.isBye && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>BYE</span>}
        </div>
      ))}
      {isAdmin && match.winner_id && (
        <div style={{ padding: '4px 10px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <button
            onClick={handleClearWinner}
            disabled={loading}
            style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >↩ Undo result</button>
        </div>
      )}
    </div>
  );
}

function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isSuperuser, superuserKey } = useSuperuser();
  const isAdmin = isSuperuser;
  const [addSearch, setAddSearch] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getTournamentById(id), getAllPlayers(null)]).then(([d, ap]) => {
      setData(d);
      setAllPlayers(ap?.players || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Loading tournament…</div>;
  if (!data) return <div className="error-state">Tournament not found.</div>;

  const { tournament, participants, matches } = data;
  const participantIds = new Set(participants.map(p => String(p.account_id)));
  const availablePlayers = allPlayers.filter(p =>
    !participantIds.has(String(p.account_id)) &&
    (!addSearch || (p.nickname || p.persona_name || '').toLowerCase().includes(addSearch.toLowerCase()))
  );

  const isDoubleElim = tournament.format === 'double_elim';
  const wbMatches = matches.filter(m => !m.bracket || m.bracket === 'W');
  const lbMatches = matches.filter(m => m.bracket === 'L');
  const gfMatches = matches.filter(m => m.bracket === 'GF');
  const wbRounds = [...new Set(wbMatches.map(m => m.round))].sort((a, b) => a - b);
  const lbRounds = [...new Set(lbMatches.map(m => m.round))].sort((a, b) => a - b);
  const maxWBRound = wbRounds.length > 0 ? Math.max(...wbRounds) : 0;
  const maxLBRound = lbRounds.length > 0 ? Math.max(...lbRounds) : 0;
  const rounds = [...new Set(wbMatches.map(m => m.round))].sort((a, b) => a - b);
  const maxRound = rounds.length > 0 ? Math.max(...rounds) : 0;

  const handleAddParticipant = async (accountId) => {
    setAddLoading(true);
    try {
      await addTournamentParticipant(id, accountId, superuserKey);
      load();
    } catch (e) { alert(e.message); }
    setAddLoading(false);
  };

  const handleRemoveParticipant = async (accountId) => {
    if (!window.confirm('Remove this player?')) return;
    try {
      await removeTournamentParticipant(id, accountId, superuserKey);
      load();
    } catch (e) { alert(e.message); }
  };

  const handleGenerate = async () => {
    if (!window.confirm(`Generate bracket for ${participants.length} players? This will clear any existing bracket.`)) return;
    try {
      const result = await generateTournamentBracket(id, superuserKey);
      setData(prev => ({ ...prev, matches: result.matches }));
      load();
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this tournament? This cannot be undone.')) return;
    try {
      await deleteTournament(id, superuserKey);
      navigate('/tournaments');
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <Link to="/tournaments" className="back-link">&larr; Back to Tournaments</Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{tournament.name}</h1>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: STATUS_COLORS[tournament.status] || 'var(--text-muted)', fontWeight: 700 }}>
              {STATUS_LABELS[tournament.status] || tournament.status}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{FORMAT_LABELS[tournament.format] || tournament.format}</span>
            {tournament.season_name && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Season: {tournament.season_name}</span>}
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{participants.length} players</span>
          </div>
          {tournament.description && <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 14 }}>{tournament.description}</p>}
        </div>
      </div>

      {isAdmin && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleGenerate} style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ⚡ Generate Bracket
          </button>
          <button onClick={handleDelete} style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', borderRadius: 7, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
            🗑️ Delete Tournament
          </button>
        </div>
      )}

      <div className="tournament-layout">
        <div>
          <h2 className="section-title">Participants ({participants.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {participants.map((p, i) => (
              <div key={p.account_id} style={{
                background: p.eliminated ? 'rgba(239,68,68,0.06)' : 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
                opacity: p.eliminated ? 0.55 : 1,
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 20 }}>#{i + 1}</span>
                <Link to={`/player/${p.account_id}`} style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
                  {p.display_name}
                </Link>
                {p.mmr && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.mmr}</span>}
                {p.eliminated && <span style={{ fontSize: 11, color: 'var(--accent-red)' }}>OUT</span>}
                {isAdmin && (
                  <button onClick={() => handleRemoveParticipant(p.account_id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
                )}
              </div>
            ))}
            {participants.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No participants yet.</p>}
          </div>

          {isAdmin && tournament.status === 'upcoming' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Add player</div>
              <input
                placeholder="Search…"
                value={addSearch}
                onChange={e => setAddSearch(e.target.value)}
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '5px 10px', fontSize: 13, width: '100%', marginBottom: 6 }}
              />
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {availablePlayers.slice(0, 20).map(p => (
                  <button
                    key={p.account_id}
                    onClick={() => handleAddParticipant(p.account_id)}
                    disabled={addLoading}
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '5px 10px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
                  >{p.nickname || p.persona_name}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <h2 className="section-title">Bracket</h2>
          {tournament.status === 'completed' && matches.length > 0 && (
            <ChampionBanner matches={matches} tournament={tournament} />
          )}
          {matches.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>
              {isAdmin && participants.length >= 2
                ? 'Click "Generate Bracket" to create the bracket.'
                : participants.length < 2
                ? 'Add at least 2 participants to generate a bracket.'
                : 'No bracket generated yet.'}
            </div>
          ) : isDoubleElim ? (
            <div>
              {wbMatches.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
                    Winners Bracket
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', minWidth: `${wbRounds.length * 260}px` }}>
                      {wbRounds.map(round => (
                        <div key={round} style={{ flex: '0 0 220px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, textAlign: 'center' }}>
                            {RoundName(round, maxWBRound)}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {wbMatches.filter(m => m.round === round).map(match => (
                              <BracketMatch key={match.id} match={match} superuserKey={superuserKey}
                                onWinnerSet={(updatedMatches) => setData(prev => ({ ...prev, matches: updatedMatches }))}
                                isAdmin={isAdmin} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {lbMatches.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
                    Losers Bracket
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', minWidth: `${lbRounds.length * 260}px` }}>
                      {lbRounds.map(round => (
                        <div key={round} style={{ flex: '0 0 220px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, textAlign: 'center' }}>
                            {LBRoundName(round, maxLBRound)}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {lbMatches.filter(m => m.round === round).map(match => (
                              <BracketMatch key={match.id} match={match} superuserKey={superuserKey}
                                onWinnerSet={(updatedMatches) => setData(prev => ({ ...prev, matches: updatedMatches }))}
                                isAdmin={isAdmin} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {gfMatches.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
                    Grand Final
                  </div>
                  <div style={{ maxWidth: 260 }}>
                    {gfMatches.map(match => (
                      <BracketMatch key={match.id} match={match} superuserKey={superuserKey}
                        onWinnerSet={(updatedMatches) => setData(prev => ({ ...prev, matches: updatedMatches }))}
                        isAdmin={isAdmin} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', minWidth: `${rounds.length * 260}px` }}>
                {rounds.map(round => {
                  const roundMatches = matches.filter(m => m.round === round);
                  return (
                    <div key={round} style={{ flex: '0 0 220px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, textAlign: 'center' }}>
                        {RoundName(round, maxRound)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'space-around', height: '100%' }}>
                        {roundMatches.map(match => (
                          <BracketMatch
                            key={match.id}
                            match={match}
                            superuserKey={superuserKey}
                            onWinnerSet={(updatedMatches) => setData(prev => ({ ...prev, matches: updatedMatches }))}
                            isAdmin={isAdmin}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TournamentList() {
  const { seasonId } = useSeason();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isSuperuser, superuserKey } = useSuperuser();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', format: 'single_elim' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setLoading(true);
    getTournaments(seasonId)
      .then(d => setTournaments(d.tournaments || []))
      .catch(() => setTournaments([]))
      .finally(() => setLoading(false));
  }, [seasonId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await createTournament({ ...form, seasonId }, superuserKey);
      const updated = await getTournaments(seasonId);
      setTournaments(updated.tournaments || []);
      setForm({ name: '', description: '', format: 'single_elim' });
      setShowCreate(false);
    } catch (e) { alert(e.message); }
    setCreating(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>🏆 Tournaments</h1>
        {isSuperuser && (
          <button
            onClick={() => setShowCreate(s => !s)}
            style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >+ New Tournament</button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700 }}>Create Tournament</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '7px 12px', fontSize: 14, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Format</label>
              <select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '7px 12px', fontSize: 14, width: '100%' }}>
                <option value="single_elim">Single Elimination</option>
                <option value="double_elim">Double Elimination</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Description (optional)</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '7px 12px', fontSize: 14, width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={creating}
              style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)}
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 16px', cursor: 'pointer', fontSize: 14 }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <div className="loading">Loading tournaments…</div>}
      {!loading && tournaments.length === 0 && (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
          <p>No tournaments yet. Create one to get started!</p>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {tournaments.map(t => (
          <Link key={t.id} to={`/tournaments/${t.id}`} style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
              padding: 20, transition: 'border-color 0.15s, transform 0.1s',
              ':hover': { borderColor: 'var(--accent-blue)' },
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLORS[t.status] || 'var(--text-muted)' }}>
                  {STATUS_LABELS[t.status] || t.status}
                </span>
              </div>
              {t.description && <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>{t.description}</p>}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>{FORMAT_LABELS[t.format] || t.format}</span>
                <span>👥 {t.participant_count} players</span>
                {t.season_name && <span>📅 {t.season_name}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Tournaments() {
  const { id } = useParams();
  return id ? <TournamentDetail /> : <TournamentList />;
}
