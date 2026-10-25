import React, { useMemo, useState } from 'react';
import { resolvePlayerDisplayName } from '../utils/displayName';
import '../styles/draft-team-review.css';

const TEAM_NAMES = { 1: 'Green side', 2: 'Red side' };

function playerName(player) {
  return resolvePlayerDisplayName(player);
}

function accountId(player) {
  return Number(player?.account_id);
}

function formatRating(value) {
  const number = Number(value);
  return value == null || !Number.isFinite(number) ? 'Not rated' : Math.round(number).toLocaleString();
}

function formatGap(value) {
  const number = Number(value);
  return value == null || !Number.isFinite(number) ? 'Unavailable' : `${number.toFixed(1)} MMR`;
}

async function postReview(sessionId, payload) {
  const response = await fetch(`/api/inhouse/${encodeURIComponent(sessionId)}/draft-review`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

export default function DraftTeamReview({
  sessionId,
  review,
  players = [],
  captainTeam = null,
  captainAccountIds = [],
  onChanged,
}) {
  const [selectedGreen, setSelectedGreen] = useState('');
  const [selectedRed, setSelectedRed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmations = Array.isArray(review?.confirmations) ? review.confirmations : [];
  const pendingTrade = review?.pendingTrade || null;
  const approved = Boolean(review?.approved);
  const locked = approved || confirmations.length === 2;
  const canAct = (captainTeam === 1 || captainTeam === 2) && !locked;
  const rated = Number(review?.balance?.knownCount) || 0;
  const balance = review?.balance;

  const teams = useMemo(() => ({
    1: players.filter(player => Number(player.team) === 1),
    2: players.filter(player => Number(player.team) === 2),
  }), [players]);

  const captainIds = useMemo(() => {
    const ids = Array.isArray(captainAccountIds) ? captainAccountIds : [];
    return new Set([
      ...ids.map(Number).filter(Number.isFinite),
      ...players.filter(player => player.captain).map(accountId).filter(Number.isFinite),
    ]);
  }, [captainAccountIds, players]);

  const availableGreen = teams[1].filter(player => !captainIds.has(accountId(player)));
  const availableRed = teams[2].filter(player => !captainIds.has(accountId(player)));
  const canPropose = canAct && !pendingTrade && selectedGreen && selectedRed &&
    Number(selectedGreen) !== Number(selectedRed);

  async function mutate(action, extra = {}) {
    if (busy || !canAct || !sessionId || !review) return;
    setBusy(true);
    setError('');
    try {
      await postReview(sessionId, { action, revision: review.revision, ...extra });
      setSelectedGreen('');
      setSelectedRed('');
      if (typeof onChanged === 'function') await onChanged();
    } catch (err) {
      setError(err?.message || 'Unable to update team review. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function selectSuggestion(suggestion) {
    if (!canAct || pendingTrade || locked) return;
    setSelectedGreen(String(suggestion.team1AccountId));
    setSelectedRed(String(suggestion.team2AccountId));
  }

  function submitProposal(event) {
    event.preventDefault();
    if (!canPropose) return;
    mutate('propose', {
      team1AccountId: Number(selectedGreen),
      team2AccountId: Number(selectedRed),
    });
  }

  function findPlayer(id) {
    return players.find(player => accountId(player) === Number(id));
  }

  if (!review?.available) {
    return (
      <section className="dtr-review" aria-label="Captain team review">
        <div className="dtr-heading">
          <div>
            <span className="dtr-kicker">After the draft</span>
            <h2>Captain review</h2>
          </div>
          <span className="dtr-state">Not ready</span>
        </div>
        <p className="dtr-intro">Team review opens when the draft is complete and both sides have five players.</p>
      </section>
    );
  }

  const tradeFromGreen = findPlayer(pendingTrade?.team1AccountId);
  const tradeFromRed = findPlayer(pendingTrade?.team2AccountId);
  const opponentCanRespond = pendingTrade && captainTeam && captainTeam !== pendingTrade.proposedByTeam;
  const proposerCanWithdraw = pendingTrade && captainTeam === pendingTrade.proposedByTeam;

  return (
    <section className="dtr-review" aria-label="Captain team review">
      <header className="dtr-heading">
        <div>
          <span className="dtr-kicker">After the draft · revision {review.revision}</span>
          <h2>Captain review</h2>
          <p className="dtr-intro">A final check for the two captains. The draft board above stays unchanged until an agreed swap is accepted.</p>
        </div>
        <span className={`dtr-state${locked ? ' is-locked' : ''}`}>
          {approved ? 'Approved' : pendingTrade ? 'Trade pending' : locked ? 'Locked' : 'Awaiting review'}
        </span>
      </header>

      <div className="dtr-summary">
        <div className="dtr-balance">
          <span className="dtr-label">{balance?.metric ? `Balance · ${balance.metric.replaceAll('_', ' ')}` : 'Inhouse MMR balance'}</span>
          <strong>{formatGap(balance?.gap)}</strong>
          <span>{rated} of {balance?.totalCount ?? 10} player ratings known</span>
          <small>Green average: {formatRating(balance?.team1Average)} · Red average: {formatRating(balance?.team2Average)}</small>
          {rated < (Number(balance?.totalCount) || 10) && <small>Incomplete ratings; averages and gap may not represent every player.</small>}
        </div>
        <p className="dtr-note">
          Rating suggestions are estimates only, not guarantees. Ratings do not measure role fit.
          Both captain confirmations lock the teams and may permit lobby automation if enabled.
          Website review alone does not create a Dota lobby.
        </p>
      </div>

      <div className="dtr-confirmations" aria-label="Captain confirmation status">
        {[1, 2].map(team => {
          const confirmed = confirmations.includes(team);
          return (
            <div className={`dtr-confirmation${confirmed ? ' is-confirmed' : ''}`} key={team}>
              <span className="dtr-confirm-mark" aria-hidden="true">{confirmed ? '✓' : '—'}</span>
              <span><strong>{TEAM_NAMES[team]} captain</strong><small>{confirmed ? 'Satisfied with these teams' : 'Has not confirmed'}</small></span>
              {captainTeam === team && <span className="dtr-you">You</span>}
            </div>
          );
        })}
      </div>

      {pendingTrade && (
        <div className="dtr-trade" role="group" aria-label="Pending one-for-one trade">
          <div className="dtr-trade-copy">
            <span className="dtr-label">One-for-one proposal · from {TEAM_NAMES[pendingTrade.proposedByTeam]} captain</span>
            <strong>{playerName(tradeFromGreen)} <span>for</span> {playerName(tradeFromRed)}</strong>
            <small>The teams remain as drafted unless the opposing captain accepts.</small>
          </div>
          <div className="dtr-actions">
            {opponentCanRespond && (
              <>
                <button type="button" className="dtr-button dtr-button-primary" disabled={busy} onClick={() => mutate('accept', { proposalId: pendingTrade.id })}>Accept swap</button>
                <button type="button" className="dtr-button" disabled={busy} onClick={() => mutate('decline', { proposalId: pendingTrade.id })}>Decline</button>
              </>
            )}
            {proposerCanWithdraw && (
              <button type="button" className="dtr-button" disabled={busy} onClick={() => mutate('withdraw', { proposalId: pendingTrade.id })}>Withdraw proposal</button>
            )}
            {!captainTeam && <span className="dtr-readonly">Waiting for a captain response</span>}
          </div>
        </div>
      )}

      {!pendingTrade && review.suggestions?.length > 0 && (
        <div className="dtr-suggestions">
          <div className="dtr-section-title">
            <div><span className="dtr-label">Optional rating ideas</span><h3>Possible swaps</h3></div>
            <span>Suggestion only</span>
          </div>
          <div className="dtr-suggestion-list">
            {review.suggestions.slice(0, 3).map((suggestion, index) => {
              const green = findPlayer(suggestion.team1AccountId);
              const red = findPlayer(suggestion.team2AccountId);
              const selected = selectedGreen === String(suggestion.team1AccountId) && selectedRed === String(suggestion.team2AccountId);
              return (
                <button
                  className={`dtr-suggestion${selected ? ' is-selected' : ''}`}
                  type="button"
                  key={`${suggestion.team1AccountId}-${suggestion.team2AccountId}-${index}`}
                  disabled={!canAct || busy || Boolean(pendingTrade)}
                  onClick={() => selectSuggestion(suggestion)}
                  aria-pressed={selected}
                >
                  <span className="dtr-suggestion-names"><strong>{playerName(green)}</strong><span>↔</span><strong>{playerName(red)}</strong></span>
                  <span className="dtr-suggestion-gap">{formatGap(suggestion.beforeGap)} <b>to</b> {formatGap(suggestion.afterGap)}</span>
                  <span className="dtr-improvement">Improvement {formatGap(suggestion.improvement)}</span>
                </button>
              );
            })}
          </div>
          <p className="dtr-caption">Choose an idea to fill the proposal form; it will not change teams unless the other captain accepts.</p>
        </div>
      )}

      {!pendingTrade && !locked && (
        <form className="dtr-proposal" onSubmit={submitProposal}>
          <div className="dtr-section-title">
            <div><span className="dtr-label">Captain action</span><h3>Propose a swap</h3></div>
            <span>One player from each side</span>
          </div>
          <div className="dtr-proposal-fields">
            <label>
              <span>Green side player</span>
              <select value={selectedGreen} onChange={event => setSelectedGreen(event.target.value)} disabled={!canAct || busy || Boolean(pendingTrade)}>
                <option value="">Choose a player</option>
                {availableGreen.map(player => <option key={player.account_id} value={player.account_id}>{playerName(player)}{player.inhouse_mmr != null ? ` · ${formatRating(player.inhouse_mmr)} MMR` : ''}</option>)}
              </select>
            </label>
            <span className="dtr-swap-mark" aria-hidden="true">↔</span>
            <label>
              <span>Red side player</span>
              <select value={selectedRed} onChange={event => setSelectedRed(event.target.value)} disabled={!canAct || busy || Boolean(pendingTrade)}>
                <option value="">Choose a player</option>
                {availableRed.map(player => <option key={player.account_id} value={player.account_id}>{playerName(player)}{player.inhouse_mmr != null ? ` · ${formatRating(player.inhouse_mmr)} MMR` : ''}</option>)}
              </select>
            </label>
            <button className="dtr-button dtr-button-primary" type="submit" disabled={!canPropose || busy}>Propose trade</button>
          </div>
          {(!captainTeam && !locked) && <p className="dtr-caption">Only the two captains can propose or respond to a trade. This view is read-only.</p>}
          {captainTeam && !locked && (availableGreen.length === 0 || availableRed.length === 0) && <p className="dtr-caption">A captain cannot be included in a trade.</p>}
        </form>
      )}

      {!pendingTrade && !locked && (
        <div className="dtr-confirm-row">
          <div>
            <strong>Happy with the teams?</strong>
            <span>{confirmations.includes(captainTeam) ? 'Your confirmation is recorded.' : 'Confirm when you are satisfied with the current teams.'}</span>
          </div>
          {captainTeam && (
            confirmations.includes(captainTeam)
              ? <button className="dtr-button" type="button" disabled={busy} onClick={() => mutate('revoke')}>Revoke confirmation</button>
              : <button className="dtr-button dtr-button-confirm" type="button" disabled={busy} onClick={() => mutate('confirm')}>Confirm teams</button>
          )}
          {!captainTeam && <span className="dtr-readonly">Read-only for spectators</span>}
        </div>
      )}

      {locked && (
        <div className="dtr-locked-message" role="status">
          Both captains are satisfied. Team review is final and the teams are locked.
        </div>
      )}
      {error && <p className="dtr-error" role="alert">{error}</p>}
      {busy && <span className="dtr-busy" role="status">Saving review…</span>}
    </section>
  );
}
