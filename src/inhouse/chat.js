// Lobby-scoped chat. Stored separately from the session/roster lifecycle.
const OPEN_PHASES = new Set(['open', 'accepting', 'drafting', 'server_failed', 'in_progress']);
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail(400, 'Invalid lobby or message id.');
  return Number(value);
}
function messageBody(value) {
  if (typeof value !== 'string') fail(400, 'Enter a message.');
  const body = value.trim();
  if (!body || [...body].length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) {
    fail(400, 'Messages must contain 1–500 characters of readable text.');
  }
  return body;
}

function createChatHandlers({ db, isAdmin, visibleInScope, resolveScope }) {
  async function access(req, client = null) {
    const accountId = req.session?.accountId;
    if (!accountId) fail(401, 'Sign in with Steam to use lobby chat.');
    const id = positiveId(req.params.id);
    const session = client
      ? (await client.query('SELECT * FROM inhouse_sessions WHERE id = $1 FOR UPDATE', [id])).rows[0]
      : await db.getInhouseSession(id);
    if (!visibleInScope(session, resolveScope(req))) fail(404, 'Lobby not found.');
    const canModerate = await isAdmin(req); // Resolve live Steam roles; never cached session flags.
    const roster = await (client
      ? client.query('SELECT account_id, status FROM inhouse_session_players WHERE session_id = $1 FOR SHARE', [id]).then(r => r.rows)
      : db.getPool().query('SELECT account_id, status FROM inhouse_session_players WHERE session_id = $1', [id]).then(r => r.rows));
    const member = roster.some(p => String(p.account_id) === String(accountId) && p.status !== 'declined');
    if (!member && !canModerate) fail(403, 'Join this lobby to use its chat.');
    return { id, accountId, canModerate, canSend: OPEN_PHASES.has(session.status) };
  }
  function endpoint(action) {
    return async (req, res) => {
      res.set('Cache-Control', 'private, no-store');
      try { await action(req, res); }
      catch (error) {
        if (!error.status) console.error('[Inhouse chat]', error.message);
        res.status(error.status || 503).json({ error: error.status ? error.message : 'Lobby chat is unavailable. Please retry.' });
      }
    };
  }
  return {
    list: endpoint(async (req, res) => {
      const permission = await access(req);
      const result = await db.getPool().query(
        `SELECT id, account_id, display_name, body, created_at FROM inhouse_chat_messages
         WHERE session_id = $1 ORDER BY id DESC LIMIT 50`, [permission.id]);
      res.json({ messages: result.rows.reverse(), canSend: permission.canSend, canModerate: permission.canModerate });
    }),
    send: endpoint(async (req, res) => {
      const body = messageBody(req.body?.body);
      const client = await db.getPool().connect();
      try {
        await client.query('BEGIN');
        const permission = await access(req, client);
        if (!permission.canSend) fail(409, 'This lobby has ended. Chat is read-only.');
        // The session lock serializes concurrent sends, including across processes.
        const recent = await client.query(
          `SELECT id FROM inhouse_chat_messages WHERE session_id = $1 AND account_id = $2
           AND created_at > NOW() - INTERVAL '2 seconds' LIMIT 1`, [permission.id, permission.accountId]);
        if (recent.rows.length) fail(429, 'Please wait two seconds between messages.');
        const name = await client.query('SELECT nickname FROM nicknames WHERE account_id = $1', [permission.accountId]);
        const displayName = String(name.rows[0]?.nickname || `Player ${permission.accountId}`).slice(0, 100);
        const result = await client.query(
          `INSERT INTO inhouse_chat_messages (session_id, account_id, display_name, body)
           VALUES ($1, $2, $3, $4) RETURNING id, account_id, display_name, body, created_at`,
          [permission.id, permission.accountId, displayName, body]);
        await client.query('COMMIT');
        res.status(201).json({ message: result.rows[0] });
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }),
    remove: endpoint(async (req, res) => {
      const permission = await access(req);
      if (!permission.canModerate) fail(403, 'Only lobby admins can remove messages.');
      const messageId = positiveId(req.params.messageId);
      const result = await db.getPool().query(
        'DELETE FROM inhouse_chat_messages WHERE id = $1 AND session_id = $2 RETURNING id', [messageId, permission.id]);
      if (!result.rows.length) fail(404, 'Message not found.');
      res.json({ ok: true });
    }),
  };
}

function registerLobbyChat(router, deps) {
  const handlers = createChatHandlers(deps);
  router.get('/inhouse/:id/chat', handlers.list);
  router.post('/inhouse/:id/chat', require('express').json({ limit: '4kb' }), handlers.send);
  router.delete('/inhouse/:id/chat/:messageId', handlers.remove);
}
module.exports = { createChatHandlers, registerLobbyChat, messageBody };
