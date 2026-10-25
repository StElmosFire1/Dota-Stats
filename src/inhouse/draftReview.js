const { randomUUID } = require('node:crypto');

function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
function signature(session, players) {
  return `${session.captain1_account_id}:${session.captain2_account_id}|` +
    players.map(p => `${Number(p.account_id)}:${Number(p.team)}`).sort().join('|');
}
function balanced(session, players) {
  return players.length === 10 && [1, 2].every(team =>
    players.filter(p => Number(p.team) === team && p.status !== 'declined').length === 5 &&
    players.some(p => Number(p.account_id) === Number(session[`captain${team}_account_id`]) && Number(p.team) === team));
}
function stateFor(session, players) {
  const rosterSignature = signature(session, players);
  const saved = session.draft_review;
  const matches = saved?.rosterSignature === rosterSignature;
  return {
    revision: (Number(saved?.revision) || 0) + (saved && !matches ? 1 : 0),
    rosterSignature,
    confirmations: matches && Array.isArray(saved.confirmations) ? [...new Set(saved.confirmations.filter(t => [1, 2].includes(t)))] : [],
    pendingTrade: matches ? saved.pendingTrade || null : null,
  };
}
function isDraftReviewApproved(session, players) {
  if (!session || !balanced(session, players)) return false;
  const state = stateFor(session, players);
  return state.confirmations.length === 2 && !state.pendingTrade;
}
function rating(player) {
  const displayed = player.inhouse_mmr;
  if (displayed != null && Number.isFinite(Number(displayed))) return Number(displayed);
  // The stored conservative TrueSkill rating uses hundredths of displayed
  // MMR. Never replace an unplayed/unrated account with a zero estimate.
  if (Number(player.games_played) > 0 && player.trueskill_mmr != null && Number.isFinite(Number(player.trueskill_mmr))) {
    return Number(player.trueskill_mmr) * 100;
  }
  return null;
}
function getDraftReview(session, players) {
  const state = stateFor(session, players);
  const available = ['drafting', 'server_failed'].includes(session.status) && balanced(session, players);
  const knownCount = players.filter(p => rating(p) !== null).length;
  const balance = { metric: 'inhouse_mmr', knownCount, totalCount: players.length, team1Average: null, team2Average: null, gap: null };
  const suggestions = [];
  if (balanced(session, players) && knownCount === 10) {
    const totals = [1, 2].map(team => players.filter(p => Number(p.team) === team).reduce((sum, p) => sum + rating(p), 0));
    balance.team1Average = Math.round(totals[0] / 5);
    balance.team2Average = Math.round(totals[1] / 5);
    balance.gap = Math.round(Math.abs(totals[0] - totals[1]) / 5);
    const captains = [Number(session.captain1_account_id), Number(session.captain2_account_id)];
    const movable = team => players.filter(p => Number(p.team) === team && !captains.includes(Number(p.account_id)));
    for (const a of movable(1)) for (const b of movable(2)) {
      const afterGap = Math.round(Math.abs(totals[0] - totals[1] - 2 * rating(a) + 2 * rating(b)) / 5);
      if (afterGap < balance.gap) suggestions.push({
        team1AccountId: Number(a.account_id), team2AccountId: Number(b.account_id),
        beforeGap: balance.gap, afterGap, improvement: balance.gap - afterGap,
      });
    }
    suggestions.sort((a, b) => b.improvement - a.improvement || a.team1AccountId - b.team1AccountId || a.team2AccountId - b.team2AccountId);
  }
  return { ...state, available, approved: isDraftReviewApproved(session, players), balance, suggestions: suggestions.slice(0, 3) };
}

