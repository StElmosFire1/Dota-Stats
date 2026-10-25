import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Dialog from './Dialog';
import LobbyChat from './LobbyChat';
import { resolvePlayerDisplayName } from '../utils/displayName';
import './lobby-hub.css';

const ROLES = [
  ['1', 'Carry'], ['2', 'Mid'], ['3', 'Offlane'], ['4', 'Soft support'], ['5', 'Hard support'],
];
const PHASE = { open: 'Queue open', accepting: 'Ready check', drafting: 'Captain draft', server_failed: 'Server recovery', in_progress: 'Match live', completed: 'Match complete', cancelled: 'Match closed' };

export default function LobbyHub({ snapshot, accountId, onRefresh, children, attention, steamUser, isAdmin = false, settingsAction, stale = false }) {
  const location = useLocation();
  const inhousePage = location.pathname.startsWith('/inhouse');
  const [expanded, setExpanded] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [joining, setJoining] = useState(false);
  const joinLock = useRef(false);
  const joinAttempt = useRef(0);
  const [joinError, setJoinError] = useState('');
  const [joinTarget, setJoinTarget] = useState(null);
  const session = snapshot?.session;
  const players = snapshot?.players || [];
  const members = players.filter(p => p.status !== 'declined');
  const member = !!members.find(p => String(p.account_id) === String(accountId));
  const ownPlayer = members.find(p => String(p.account_id) === String(accountId));
  const phase = PHASE[session?.status] || 'No active lobby';
  const quickJoinable = session?.status === 'open' && !!accountId && !member;
  const blocked = !!steamUser && (steamUser.needs_discord_link === true || steamUser.discord_in_guild === false);
  const targetKey = `${session?.id ?? ''}:${accountId ?? ''}`;
  const currentTargetKey = useRef(targetKey);
  currentTargetKey.current = targetKey;
  const roleContextCurrent = !!joinTarget && `${joinTarget.sessionId}:${joinTarget.accountId}` === targetKey;
  const reminderOnly = inhousePage;

  useEffect(() => {
    joinAttempt.current += 1;
    joinLock.current = false;
    setRoleOpen(false);
    setRoles([]);
    setJoinError('');
    setJoining(false);
    setJoinTarget(null);
  }, [session?.id, accountId]);

  function beginJoin() {
    if (!quickJoinable || stale || !session?.id) return;
    setJoinError('');
    setRoles([]);
    setJoinTarget({ sessionId: session.id, accountId: String(accountId) });
    setRoleOpen(true);
  }
  async function join() {
    if (!roles.length || joining || joinLock.current || stale || !quickJoinable || !roleContextCurrent || !session?.id) {
      if (roleContextCurrent && !quickJoinable) setJoinError('This lobby is no longer open for quick join.');
      return;
    }
    joinLock.current = true;
    const attempt = ++joinAttempt.current;
    const requestedSessionId = joinTarget.sessionId;
    const requestedAccountId = joinTarget.accountId;
    setJoining(true);
    setJoinError('');
    try {
      const response = await fetch(`/api/inhouse/${requestedSessionId}/join`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredPositions: roles }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data.error || `Could not join the lobby (${response.status})`;
        throw new Error(msg);
      }
      if (joinAttempt.current !== attempt || currentTargetKey.current !== `${requestedSessionId}:${requestedAccountId}`) return;
      setRoleOpen(false);
      try { await onRefresh?.(); } catch { /* Polling surface reports stale state; join itself succeeded. */ }
    } catch (e) {
      if (joinAttempt.current === attempt && currentTargetKey.current === `${requestedSessionId}:${requestedAccountId}`) {
        setJoinError(e.message);
      }
    } finally {
      if (joinAttempt.current === attempt) {
        joinLock.current = false;
        setJoining(false);
      }
    }
  }

  if (!accountId) return null;
  return (
    <>
      <aside className={`lh-widget${inhousePage ? ' lh-widget-page' : ''}`} aria-label="OCE Inhouse lobby">
        <div className="lh-widget-top">
          <span className="lh-brand-mark" aria-hidden="true">OI</span>
          <div className="lh-widget-title"><span className="lh-kicker">OCE Inhouse</span><strong>{phase}</strong></div>
          {!reminderOnly && <span className="lh-count"><b>{members.length}</b><span>/ 10 queued</span></span>}
          {ownPlayer && <span className="lh-own-status">{ownPlayer.status === 'accepted' ? 'You’re ready' : ownPlayer.status === 'drafted' ? 'Drafted' : 'You’re queued'}</span>}
          <button className="lh-toggle" type="button" aria-expanded={expanded} aria-label={expanded ? 'Collapse lobby panel' : 'Expand lobby panel'} onClick={() => setExpanded(v => !v)}>{expanded ? '−' : '+'}</button>
        </div>
        <div className="lh-widget-actions">
          {!reminderOnly && <Link to="/inhouse" className="lh-open-link">Open lobby <span aria-hidden="true">↗</span></Link>}
          {quickJoinable && !inhousePage && <button type="button" className="lh-join-button" onClick={beginJoin} disabled={stale} title={blocked ? 'Link your Discord and join the OCE Inhouse server first.' : ''}>{blocked ? 'Discord required' : stale ? 'Refresh to join' : 'Quick join'}</button>}
          {settingsAction && <button className="lh-settings" type="button" onClick={settingsAction}>Reminder settings</button>}
        </div>
        {stale && <p className="lh-inline-error" role="status">Lobby details may be out of date. Refresh before joining.</p>}
        {attention}
        {expanded && !inhousePage && (
          <div className="lh-expanded">
            {session ? <>
              <div className="lh-roster-heading"><span>In the room</span><span>{members.length} / 10</span></div>
              <div className="lh-roster-names">{members.slice(0, 10).map(p => <span className="lh-roster-name" key={p.account_id}>{resolvePlayerDisplayName(p)}</span>)}</div>
              {(member || isAdmin) && <LobbyChat key={`${session.id}:${accountId}`} sessionId={session.id} accountId={accountId} sessionStatus={session.status} allowed />}
            </> : <p className="lh-chat-empty">No lobby is active right now. Check back soon.</p>}
            {children}
          </div>
        )}
        {expanded && inhousePage && <div className="lh-expanded lh-reminders-expanded">{children}</div>}
      </aside>
      <Dialog open={roleOpen && roleContextCurrent} onClose={() => !joining && setRoleOpen(false)} labelledBy="lh-role-title"
        contentClassName="lh-role-dialog">
        <div className="lh-dialog-eyebrow">Queue preferences</div>
        <h2 id="lh-role-title">Where do you play?</h2>
        <p>Select at least one role. You can pick several; nothing is preselected.</p>
        <fieldset className="lh-role-grid">
          <legend className="lh-visually-hidden">Preferred positions</legend>
          {ROLES.map(([id, label]) => <button type="button" key={id} aria-pressed={roles.includes(Number(id))} className={roles.includes(Number(id)) ? 'is-selected' : ''} onClick={() => setRoles(current => current.includes(Number(id)) ? current.filter(r => r !== Number(id)) : [...current, Number(id)])}><b>P{id}</b><span>{label}</span></button>)}
        </fieldset>
        {!roles.length && <p className="lh-role-hint">Choose a role to continue.</p>}
        {joinError && <p className="lh-inline-error" role="alert">{joinError}</p>}
        {blocked && <p className="lh-inline-error" role="status">Link your Discord and join the OCE Inhouse server first.</p>}
        {roleContextCurrent && !quickJoinable && <p className="lh-inline-error" role="status">This lobby is no longer open for quick join.</p>}
        <div className="lh-dialog-actions"><button type="button" className="lh-cancel" onClick={() => setRoleOpen(false)} disabled={joining}>Cancel</button><button type="button" className="lh-join-button" disabled={!roles.length || joining || stale || !quickJoinable} onClick={join}>{joining ? 'Joining…' : 'Join queue'}</button></div>
      </Dialog>
    </>
  );
}
