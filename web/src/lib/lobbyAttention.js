// Pure event selection, independent of polling and browser notification support.
export function lobbyAttention(session, players, accountId, draft) {
  if (!session || !accountId) return null;
  const me = players.find(p => String(p.account_id) === String(accountId));
  if (!me || me.status === 'declined') return null;
  const prefix = `lobby-${session.id}`;
  if (session.status === 'accepting' && me.status !== 'accepted') {
    return { key: `${prefix}-accept-${session.accept_phase_starts_at}`, message: 'Your lobby is ready. Open the lobby and accept your place.' };
  }
  if (session.status === 'drafting' && draft) {
    const team = String(session.captain1_account_id) === String(accountId) ? 1
      : String(session.captain2_account_id) === String(accountId) ? 2 : null;
    if (team && !draft.complete && draft.currentPickerTeam === team) {
      return { key: `${prefix}-pick-${draft.pickIdx}`, message: 'It is your turn to draft a player.' };
    }
    if (draft.complete) return { key: `${prefix}-draft-done`, message: 'Player drafting is complete. Open the lobby for your teams and next steps.' };
    return { key: `${prefix}-draft-start`, message: 'Player drafting has started. Open the lobby to follow your team.' };
  }
  if (session.status === 'in_progress') return { key: `${prefix}-started`, message: 'Your match is ready. Open the lobby for connection details.' };
  if (session.status === 'server_failed') return { key: `${prefix}-server-failed`, message: 'Your lobby needs attention: game-server setup failed.' };
  return null;
}