// Shares the session lock with draft picks. Confirmations are bound to the
// exact roster; stale tabs, simultaneous approvals and trades cannot race.
async function updateDraftReview(pool, { sessionId, requesterAccountId, action, revision, team1AccountId, team2AccountId, proposalId }) {
  if (!requesterAccountId) fail(401, 'Sign in with Steam to review your team.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = (await client.query('SELECT * FROM inhouse_sessions WHERE id = $1 FOR UPDATE', [sessionId])).rows[0];
    if (!session) fail(404, 'Session not found.');
    const team = Number(session.captain1_account_id) === Number(requesterAccountId) ? 1
      : Number(session.captain2_account_id) === Number(requesterAccountId) ? 2 : null;
    if (!team) fail(403, 'Only the two captains can review or trade players.');
    if (!['drafting', 'server_failed'].includes(session.status)) fail(409, 'Team review is closed for this session.');
    let players = (await client.query('SELECT * FROM inhouse_session_players WHERE session_id = $1 FOR UPDATE', [sessionId])).rows;
    if (!balanced(session, players)) fail(409, 'Complete a valid five-versus-five draft before reviewing teams.');
    const state = stateFor(session, players);
    if (!Number.isInteger(revision) || revision !== state.revision) fail(409, 'The review has changed. Refresh and try again.');
    if (isDraftReviewApproved(session, players)) fail(409, 'Both captains have confirmed. Teams are locked.');
    if (action === 'confirm') {
      if (state.pendingTrade) fail(409, 'Resolve the proposed trade before confirming.');
      if (!state.confirmations.includes(team)) state.confirmations.push(team);
    } else if (action === 'revoke') {
      state.confirmations = state.confirmations.filter(t => t !== team);
    } else if (action === 'propose') {
      if (state.pendingTrade) fail(409, 'Resolve or withdraw the existing trade first.');
      const captainIds = [Number(session.captain1_account_id), Number(session.captain2_account_id)];
      const a = players.find(p => Number(p.account_id) === Number(team1AccountId) && Number(p.team) === 1);
      const b = players.find(p => Number(p.account_id) === Number(team2AccountId) && Number(p.team) === 2);
      if (!a || !b || [a, b].some(p => captainIds.includes(Number(p.account_id)))) fail(400, 'Choose one non-captain from each team.');
      state.pendingTrade = { id: randomUUID(), proposedByTeam: team, team1AccountId: Number(a.account_id), team2AccountId: Number(b.account_id) };
      state.confirmations = [];
    } else if (['accept', 'decline', 'withdraw'].includes(action)) {
      const trade = state.pendingTrade;
      if (!trade || trade.id !== proposalId) fail(409, 'That trade is no longer pending.');
      if (action === 'withdraw' ? trade.proposedByTeam !== team : trade.proposedByTeam === team) {
        fail(403, action === 'withdraw' ? 'Only the proposing captain can withdraw this trade.' : 'Only the other captain can accept or decline this trade.');
      }
      if (action === 'accept') {
        const result = await client.query(
          `UPDATE inhouse_session_players
              SET team = CASE WHEN account_id = $2 THEN 2 ELSE 1 END
            WHERE session_id = $1 AND ((account_id = $2 AND team = 1) OR (account_id = $3 AND team = 2))
            RETURNING *`, [sessionId, trade.team1AccountId, trade.team2AccountId]);
        if (result.rowCount !== 2) fail(409, 'The roster changed. Please propose a new trade.');
        players = players.map(p => result.rows.find(updated => Number(updated.account_id) === Number(p.account_id)) || p);
        if (!balanced(session, players)) fail(409, 'The trade would leave an invalid team.');
        state.rosterSignature = signature(session, players);
      }
      state.pendingTrade = null;
      state.confirmations = [];
    } else fail(400, 'Unknown review action.');
    state.revision++;
    state.approved = state.confirmations.length === 2 && !state.pendingTrade;
    await client.query('UPDATE inhouse_sessions SET draft_review = $2::jsonb WHERE id = $1', [sessionId, JSON.stringify(state)]);
    await client.query('COMMIT');
    return { review: getDraftReview({ ...session, draft_review: state }, players) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

module.exports = { getDraftReview, updateDraftReview, isDraftReviewApproved };
