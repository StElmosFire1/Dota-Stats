const { currentPickerTeam, countDraftedNonCaptains } = require('./draftSequence');

const PICK_GRACE_SECONDS = 10;
function getNextPickDeadline(session, now = Date.now(), initial = false) {
  return new Date(now + ((initial ? PICK_GRACE_SECONDS : 0) + (Number(session.draft_pick_seconds) || 30)) * 1000);
}
function reject(status, message) { const error = new Error(message); error.status = status; throw error; }

// The session lock serializes all picks, including manual/admin and deadline
// picks. Permissions, turn, capacity and deadline advance share one transaction.
async function pickPlayer(pool, { sessionId, accountId, team, requesterAccountId, isAdmin, source, expectedPickDeadlineAt, expectedPickIndex }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = (await client.query('SELECT * FROM inhouse_sessions WHERE id = $1 FOR UPDATE', [sessionId])).rows[0];
    if (!session) reject(404, 'Session not found');
    if (session.status !== 'drafting') reject(400, 'Not in drafting phase');
    const players = (await client.query('SELECT * FROM inhouse_session_players WHERE session_id = $1 FOR UPDATE', [sessionId])).rows;
    if (![1, 2].every(t => players.some(p => Number(p.account_id) === Number(session[`captain${t}_account_id`]) && Number(p.team) === t))) {
      reject(409, 'Captains are still being assigned. Please try again.');
    }
    const turn = currentPickerTeam(players, session);
    const pickIndex = countDraftedNonCaptains(players, session);
    if (!isAdmin) {
      if (!requesterAccountId) reject(401, 'Sign in with Steam to pick.');
      const myTeam = Number(session.captain1_account_id) === Number(requesterAccountId) ? 1
        : Number(session.captain2_account_id) === Number(requesterAccountId) ? 2 : null;
      if (!myTeam) reject(403, 'Only the captains can pick.');
      if (myTeam !== team) reject(403, 'You can only pick onto your own team.');
      if (turn === null) reject(400, 'Draft is complete.');
      if (turn !== myTeam) reject(409, "It's not your turn to pick.");
    }
    if (expectedPickIndex != null && Number(expectedPickIndex) !== pickIndex) reject(409, 'The draft has moved on. Please pick again.');
    if (players.filter(p => Number(p.team) === team).length >= 5) reject(409, 'That team already has five players, including its captain.');
    if (source === 'auto_deadline') {
      const deadline = new Date(session.draft_pick_deadline_at).getTime();
      if (!session.draft_pick_deadline_at || !expectedPickDeadlineAt ||
          deadline !== new Date(expectedPickDeadlineAt).getTime() || deadline > Date.now() || team !== turn) {
        reject(409, 'The pick deadline or turn has changed.');
      }
    }
    const target = players.find(p => Number(p.account_id) === Number(accountId));
    if (!target || Number(target.team) !== 0 || target.status === 'declined' ||
        [Number(session.captain1_account_id), Number(session.captain2_account_id)].includes(Number(accountId))) {
      reject(409, 'Player already picked or no longer eligible');
    }
    const result = await client.query(
      `UPDATE inhouse_session_players
          SET team = $1, pick_order = $2, status = 'drafted', pick_source = $5
        WHERE session_id = $3 AND account_id = $4 AND team = 0 AND status <> 'declined'
        RETURNING *`, [team, pickIndex + 1, sessionId, accountId, source]);
    if (!result.rowCount) reject(409, 'Player already picked or no longer eligible');
    const after = players.map(p => Number(p.account_id) === Number(accountId) ? result.rows[0] : p);
    const complete = currentPickerTeam(after, session) === null;
    await client.query('UPDATE inhouse_sessions SET draft_pick_deadline_at = $2 WHERE id = $1',
      [sessionId, complete ? null : getNextPickDeadline(session)]);
    await client.query('COMMIT');
    return { player: result.rows[0], session, players: after, complete };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

module.exports = { pickPlayer, getNextPickDeadline, PICK_GRACE_SECONDS };
