import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import { useSeason } from '../context/SeasonContext';
import { getAdminRivals, regenerateRivals, repairRival, setRivalExempt, adminListCommunityChallenges, adminCreateCommunityChallenge, adminUpdateCommunityChallenge, adminDeleteCommunityChallenge, getStoredReplays, extendReplayExpiry, getPlayerRanks, triggerRankSync, setManualRank, clearPlayerRank, getSignupRequests, updateSignupRequest, getSeasons, getSeasonTiers, ensureSeasonTiers, updateSeasonTier, placeAllPlayersInTiers, getSeasonTierPlayers, setSeasonEndConditions, closeSeasonApi, reannounceSeasonApi, rolloverSeasonApi, undoSeasonRolloverApi, setMatchReplayPath, getMatchReplayStatus, getAdminHeroTierOverrides, setAdminHeroTierOverride, deleteAdminHeroTierOverride, getTournaments, recomputeAchievements, getAdminFeatureFlags, setFeatureFlag, getAdminDiscordRichPresence, superuserFetch, getDiscordIdCollisions, resolveDiscordIdCollision, enforceDiscordIdUniqueIndex, getDiscordAutoJoinFailures, clearDiscordAutoJoinFailure, getFoundersRingRefunds, retryFoundersRingRefund, runInhouseDiagProvision, cleanupInhouseDiag, getAgentTrafficReport, getAssetHotlinkReport, getTwitchLinks, setTwitchLink, getLockdownState, setLockdownState, getLockdownAttempts, getLockdownAudit, getInhouseMarkets, adminSetBettingPaused, adminVoidBetMarket, adminSettleBetMarket, adminCreateCustomMarket, getFailedTournamentPayouts, retryFailedTournamentPayout, getPayoutsAwaitingConnect, getPaidPayoutReceipts, resendPayoutReceipt, resendAllPayoutReceipts, getAdminOpsLogs, getAdminOpsHistory, getLootboxAdminSets, retireLootboxSet, createLootboxSet, getPlayerV3ModifierHistory, adminGetNotifyTestTypes, adminSendNotifyTest, adminRunJob, getAdminEconomyPrices, setAdminEconomyPrices, getAdminDmRecipients, adminDmBlast } from '../api';
import Dialog from '../components/Dialog';
import RankBadge, { decodeRankTier } from '../components/RankBadge';
import SortableTh from '../components/SortableTh';
import { useTour } from '../components/SpotlightTour';
import { clearIntroSeen, hasSeenIntro } from '../config/tutorial';
import SponsorshipTrendChart, { trendRowsFor } from '../components/SponsorshipTrendChart';
import { TierBadge, MMR_TIERS } from './Leaderboard';
import { ALL_HEROES, getHeroName } from '../heroNames';

// Catches render-phase errors in any child component and shows a helpful
// message instead of a blank screen.
class AdminErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          margin: '40px auto', maxWidth: 640, padding: 24,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 10, fontFamily: 'monospace', fontSize: 13,
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#ef4444', marginBottom: 8 }}>
            ⚠️ Admin panel crashed
          </div>
          <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
            A section failed to render. This is usually caused by a newly-enabled feature flag
            whose component encountered unexpected data. Try disabling the most recently
            enabled preview flag and refreshing.
          </div>
          <pre style={{
            background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 12,
            color: '#fca5a5', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {this.state.error?.message || String(this.state.error)}
            {this.state.error?.stack ? '\n\n' + this.state.error.stack : ''}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 12, padding: '6px 16px', borderRadius: 6,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13,
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const POSITIONS = ['', 'Pos 1', 'Pos 2', 'Pos 3', 'Pos 4', 'Pos 5'];

function makeEmptyPlayer(team) {
  return { team, accountId: '', personaName: '', heroName: '', heroId: 0, position: 0, kills: 0, deaths: 0, assists: 0 };
}

function OverviewCard({ label, value, sub }) {
  return (
    <div className="stat-card" style={{ minWidth: 160 }}>
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Task #656 — admin controls to test/review the new-visitor tutorial. Lets a
// superuser launch the spotlight tour, open the public guide, and reset the
// guest auto-offer flag so the once-per-browser nudge fires again.
function TutorialReviewCard() {
  const { startTour } = useTour() || {};
  const [seen, setSeen] = useState(() => hasSeenIntro());
  return (
    <section style={{ marginBottom: 36 }}>
      <div className="admin-card" style={{
        padding: 18, borderRadius: 10, border: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}>
        <h3 style={{ margin: '0 0 6px' }}>🎓 New-visitor tutorial</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 14px' }}>
          Review the onboarding experience. Launch the interactive spotlight tour,
          open the public guide page, or reset the once-per-browser guest auto-offer
          so the nudge appears again on the next page load.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => startTour && startTour()}
          >
            ▶ Take the tour
          </button>
          <Link to="/how-it-works" className="btn" style={{ textDecoration: 'none' }}>
            📖 Open guide page
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => { clearIntroSeen(); setSeen(false); window.location.reload(); }}
          >
            ♻ Replay guest auto-offer
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Guest auto-offer on this browser: <strong>{seen ? 'already shown' : 'not yet shown'}</strong>
          </span>
        </div>
      </div>
    </section>
  );
}

function PlayerRow({ player, idx, allPlayers, heroes, onChange }) {
  return (
    <tr>
      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{idx + 1}</td>
      <td>
        <select
          value={player.accountId}
          onChange={e => {
            const selected = allPlayers.find(p => String(p.account_id) === e.target.value);
            onChange({ accountId: e.target.value, personaName: selected ? (selected.nickname || selected.persona_name || '') : '' });
          }}
          style={{ width: '100%', minWidth: 140 }}
        >
          <option value="">— Select player —</option>
          {allPlayers.map(p => (
            <option key={p.account_id} value={String(p.account_id)}>
              {p.nickname || p.persona_name || p.account_id}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={player.position} onChange={e => onChange({ position: parseInt(e.target.value) })} style={{ width: 90 }}>
          {POSITIONS.map((label, i) => <option key={i} value={i}>{i === 0 ? '—' : label}</option>)}
        </select>
      </td>
      <td>
        <input
          list={`heroes-list-${idx}-${player.team}`}
          value={player.heroName}
          onChange={e => {
            const name = e.target.value;
            const match = heroes.find(h => h.localized_name.toLowerCase() === name.toLowerCase());
            onChange({ heroName: name, heroId: match ? match.id : 0 });
          }}
          placeholder="Hero name"
          style={{ width: 140 }}
        />
        <datalist id={`heroes-list-${idx}-${player.team}`}>
          {heroes.map(h => <option key={h.id} value={h.localized_name} />)}
        </datalist>
      </td>
      <td><input type="number" min={0} max={50} value={player.kills} onChange={e => onChange({ kills: parseInt(e.target.value) || 0 })} style={{ width: 50 }} /></td>
      <td><input type="number" min={0} max={50} value={player.deaths} onChange={e => onChange({ deaths: parseInt(e.target.value) || 0 })} style={{ width: 50 }} /></td>
      <td><input type="number" min={0} max={50} value={player.assists} onChange={e => onChange({ assists: parseInt(e.target.value) || 0 })} style={{ width: 50 }} /></td>
    </tr>
  );
}

// Task #497 — Runtime toggle for the FULL_SITE_LOCKDOWN gate.
// Lets the owner flip the public site between "locked" (owner-only sign-in
// gate) and "open" without SSH/pm2/env edits. The env var still wins when
// set, so the toggle is read-only in that case.
// Task #450 — inhouse coin betting controls: global kill-switch, plus a
// per-match market inspector for void / manual-settle / custom-market
// creation. Markets are loaded on demand by entering a match id.
function BettingControlsCard({ superuserKey }) {
  const [paused, setPaused] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [matchId, setMatchId] = useState('');
  const [markets, setMarkets] = useState(null);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  // Custom market form.
  const [customTitle, setCustomTitle] = useState('');
  const [customOutcomes, setCustomOutcomes] = useState('');
  const [customTrigger, setCustomTrigger] = useState('match_start');

  const loadMarkets = useCallback(async () => {
    if (!matchId) return;
    setLoadingMarkets(true); setError(''); setMsg('');
    try {
      const d = await getInhouseMarkets(matchId.trim());
      setMarkets(d.markets || []);
      if (typeof d.paused === 'boolean') setPaused(d.paused);
    } catch (e) {
      setError(e.message || 'Failed to load markets');
      setMarkets(null);
    } finally {
      setLoadingMarkets(false);
    }
  }, [matchId]);

  const togglePause = async () => {
    if (saving) return;
    const next = !paused;
    if (!window.confirm(next ? 'Pause ALL coin betting?' : 'Resume coin betting?')) return;
    setSaving(true); setError(''); setMsg('');
    try {
      const r = await adminSetBettingPaused(next, superuserKey);
      setPaused(Boolean(r.paused));
      setMsg(next ? '⏸ Betting paused.' : '▶ Betting resumed.');
    } catch (e) {
      setError(e.message || 'Failed to toggle pause');
    } finally {
      setSaving(false);
    }
  };

  const voidMkt = async (m) => {
    if (!window.confirm(`Void "${m.title}" and refund all stakes? This cannot be undone.`)) return;
    setError(''); setMsg('');
    try {
      await adminVoidBetMarket(m.id, superuserKey);
      setMsg(`↩ Voided "${m.title}".`);
      loadMarkets();
    } catch (e) {
      setError(e.message || 'Void failed');
    }
  };

  const settleMkt = async (m, outcomeId) => {
    const o = m.outcomes.find(x => x.id === outcomeId);
    if (!o) return;
    if (!window.confirm(`Settle "${m.title}" to "${o.label}"? Winners are paid immediately.`)) return;
    setError(''); setMsg('');
    try {
      await adminSettleBetMarket(m.id, outcomeId, superuserKey);
      setMsg(`✓ Settled "${m.title}".`);
      loadMarkets();
    } catch (e) {
      setError(e.message || 'Settle failed');
    }
  };

  const createCustom = async () => {
    const outcomes = customOutcomes.split('\n').map(s => s.trim()).filter(Boolean).map(label => ({ label }));
    if (!customTitle.trim() || outcomes.length < 2) {
      setError('Custom market needs a title and at least 2 outcomes (one per line).');
      return;
    }
    setError(''); setMsg('');
    try {
      await adminCreateCustomMarket(matchId.trim(), { title: customTitle.trim(), outcomes, lockTrigger: customTrigger }, superuserKey);
      setMsg('✓ Custom market created.');
      setCustomTitle(''); setCustomOutcomes('');
      loadMarkets();
    } catch (e) {
      setError(e.message || 'Create failed');
    }
  };

  const inputStyle = {
    padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg-input, var(--bg))', color: 'var(--text-primary)', fontSize: 13,
  };

  return (
    <section style={{ marginBottom: 36 }} aria-labelledby="ap-betting-h">
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 id="ap-betting-h" style={{ margin: 0, fontSize: '1.05rem' }}>🪙 Coin betting</h2>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {paused == null ? '—' : paused ? 'PAUSED' : 'LIVE'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={!paused}
              aria-label={paused ? 'Resume coin betting' : 'Pause coin betting'}
              onClick={togglePause}
              disabled={saving}
              style={{
                position: 'relative', width: 56, height: 30, borderRadius: 999, border: 0,
                background: paused ? '#ef4444' : '#22c55e',
                cursor: saving ? 'not-allowed' : 'pointer', padding: 0,
              }}
            >
              <span aria-hidden="true" style={{
                position: 'absolute', top: 3, left: paused ? 3 : 29,
                width: 24, height: 24, borderRadius: '50%', background: '#fff',
                transition: 'left 0.15s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }} />
            </button>
          </div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 0, marginBottom: 14 }}>
          Kill-switch pauses all new bets globally. Below, load a match's markets to void (refund),
          manually settle a custom market, or create a new custom market.
        </p>
        {error && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        {msg && <div role="status" style={{ color: '#22c55e', fontSize: 13, marginBottom: 10 }}>{msg}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <input
            type="text"
            value={matchId}
            onChange={e => setMatchId(e.target.value)}
            placeholder="Match ID"
            aria-label="Match ID to load betting markets"
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          />
          <button type="button" className="btn" onClick={loadMarkets} disabled={!matchId || loadingMarkets}>
            {loadingMarkets ? 'Loading…' : 'Load markets'}
          </button>
        </div>

        {markets && markets.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>No markets on this match.</div>
        )}
        {markets && markets.map(m => (
          <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {m.title} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>· {m.status} · 🪙 {m.pool}</span>
              </div>
              {(m.status === 'open' || m.status === 'locked') && (
                <button
                  type="button"
                  onClick={() => voidMkt(m)}
                  aria-label={`Void market ${m.title} and refund all stakes`}
                  style={{ ...inputStyle, cursor: 'pointer', color: '#ef4444', borderColor: '#ef444455' }}
                >
                  ↩ Void / refund
                </button>
              )}
            </div>
            {m.is_custom && (m.status === 'open' || m.status === 'locked') && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Settle to outcome:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {m.outcomes.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => settleMkt(m, o.id)}
                      aria-label={`Settle ${m.title} to ${o.label}`}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {matchId && markets && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 10 }}>Create custom market</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <input
                type="text"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                placeholder="Market title (e.g. First Roshan)"
                aria-label="Custom market title"
                style={inputStyle}
              />
              <textarea
                value={customOutcomes}
                onChange={e => setCustomOutcomes(e.target.value)}
                placeholder={'One outcome per line\nRadiant\nDire'}
                aria-label="Custom market outcomes, one per line"
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label htmlFor="ap-custom-trigger" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Lock trigger</label>
                <select
                  id="ap-custom-trigger"
                  value={customTrigger}
                  onChange={e => setCustomTrigger(e.target.value)}
                  style={inputStyle}
                >
                  <option value="lobby_launch">Lobby launch</option>
                  <option value="match_start">Match start</option>
                  <option value="first_blood">First blood</option>
                </select>
                <button type="button" className="btn" onClick={createCustom}>Create market</button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Custom markets are settled manually (no auto-grader) — use the per-outcome settle buttons above.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function LockdownCard({ superuserKey }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const load = useCallback(() => {
    if (!superuserKey) return;
    setLoading(true); setError('');
    getLockdownState(superuserKey)
      .then(setState)
      .catch(e => setError(e.message || 'Failed to load lockdown state'))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  useEffect(() => { load(); }, [load]);

  const loadHistory = useCallback(() => {
    if (!superuserKey) return;
    setHistoryLoading(true); setHistoryError('');
    getLockdownAudit(superuserKey, 20)
      .then(r => setHistory(r.entries || []))
      .catch(e => setHistoryError(e.message || 'Failed to load history'))
      .finally(() => setHistoryLoading(false));
  }, [superuserKey]);

  // Lazily load the audit trail the first time the section is expanded.
  useEffect(() => {
    if (historyOpen && history === null && !historyLoading) loadHistory();
  }, [historyOpen, history, historyLoading, loadHistory]);

  const onToggle = async () => {
    if (!state || saving) return;
    if (state.envForced) return; // env wins — toggle is informational only
    const next = !state.enabled;
    const verb = next ? 'lock down' : 'unlock';
    if (!window.confirm(`Are you sure you want to ${verb} the public site?`)) return;
    setSaving(true); setError(''); setMsg('');
    try {
      const updated = await setLockdownState(superuserKey, next);
      setState(updated);
      setMsg(next
        ? '🔒 Site is now locked. Visitors will see the sign-in gate.'
        : '🔓 Site is now open. Visitors can browse normally.');
      // The flip just added an audit row — refresh the trail if it's open.
      if (historyOpen) loadHistory();
      else setHistory(null);
    } catch (e) {
      setError(e.message || 'Failed to update lockdown');
    } finally {
      setSaving(false);
    }
  };

  const fmtTs = (t) => t ? new Date(t).toLocaleString() : '—';
  const enabled = !!state?.enabled;
  const envForced = !!state?.envForced;
  const dot = enabled ? '#ef4444' : '#22c55e';
  const label = enabled ? 'LOCKED' : 'OPEN';

  return (
    <section style={{ marginBottom: 36 }} aria-labelledby="ap-lockdown-h">
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 id="ap-lockdown-h" style={{ margin: 0, fontSize: '1.05rem' }}>
            🔒 Site lockdown
          </h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block' }} />
              <strong style={{ color: enabled ? '#ef4444' : '#22c55e' }}>{label}</strong>
            </span>
            <button type="button" className="btn" onClick={load} disabled={loading} aria-label="Refresh lockdown state" style={{ fontSize: 12 }}>
              {loading ? '…' : '↻'}
            </button>
          </div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 0, marginBottom: 14 }}>
          When ON, every visitor to <code>oceinhouse.gg</code> sees the owner-only sign-in page until they unlock with the superuser password.
          Steam OpenID, the Stripe webhook, and <code>robots.txt</code> stay reachable so logins and payments keep working.
          {envForced && (
            <> The <code>FULL_SITE_LOCKDOWN</code> env var is currently forcing the gate ON — unset it on the prod host to make this toggle take effect.</>
          )}
        </p>
        {error && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        {msg && <div role="status" style={{ color: '#22c55e', fontSize: 13, marginBottom: 10 }}>{msg}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? 'Disable site lockdown (unlock the site)' : 'Enable site lockdown (lock the site)'}
            onClick={onToggle}
            disabled={saving || envForced || !state}
            style={{
              position: 'relative',
              width: 56, height: 30, borderRadius: 999, border: 0,
              background: enabled ? '#ef4444' : '#4b5563',
              cursor: (saving || envForced || !state) ? 'not-allowed' : 'pointer',
              opacity: (envForced || !state) ? 0.6 : 1,
              transition: 'background 0.15s ease',
              padding: 0,
            }}
          >
            <span aria-hidden="true" style={{
              position: 'absolute', top: 3, left: enabled ? 29 : 3,
              width: 24, height: 24, borderRadius: '50%', background: '#fff',
              transition: 'left 0.15s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }} />
          </button>
          <div style={{ fontSize: 13, lineHeight: 1.4 }}>
            <div><strong>{enabled ? 'Locked' : 'Open'}</strong> {envForced ? '(forced by env var)' : '(via admin toggle)'}</div>
            {enabled && state?.since && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                ON since {fmtTs(state.since)}
                {state.actor && <> · by <code>{state.actor}</code></>}
              </div>
            )}
            {saving && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Saving…</div>}
          </div>
        </div>

        {/* Task #507 — collapsible audit trail of every lock/unlock flip. */}
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border, rgba(255,255,255,0.08))', paddingTop: 12 }}>
          <button
            type="button"
            className="btn"
            onClick={() => setHistoryOpen(o => !o)}
            aria-expanded={historyOpen}
            aria-controls="ap-lockdown-history"
            style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span aria-hidden="true">{historyOpen ? '▾' : '▸'}</span>
            History
          </button>
          {historyOpen && (
            <div id="ap-lockdown-history" style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Last 20 changes (newest first)</span>
                <button type="button" className="btn" onClick={loadHistory} disabled={historyLoading} aria-label="Refresh lockdown history" style={{ fontSize: 12 }}>
                  {historyLoading ? '…' : '↻'}
                </button>
              </div>
              {historyError && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{historyError}</div>}
              {historyLoading && history === null && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}
              {!historyLoading && Array.isArray(history) && history.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No lockdown changes recorded yet.</div>
              )}
              {Array.isArray(history) && history.length > 0 && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 280, overflowY: 'auto', fontSize: 12 }}>
                  {history.map(entry => (
                    <li key={entry.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border, rgba(255,255,255,0.05))' }}>
                      <span
                        style={{
                          flexShrink: 0,
                          fontWeight: 700,
                          color: entry.action === 'lock' ? '#ef4444' : '#22c55e',
                          textTransform: 'uppercase',
                          fontSize: 11,
                          minWidth: 56,
                        }}
                      >
                        {entry.action === 'lock' ? '🔒 Lock' : '🔓 Unlock'}
                      </span>
                      <span style={{ flexShrink: 0, color: 'var(--text-muted)' }}>{fmtTs(entry.created_at)}</span>
                      <code style={{ flex: 1, wordBreak: 'break-all' }}>{entry.actor}</code>
                      {entry.reason && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{entry.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Task #492 — AI scraper / app-builder traffic card. Aggregates the
// in-memory ring buffer maintained by src/security/agentClassifier.js,
// surfacing the last 7 days of agent UA hits by family with a sortable
// table (uses the shared SortableTh component, satisfies all 6 a11y rules).
function AgentTrafficCard({ superuserKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [sortKey, setSortKey] = useState('hits');
  const [sortDir, setSortDir] = useState('desc');
  const [showRecent, setShowRecent] = useState(false);

  const load = useCallback(() => {
    if (!superuserKey) return;
    setLoading(true); setError('');
    getAgentTrafficReport(superuserKey, days)
      .then(setData)
      .catch(e => setError(e.message || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [superuserKey, days]);

  useEffect(() => { load(); }, [load]);

  const sort = (k) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const rows = React.useMemo(() => {
    const list = [...(data?.families || [])];
    list.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [data, sortKey, sortDir]);

  const fmtTs = (t) => t ? new Date(t).toLocaleString() : '—';
  const kindBadge = (k) => {
    const color = k === 'ai-crawler' ? '#c084fc'
      : k === 'app-builder' ? '#f59e0b'
      : '#6b7280';
    return (
      <span style={{
        display: 'inline-block', padding: '2px 6px', borderRadius: 4,
        background: `${color}22`, color, fontSize: 11, fontWeight: 600,
      }}>{k || 'unknown'}</span>
    );
  };

  return (
    <section style={{ marginBottom: 36 }} aria-labelledby="ap-agent-traffic-h">
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 id="ap-agent-traffic-h" style={{ margin: 0, fontSize: '1.05rem' }}>
            🕷️ AI agent traffic
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Window:&nbsp;
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                aria-label="Report time window"
                style={{ fontSize: 13 }}
              >
                <option value={1}>24h</option>
                <option value={7}>7d</option>
                <option value={30}>30d</option>
              </select>
            </label>
            <button
              type="button"
              className="btn"
              onClick={load}
              disabled={loading}
              aria-label="Refresh agent traffic report"
            >
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
          Aggregated from the in-process ring buffer ({data ? `${data.ringBufferSize}/${data.ringBufferMax}` : '…'} entries).
          Hard block is <strong>{data?.blockOn ? 'ON' : 'OFF'}</strong> (toggle via <code>BLOCK_AI_AGENTS=1</code>).
          See <code>src/security/agentUaList.js</code> for the classification list.
        </p>
        {error && (
          <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</div>
        )}
        {!data && !error && <div style={{ fontSize: 13 }}>Loading…</div>}
        {data && rows.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No agent UA hits in the selected window. (Either the deterrent is working
            or the bot just rebooted — the buffer is in-process only.)
          </div>
        )}
        {data && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                  <SortableTh onSort={() => sort('family')}    active={sortKey === 'family'}    direction={sortDir}>UA family</SortableTh>
                  <SortableTh onSort={() => sort('kind')}      active={sortKey === 'kind'}      direction={sortDir}>Kind</SortableTh>
                  <SortableTh onSort={() => sort('hits')}      active={sortKey === 'hits'}      direction={sortDir} style={{ textAlign: 'right' }}>Hits</SortableTh>
                  <SortableTh onSort={() => sort('blocked')}   active={sortKey === 'blocked'}   direction={sortDir} style={{ textAlign: 'right' }}>Blocked</SortableTh>
                  <SortableTh onSort={() => sort('throttled')} active={sortKey === 'throttled'} direction={sortDir} style={{ textAlign: 'right' }}>Throttled</SortableTh>
                  <SortableTh onSort={() => sort('logged')}    active={sortKey === 'logged'}    direction={sortDir} style={{ textAlign: 'right' }}>Logged</SortableTh>
                  <SortableTh onSort={() => sort('unique_ips')}   active={sortKey === 'unique_ips'}   direction={sortDir} style={{ textAlign: 'right' }}>Uniq IPs</SortableTh>
                  <SortableTh onSort={() => sort('unique_paths')} active={sortKey === 'unique_paths'} direction={sortDir} style={{ textAlign: 'right' }}>Uniq paths</SortableTh>
                  <SortableTh onSort={() => sort('last_seen')} active={sortKey === 'last_seen'} direction={sortDir}>Last seen</SortableTh>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.family} style={{ borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{r.family}</td>
                    <td style={{ padding: '6px 8px' }}>{kindBadge(r.kind)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.hits}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: r.blocked ? '#ef4444' : 'inherit' }}>{r.blocked || 0}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: r.throttled ? '#f59e0b' : 'inherit' }}>{r.throttled || 0}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.logged || 0}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.unique_ips}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.unique_paths}</td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtTs(r.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.recent && data.recent.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setShowRecent(s => !s)}
              aria-expanded={showRecent}
              aria-controls="ap-agent-traffic-recent"
              aria-label={showRecent ? 'Hide recent agent requests' : 'Show recent agent requests'}
              style={{ fontSize: 12 }}
            >
              {showRecent ? '▾ Hide recent requests' : `▸ Show recent requests (${data.recent.length})`}
            </button>
            {showRecent && (
              <div id="ap-agent-traffic-recent" style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto', fontSize: 12, fontFamily: 'monospace' }}>
                {data.recent.map((r, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{fmtTs(r.ts)}</span>
                    {' · '}
                    <span style={{ color: r.decision === 'blocked' ? '#ef4444' : '#9ca3af' }}>{r.decision}</span>
                    {' · '}
                    <strong>{r.family}</strong>
                    {' · '}
                    {r.method} {r.path}
                    <div style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>{r.ua}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// Task #498 — Lockdown access log. Shows who tried to reach the site while the
// owner-only lockdown gate was on, grouped by UA family, so the owner can spot
// humans hitting deep links from a leaked share (vs. the AI-agent card).
// Hidden entirely when the gate is off.
function LockdownAttemptsCard({ superuserKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [sortKey, setSortKey] = useState('hits');
  const [sortDir, setSortDir] = useState('desc');
  const [showRecent, setShowRecent] = useState(false);

  const load = useCallback(() => {
    if (!superuserKey) return;
    setLoading(true); setError('');
    getLockdownAttempts(superuserKey, days)
      .then(setData)
      .catch(e => setError(e.message || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [superuserKey, days]);

  useEffect(() => { load(); }, [load]);

  const sort = (k) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const rows = React.useMemo(() => {
    const list = [...(data?.families || [])];
    list.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [data, sortKey, sortDir]);

  const fmtTs = (t) => t ? new Date(t).toLocaleString() : '—';

  // Hide the card entirely while the gate is off — there's nothing to see and
  // no new attempts will be recorded.
  if (data && !data.gateOn) return null;

  return (
    <section style={{ marginBottom: 36 }} aria-labelledby="ap-lockdown-attempts-h">
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 id="ap-lockdown-attempts-h" style={{ margin: 0, fontSize: '1.05rem' }}>
            🚪 Lockdown access log
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Window:&nbsp;
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                aria-label="Lockdown access log time window"
                style={{ fontSize: 13 }}
              >
                <option value={1}>24h</option>
                <option value={7}>7d</option>
                <option value={30}>30d</option>
              </select>
            </label>
            <button
              type="button"
              className="btn"
              onClick={load}
              disabled={loading}
              aria-label="Refresh lockdown access log"
            >
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
          Requests blocked by the lockdown gate, grouped by UA family
          ({data ? `${data.ringBufferSize}/${data.ringBufferMax}` : '…'} entries, in-process only).
          <strong> html-gate</strong> = browser navigation shown the sign-in page;
          <strong> 401-empty</strong> = API/asset request denied. Separate from the AI-agent traffic card above.
        </p>
        {error && (
          <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</div>
        )}
        {!data && !error && <div style={{ fontSize: 13 }}>Loading…</div>}
        {data && rows.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No gated requests in the selected window. (Either no one has hit the
            site while locked, or the bot rebooted — the buffer is in-process only.)
          </div>
        )}
        {data && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                  <SortableTh onSort={() => sort('family')}       active={sortKey === 'family'}       direction={sortDir}>UA family</SortableTh>
                  <SortableTh onSort={() => sort('hits')}         active={sortKey === 'hits'}         direction={sortDir} style={{ textAlign: 'right' }}>Hits</SortableTh>
                  <SortableTh onSort={() => sort('html_gate')}    active={sortKey === 'html_gate'}    direction={sortDir} style={{ textAlign: 'right' }}>HTML gate</SortableTh>
                  <SortableTh onSort={() => sort('empty_401')}    active={sortKey === 'empty_401'}    direction={sortDir} style={{ textAlign: 'right' }}>401 empty</SortableTh>
                  <SortableTh onSort={() => sort('unique_ips')}   active={sortKey === 'unique_ips'}   direction={sortDir} style={{ textAlign: 'right' }}>Uniq IPs</SortableTh>
                  <SortableTh onSort={() => sort('unique_paths')} active={sortKey === 'unique_paths'} direction={sortDir} style={{ textAlign: 'right' }}>Uniq paths</SortableTh>
                  <SortableTh onSort={() => sort('last_seen')}    active={sortKey === 'last_seen'}    direction={sortDir}>Last seen</SortableTh>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.family} style={{ borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{r.family}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.hits}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.html_gate || 0}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.empty_401 || 0}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.unique_ips}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.unique_paths}</td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtTs(r.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.recent && data.recent.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setShowRecent(s => !s)}
              aria-expanded={showRecent}
              aria-controls="ap-lockdown-attempts-recent"
              aria-label={showRecent ? 'Hide recent gated requests' : 'Show recent gated requests'}
              style={{ fontSize: 12 }}
            >
              {showRecent ? '▾ Hide recent requests' : `▸ Show recent requests (${data.recent.length})`}
            </button>
            {showRecent && (
              <div id="ap-lockdown-attempts-recent" style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto', fontSize: 12, fontFamily: 'monospace' }}>
                {data.recent.map((r, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{fmtTs(r.ts)}</span>
                    {' · '}
                    <span style={{ color: r.decision === 'html-gate' ? '#9ca3af' : '#f59e0b' }}>{r.decision}</span>
                    {' · '}
                    <strong>{r.family}</strong>
                    {' · '}
                    {r.ip || '—'}
                    {' · '}
                    {r.method} {r.path}
                    <div style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>{r.ua}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// Task #491 — Brand-asset hotlink report. Surfaces whether a clone (or anything
// else) has been hotlinking our logo / favicon / badges / voice packs /
// scoreboard renders off oceinhouse.gg, grouped by referer host.
function AssetHotlinkCard({ superuserKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [sortKey, setSortKey] = useState('blocked');
  const [sortDir, setSortDir] = useState('desc');
  const [showRecent, setShowRecent] = useState(false);

  const load = useCallback(() => {
    if (!superuserKey) return;
    setLoading(true); setError('');
    getAssetHotlinkReport(superuserKey, days)
      .then(setData)
      .catch(e => setError(e.message || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [superuserKey, days]);

  useEffect(() => { load(); }, [load]);

  const sort = (k) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const rows = React.useMemo(() => {
    const list = [...(data?.hosts || [])];
    list.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [data, sortKey, sortDir]);

  const fmtTs = (t) => t ? new Date(t).toLocaleString() : '—';

  return (
    <section style={{ marginBottom: 36 }} aria-labelledby="ap-asset-hotlink-h">
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 id="ap-asset-hotlink-h" style={{ margin: 0, fontSize: '1.05rem' }}>
            🖼️ Brand-asset hotlinks
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Window:&nbsp;
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                aria-label="Hotlink report time window"
                style={{ fontSize: 13 }}
              >
                <option value={1}>24h</option>
                <option value={7}>7d</option>
                <option value={30}>30d</option>
              </select>
            </label>
            <button
              type="button"
              className="btn"
              onClick={load}
              disabled={loading}
              aria-label="Refresh brand-asset hotlink report"
            >
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
          Requests for our logo / favicon / badges / voice packs / scoreboard renders whose
          <code> Referer</code> points off-domain are blocked with HTTP 403. Totals are aggregated
          from a {data?.persisted ? `durable daily rollup (kept ${data.retentionDays || 90} days, survives deploys)` : 'durable daily rollup'},
          grouped by referer host; the recent-requests list below is the live in-process tail
          ({data ? `${data.ringBufferSize}/${data.ringBufferMax}` : '…'} entries, resets on reboot).
          Allow-list extendable via <code>BRAND_ASSET_REFERER_ALLOWLIST</code>.
        </p>
        {data && data.totals && (
          <p style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>
            <strong>{data.totals.hits}</strong> requests ·{' '}
            <span style={{ color: '#22c55e' }}>{data.totals.allowed} allowed</span> ·{' '}
            <span style={{ color: data.totals.blocked ? '#ef4444' : 'inherit' }}>{data.totals.blocked} blocked</span>
          </p>
        )}
        {error && (
          <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</div>
        )}
        {!data && !error && <div style={{ fontSize: 13 }}>Loading…</div>}
        {data && rows.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No brand-asset requests in the selected window.
          </div>
        )}
        {data && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                  <SortableTh onSort={() => sort('referer_host')} active={sortKey === 'referer_host'} direction={sortDir}>Referer host</SortableTh>
                  <SortableTh onSort={() => sort('hits')}         active={sortKey === 'hits'}         direction={sortDir} style={{ textAlign: 'right' }}>Hits</SortableTh>
                  <SortableTh onSort={() => sort('allowed')}      active={sortKey === 'allowed'}      direction={sortDir} style={{ textAlign: 'right' }}>Allowed</SortableTh>
                  <SortableTh onSort={() => sort('blocked')}      active={sortKey === 'blocked'}      direction={sortDir} style={{ textAlign: 'right' }}>Blocked</SortableTh>
                  <SortableTh onSort={() => sort('unique_paths')} active={sortKey === 'unique_paths'} direction={sortDir} style={{ textAlign: 'right' }}>Uniq paths</SortableTh>
                  <SortableTh onSort={() => sort('last_seen')}    active={sortKey === 'last_seen'}    direction={sortDir}>Last seen</SortableTh>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.referer_host} style={{ borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{r.referer_host}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.hits}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: r.allowed ? '#22c55e' : 'inherit' }}>{r.allowed || 0}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: r.blocked ? '#ef4444' : 'inherit' }}>{r.blocked || 0}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.unique_paths}</td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtTs(r.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.recent && data.recent.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setShowRecent(s => !s)}
              aria-expanded={showRecent}
              aria-controls="ap-asset-hotlink-recent"
              aria-label={showRecent ? 'Hide recent hotlink requests' : 'Show recent hotlink requests'}
              style={{ fontSize: 12 }}
            >
              {showRecent ? '▾ Hide recent requests' : `▸ Show recent requests (${data.recent.length})`}
            </button>
            {showRecent && (
              <div id="ap-asset-hotlink-recent" style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto', fontSize: 12, fontFamily: 'monospace' }}>
                {data.recent.map((r, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{fmtTs(r.ts)}</span>
                    {' · '}
                    <span style={{ color: r.decision === 'blocked' ? '#ef4444' : '#22c55e' }}>{r.decision}</span>
                    {' · '}
                    <strong>{r.referer_host}</strong>
                    {' · '}
                    {r.method} {r.path}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// Superuser-only — link/unlink any player's Twitch channel so they appear on
// the /live hub. Writes player_profiles.extras->>'twitch_login' via the admin
// API; saves the owner from running raw SQL on the prod database.
function TwitchLinkCard({ superuserKey }) {
  const [links, setLinks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState('');
  const [channel, setChannel] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    if (!superuserKey) return;
    setLoading(true); setError('');
    getTwitchLinks(superuserKey)
      .then(d => setLinks(d.links || []))
      .catch(e => setError(e.message || 'Failed to load Twitch links'))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!accountId.trim()) { setError('Enter the player\u2019s account id'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const r = await setTwitchLink(accountId.trim(), channel.trim(), superuserKey);
      setNotice(r.cleared
        ? `Cleared Twitch link for ${r.account_id}`
        : `Linked ${r.account_id} \u2192 twitch.tv/${r.twitch_login}`);
      setAccountId(''); setChannel('');
      load();
    } catch (err) {
      setError(err.message || 'Failed to save Twitch link');
    } finally {
      setSaving(false);
    }
  };

  const unlink = async (acct) => {
    setSaving(true); setError(''); setNotice('');
    try {
      await setTwitchLink(String(acct), '', superuserKey);
      setNotice(`Cleared Twitch link for ${acct}`);
      load();
    } catch (err) {
      setError(err.message || 'Failed to clear Twitch link');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ marginBottom: 36 }} aria-labelledby="ap-twitch-link-h">
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 id="ap-twitch-link-h" style={{ margin: 0, fontSize: '1.05rem' }}>
            📺 Twitch channel links
          </h2>
          <button
            type="button"
            className="btn"
            onClick={load}
            disabled={loading}
            aria-label="Refresh Twitch links"
          >
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>

        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)' }}>
          Link any player&rsquo;s Twitch channel so they show up on the <Link to="/live">/live</Link> hub.
          The channel must opt in via their own profile, or you can set it here. Leave the channel
          blank and submit to clear an existing link.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: 'var(--text-muted)' }}>
            Account id
            <input
              type="text"
              inputMode="numeric"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="e.g. 135991380"
              style={{ fontSize: 14, padding: '6px 8px', minWidth: 160 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: 'var(--text-muted)' }}>
            Twitch channel
            <input
              type="text"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="frangie or twitch.tv/frangie"
              style={{ fontSize: 14, padding: '6px 8px', minWidth: 200 }}
            />
          </label>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save link'}
          </button>
        </form>

        {error ? <p style={{ color: 'var(--danger, #e25555)', fontSize: 13, margin: '0 0 10px' }}>{error}</p> : null}
        {notice ? <p style={{ color: 'var(--accent)', fontSize: 13, margin: '0 0 10px' }}>{notice}</p> : null}

        {links && links.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '6px 8px' }}>Player</th>
                <th style={{ padding: '6px 8px' }}>Account id</th>
                <th style={{ padding: '6px 8px' }}>Channel</th>
                <th style={{ padding: '6px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.account_id} style={{ borderTop: '1px solid var(--border, #2a3142)' }}>
                  <td style={{ padding: '6px 8px' }}>{l.display_name || '—'}</td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{l.account_id}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <a href={`https://twitch.tv/${l.twitch_login}`} target="_blank" rel="noopener noreferrer">
                      twitch.tv/{l.twitch_login}
                    </a>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => unlink(l.account_id)}
                      disabled={saving}
                      aria-label={`Unlink Twitch channel for account ${l.account_id}`}
                    >
                      Unlink
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !loading && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No channels linked yet.</p>
        )}
      </div>
    </section>
  );
}

// Task #265 — superuser-only audit table for Founders Pass cap-race auto-refunds.
// Lists every refund recorded in `founders_ring_refunds` (most recent first)
// and visually highlights any row whose status is 'refund_failed' so an
// operator can spot a stuck refund that needs manual attention in Stripe.
function FoundersRingRefunds({ superuserKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  // Task #274 — per-row retry state ({ [id]: true while in-flight }) and a
  // per-row error message shown inline below the row error column.
  const [retrying, setRetrying] = useState({});
  const [rowErrors, setRowErrors] = useState({});
  const [statusMsg, setStatusMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getFoundersRingRefunds(superuserKey, { limit: 500 })
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  function handleRetry(row) {
    if (!window.confirm(
      `Retry Stripe refund for account ${row.account_id} (session ${row.stripe_session_id})?`
    )) return;
    setRetrying(prev => ({ ...prev, [row.id]: true }));
    setRowErrors(prev => ({ ...prev, [row.id]: '' }));
    setStatusMsg('');
    retryFoundersRingRefund(row.id, superuserKey)
      .then(r => {
        setStatusMsg(`✓ Refund succeeded for account ${row.account_id}.`);
        setData(prev => prev ? {
          ...prev,
          refunds: prev.refunds.map(x => x.id === row.id ? (r.refund || x) : x),
        } : prev);
      })
      .catch(e => {
        setRowErrors(prev => ({ ...prev, [row.id]: e.message }));
        // Server returns the updated row on 502 (Stripe rejected) so the
        // row's error_message refreshes in place without a manual reload.
        if (e.refund) {
          setData(prev => prev ? {
            ...prev,
            refunds: prev.refunds.map(x => x.id === row.id ? e.refund : x),
          } : prev);
        }
      })
      .finally(() => {
        setRetrying(prev => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      });
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'amount_cents' || key === 'created_at' ? 'desc' : 'asc');
    }
  }

  const refunds = data?.refunds || [];
  const sorted = [...refunds].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    let cmp;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const failedCount = refunds.filter(r => r.status === 'refund_failed').length;

  function fmtMoney(cents, currency) {
    if (cents == null) return '—';
    const amt = (cents / 100).toFixed(2);
    return `${amt} ${(currency || '').toUpperCase()}`.trim();
  }
  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleString(); } catch (_) { return d; }
  }
  function stripeRefundUrl(refundId) {
    if (!refundId) return null;
    return `https://dashboard.stripe.com/refunds/${refundId}`;
  }
  function stripeSessionUrl(sessionId) {
    if (!sessionId) return null;
    return `https://dashboard.stripe.com/payments/${sessionId}`;
  }

  function SortHeader({ k, children, align = 'left' }) {
    const active = sortKey === k;
    const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return (
      <SortableTh
        scope="col"
        active={active}
        direction={sortDir}
        onSort={() => toggleSort(k)}
        style={{ padding: '6px 10px 8px 0', fontWeight: 600, textAlign: align }}
      >
        {children}{arrow}
      </SortableTh>
    );
  }

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 id="ap-anchor-founders-refunds" className="section-title" style={{ margin: 0 }}>
          💍 Founders Pass Refunds
        </h2>
        <button className="btn" onClick={load} disabled={loading} style={{ fontSize: 12 }}>
          {loading ? '⏳ Loading…' : data === null ? 'Load' : 'Refresh'}
        </button>
        {data !== null && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {refunds.length} refund{refunds.length === 1 ? '' : 's'}
            {failedCount > 0 && (
              <span style={{ marginLeft: 8, color: '#fca5a5', fontWeight: 600 }}>
                ⚠ {failedCount} failed
              </span>
            )}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        Audit log of every Founders Pass cover-ring auto-refund. When a buyer pays after the cap is
        already reached, the webhook auto-refunds them and records a row here. Rows in
        <code> refund_failed </code> require manual follow-up in Stripe — they're highlighted in red.
      </p>

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#450a0a',
                      border: '1px solid #f87171', color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {statusMsg && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(74,222,128,0.10)',
                      border: '1px solid #4ade80', color: '#86efac', fontSize: 13, marginBottom: 12 }}>
          {statusMsg}
        </div>
      )}

      {data !== null && refunds.length === 0 && (
        <p style={{ color: '#4ade80', fontSize: 13 }}>
          ✓ No cap-race refunds recorded — every Founders Pass purchase landed under the cap.
        </p>
      )}

      {refunds.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <SortHeader k="created_at">Date</SortHeader>
                <SortHeader k="account_id">Account</SortHeader>
                <SortHeader k="amount_cents" align="right">Amount</SortHeader>
                <SortHeader k="status">Status</SortHeader>
                <SortHeader k="stripe_refund_id">Refund</SortHeader>
                <SortHeader k="stripe_session_id">Session</SortHeader>
                <th style={{ padding: '6px 10px 8px 0', fontWeight: 600 }}>Error</th>
                <th style={{ padding: '6px 10px 8px 0', fontWeight: 600 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const failed = r.status === 'refund_failed';
                const refundUrl = stripeRefundUrl(r.stripe_refund_id);
                const sessionUrl = stripeSessionUrl(r.stripe_session_id);
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderTop: '1px solid var(--border)',
                      background: failed ? 'rgba(239,68,68,0.10)' : undefined,
                    }}
                  >
                    <td style={{ padding: '5px 10px 5px 0', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                    <td style={{ padding: '5px 10px 5px 0', fontFamily: 'monospace' }}>
                      <Link to={`/players/${r.account_id}`}>{r.account_id}</Link>
                    </td>
                    <td style={{ padding: '5px 10px 5px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {fmtMoney(r.amount_cents, r.currency)}
                    </td>
                    <td style={{ padding: '5px 10px 5px 0' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
                        fontWeight: 600,
                        background: failed ? 'rgba(239,68,68,0.25)' : 'rgba(74,222,128,0.15)',
                        color: failed ? '#fca5a5' : '#86efac',
                        border: `1px solid ${failed ? '#f87171' : '#4ade80'}`,
                      }}>
                        {r.status || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '5px 10px 5px 0', fontFamily: 'monospace', fontSize: 11 }}>
                      {refundUrl ? (
                        <a href={refundUrl} target="_blank" rel="noopener noreferrer">{r.stripe_refund_id}</a>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '5px 10px 5px 0', fontFamily: 'monospace', fontSize: 11 }}>
                      {sessionUrl ? (
                        <a href={sessionUrl} target="_blank" rel="noopener noreferrer">{r.stripe_session_id}</a>
                      ) : '—'}
                    </td>
                    <td style={{
                      padding: '5px 10px 5px 0', fontSize: 11,
                      color: failed ? '#fca5a5' : 'var(--text-muted)',
                      maxWidth: 320, wordBreak: 'break-word',
                    }}>
                      {r.error_message || (failed ? '(no message)' : '—')}
                      {rowErrors[r.id] && (
                        <div style={{ marginTop: 4, color: '#fca5a5', fontWeight: 600 }}>
                          ⚠ {rowErrors[r.id]}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '5px 10px 5px 0', whiteSpace: 'nowrap' }}>
                      {failed ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleRetry(r)}
                          disabled={!!retrying[r.id] || !r.stripe_payment_intent}
                          title={!r.stripe_payment_intent
                            ? 'No payment_intent on record — refund manually in Stripe'
                            : 'Re-run stripe.refunds.create against the stored payment_intent'}
                          style={{ fontSize: 11, padding: '4px 10px' }}
                        >
                          {retrying[r.id] ? '⏳ Retrying…' : '↻ Retry refund'}
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Task 114 — surfaces every Discord ID currently bound to >1 account in a
// table where the operator picks the canonical owner and clears the rest in
// one click. Once the listing is empty it lets them turn on the partial
// unique index without redeploying.
function DiscordIdCollisions({ superuserKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState({});
  const [enforcing, setEnforcing] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getDiscordIdCollisions(superuserKey)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  function handleResolve(discordId, keepAccountId, keeperLabel, otherCount) {
    if (!window.confirm(
      `Keep "${keeperLabel}" (account ${keepAccountId}) as the owner of Discord ID ${discordId}?\n\n` +
      `This will clear the Discord link from ${otherCount} other account${otherCount === 1 ? '' : 's'}. ` +
      `Those players can re-link from their settings if needed.`
    )) return;
    const key = `${discordId}|${keepAccountId}`;
    setResolving(prev => ({ ...prev, [key]: true }));
    setStatusMsg('');
    resolveDiscordIdCollision(discordId, keepAccountId, superuserKey)
      .then(r => {
        setStatusMsg(`✓ Cleared ${r.cleared.length} loser account${r.cleared.length === 1 ? '' : 's'} for Discord ID ${discordId}.`);
        load();
      })
      .catch(e => setError(e.message))
      .finally(() => setResolving(prev => ({ ...prev, [key]: false })));
  }

  function handleEnforce() {
    setEnforcing(true);
    setStatusMsg('');
    enforceDiscordIdUniqueIndex(superuserKey)
      .then(r => {
        if (r.index?.error) setError(r.index.error);
        else if (r.index?.created) setStatusMsg('✓ Unique index created — duplicate Discord IDs are now blocked at the DB layer.');
        else if (r.index?.exists) setStatusMsg('✓ Unique index already enforced.');
        load();
      })
      .catch(e => setError(e.message))
      .finally(() => setEnforcing(false));
  }

  const collisions = data?.collisions || [];
  const indexExists = data?.index?.exists;
  const indexError = data?.index?.error;
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-discord-collisions" className="section-title" style={{ marginBottom: 6 }}>
        🔗 Discord ID Collisions
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        Lists every Discord ID currently bound to more than one player account. Pick the canonical
        owner and the rest will be cleared (<code>discord_id = ''</code>) in both the <code>nicknames</code>
        and legacy <code>players</code> tables. Once the list is empty the partial unique index can be
        enforced so future duplicates are blocked at the DB layer.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? '⏳ Loading…' : data === null ? 'Load' : 'Refresh'}
        </button>
        {data !== null && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {collisions.length === 0 ? 'No collisions found.' : `${collisions.length} colliding Discord ID${collisions.length === 1 ? '' : 's'}`}
          </span>
        )}
        {data !== null && (
          <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)',
                        background: indexExists ? 'rgba(74,222,128,0.12)' : 'rgba(245,158,11,0.12)',
                        color: indexExists ? '#4ade80' : '#f59e0b' }}>
            {indexExists ? '✓ Unique index enforced' : '⚠ Unique index NOT enforced'}
          </span>
        )}
        {data !== null && !indexExists && collisions.length === 0 && (
          <button className="btn btn-primary" onClick={handleEnforce} disabled={enforcing} style={{ fontSize: '0.82rem' }}>
            {enforcing ? 'Enforcing…' : '🔒 Enforce Unique Index Now'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#450a0a', border: '1px solid #f87171',
                      color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {statusMsg && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#052e16', border: '1px solid #4ade80',
                      color: '#86efac', fontSize: 13, marginBottom: 12 }}>
          {statusMsg}
        </div>
      )}
      {indexError && !indexExists && data !== null && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(245,158,11,0.08)',
                      border: '1px solid #f59e0b', color: '#fbbf24', fontSize: 12, marginBottom: 12 }}>
          Index status: {indexError}
        </div>
      )}

      {data !== null && collisions.length === 0 && indexExists && (
        <p style={{ color: '#4ade80', fontSize: 13 }}>
          ✓ Nothing to reconcile. Every Discord ID maps to a single account and the unique index is in place.
        </p>
      )}

      {collisions.map(group => (
        <div key={group.discord_id} style={{
          border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
          marginBottom: 14, background: 'var(--bg-elevated)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Discord ID</span>
            <code style={{ fontSize: 13, fontWeight: 600 }}>{group.discord_id}</code>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              · {group.candidates.length} accounts
            </span>
          </div>
          <div className="scoreboard-wrapper">
            <table className="scoreboard" style={{ fontSize: 12, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Nickname</th>
                  <th style={{ textAlign: 'left' }}>Account ID</th>
                  <th>Source</th>
                  <th>Last Match</th>
                  <th>MMR</th>
                  <th>Games</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {group.candidates.map(c => {
                  const key = `${group.discord_id}|${c.account_id}`;
                  const label = c.nickname || `#${c.account_id}`;
                  return (
                    <tr key={c.account_id}>
                      <td style={{ fontWeight: 600 }}>
                        <a href={`/player/${c.account_id}`} target="_blank" rel="noopener noreferrer"
                           style={{ color: 'var(--accent)' }}>{label}</a>
                      </td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{c.account_id}</td>
                      <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                        {c.in_nicknames ? 'nicknames' : 'players (legacy)'}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        {c.last_match_id
                          ? <a href={`/match/${c.last_match_id}`} target="_blank" rel="noopener noreferrer"
                               style={{ color: 'var(--accent)' }}>{fmtDate(c.last_match_at)}</a>
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>{c.mmr ?? '—'}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{c.games_played}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-sm"
                          disabled={!!resolving[key]}
                          onClick={() => handleResolve(group.discord_id, c.account_id, label, group.candidates.length - 1)}
                          style={{ fontSize: 11, padding: '2px 8px', color: '#4ade80', borderColor: '#4ade80' }}
                        >
                          {resolving[key] ? 'Working…' : '✓ Keep this one'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

// Task #138 — surfaces the queue of users whose `bot.addUserToLeagueGuild`
// call failed mid-OAuth (Task #128). Each row shows the player nickname,
// the failure code/error, attempt count, and timing so admins can tell at
// a glance whether a recent perms fix has actually drained the queue. The
// per-row Clear button calls /api/admin/discord-autojoin-failures/clear so
// rows that the player has already self-resolved by re-linking can be
// pruned without waiting for the next successful auto-join.
function DiscordAutoJoinFailures({ superuserKey }) {
  const [failures, setFailures] = useState(null);
  const [pruneInfo, setPruneInfo] = useState({ thresholdDays: null, lastRunTs: null, lastRemoved: null });
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState({});
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const load = useCallback(() => {
    if (!superuserKey) return;
    setLoading(true);
    setError('');
    getDiscordAutoJoinFailures(superuserKey)
      .then(d => {
        setFailures(d.failures || []);
        setPruneInfo({
          thresholdDays: d.prune_threshold_days ?? null,
          lastRunTs: d.prune_last_run_ts ?? null,
          lastRemoved: d.prune_last_removed ?? null,
        });
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  useEffect(() => { load(); }, [load]);

  function handleClear(row) {
    const label = row.nickname || `account ${row.account_id}`;
    if (!window.confirm(
      `Clear the pending Discord auto-join failure for ${label}?\n\n` +
      `Use this only if you've confirmed the player is now actually in the Discord server, ` +
      `or if they've re-linked. The banner will stop showing for them on their next page load.`
    )) return;
    const key = `${row.discord_id}|${row.account_id}`;
    setClearing(prev => ({ ...prev, [key]: true }));
    setStatusMsg('');
    clearDiscordAutoJoinFailure({ discord_id: row.discord_id, account_id: row.account_id }, superuserKey)
      .then(r => {
        setStatusMsg(r.cleared ? `✓ Cleared pending failure for ${label}.` : `Row was already gone for ${label}.`);
        load();
      })
      .catch(e => setError(e.message))
      .finally(() => setClearing(prev => ({ ...prev, [key]: false })));
  }

  function fmtTs(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
  }

  const rows = failures || [];

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-discord-autojoin-failures" className="section-title" style={{ marginBottom: 6 }}>
        ⏳ Discord Auto-Join Retry Queue
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        Players whose <code>addUserToLeagueGuild</code> call failed during OAuth (Task #128). They see a
        site-wide banner prompting them to re-click <em>Reconnect with Discord</em>; the row is cleared
        automatically on the next successful auto-join. Use this list to confirm whether a recent perms
        fix has actually drained the queue.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? '⏳ Loading…' : 'Refresh'}
        </button>
        {failures !== null && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {rows.length === 0 ? 'No pending failures.' : `${rows.length} player${rows.length === 1 ? '' : 's'} stuck`}
          </span>
        )}
      </div>

      {pruneInfo.thresholdDays !== null && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12 }}>
          🧹 Auto-prune: rows with no fresh failure for{' '}
          <strong>{pruneInfo.thresholdDays} day{pruneInfo.thresholdDays === 1 ? '' : 's'}</strong>{' '}
          are dropped automatically (hourly, off the bot's auto-join write path).{' '}
          {pruneInfo.lastRunTs ? (
            <>
              Last run <strong>{fmtTs(pruneInfo.lastRunTs)}</strong>
              {typeof pruneInfo.lastRemoved === 'number'
                ? ` — removed ${pruneInfo.lastRemoved} row${pruneInfo.lastRemoved === 1 ? '' : 's'}.`
                : '.'}
            </>
          ) : (
            <>Has not run yet on this database.</>
          )}
        </p>
      )}

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#450a0a', border: '1px solid #f87171',
                      color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {statusMsg && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#052e16', border: '1px solid #4ade80',
                      color: '#86efac', fontSize: 13, marginBottom: 12 }}>
          {statusMsg}
        </div>
      )}

      {failures !== null && rows.length === 0 && !error && (
        <p style={{ color: '#4ade80', fontSize: 13 }}>
          ✓ No players are currently stuck waiting to retry their Discord auto-join.
        </p>
      )}

      {rows.length > 0 && (
        <div className="scoreboard-wrapper">
          <table className="scoreboard" style={{ fontSize: 12, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Nickname</th>
                <th style={{ textAlign: 'left' }}>Account ID</th>
                <th style={{ textAlign: 'left' }}>Discord ID</th>
                <th style={{ textAlign: 'left' }}>Last Code</th>
                <th>Attempts</th>
                <th>First Failed</th>
                <th>Last Failed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const key = `${row.discord_id}|${row.account_id}`;
                return (
                  <tr key={key}>
                    {/* Task #148 — match the Task #144 history-table treatment:
                        linked nickname when we have one, otherwise the raw ID
                        (unlinked) so we never imply a profile exists for a
                        player who hasn't actually been recognised yet. */}
                    <td style={{ fontWeight: 600 }}>
                      {row.nickname && row.account_id ? (
                        <a href={`/player/${row.account_id}`} target="_blank" rel="noopener noreferrer"
                           style={{ color: 'var(--accent)' }}>{row.nickname}</a>
                      ) : (
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          {row.account_id || row.discord_id || '—'}
                        </span>
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{row.account_id || '—'}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{row.discord_id || '—'}</td>
                    <td>
                      <code style={{ fontSize: 11 }}>{row.last_code || 'unknown'}</code>
                      {row.last_error && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2,
                                      maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                             title={row.last_error}>
                          {row.last_error}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600,
                                 color: row.attempts > 1 ? '#f59e0b' : 'var(--text-muted)' }}>
                      {row.attempts}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                      {fmtTs(row.first_failed_at)}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                      {fmtTs(row.last_failed_at)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-sm"
                        disabled={!!clearing[key]}
                        onClick={() => handleClear(row)}
                        style={{ fontSize: 11, padding: '2px 8px', color: '#f87171', borderColor: '#f87171' }}
                      >
                        {clearing[key] ? 'Working…' : '✕ Clear'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DbBackupManager({ superuserKey }) {
  const [backups, setBackups] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [restoring, setRestoring] = useState('');
  const [deleting, setDeleting] = useState('');
  const [fixNickLoading, setFixNickLoading] = useState(false);
  const [fixNickResult, setFixNickResult] = useState(null);
  const authHeader = { 'x-superuser-key': superuserKey };

  function loadBackups() {
    superuserFetch('/api/admin/list-backups', { headers: authHeader })
      .then(r => r.json())
      .then(d => setBackups(d.backups || []))
      .catch(() => setBackups([]));
  }

  function handleBackup() {
    setBackupLoading(true);
    setBackupMsg('');
    superuserFetch('/api/admin/backup-db', { method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'manual' }) })
      .then(r => r.json())
      .then(d => {
        setBackupMsg(d.message || d.error || 'Done.');
        loadBackups();
      })
      .catch(e => setBackupMsg('Failed: ' + e.message))
      .finally(() => setBackupLoading(false));
  }

  function handleRestore(backup) {
    if (!window.confirm(`Restore from backup: ${backup}?\n\nThis will OVERWRITE the current player_stats, ratings, and rating_history tables with data from this snapshot. The current state cannot be recovered unless you have another backup.`)) return;
    setRestoring(backup);
    superuserFetch('/api/admin/restore-backup', { method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ backup }) })
      .then(r => r.json())
      .then(d => { alert(d.message || d.error); loadBackups(); })
      .catch(e => alert('Restore failed: ' + e.message))
      .finally(() => setRestoring(''));
  }

  function handleDelete(backup) {
    if (!window.confirm(`Permanently delete backup: ${backup}?\n\nThis cannot be undone.`)) return;
    setDeleting(backup);
    superuserFetch(`/api/admin/delete-backup/${backup}`, { method: 'DELETE', headers: authHeader })
      .then(r => r.json())
      .then(d => { loadBackups(); })
      .catch(e => alert('Delete failed: ' + e.message))
      .finally(() => setDeleting(''));
  }

  function handleFixNicknames(backup) {
    if (!window.confirm(
      `Fix nickname account IDs using backup: ${backup}?\n\n` +
      `This compares the backup (old wrong IDs) against current player_stats (correct IDs) ` +
      `to build a precise mapping, then updates every row in the nicknames table.\n\n` +
      `Any existing rank data on nicknames will be cleared so rank sync re-fetches with the correct IDs.`
    )) return;
    setFixNickLoading(true);
    setFixNickResult(null);
    superuserFetch('/api/admin/fix-nickname-account-ids', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup })
    })
      .then(r => r.json())
      .then(d => setFixNickResult(d))
      .catch(e => setFixNickResult({ error: e.message }))
      .finally(() => setFixNickLoading(false));
  }

  const fmtBackupDate = slug => {
    const m = slug.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!m) return slug;
    return `${m[4]}:${m[5]} ${m[3]}/${m[2]}/${m[1]}`;
  };
  const fmtBackupLabel = slug => slug.replace(/_\d{14}$/, '').replace(/_/g, ' ');

  return (
    <section style={{ marginBottom: 36, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 id="ap-anchor-db-backups" style={{ margin: 0, fontSize: '1rem' }}>Database Backups</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Snapshots of player_stats, ratings &amp; rating_history</span>
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px' }} onClick={loadBackups} disabled={backups !== null && backupLoading}>
          {backups === null ? 'Load' : 'Refresh'}
        </button>
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px', color: '#4ade80', borderColor: '#4ade80' }}
          onClick={handleBackup} disabled={backupLoading}>
          {backupLoading ? 'Backing up…' : '💾 Backup Now'}
        </button>
        {backupMsg && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{backupMsg}</span>}
      </div>
      {backups === null && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Click "Load" to see existing backups.</p>}
      {backups !== null && backups.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No backups found. Backups are created automatically before "Re-parse All" runs.</p>}
      {backups !== null && backups.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Label</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Created (UTC)</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Backup ID</th>
                <th style={{ padding: '4px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '5px 8px' }}>{fmtBackupLabel(b)}</td>
                  <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{fmtBackupDate(b)}</td>
                  <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b}</td>
                  <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button className="btn" style={{ fontSize: '0.72rem', padding: '2px 7px', color: '#fb923c', borderColor: '#fb923c' }}
                        onClick={() => handleFixNicknames(b)} disabled={fixNickLoading}>
                        {fixNickLoading ? 'Fixing…' : '🔧 Fix Nickname IDs'}
                      </button>
                      <button className="btn" style={{ fontSize: '0.72rem', padding: '2px 7px', color: '#facc15', borderColor: '#facc15' }}
                        onClick={() => handleRestore(b)} disabled={restoring === b}>
                        {restoring === b ? 'Restoring…' : '↩ Restore'}
                      </button>
                      <button className="btn" style={{ fontSize: '0.72rem', padding: '2px 7px', color: '#f87171', borderColor: '#f87171' }}
                        onClick={() => handleDelete(b)} disabled={deleting === b}>
                        {deleting === b ? 'Deleting…' : '🗑 Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {fixNickResult && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: fixNickResult.error ? '#450a0a' : '#052e16', border: `1px solid ${fixNickResult.error ? '#f87171' : '#4ade80'}`, fontSize: '0.82rem' }}>
              {fixNickResult.error ? (
                <span style={{ color: '#f87171' }}>Error: {fixNickResult.error}</span>
              ) : (
                <div>
                  <div style={{ color: '#4ade80' }}>✓ {fixNickResult.message}</div>
                  {fixNickResult.updated > 0 && (
                    <div style={{ color: '#86efac', marginTop: 4 }}>
                      <strong>Now go to Dota 2 Rank Management and run Rank Sync.</strong>
                    </div>
                  )}
                  {fixNickResult.skipped_conflicts > 0 && fixNickResult.skipped_details?.length > 0 && (
                    <div style={{ marginTop: 6, color: '#facc15' }}>
                      ⚠ Genuinely ambiguous IDs (equal matches for two different players) — set these manually:
                      {fixNickResult.skipped_details.map((s, i) => (
                        <div key={i} style={{ fontFamily: 'monospace', fontSize: '0.75rem', marginTop: 2 }}>
                          old {s.old_id} → candidates: {s.candidates.map(c => `${c.new_id} (${c.occurrences} matches)`).join(' vs ')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ReplayManager({ superuserKey }) {
  const [replays, setReplays] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extending, setExtending] = useState({});
  const [reparsing, setReparsing] = useState({});
  const [reparseMsg, setReparseMsg] = useState({});
  const [reparseAllStatus, setReparseAllStatus] = useState(null);
  const [reparseAllLoading, setReparseAllLoading] = useState(false);
  const [setPermanentLoading, setSetPermanentLoading] = useState(false);
  const [setPermanentMsg, setSetPermanentMsg] = useState('');
  // Task #411 — backfill team-fight detection for matches that have a stored
  // game_timeline but no match_fights rows yet (i.e. matches parsed before
  // the v3 viewer landed). Mirrors the reparse-all polling shape.
  const [fightsBackfillLoading, setFightsBackfillLoading] = useState(false);
  const [fightsBackfillStatus, setFightsBackfillStatus] = useState(null);
  const authHeader = { 'x-superuser-key': superuserKey };

  function load() {
    setLoading(true);
    getStoredReplays(superuserKey)
      .then(d => { setReplays(d.replays || []); setLoading(false); })
      .catch(() => { setReplays([]); setLoading(false); });
  }

  function handleExtend(matchId, days) {
    setExtending(prev => ({ ...prev, [matchId]: true }));
    extendReplayExpiry(matchId, days, superuserKey)
      .then(() => load())
      .catch(e => alert('Error: ' + e.message))
      .finally(() => setExtending(prev => ({ ...prev, [matchId]: false })));
  }

  function handleDownload(matchId) {
    const url = `/api/replays/${matchId}/download`;
    superuserFetch(url, { headers: authHeader })
      .then(r => {
        if (!r.ok) return r.json().then(j => { throw new Error(j.error || 'Not available'); });
        return r.blob();
      })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${matchId}.dem`;
        a.click();
      })
      .catch(err => alert('Download failed: ' + err.message));
  }

  function handleReparse(matchId) {
    if (!window.confirm(`Re-parse stored replay for match ${matchId}?\n\nThis will update all stats and recalculate MMR for all matches. Season assignment is preserved.`)) return;
    setReparsing(prev => ({ ...prev, [matchId]: true }));
    setReparseMsg(prev => ({ ...prev, [matchId]: '' }));
    superuserFetch(`/api/admin/reparse-replay/${matchId}`, { method: 'POST', headers: authHeader })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setReparseMsg(prev => ({ ...prev, [matchId]: '✓ Reparsed + MMR updated' }));
        } else {
          setReparseMsg(prev => ({ ...prev, [matchId]: `Error: ${d.error}` }));
        }
      })
      .catch(e => setReparseMsg(prev => ({ ...prev, [matchId]: `Failed: ${e.message}` })))
      .finally(() => setReparsing(prev => ({ ...prev, [matchId]: false })));
  }

  function handleReparseAll() {
    if (!window.confirm(`Re-parse ALL stored replays?\n\nA snapshot of the current database will be created automatically before starting, so you can roll back if needed.\n\nThis runs in the background and may take a long time. Stats for every replay on file will be updated and MMR recalculated for all players in chronological order. Season assignments are preserved.`)) return;
    setReparseAllLoading(true);
    superuserFetch('/api/admin/reparse-all-replays', { method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(r => r.json())
      .then(d => {
        setReparseAllStatus(d);
        if (d.running || d.success) {
          const poll = setInterval(() => {
            superuserFetch('/api/admin/reparse-all-status', { headers: authHeader })
              .then(r => r.json())
              .then(s => {
                setReparseAllStatus(s);
                if (s.status?.phase === 'complete' || !s.running) clearInterval(poll);
              })
              .catch(() => clearInterval(poll));
          }, 3000);
        }
      })
      .catch(e => setReparseAllStatus({ error: e.message }))
      .finally(() => setReparseAllLoading(false));
  }

  async function handleBackfillFights() {
    if (!window.confirm('Re-detect team fights for every match with a stored timeline but no fights yet?\n\nReplays in JSON, no .dem files needed — runs in the background.')) return;
    setFightsBackfillLoading(true);
    setFightsBackfillStatus(null);
    try {
      const { backfillReplayFights, getReplayFightsBackfillStatus } = await import('../api');
      const d = await backfillReplayFights(superuserKey, { limit: 2000 });
      setFightsBackfillStatus(d);
      if (d.queued > 0 || d.running) {
        const poll = setInterval(async () => {
          try {
            const s = await getReplayFightsBackfillStatus(superuserKey);
            setFightsBackfillStatus(s);
            if (!s.running && s.status?.phase === 'complete') clearInterval(poll);
          } catch { clearInterval(poll); }
        }, 3000);
      }
    } catch (e) {
      setFightsBackfillStatus({ error: e.message });
    } finally {
      setFightsBackfillLoading(false);
    }
  }

  function handleSetAllPermanent() {
    if (!window.confirm('Set ALL stored replays to never expire?')) return;
    setSetPermanentLoading(true);
    setSetPermanentMsg('');
    superuserFetch('/api/admin/replays/set-all-permanent', { method: 'POST', headers: authHeader })
      .then(r => r.json())
      .then(d => {
        setSetPermanentMsg(d.message || d.error || 'Done.');
        if (replays) load();
      })
      .catch(e => setSetPermanentMsg('Failed: ' + e.message))
      .finally(() => setSetPermanentLoading(false));
  }

  const fmtSize = bytes => {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const isExpired = d => d && new Date(d) < new Date();

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 id="ap-anchor-stored-replays" style={{ margin: 0 }}>Stored Replays</h2>
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px' }} onClick={load} disabled={loading}>
          {loading ? 'Loading…' : replays === null ? 'Load' : 'Refresh'}
        </button>
        {replays !== null && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {replays.filter(r => r.available).length} / {replays.length} available
          </span>
        )}
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px', color: '#4ade80', borderColor: '#4ade80' }}
          onClick={handleSetAllPermanent} disabled={setPermanentLoading}>
          {setPermanentLoading ? 'Setting…' : '♾️ Set All Permanent'}
        </button>
        {setPermanentMsg && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{setPermanentMsg}</span>}
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px', color: '#a78bfa', borderColor: '#a78bfa' }}
          onClick={handleReparseAll} disabled={reparseAllLoading}>
          🔄 Re-parse All
        </button>
        {/* Task #411 — fights backfill for the replay viewer v3 overlay. */}
        <button
          type="button"
          className="btn"
          style={{ fontSize: '0.8rem', padding: '3px 10px', color: '#f59e0b', borderColor: '#f59e0b' }}
          onClick={handleBackfillFights}
          disabled={fightsBackfillLoading}
          aria-label="Backfill auto-detected team fights for stored replays"
        >
          {fightsBackfillLoading ? '⏳ Queuing…' : '⚔️ Backfill fights'}
        </button>
      </div>
      {fightsBackfillStatus && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.82rem' }}>
          {fightsBackfillStatus.error ? (
            <span style={{ color: '#f87171' }}>Error: {fightsBackfillStatus.error}</span>
          ) : fightsBackfillStatus.status ? (
            <span>
              Fights backfill: {fightsBackfillStatus.status.phase === 'complete' ? '✓ Complete' : '⏳ Running'} —&nbsp;
              {fightsBackfillStatus.status.done}/{fightsBackfillStatus.status.total} done,&nbsp;
              {fightsBackfillStatus.status.failed} failed,&nbsp;
              {fightsBackfillStatus.status.detected} fights detected,&nbsp;
              {fightsBackfillStatus.status.remaining} remaining
              {fightsBackfillStatus.status.errors?.length > 0 && (
                <div style={{ color: '#f87171', marginTop: 4 }}>
                  {fightsBackfillStatus.status.errors.slice(0, 5).map((e, i) => (
                    <div key={i}>{e.matchId}: {e.error}</div>
                  ))}
                </div>
              )}
            </span>
          ) : (
            <span>{fightsBackfillStatus.message}</span>
          )}
        </div>
      )}
      {reparseAllStatus && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.82rem' }}>
          {reparseAllStatus.error ? (
            <span style={{ color: '#f87171' }}>Error: {reparseAllStatus.error}</span>
          ) : reparseAllStatus.status ? (
            <span>
              Re-parse: {reparseAllStatus.status.phase === 'complete' ? '✓ Complete — MMR recalculated' : '⏳ Running'} —&nbsp;
              {reparseAllStatus.status.done}/{reparseAllStatus.status.total} done,&nbsp;
              {reparseAllStatus.status.failed} failed,&nbsp;
              {reparseAllStatus.status.remaining} remaining
              {reparseAllStatus.status.backup && (
                <div style={{ color: '#4ade80', marginTop: 4 }}>
                  💾 Backup taken before start: <code style={{ fontSize: '0.75rem' }}>{reparseAllStatus.status.backup}</code>
                  &nbsp;— use the Database Backups panel above to restore if needed.
                </div>
              )}
              {reparseAllStatus.status.errors?.length > 0 && (
                <div style={{ color: '#f87171', marginTop: 4 }}>
                  {reparseAllStatus.status.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </span>
          ) : (
            <div>
              <span>{reparseAllStatus.message}</span>
              {reparseAllStatus.backup && (
                <div style={{ color: '#4ade80', marginTop: 4, fontSize: '0.8rem' }}>
                  💾 Backup: <code style={{ fontSize: '0.75rem' }}>{reparseAllStatus.backup}</code>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {replays !== null && replays.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No replay files stored yet. Upload replays and they will be archived automatically.</p>
      )}
      {replays !== null && replays.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Match ID</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Date</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Size</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Expires</th>
                <th style={{ textAlign: 'center', padding: '6px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {replays.map(r => (
                <tr key={r.matchId} style={{ borderBottom: '1px solid var(--border)', opacity: r.available ? 1 : 0.5 }}>
                  <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>
                    <Link to={`/match/${r.matchId}`}>{r.matchId}</Link>
                  </td>
                  <td style={{ padding: '5px 8px' }}>{fmtDate(r.date)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtSize(r.fileSize)}</td>
                  <td style={{ padding: '5px 8px' }}>
                    {r.expiresAt
                      ? <span style={{ color: isExpired(r.expiresAt) ? '#f87171' : '#facc15' }}>{fmtDate(r.expiresAt)}{isExpired(r.expiresAt) ? ' (expired)' : ''}</span>
                      : <span style={{ color: '#4ade80' }}>Never</span>}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {r.available && (
                        <button className="btn" style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                          onClick={() => handleDownload(r.matchId)}>
                          ⬇ Download
                        </button>
                      )}
                      {r.available && (
                        <button className="btn" style={{ fontSize: '0.75rem', padding: '2px 8px', color: '#a78bfa', borderColor: '#a78bfa' }}
                          disabled={reparsing[r.matchId]}
                          onClick={() => handleReparse(r.matchId)}
                          title="Re-parse this replay and update all stats + MMR">
                          {reparsing[r.matchId] ? '⏳' : '🔄'} Re-parse
                        </button>
                      )}
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                        disabled={extending[r.matchId]}
                        onClick={() => handleExtend(r.matchId, 7)}>
                        +7 days
                      </button>
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '2px 8px', color: '#4ade80', borderColor: '#4ade80' }}
                        disabled={extending[r.matchId]}
                        onClick={() => handleExtend(r.matchId, 0)}>
                        ♾️ Forever
                      </button>
                    </div>
                    {reparseMsg[r.matchId] && (
                      <div style={{ fontSize: '0.75rem', color: reparseMsg[r.matchId].startsWith('✓') ? '#4ade80' : '#f87171', marginTop: 4 }}>
                        {reparseMsg[r.matchId]}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        Replays are kept permanently by default. Set <code>REPLAY_STORE_DAYS=N</code> to auto-expire after N days.
        Use <code>REPLAY_STORE_DIR</code> to set a custom storage path.
      </p>
    </section>
  );
}

function ReplayArchiveManager({ superuserKey }) {
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pathInputs, setPathInputs] = useState({});
  const [saving, setSaving] = useState({});
  const [saveMsg, setSaveMsg] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMatchReplayStatus(superuserKey);
      setMatches(data.matches || []);
    } catch (err) {
      setMatches([]);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [superuserKey]);

  const handleSavePath = useCallback(async (matchId) => {
    const p = (pathInputs[matchId] || '').trim();
    setSaving(s => ({ ...s, [matchId]: true }));
    setSaveMsg(s => ({ ...s, [matchId]: '' }));
    try {
      const result = await setMatchReplayPath(matchId, p, superuserKey);
      const storedPath = result?.replay_path || null;
      setSaveMsg(s => ({ ...s, [matchId]: storedPath ? `✓ Saved: ${storedPath}` : '✓ Cleared' }));
      setMatches(ms => ms.map(m => m.match_id === matchId ? { ...m, replay_path: storedPath } : m));
    } catch (err) {
      setSaveMsg(s => ({ ...s, [matchId]: '✗ ' + err.message }));
    } finally {
      setSaving(s => ({ ...s, [matchId]: false }));
    }
  }, [pathInputs, superuserKey]);

  return (
    <section className="admin-section">
      <h2 id="ap-anchor-replay-archive">Replay Archive (Dedicated Server)</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
        Matches archived from the dedicated server via SSH. Pro members and admins can download these. Use the path field to manually link a .dem file.
      </p>
      <button className="btn" onClick={load} disabled={loading}>
        {loading ? 'Loading…' : matches === null ? 'Load Replay Archive Status' : 'Refresh'}
      </button>
      {matches !== null && matches.length === 0 && (
        <p style={{ fontSize: 13, marginTop: 10, color: 'var(--text-muted)' }}>No matches found.</p>
      )}
      {matches !== null && matches.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="admin-table" style={{ fontSize: 12, width: '100%' }}>
            <thead>
              <tr>
                <th>Match ID</th>
                <th>Date</th>
                <th>Archive Status</th>
                <th>Remote Path</th>
                <th>Set Path Manually</th>
              </tr>
            </thead>
            <tbody>
              {matches.map(m => (
                <tr key={m.match_id}>
                  <td>
                    <a href={`/match/${m.match_id}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                      {m.match_id}
                    </a>
                  </td>
                  <td>{m.date ? new Date(m.date).toLocaleDateString() : '—'}</td>
                  <td>
                    {m.replay_path
                      ? <span style={{ color: '#4ade80', fontWeight: 600 }}>✓ Archived</span>
                      : <span style={{ color: '#f87171' }}>✗ Not archived</span>}
                  </td>
                  <td style={{ maxWidth: 260, wordBreak: 'break-all', fontSize: 11, color: 'var(--text-muted)' }}>
                    {m.replay_path || '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="match_123.dem or full path (empty to clear)"
                        value={pathInputs[m.match_id] || ''}
                        onChange={e => setPathInputs(p => ({ ...p, [m.match_id]: e.target.value }))}
                        style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, minWidth: 220,
                          background: 'var(--bg-input, #0f172a)', border: '1px solid var(--border, #334155)',
                          color: 'var(--text-primary, #f1f5f9)' }}
                      />
                      <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }}
                        disabled={saving[m.match_id]}
                        onClick={() => handleSavePath(m.match_id)}>
                        {saving[m.match_id] ? '…' : 'Save'}
                      </button>
                      {saveMsg[m.match_id] && (
                        <span style={{ fontSize: 11, color: saveMsg[m.match_id].startsWith('✓') ? '#4ade80' : '#f87171' }}>
                          {saveMsg[m.match_id]}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        Archive directory is controlled by <code>REPLAY_ARCHIVE_DIR</code> on the dedicated server.
      </p>
    </section>
  );
}

// ── Task #699 — Notification test harness ────────────────────────────────────
// Covers all ~18 event types. Routes through notify() so Discord DMs and
// web-push formatting are genuinely exercised. All sample content is clearly
// labelled [TEST].
function NotificationTestPanel({ superuserKey }) {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(false);

  useEffect(() => {
    setLoadingTypes(true);
    adminGetNotifyTestTypes(superuserKey)
      .then(data => {
        if (Array.isArray(data)) {
          setTypes(data);
          if (data.length) setSelectedType(data[0].key);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTypes(false));
  }, [superuserKey]);

  const send = async () => {
    if (!selectedType) return;
    setLoading(true);
    setStatus(null);
    try {
      const data = await adminSendNotifyTest(
        superuserKey,
        selectedType,
        targetAccountId.trim() || undefined
      );
      if (data.ok) {
        const ch = data.channels;
        const summary = ch
          ? Object.entries(ch).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' | ')
          : 'sent';
        setStatus({ ok: true, message: `✅ Test notification sent for "${data.label}". Channels: ${summary}` });
      } else {
        setStatus({ ok: false, message: `❌ ${data.error || 'Unknown error'}` });
      }
    } catch (e) {
      setStatus({ ok: false, message: `❌ Request failed: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    padding: '8px 12px', borderRadius: 6, fontSize: 14, width: 320,
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  };

  return (
    <section className="admin-section" id="ap-anchor-notify-test" style={{ marginTop: 32 }}>
      <h2 className="section-title" style={{ marginBottom: 6 }}>🔔 Notification Test Harness</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        Sends a real test notification through the existing Discord-DM and web-push channels so
        the full formatting pipeline is exercised. All messages are clearly labelled <strong>[TEST]</strong>.
        The target account&apos;s notification preferences are respected — if Discord DMs or web push
        are disabled for that event type, those channels will be skipped.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <label htmlFor="notify-test-type" style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            Notification type
          </label>
          <select
            id="notify-test-type"
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            disabled={loadingTypes}
            style={{ ...inputStyle, width: 340, cursor: loadingTypes ? 'not-allowed' : 'pointer' }}
            aria-label="Notification type to test"
          >
            {loadingTypes && <option value="">Loading types…</option>}
            {types.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="notify-test-account" style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            Target account ID <span style={{ fontStyle: 'italic' }}>(blank = your own account)</span>
          </label>
          <input
            id="notify-test-account"
            type="text"
            placeholder="Steam64 account ID"
            value={targetAccountId}
            onChange={e => setTargetAccountId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            style={inputStyle}
            aria-label="Target account ID for test notification"
          />
        </div>
        <button
          type="button"
          onClick={send}
          disabled={loading || !selectedType}
          style={{
            padding: '8px 18px', borderRadius: 6, fontWeight: 600, fontSize: 14,
            background: loading ? 'var(--bg-secondary)' : '#6366f1',
            color: '#fff', border: 'none', cursor: loading || !selectedType ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-end',
          }}
        >
          {loading ? '⏳ Sending…' : '🔔 Send test'}
        </button>
      </div>
      {status && (
        <div style={{
          marginTop: 4, padding: '8px 14px', borderRadius: 6, fontSize: 13,
          background: status.ok ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${status.ok ? '#4ade80' : '#f87171'}`,
          color: status.ok ? '#4ade80' : '#f87171',
          wordBreak: 'break-word',
        }}>
          {status.message}
        </div>
      )}
    </section>
  );
}

// ── Task #699 — Background-job run-now center ────────────────────────────────
// Each row calls its underlying cron function once. Destructive jobs (account
// deletion, payout sweep, season rollover) show a browser confirm dialog
// before firing, following the existing pattern in this panel.
const JOB_DEFINITIONS = [
  {
    id: 'puzzle-pregen',
    label: '🧩 Puzzle Pre-generation',
    description: 'Generates tomorrow\'s daily mini-game puzzles ahead of schedule.',
    destructive: false,
  },
  {
    id: 'api-quota-sweep',
    label: '🔑 API Quota Lapse Sweep',
    description: 'Degrades API access for any accounts whose quota period has lapsed.',
    destructive: false,
  },
  {
    id: 'ops-snapshot',
    label: '📸 Ops History Snapshot',
    description: 'Captures a point-in-time ops-history entry for the sparklines.',
    destructive: false,
  },
  {
    id: 'checkin-notify',
    label: '📣 Tournament Check-in Notify',
    description: 'Sends check-in-open notifications for any tournament whose window just opened.',
    destructive: false,
  },
  {
    id: 'checkin-dq',
    label: '🚫 Tournament Check-in DQ Sweep',
    description: 'Removes players who missed the check-in window from their brackets.',
    destructive: false,
  },
  {
    id: 'pro-match-sync',
    label: '⚔️ Pro Match Sync',
    description: 'Fetches the latest professional Dota 2 match data from OpenDota.',
    destructive: false,
  },
  {
    id: 'weekly-report',
    label: '📊 Weekly Report + Badge Expiry',
    description: 'Expires stale verified badges and generates weekly AI reports for all Pro accounts immediately (bypasses the normal Mon 09:00 UTC schedule).',
    destructive: false,
  },
  {
    id: 'stale-upload-reaper',
    label: '🗑️ Stale Upload Reaper',
    description: 'Removes in-memory upload jobs that have been stuck in uploading/assembling state past their TTL and cleans up their temporary chunk files.',
    destructive: false,
  },
  {
    id: 'payout-sweep',
    label: '💸 Tournament Payout Sweep',
    description: 'Settles all pending Stripe payouts for completed tournaments. Triggers real Stripe transfers.',
    destructive: true,
  },
  {
    id: 'account-deletion-sweep',
    label: '🗑️ Account Deletion Sweep',
    description: 'Permanently anonymises accounts flagged for deletion. This is irreversible.',
    destructive: true,
  },
  {
    id: 'season-rollover',
    label: '🏁 Season Auto-Rollover',
    description: 'Triggers the season auto-rollover check. Creates a new season if the current end conditions are met.',
    destructive: true,
  },
];

function JobRunNowPanel({ superuserKey }) {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState({});

  const runJob = async (jobId, destructive) => {
    if (destructive) {
      const jobDef = JOB_DEFINITIONS.find(j => j.id === jobId);
      const confirmed = window.confirm(
        `⚠️ "${jobDef?.label}" is a destructive operation.\n\n${jobDef?.description}\n\nProceed?`
      );
      if (!confirmed) return;
    }
    setRunning(r => ({ ...r, [jobId]: true }));
    setResults(r => ({ ...r, [jobId]: null }));
    try {
      const data = await adminRunJob(superuserKey, jobId, destructive ? { confirmed: true } : {});
      if (data.ok) {
        const resultStr = data.result
          ? Object.entries(data.result).map(([k, v]) => `${k}: ${v}`).join(', ')
          : 'completed';
        setResults(r => ({ ...r, [jobId]: { ok: true, message: `✅ ${resultStr}` } }));
      } else {
        setResults(r => ({ ...r, [jobId]: { ok: false, message: `❌ ${data.error || 'Unknown error'}` } }));
      }
    } catch (e) {
      setResults(r => ({ ...r, [jobId]: { ok: false, message: `❌ ${e.message}` } }));
    } finally {
      setRunning(r => ({ ...r, [jobId]: false }));
    }
  };

  return (
    <section className="admin-section" id="ap-anchor-job-run-now" style={{ marginTop: 32 }}>
      <h2 className="section-title" style={{ marginBottom: 6 }}>⚡ Background Job Triggers</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        Run any background cron job immediately — useful for testing, backfills, or forcing a sweep
        outside its normal schedule. Jobs marked <strong style={{ color: '#f59e0b' }}>⚠ destructive</strong> require
        confirmation because they trigger irreversible or financial side effects.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {JOB_DEFINITIONS.map(job => {
          const res = results[job.id];
          const busy = running[job.id];
          return (
            <div
              key={job.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
                padding: '10px 14px', borderRadius: 8,
                background: 'var(--surface-2, rgba(255,255,255,0.03))',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                  {job.label}
                  {job.destructive && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#f59e0b', fontWeight: 500 }}>
                      ⚠ destructive
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{job.description}</div>
                {res && (
                  <div style={{
                    marginTop: 6, fontSize: 12, fontFamily: 'monospace',
                    color: res.ok ? '#4ade80' : '#f87171',
                    wordBreak: 'break-word',
                  }}>
                    {res.message}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => runJob(job.id, job.destructive)}
                disabled={!!busy}
                aria-label={`Run ${job.label} now`}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontWeight: 600, fontSize: 13,
                  background: busy ? 'var(--bg-secondary)' : job.destructive ? '#dc2626' : '#6366f1',
                  color: '#fff', border: 'none',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  flexShrink: 0, alignSelf: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {busy ? '⏳ Running…' : '▶ Run now'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TestDmPanel({ superuserKey }) {
  const [discordId, setDiscordId] = useState('');
  const [status, setStatus] = useState(null); // null | { ok, message }
  const [loading, setLoading] = useState(false);

  const sendTestDm = async () => {
    const id = discordId.trim();
    if (!id) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await superuserFetch('/api/admin/test-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ discordId: id }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus({ ok: true, message: `✅ Test DM sent to ${data.username} (${data.id})` });
      } else {
        setStatus({ ok: false, message: `❌ ${data.error}` });
      }
    } catch (e) {
      setStatus({ ok: false, message: `❌ Request failed: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 id="ap-anchor-test-dm" style={{ margin: 0 }}>Test Post-Match DM</h2>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Sends a mock MVP + attitude rating DM to verify the post-match DM system is working for a player.
        Replies are handled but not saved to the database.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Discord User ID (e.g. 135991380760592384)"
          value={discordId}
          onChange={e => setDiscordId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendTestDm()}
          style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 14, width: 320,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          onClick={sendTestDm}
          disabled={loading || !discordId.trim()}
          style={{
            padding: '8px 18px', borderRadius: 6, fontWeight: 600, fontSize: 14,
            background: loading ? 'var(--bg-secondary)' : '#6366f1',
            color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Sending…' : '📨 Send Test DM'}
        </button>
      </div>
      {status && (
        <div style={{
          marginTop: 12, padding: '8px 14px', borderRadius: 6, fontSize: 13,
          background: status.ok ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${status.ok ? '#4ade80' : '#f87171'}`,
          color: status.ok ? '#4ade80' : '#f87171',
        }}>
          {status.message}
        </div>
      )}
    </section>
  );
}

function TestRsvpDmPanel({ superuserKey }) {
  const [discordId, setDiscordId] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const id = discordId.trim();
    if (!id) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await superuserFetch('/api/admin/test-rsvp-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ discordId: id }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus({ ok: true, message: `✅ RSVP registration DM sent to ${data.username} (${data.id}). Reply with a Steam ID to test the full flow, or "skip".` });
      } else {
        setStatus({ ok: false, message: `❌ ${data.error}` });
      }
    } catch (e) {
      setStatus({ ok: false, message: `❌ Request failed: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 id="ap-anchor-test-rsvp-dm" style={{ margin: 0 }}>Test RSVP Registration DM</h2>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Sends the unregistered-player RSVP prompt DM. The reply handler is fully live — you can test
        replying with a Steam ID (Steam64, Steam3, Steam2, or profile URL) or type <code>skip</code>.
        Equivalent to <code>!testrsvpdm</code> in Discord.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Discord User ID (e.g. 135991380760592384)"
          value={discordId}
          onChange={e => setDiscordId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 14, width: 320,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !discordId.trim()}
          style={{
            padding: '8px 18px', borderRadius: 6, fontWeight: 600, fontSize: 14,
            background: loading ? 'var(--bg-secondary)' : '#4ade80',
            color: loading ? 'var(--text-muted)' : '#000', border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Sending…' : '🎮 Send RSVP Registration DM'}
        </button>
      </div>
      {status && (
        <div style={{
          marginTop: 12, padding: '8px 14px', borderRadius: 6, fontSize: 13,
          background: status.ok ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${status.ok ? '#4ade80' : '#f87171'}`,
          color: status.ok ? '#4ade80' : '#f87171',
        }}>
          {status.message}
        </div>
      )}
    </section>
  );
}

function ErrorLogViewer({ superuserKey }) {
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState('');
  const [clearMsg, setClearMsg] = useState('');
  const authHeader = { 'x-superuser-key': superuserKey };

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ limit: 100 });
    if (level) params.set('level', level);
    superuserFetch(`/api/admin/error-log?${params}`, { headers: authHeader })
      .then(r => r.json())
      .then(d => { setLogs(d.logs || []); setLoading(false); })
      .catch(() => { setLogs([]); setLoading(false); });
  }

  function handleClear() {
    if (!window.confirm('Clear server logs older than 30 days?')) return;
    superuserFetch('/api/admin/error-log?days=30', { method: 'DELETE', headers: authHeader })
      .then(r => r.json())
      .then(d => { setClearMsg(d.message || 'Done.'); load(); })
      .catch(e => setClearMsg('Error: ' + e.message));
  }

  const levelColor = l => ({ error: '#f87171', warn: '#facc15', info: '#60a5fa' }[l] || '#aaa');

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 id="ap-anchor-error-log" style={{ margin: 0 }}>Server Error Log</h2>
        <select value={level} onChange={e => setLevel(e.target.value)} style={{ fontSize: '0.82rem', padding: '2px 6px' }}>
          <option value="">All levels</option>
          <option value="error">Errors only</option>
          <option value="warn">Warnings only</option>
          <option value="info">Info only</option>
        </select>
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px' }} onClick={load} disabled={loading}>
          {loading ? 'Loading…' : logs === null ? 'Load' : 'Refresh'}
        </button>
        {logs !== null && (
          <>
            <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px', color: '#f87171', borderColor: '#f87171' }} onClick={handleClear}>
              🗑 Clear Old
            </button>
            {clearMsg && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{clearMsg}</span>}
          </>
        )}
      </div>
      {logs !== null && logs.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No server logs found. Errors encountered during API calls will appear here.</p>
      )}
      {logs !== null && logs.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', position: 'sticky', top: 0, background: 'var(--bg)' }}>
                <th style={{ textAlign: 'left', padding: '5px 8px', width: 60 }}>Level</th>
                <th style={{ textAlign: 'left', padding: '5px 8px', width: 140 }}>When</th>
                <th style={{ textAlign: 'left', padding: '5px 8px', width: 160 }}>Source</th>
                <th style={{ textAlign: 'left', padding: '5px 8px' }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px', color: levelColor(l.level), fontWeight: 600 }}>{l.level?.toUpperCase()}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString('en-AU')}</td>
                  <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#a78bfa' }}>{l.source}</td>
                  <td style={{ padding: '4px 8px', wordBreak: 'break-all' }}>{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        Shows server-side errors logged during API operations. Useful for diagnosing replay parse failures and data issues.
      </p>
    </section>
  );
}

// Task #714 — Admin mass Discord DM tool.
// Lets a superuser compose a plain-text message, pick individual recipients
// from every player who has a Discord ID on file, confirm, and see a
// per-recipient success/failure breakdown after sending.
function RolesPanel({ superuserKey }) {
  const [roles, setRoles] = useState(null);
  const [players, setPlayers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [pickRole, setPickRole] = useState('moderator');
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [r, p] = await Promise.all([
        getAdminRoles(superuserKey),
        getAdminDmRecipients(superuserKey),
      ]);
      setRoles(r.roles || []);
      setPlayers(p.players || []);
    } catch (e) {
      setLoadError(e.message || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, [superuserKey]);

  useEffect(() => { load(); }, [load]);

  const roleByAccount = new Map((roles || []).map(r => [String(r.account_id), r.role]));
  const nameByAccount = new Map((players || []).map(p => [String(p.account_id), p.display_name]));

  const filtered = (players || []).filter(p => {
    const q = search.trim().toLowerCase();
    if (!q) return false;
    return p.display_name.toLowerCase().includes(q) || String(p.account_id).includes(q);
  }).slice(0, 25);

  async function assign(accountId) {
    setBusyId(accountId); setActionError('');
    try {
      await setAdminRole(superuserKey, accountId, pickRole);
      await load();
      setSearch('');
    } catch (e) {
      setActionError(e.message || 'Failed to assign role');
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(accountId) {
    setBusyId(accountId); setActionError('');
    try {
      await removeAdminRole(superuserKey, accountId);
      await load();
    } catch (e) {
      setActionError(e.message || 'Failed to revoke role');
    } finally {
      setBusyId(null);
    }
  }

  const inputStyle = {
    padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg-input, var(--bg))', color: 'var(--text-primary)', fontSize: 13,
    width: '100%', boxSizing: 'border-box',
  };

  const sortedStaff = (roles || []).slice().sort((a, b) => {
    if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
    return 0;
  });

  return (
    <section className="admin-section" id="ap-anchor-staff-roles" aria-labelledby="ap-staff-roles-h" style={{ marginTop: 32 }}>
      <h2 id="ap-staff-roles-h" className="section-title" style={{ marginBottom: 6 }}>
        🛡️ Staff Roles
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        Grant staff tiers to Steam accounts. <strong>Admins</strong> can edit matches, run inhouse
        lobbies &amp; seasons, manage replays/uploads, send mass DMs, and moderate users.{' '}
        <strong>Moderators</strong> can control live lobbies (kick/cancel) and do basic content moderation.
        Only you (the owner) can assign roles or perform financial/destructive actions.
      </p>

      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
      {loadError && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{loadError}</div>}

      {!loading && !loadError && (
        <div style={{ display: 'grid', gap: 18 }}>
          {/* Assign new staff */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Assign a role</span>
              <div role="radiogroup" aria-label="Role to assign" style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                {['moderator', 'admin'].map(r => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={pickRole === r}
                    className="btn"
                    style={{ fontSize: 11, padding: '3px 10px', background: pickRole === r ? 'var(--accent)' : undefined, color: pickRole === r ? '#fff' : undefined }}
                    onClick={() => setPickRole(r)}
                  >
                    {r === 'admin' ? 'Admin' : 'Moderator'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: '8px 12px', borderBottom: filtered.length ? '1px solid var(--border)' : 'none' }}>
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search players by name or account ID…"
                aria-label="Search players to grant a role"
                style={inputStyle}
              />
            </div>
            {actionError && <div role="alert" style={{ color: '#ef4444', fontSize: 13, padding: '8px 12px' }}>{actionError}</div>}
            {search.trim() && (
              <ul role="list" aria-label="Player search results" style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 280, overflowY: 'auto' }}>
                {filtered.map(p => {
                  const existing = roleByAccount.get(String(p.account_id));
                  return (
                    <li key={p.account_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13, flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.display_name}
                        {existing && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>(currently {existing})</span>}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{p.account_id}</span>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }}
                        disabled={busyId === p.account_id}
                        onClick={() => assign(p.account_id)}
                        aria-label={`Grant ${pickRole} to ${p.display_name}`}
                      >
                        {busyId === p.account_id ? '…' : `Make ${pickRole}`}
                      </button>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li style={{ padding: '12px', fontSize: 13, color: 'var(--text-muted)' }}>No players match your search.</li>
                )}
              </ul>
            )}
          </div>

          {/* Current staff */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: sortedStaff.length ? '1px solid var(--border)' : 'none', background: 'var(--bg-card)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Current staff <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({sortedStaff.length})</span>
              </span>
            </div>
            <ul role="list" aria-label="Current staff" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {sortedStaff.map(r => {
                const acct = String(r.account_id);
                const name = r.display_name || nameByAccount.get(acct) || `Account ${acct}`;
                return (
                  <li key={acct} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: r.role === 'admin' ? 'var(--amber)' : 'var(--brass)', flexShrink: 0, width: 78 }}>
                      {r.role}
                    </span>
                    <span style={{ fontSize: 13, flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{acct}</span>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }}
                      disabled={busyId === acct}
                      onClick={() => revoke(acct)}
                      aria-label={`Revoke ${r.role} from ${name}`}
                    >
                      {busyId === acct ? '…' : 'Revoke'}
                    </button>
                  </li>
                );
              })}
              {sortedStaff.length === 0 && (
                <li style={{ padding: '12px', fontSize: 13, color: 'var(--text-muted)' }}>No staff assigned yet. Search above to grant a role.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function MassDmPanel({ superuserKey }) {
  const [players, setPlayers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
  const [sendError, setSendError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const d = await getAdminDmRecipients(superuserKey);
      setPlayers(d.players || []);
    } catch (e) {
      setLoadError(e.message || 'Failed to load recipients');
    } finally {
      setLoading(false);
    }
  }, [superuserKey]);

  const reachable = players ? players.filter(p => p.has_discord) : [];
  const unreachable = players ? players.filter(p => !p.has_discord) : [];

  const filtered = reachable.filter(p =>
    !search.trim() ||
    p.display_name.toLowerCase().includes(search.trim().toLowerCase()) ||
    p.account_id.includes(search.trim())
  );

  function toggleOne(accountId) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(prev => {
      const next = new Set(prev);
      filtered.forEach(p => next.add(p.account_id));
      return next;
    });
  }

  function clearAllFiltered() {
    setSelected(prev => {
      const next = new Set(prev);
      filtered.forEach(p => next.delete(p.account_id));
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(reachable.map(p => p.account_id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function send() {
    setSending(true); setSendError(''); setResults(null);
    try {
      const accountIds = Array.from(selected);
      const d = await adminDmBlast(superuserKey, message, accountIds);
      setResults(d);
      setShowConfirm(false);
    } catch (e) {
      setSendError(e.message || 'Send failed');
    } finally {
      setSending(false);
    }
  }

  const inputStyle = {
    padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg-input, var(--bg))', color: 'var(--text-primary)', fontSize: 13,
    width: '100%', boxSizing: 'border-box',
  };

  return (
    <section className="admin-section" id="ap-anchor-mass-dm" aria-labelledby="ap-mass-dm-h" style={{ marginTop: 32 }}>
      <h2 id="ap-mass-dm-h" className="section-title" style={{ marginBottom: 6 }}>
        📢 Mass Discord DM
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        Send a plain-text message directly to individual Discord users.{' '}
        <strong>Ignores per-user notification preferences</strong> — this is an explicit admin broadcast.
        Players with no Discord ID on file cannot be selected.
      </p>

      {!players && !loading && (
        <button type="button" className="btn" onClick={load}>Load recipients</button>
      )}
      {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading recipients…</p>}
      {loadError && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{loadError}</div>}

      {players && (
        <div style={{ display: 'grid', gap: 18 }}>
          {/* Message composer */}
          <div>
            <label htmlFor="ap-mass-dm-msg" style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              Message
            </label>
            <textarea
              id="ap-mass-dm-msg"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your message here…"
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Recipient picker */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Recipients{' '}
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                  ({selected.size} selected · {reachable.length} reachable · {unreachable.length} unreachable)
                </span>
              </span>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={selectAll} aria-label="Select all reachable recipients">
                  Select all
                </button>
                <button type="button" className="btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={clearAll} aria-label="Clear all selections">
                  Clear all
                </button>
              </div>
            </div>

            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or account ID…"
                aria-label="Search recipients"
                style={{ ...inputStyle }}
              />
            </div>

            {search && (
              <div style={{ padding: '4px 12px 4px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} result(s)</span>
                <button type="button" className="btn" style={{ fontSize: 11, padding: '2px 7px' }} onClick={selectAllFiltered} aria-label="Select all filtered recipients">
                  Select filtered
                </button>
                <button type="button" className="btn" style={{ fontSize: 11, padding: '2px 7px' }} onClick={clearAllFiltered} aria-label="Clear filtered selections">
                  Clear filtered
                </button>
              </div>
            )}

            <ul
              role="listbox"
              aria-label="Recipient list"
              aria-multiselectable="true"
              style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 300, overflowY: 'auto' }}
            >
              {filtered.map(p => {
                const isSelected = selected.has(p.account_id);
                return (
                  <li
                    key={p.account_id}
                    role="option"
                    aria-selected={isSelected}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 12px', cursor: 'pointer',
                      background: isSelected ? 'rgba(197,169,117,0.08)' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onClick={() => toggleOne(p.account_id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOne(p.account_id); } }}
                    tabIndex={0}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(p.account_id)}
                      aria-label={`Select ${p.display_name}`}
                      tabIndex={-1}
                      style={{ accentColor: 'var(--accent)', width: 15, height: 15, flexShrink: 0 }}
                      onClick={e => e.stopPropagation()}
                    />
                    <span style={{ fontSize: 13, flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.display_name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {p.account_id}
                    </span>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li style={{ padding: '12px', fontSize: 13, color: 'var(--text-muted)' }}>No reachable recipients match your search.</li>
              )}
            </ul>

            {unreachable.length > 0 && (
              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
                ⚠️ {unreachable.length} player(s) have no Discord ID on file and cannot be selected.
              </div>
            )}
          </div>

          {/* Send button */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!message.trim() || selected.size === 0 || sending}
              onClick={() => { setShowConfirm(true); setSendError(''); }}
              aria-label={`Send DM to ${selected.size} selected recipient(s)`}
            >
              📨 Send to {selected.size} recipient{selected.size !== 1 ? 's' : ''}
            </button>
            {selected.size === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select at least one recipient.</span>}
            {!message.trim() && selected.size > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Enter a message first.</span>}
          </div>

          {/* Confirm dialog — uses the shared <Dialog> primitive for focus trapping, Escape-to-close, and ARIA */}
          <Dialog
            open={showConfirm}
            onClose={() => !sending && setShowConfirm(false)}
            labelledBy="ap-mass-dm-confirm-title"
            contentStyle={{ maxWidth: 480, width: '90%', padding: 28 }}
          >
            <h3 id="ap-mass-dm-confirm-title" style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>
              Confirm mass DM
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
              You are about to send a Discord DM to <strong>{selected.size}</strong> player{selected.size !== 1 ? 's' : ''}.
              This bypasses notification preferences and cannot be undone.
            </p>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)' }}>
              {message.trim()}
            </div>
            {sendError && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{sendError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowConfirm(false)} disabled={sending}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={send}
                disabled={sending}
                aria-label="Confirm and send the mass DM"
              >
                {sending ? 'Sending…' : `✅ Confirm & send to ${selected.size}`}
              </button>
            </div>
          </Dialog>

          {/* Results */}
          {results && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14 }}>
                  <strong style={{ color: '#22c55e' }}>✓ {results.sent}</strong> sent
                </span>
                <span style={{ fontSize: 14 }}>
                  <strong style={{ color: results.failed > 0 ? '#ef4444' : 'var(--text-muted)' }}>✗ {results.failed}</strong> failed
                </span>
              </div>
              {results.failedList && results.failedList.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Failures:</div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, color: '#f87171' }}>
                    {results.failedList.map((f, i) => (
                      <li key={i}>
                        {f.account_id}{f.discord_id ? ` (${f.discord_id})` : ''} — {f.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {results.failed === 0 && (
                <p style={{ fontSize: 13, color: '#22c55e', margin: 0 }}>All messages delivered successfully.</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Season Lifecycle panel — configure end conditions (end date / match limit) and
// manually close a season + post the Discord summary embed.
// v5.89 — small standalone button + log viewer for the community → full
// nickname/discord/rank sync. Lives in the rank management section because
// it shares context (one-shot data imports for player metadata).
function CommunitySyncButton({ superuserKey }) {
  const [busy, setBusy] = React.useState(false);
  const [overwrite, setOverwrite] = React.useState(false);
  const [dryRun, setDryRun] = React.useState(true);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  async function run() {
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await superuserFetch('/api/admin/sync-community-nicknames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ overwrite, dryRun }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} /> Dry run (preview only)
        </label>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} /> Overwrite existing values
        </label>
        <button className="btn btn-primary" disabled={busy} onClick={run}>
          {busy ? '⏳ Syncing…' : (dryRun ? '🔍 Preview Sync' : '📥 Run Sync Now')}
        </button>
      </div>
      {error && <div style={{ padding: 10, background: 'rgba(244,67,54,0.1)', border: '1px solid #f44336', borderRadius: 6, color: '#f44336', fontSize: 13 }}>{error}</div>}
      {result && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>{result.dryRun ? 'DRY RUN — nothing was written.' : 'Done.'}</strong>{' '}
            inserted={result.inserted} · updated={result.updated} · skipped={result.skipped} · players-linked={result.playerLinked} · total-source-rows={result.total}
          </div>
          <pre style={{ maxHeight: 280, overflow: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, fontSize: 11, lineHeight: 1.4 }}>
            {result.log}
          </pre>
        </div>
      )}
    </div>
  );
}

function SeasonLifecyclePanel({ superuserKey }) {
  const [seasons, setSeasons] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [endDate, setEndDate] = useState('');
  // datetime-local expects local wall time as `YYYY-MM-DDTHH:mm`, not UTC.
  // `toISOString()` would shift values by the local TZ offset (potentially
  // by hours or even cross a date boundary) and silently move the rollover
  // moment — so we format from local Date components instead.
  function fmtDatetimeLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const [matchLimit, setMatchLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reannouncing, setReannouncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSeasons()
      .then(raw => {
        const list = raw?.seasons || (Array.isArray(raw) ? raw : []);
        setSeasons(list);
        const active = list.find(s => s.active) || list[0];
        if (active) {
          setSelectedId(String(active.id));
          setEndDate(fmtDatetimeLocal(active.end_date));
          setMatchLimit(active.match_count_limit != null ? String(active.match_count_limit) : '');
        }
      })
      .catch(() => {});
  }, []);

  const selectedSeason = seasons.find(s => String(s.id) === selectedId);

  function handleSeasonChange(e) {
    const id = e.target.value;
    setSelectedId(id);
    setMsg(''); setError('');
    const s = seasons.find(s => String(s.id) === id);
    if (s) {
      setEndDate(fmtDatetimeLocal(s.end_date));
      setMatchLimit(s.match_count_limit != null ? String(s.match_count_limit) : '');
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    try {
      // `endDate` is a local `YYYY-MM-DDTHH:mm` string from the datetime-local
      // input. Send a proper ISO timestamp (with the browser's UTC offset
      // baked in) so the server stores exactly the moment the operator picked
      // in their own timezone, regardless of where the server runs.
      const endIso = endDate ? new Date(endDate).toISOString() : null;
      const res = await setSeasonEndConditions(
        selectedId,
        { end_date: endIso, match_count_limit: matchLimit ? parseInt(matchLimit) : null },
        superuserKey
      );
      const s = res.season;
      setSeasons(prev => prev.map(x => String(x.id) === selectedId ? { ...x, ...s } : x));
      setMsg('End conditions saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    if (!selectedId) return;
    const s = selectedSeason;
    if (!window.confirm(
      `Close season "${s?.name}"?\n\n` +
      `This will archive the season, generate the end-of-season summary, post a Discord embed, ` +
      `and automatically activate the next pending season (if one exists).\n\nThis cannot be undone.`
    )) return;
    setClosing(true); setMsg(''); setError('');
    try {
      const res = await closeSeasonApi(selectedId, superuserKey);
      setMsg(res.message || 'Season closed and announced.');
      const raw = await getSeasons();
      const list = raw?.seasons || (Array.isArray(raw) ? raw : []);
      setSeasons(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setClosing(false);
    }
  }

  const [undoing, setUndoing] = useState(false);
  async function handleUndoRollover() {
    if (!selectedId) return;
    const s = selectedSeason;
    if (!window.confirm(
      `Undo the rollover for "${s?.name}"?\n\n` +
      `This will:\n` +
      `• restore this season to active\n` +
      `• un-flag its matches as legacy\n` +
      `• deactivate the next season if it was created/opened by the rollover\n` +
      `• delete the archive snapshot row\n\n` +
      `Refuses if the next season already has matches recorded. ` +
      `Use this only to recover from a mistaken rollover.`
    )) return;
    setUndoing(true); setMsg(''); setError('');
    try {
      const res = await undoSeasonRolloverApi(selectedId, superuserKey);
      setMsg(res.message || 'Rollover undone.');
      const raw = await getSeasons();
      const list = raw?.seasons || (Array.isArray(raw) ? raw : []);
      setSeasons(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setUndoing(false);
    }
  }

  async function handleReannounce() {
    if (!selectedId) return;
    const s = selectedSeason;
    if (!window.confirm(
      `Repost the end-of-season announcement for "${s?.name}"?\n\n` +
      `This will re-send the season summary embed to the Discord announce channel. ` +
      `No data will be changed — the season stays archived.`
    )) return;
    setReannouncing(true); setMsg(''); setError('');
    try {
      const res = await reannounceSeasonApi(selectedId, superuserKey);
      setMsg(res.message || 'Announcement reposted.');
    } catch (err) {
      setError(err.message);
    } finally {
      setReannouncing(false);
    }
  }

  return (
    <section style={{ marginBottom: 36, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
      <h2 id="ap-anchor-season-lifecycle" style={{ margin: '0 0 6px', fontSize: '1rem' }}>📅 Season Lifecycle</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        Configure automatic end conditions for each season, or manually close a season and post the
        end-of-season summary to Discord. The bot checks conditions after every match is recorded.
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Season:&nbsp;
          <select value={selectedId} onChange={handleSeasonChange} style={{ marginLeft: 6 }}>
            <option value="">— Select —</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.active ? ' (active)' : s.is_legacy ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedId && (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                End Date & Time (auto-close at this moment — per-minute cron)
              </label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                Match Count Limit (auto-close after N games)
              </label>
              <input
                type="number"
                min={1}
                value={matchLimit}
                onChange={e => setMatchLimit(e.target.value)}
                placeholder="e.g. 50"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="submit" disabled={saving} style={{ fontSize: 13 }}>
              {saving ? 'Saving…' : '💾 Save End Conditions'}
            </button>
            <button
              className="btn"
              type="button"
              disabled={closing || !selectedSeason || !!selectedSeason?.is_legacy}
              onClick={handleClose}
              title={selectedSeason?.is_legacy ? 'Season already archived — use Repost Announcement instead' : undefined}
              style={{ fontSize: 13, color: '#f87171', borderColor: '#f87171', opacity: selectedSeason?.is_legacy ? 0.4 : 1 }}
            >
              {closing ? 'Closing…' : '🏁 Close Season & Post Summary'}
            </button>
            {selectedSeason?.is_legacy && (
              <button
                className="btn"
                type="button"
                disabled={reannouncing}
                onClick={handleReannounce}
                style={{ fontSize: 13, color: '#a78bfa', borderColor: '#a78bfa' }}
              >
                {reannouncing ? 'Reposting…' : '📢 Repost Announcement'}
              </button>
            )}
            {selectedSeason?.is_legacy && (
              <button
                className="btn"
                type="button"
                disabled={undoing}
                onClick={handleUndoRollover}
                title="Restore this archived season to active and remove the archive snapshot. Refuses if the next season already has matches."
                style={{ fontSize: 13, color: '#fbbf24', borderColor: '#fbbf24' }}
              >
                {undoing ? 'Undoing…' : '↩️ Undo Rollover'}
              </button>
            )}
            {selectedSeason && (
              <a
                href={`/seasons/${selectedId}/summary`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'underline' }}
              >
                View Summary Page ↗
              </a>
            )}
          </div>
          {msg && <div style={{ fontSize: 13, color: '#4ade80' }}>✓ {msg}</div>}
          {error && <div style={{ fontSize: 13, color: '#f87171' }}>Error: {error}</div>}
        </form>
      )}
    </section>
  );
}

// 1.6 — Season Tiers admin panel.
// Lists tiers per season with name/MMR-floor editing, plus actions to seed default
// tiers and place all rated players into their MMR-derived tier in one shot.
// Whole panel is gated on the `multi_tier_seasons` feature flag — when off the
// panel is hidden even from superusers (preview/on flips it back on).
function SeasonTiersPanel({ superuserKey }) {
  const enabled = useFeatureFlag('multi_tier_seasons');
  if (!enabled) return null;
  return <SeasonTiersPanelInner superuserKey={superuserKey} />;
}

function SeasonTiersPanelInner({ superuserKey }) {
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [tiers, setTiers] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savingTier, setSavingTier] = useState(null);
  const [busy, setBusy] = useState(null);
  const [edits, setEdits] = useState({});

  const refreshSeasons = useCallback(async () => {
    try {
      const raw = await getSeasons();
      const list = raw?.seasons || (Array.isArray(raw) ? raw : []);
      setSeasons(list);
      if (!seasonId && list.length) {
        const active = list.find(s => s.is_active) || list[list.length - 1];
        setSeasonId(String(active.id));
      }
    } catch (err) {
      setError(err.message || 'Failed to load seasons');
    }
  }, [seasonId]);

  const refreshTiers = useCallback(async () => {
    if (!seasonId) return;
    try {
      setLoading(true);
      const data = await getSeasonTiers(seasonId);
      const tierList = data.tiers || [];
      setTiers(tierList);
      // Pull player counts per tier in parallel.
      const counts = {};
      await Promise.all(tierList.map(async t => {
        try {
          const r = await getSeasonTierPlayers(seasonId, t.tier_number);
          counts[t.tier_number] = (r.players || []).length;
        } catch {
          counts[t.tier_number] = 0;
        }
      }));
      setCounts(counts);
      setEdits({});
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load tiers');
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => { refreshSeasons(); }, [refreshSeasons]);
  useEffect(() => { refreshTiers(); }, [refreshTiers]);

  const handleSeed = async () => {
    if (!seasonId) return;
    if (!window.confirm('Seed the default 8-tier ladder for this season?\n\nExisting tier names/floors will be left alone — only missing tiers are inserted.')) return;
    try {
      setBusy('seed');
      await ensureSeasonTiers(seasonId, superuserKey);
      await refreshTiers();
    } catch (err) {
      setError(err.message || 'Failed to seed tiers');
    } finally {
      setBusy(null);
    }
  };

  const handlePlaceAll = async () => {
    if (!seasonId) return;
    if (!window.confirm('Place every rated player into their MMR-derived tier?\n\nThis is safe to re-run — players are re-placed based on current TrueSkill MMR.')) return;
    try {
      setBusy('place');
      // helper signature is (seasonId, force, superuserKey) — force=true so
      // re-running re-places players based on current MMR.
      const r = await placeAllPlayersInTiers(seasonId, true, superuserKey);
      await refreshTiers();
      alert(`Placed ${r.placed || 0} player(s) into tiers.`);
    } catch (err) {
      setError(err.message || 'Failed to place players');
    } finally {
      setBusy(null);
    }
  };

  const setEdit = (tn, patch) => setEdits(e => ({ ...e, [tn]: { ...(e[tn] || {}), ...patch } }));

  const saveTier = async (tn) => {
    const patch = edits[tn];
    if (!patch) return;
    try {
      setSavingTier(tn);
      await updateSeasonTier(seasonId, tn, {
        name: patch.name,
        min_mmr: patch.min_mmr !== undefined ? Number(patch.min_mmr) : undefined,
        sponsor_name: patch.sponsor_name !== undefined ? (patch.sponsor_name || null) : undefined,
        sponsor_active_from: patch.sponsor_active_from !== undefined ? (patch.sponsor_active_from || null) : undefined,
        sponsor_active_until: patch.sponsor_active_until !== undefined ? (patch.sponsor_active_until || null) : undefined,
      }, superuserKey);
      await refreshTiers();
    } catch (err) {
      setError(err.message || 'Failed to update tier');
    } finally {
      setSavingTier(null);
    }
  };

  return (
    <section style={{ marginBottom: 36 }}>
      <h2 id="ap-anchor-season-tiers" style={{ marginBottom: 6 }}>🏆 Season Tiers</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Manage the 8-tier MMR ladder for each season. Players are auto-placed by their TrueSkill MMR
        (display MMR = round((μ − 3σ) × 100) + 5000). Default Tier V floor is <strong>5000</strong>.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 13 }}>Season:&nbsp;
          <select
            value={seasonId}
            onChange={e => setSeasonId(e.target.value)}
            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
          >
            <option value="">— select —</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                #{s.id} {s.name || ''}{s.is_active ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button onClick={handleSeed} disabled={!seasonId || busy === 'seed'} className="btn">
          {busy === 'seed' ? 'Seeding…' : 'Seed default tiers'}
        </button>
        <button onClick={handlePlaceAll} disabled={!seasonId || busy === 'place' || tiers.length === 0} className="btn btn-primary">
          {busy === 'place' ? 'Placing…' : 'Place all players by MMR'}
        </button>
      </div>

      {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {loading ? <div>Loading…</div> : tiers.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {seasonId ? 'No tiers yet — click "Seed default tiers" to create the 8-tier ladder.' : 'Pick a season above.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>#</th>
                <th style={{ padding: '8px 10px' }}>Name</th>
                <th style={{ padding: '8px 10px' }}>Min MMR</th>
                <th style={{ padding: '8px 10px' }}>Sponsor (optional)</th>
                <th style={{ padding: '8px 10px' }}>Players</th>
                <th style={{ padding: '8px 10px' }}></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(t => {
                const draftName = edits[t.tier_number]?.name ?? t.name;
                const draftFloor = edits[t.tier_number]?.min_mmr ?? t.min_mmr;
                const draftSponsor = edits[t.tier_number]?.sponsor_name ?? (t.sponsor_name || '');
                const draftSponsorFrom = edits[t.tier_number]?.sponsor_active_from ?? (t.sponsor_active_from ? t.sponsor_active_from.slice(0, 10) : '');
                const draftSponsorUntil = edits[t.tier_number]?.sponsor_active_until ?? (t.sponsor_active_until ? t.sponsor_active_until.slice(0, 10) : '');
                const dirty = edits[t.tier_number] && (
                  (edits[t.tier_number].name !== undefined && edits[t.tier_number].name !== t.name)
                  || (edits[t.tier_number].min_mmr !== undefined && Number(edits[t.tier_number].min_mmr) !== Number(t.min_mmr))
                  || edits[t.tier_number].sponsor_name !== undefined
                  || edits[t.tier_number].sponsor_active_from !== undefined
                  || edits[t.tier_number].sponsor_active_until !== undefined
                );
                return (
                  <tr key={t.tier_number} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#a78bfa' }}>{t.tier_number}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <input
                        type="text"
                        value={draftName}
                        onChange={e => setEdit(t.tier_number, { name: e.target.value })}
                        style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', width: 200 }}
                      />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <input
                        type="number"
                        value={draftFloor}
                        onChange={e => setEdit(t.tier_number, { min_mmr: e.target.value })}
                        style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', width: 100 }}
                      />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                          type="text"
                          value={draftSponsor}
                          onChange={e => setEdit(t.tier_number, { sponsor_name: e.target.value })}
                          placeholder="Sponsor name (optional)"
                          style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', width: 180 }}
                        />
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="date"
                            value={draftSponsorFrom}
                            onChange={e => setEdit(t.tier_number, { sponsor_active_from: e.target.value })}
                            title="Sponsor active from"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 12 }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
                          <input
                            type="date"
                            value={draftSponsorUntil}
                            onChange={e => setEdit(t.tier_number, { sponsor_active_until: e.target.value })}
                            title="Sponsor active until"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 12 }}
                          />
                        </div>
                        {draftFloor != null && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Preview:</span>
                            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Normal</span>
                              <TierBadge
                                mmr={Number(draftFloor)}
                                dbTiers={[{ min_mmr: Number(draftFloor), name: draftName || t.name, sponsor_name: null }]}
                              />
                            </span>
                            {draftSponsor && (
                              <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sponsored (when active)</span>
                                <TierBadge
                                  mmr={Number(draftFloor)}
                                  dbTiers={[{
                                    min_mmr: Number(draftFloor),
                                    name: draftName || t.name,
                                    sponsor_name: draftSponsor,
                                    sponsor_active_from: '2000-01-01',
                                    sponsor_active_until: '2099-01-01',
                                  }]}
                                />
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{counts[t.tier_number] ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <button
                        onClick={() => saveTier(t.tier_number)}
                        disabled={!dirty || savingTier === t.tier_number}
                        className="btn btn-primary"
                        style={{ fontSize: 12, padding: '4px 10px', opacity: dirty ? 1 : 0.5 }}
                      >
                        {savingTier === t.tier_number ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Task #297 — Superuser-only diagnostic. Creates a synthetic, hidden
// inhouse session, runs the real provisionInhouseServer() against the
// configured dedicated server (real RCON push), and renders the
// resulting steam://connect link inline so the operator can verify
// Dota launches and joins. Does NOT post to Discord, NOT shuffle voice
// channels, and the session is hidden from /inhouse + history.
function InhouseDiagPanel({ superuserKey }) {
  const [running, setRunning] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  // On a failed provision the API now returns the server_failed session row
  // (status + notes) AND a sessionId. We track that here so the UI can show
  // the failure detail AND offer Cleanup for the orphaned diagnostic row.
  const [failedSession, setFailedSession] = useState(null);
  const [failedSessionId, setFailedSessionId] = useState(null);
  // Reuse the existing /api/admin/dedicated-server/status endpoint so the
  // operator can pre-flight check RCON + SSH reachability before pressing
  // the diagnostic button. Loaded lazily on mount.
  const [srvStatus, setSrvStatus] = useState(null);
  const [srvLoading, setSrvLoading] = useState(false);

  const loadSrvStatus = useCallback(async () => {
    setSrvLoading(true);
    try {
      const r = await superuserFetch('/dedicated-server/status', {
        headers: { 'x-superuser-key': superuserKey },
      });
      const d = await r.json().catch(() => ({}));
      setSrvStatus(r.ok ? d : { error: d.error || `HTTP ${r.status}` });
    } catch (e) {
      setSrvStatus({ error: e.message });
    } finally {
      setSrvLoading(false);
    }
  }, [superuserKey]);

  useEffect(() => { loadSrvStatus(); }, [loadSrvStatus]);

  async function handleProvision() {
    setRunning(true);
    setError('');
    setResult(null);
    setFailedSession(null);
    setFailedSessionId(null);
    try {
      const r = await runInhouseDiagProvision(superuserKey);
      setResult(r);
    } catch (e) {
      setError(e.message || 'Provisioning failed.');
      // Surface the server_failed session shape so the operator can read
      // notes inline AND cleanup the orphan row left behind by the failure.
      setFailedSession(e.session || null);
      setFailedSessionId(e.sessionId || null);
    } finally {
      setRunning(false);
    }
  }

  async function handleCleanup() {
    const id = result?.sessionId || failedSessionId;
    if (!id) return;
    setCleaningUp(true);
    try {
      await cleanupInhouseDiag(id, superuserKey);
      setResult(null);
      setFailedSession(null);
      setFailedSessionId(null);
      setError('');
    } catch (e) {
      setError(e.message || 'Cleanup failed.');
    } finally {
      setCleaningUp(false);
    }
  }

  return (
    <section className="admin-section" style={{ marginBottom: 36 }}>
      <h2 id="ap-anchor-inhouse-diag" className="section-title" style={{ marginBottom: 6 }}>
        🔌 Test: Provision &amp; Connect (Dedicated Server)
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        Creates a hidden synthetic inhouse session, pushes a fresh match password to the
        configured dedicated server over RCON, and renders the <code>steam://</code> connect link
        below so you can click it and verify Dota launches and joins. The diagnostic session is
        invisible to <code>/inhouse</code> and to match history, and it does <strong>not</strong> post to
        Discord or move anyone in voice. Click <strong>Cleanup</strong> when you&rsquo;re done to delete
        the hidden row.
      </p>

      {/* Pre-flight: dedicated-server reachability snapshot */}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
        padding: '10px 14px', borderRadius: 8, background: 'var(--bg-card)',
        border: '1px solid var(--border)', marginBottom: 14, fontSize: 13,
      }}>
        <strong>Dedicated server:</strong>
        {srvLoading && <span style={{ color: 'var(--text-muted)' }}>checking…</span>}
        {!srvLoading && srvStatus && srvStatus.error && (
          <span style={{ color: '#fca5a5' }}>⚠ {srvStatus.error}</span>
        )}
        {!srvLoading && srvStatus && !srvStatus.error && (
          <>
            <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
              {srvStatus.ip || '(no IP configured)'}:{srvStatus.port}
            </span>
            <span>
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                background: srvStatus.rcon?.ok ? '#4ade80' : '#ef4444', marginRight: 6,
              }} />
              RCON: <span style={{ color: srvStatus.rcon?.ok ? '#4ade80' : '#fca5a5' }}>
                {srvStatus.rcon?.ok ? 'reachable' : (srvStatus.rcon?.error || 'unreachable')}
              </span>
            </span>
            <span>
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                background: srvStatus.ssh?.ok ? '#4ade80' : '#ef4444', marginRight: 6,
              }} />
              SSH: <span style={{ color: srvStatus.ssh?.ok ? '#4ade80' : '#fca5a5' }}>
                {srvStatus.ssh?.ok ? 'reachable' : (srvStatus.ssh?.error || 'unreachable')}
              </span>
            </span>
          </>
        )}
        <button
          type="button"
          className="btn"
          onClick={loadSrvStatus}
          disabled={srvLoading}
          style={{ fontSize: 12, padding: '3px 10px', marginLeft: 'auto' }}
        >
          {srvLoading ? '…' : '↺ Refresh'}
        </button>
        <Link to="/inhouse" style={{ fontSize: 12, color: 'var(--accent)' }}>Open /inhouse →</Link>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleProvision}
          disabled={running || cleaningUp}
        >
          {running ? '⏳ Provisioning…' : '🚀 Run Diagnostic Provision'}
        </button>
        {(result?.sessionId || failedSessionId) && (
          <button
            type="button"
            className="btn"
            onClick={handleCleanup}
            disabled={cleaningUp || running}
          >
            {cleaningUp ? '⏳ Cleaning up…' : '🧹 Cleanup diagnostic session'}
          </button>
        )}
      </div>

      {failedSession && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: '#1f0a0a',
          border: '1px solid #f87171', marginBottom: 12, fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, color: '#fca5a5', marginBottom: 4 }}>
            Diagnostic session #{failedSession.id} — status: {failedSession.status}
          </div>
          {failedSession.notes && (
            <pre style={{
              margin: 0, padding: '8px 10px', background: '#0d0606',
              border: '1px solid #2a0a0a', borderRadius: 4, color: '#fca5a5',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace',
              fontSize: 12, maxHeight: 200, overflow: 'auto',
            }}>
              {failedSession.notes}
            </pre>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#450a0a',
                      border: '1px solid #f87171', color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>
          ⚠ {error}
        </div>
      )}

      {result && (
        <div style={{
          padding: 14, borderRadius: 8, background: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-muted)' }}>
            Diagnostic session <code>#{result.sessionId}</code> provisioned successfully — RCON push accepted.
          </div>
          {result.connectLink && (
            <div style={{ marginBottom: 10 }}>
              <a
                href={result.connectLink}
                style={{
                  display: 'inline-block', padding: '12px 24px',
                  background: '#171a21', color: '#66c0f4', textDecoration: 'none',
                  borderRadius: 4, fontWeight: 700, border: '1px solid #66c0f4',
                }}
              >
                🎮 Connect to Server
              </a>
            </div>
          )}
          {result.consoleCommand && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Or paste in the Dota console:{' '}
              <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 3, userSelect: 'all' }}>
                {result.consoleCommand}
              </code>
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            Server: {result.serverIp}:{result.serverPort} · Password: {result.password}
          </div>
        </div>
      )}
    </section>
  );
}

function SteamBotPanel({ superuserKey }) {
  const auth = { 'x-superuser-key': superuserKey };
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Lobby create
  const [lobbyName, setLobbyName] = useState('OCE Inhouse');
  const [lobbyPass, setLobbyPass] = useState('');
  const [lobbyMsg, setLobbyMsg] = useState(null);
  const [lobbyLoading, setLobbyLoading] = useState(false);

  // Join lobby
  const [joinId, setJoinId] = useState('');
  const [joinPass, setJoinPass] = useState('');
  const [joinMsg, setJoinMsg] = useState(null);
  const [joinLoading, setJoinLoading] = useState(false);

  // Invite
  const [inviteSteamId, setInviteSteamId] = useState('');
  const [inviteMsg, setInviteMsg] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Friends
  const [friendsMsg, setFriendsMsg] = useState(null);
  const [friendsLoading, setFriendsLoading] = useState(false);

  // End lobby
  const [endMsg, setEndMsg] = useState(null);
  const [endLoading, setEndLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const r = await superuserFetch('/api/admin/steam/status', { headers: auth });
      setStatus(await r.json());
    } catch { setStatus(null); }
    setStatusLoading(false);
  }, [superuserKey]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const dot = (ok) => (
    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: ok ? '#4ade80' : '#ef4444', marginRight: 6 }} />
  );

  const callApi = async (url, body, setMsg, setLoading) => {
    setLoading(true); setMsg(null);
    try {
      const r = await superuserFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      setMsg({ ok: r.ok, text: d.error || d.message || (r.ok ? 'Done' : 'Failed') });
      if (r.ok) setTimeout(loadStatus, 1500);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setLoading(false);
  };

  const statusColor = (ok) => ok ? 'var(--radiant-color)' : 'var(--dire-color)';
  const msgEl = (m) => m && (
    <p style={{ marginTop: 6, fontSize: 13, color: m.ok ? 'var(--radiant-color)' : 'var(--dire-color)' }}>{m.ok ? '✅' : '❌'} {m.text}</p>
  );

  const lobbyState = status?.lobby?.lobby;
  const lobbyActive = !!lobbyState;

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 id="ap-anchor-steam-bot" style={{ margin: 0 }}>🤖 Steam Bot Controls</h2>
        <button className="btn" style={{ fontSize: 12, padding: '3px 10px' }} onClick={loadStatus} disabled={statusLoading}>
          {statusLoading ? '...' : '↺ Refresh'}
        </button>
      </div>

      {/* Status row */}
      {status && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20, background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 8 }}>
          <span>{dot(status.steamConnected)}<strong>Steam</strong>: <span style={{ color: statusColor(status.steamConnected) }}>{status.steamConnected ? 'Connected' : 'Offline'}</span></span>
          <span>{dot(status.gcReady)}<strong>GC</strong>: <span style={{ color: statusColor(status.gcReady) }}>{status.gcReady ? 'Ready' : 'Not ready'}</span></span>
          <span>👥 <strong>Friends:</strong> {status.friendCount ?? '—'}</span>
          <span>🎮 <strong>Lobby:</strong> {lobbyActive ? <span style={{ color: 'var(--radiant-color)' }}>{lobbyState.name} ({status.lobby?.state})</span> : <span style={{ color: 'var(--text-muted)' }}>None</span>}</span>
          {lobbyActive && lobbyState.lobbyId && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>ID: {lobbyState.lobbyId}</span>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>

        {/* Create Lobby */}
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Create Lobby</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="input" placeholder="Lobby name" value={lobbyName} onChange={e => setLobbyName(e.target.value)} />
            <input className="input" placeholder="Password (optional)" value={lobbyPass} onChange={e => setLobbyPass(e.target.value)} />
            <button className="btn" disabled={lobbyLoading || !lobbyName.trim()}
              onClick={() => callApi('/api/admin/steam/lobby/create', { name: lobbyName, password: lobbyPass }, setLobbyMsg, setLobbyLoading)}>
              {lobbyLoading ? 'Creating…' : '🎮 Create Lobby'}
            </button>
            {msgEl(lobbyMsg)}
          </div>
        </div>

        {/* Join Lobby */}
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Join Existing Lobby</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="input" placeholder="Lobby ID" value={joinId} onChange={e => setJoinId(e.target.value)} />
            <input className="input" placeholder="Password (if any)" value={joinPass} onChange={e => setJoinPass(e.target.value)} />
            <button className="btn" disabled={joinLoading || !joinId.trim()}
              onClick={() => callApi('/api/admin/steam/lobby/join', { lobbyId: joinId, password: joinPass }, setJoinMsg, setJoinLoading)}>
              {joinLoading ? 'Joining…' : '🔗 Join Lobby'}
            </button>
            {msgEl(joinMsg)}
          </div>
        </div>

        {/* Invite Player */}
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Invite Player</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Accepts Steam64, Steam3 [U:1:N], or STEAM_0:Y:Z format. Lobby must be active.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="input" placeholder="e.g. STEAM_0:1:17972010" value={inviteSteamId} onChange={e => setInviteSteamId(e.target.value)} />
            <button className="btn" disabled={inviteLoading || !inviteSteamId.trim()}
              onClick={() => callApi('/api/admin/steam/lobby/invite', { steamId: inviteSteamId }, setInviteMsg, setInviteLoading)}>
              {inviteLoading ? 'Inviting…' : '📨 Send Invite'}
            </button>
            {msgEl(inviteMsg)}
          </div>
        </div>

        {/* End Lobby + Launch + Add Friends */}
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Other Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                Launch the game once all 10 players are seated. This cannot be undone.
              </p>
              <button className="btn" style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
                disabled={!lobbyActive}
                onClick={() => callApi('/api/admin/steam/lobby/start', {}, setEndMsg, setEndLoading)}>
                🚀 Launch Game
              </button>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
            <div>
              <button className="btn" style={{ background: 'var(--dire-color)', borderColor: 'var(--dire-color)' }}
                disabled={endLoading}
                onClick={() => callApi('/api/admin/steam/lobby/end', {}, setEndMsg, setEndLoading)}>
                {endLoading ? 'Leaving…' : '🚪 End / Leave Lobby'}
              </button>
              {msgEl(endMsg)}
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Send friend requests to all registered players so they can receive Steam reminders.</p>
              <button className="btn" disabled={friendsLoading}
                onClick={async () => {
                  setFriendsLoading(true); setFriendsMsg(null);
                  try {
                    const r = await superuserFetch('/api/admin/steam/friends/add-all', { method: 'POST', headers: auth });
                    const d = await r.json();
                    setFriendsMsg({ ok: r.ok, text: d.message || d.error || (r.ok ? 'Requests sent!' : 'Failed') });
                    setTimeout(loadStatus, 3000);
                  } catch (e) { setFriendsMsg({ ok: false, text: e.message }); }
                  setFriendsLoading(false);
                }}>
                {friendsLoading ? 'Sending…' : '👥 Add All Known Friends'}
              </button>
              {msgEl(friendsMsg)}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

function EngagementSettingsPanel({ superuserKey, siteSettings, onSaved }) {
  const [milestones, setMilestones] = React.useState('');
  const [referralXp, setReferralXp] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    if (siteSettings.engagement_milestone_thresholds !== undefined) {
      setMilestones(siteSettings.engagement_milestone_thresholds ?? '50,100,150,200');
    }
    if (siteSettings.engagement_referral_xp !== undefined) {
      setReferralXp(siteSettings.engagement_referral_xp ?? '50');
    }
  }, [siteSettings.engagement_milestone_thresholds, siteSettings.engagement_referral_xp]);

  const saveSetting = async (key, value) => {
    const r = await superuserFetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
      body: JSON.stringify({ key, value }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed');
  };

  const handleSave = async () => {
    const thresholdNums = milestones.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
    if (thresholdNums.length === 0) {
      setMsg('Error: Enter at least one valid milestone number.');
      return;
    }
    const xpNum = parseInt(referralXp, 10);
    if (isNaN(xpNum) || xpNum < 0) {
      setMsg('Error: Referral XP must be a non-negative number.');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      await Promise.all([
        saveSetting('engagement_milestone_thresholds', thresholdNums.join(',')),
        saveSetting('engagement_referral_xp', String(xpNum)),
      ]);
      setMsg('Saved.');
      if (onSaved) onSaved();
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-engagement" style={{ marginBottom: 6 }}>🎯 Engagement</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Configure milestone thresholds and referral XP. Changes take effect immediately — no redeploy required.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Milestone thresholds (comma-separated match counts)
          </label>
          <input
            type="text"
            value={milestones}
            onChange={e => setMilestones(e.target.value)}
            placeholder="50,100,150,200"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px', borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontSize: 14,
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            A Discord announcement is posted when a player's total match count hits any of these values.
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Referral XP amount
          </label>
          <input
            type="number"
            min="0"
            value={referralXp}
            onChange={e => setReferralXp(e.target.value)}
            placeholder="50"
            style={{
              width: 120,
              padding: '7px 10px', borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontSize: 14,
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            XP granted to the referrer when a player they invited completes registration.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save Engagement Settings'}
          </button>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)' }}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function BroadcastTickerPanel({ superuserKey }) {
  const [cfg, setCfg] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [text, setText] = React.useState('');

  React.useEffect(() => {
    fetch('/api/settings/broadcast-ticker')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        let parsed = { enabled: true, items: [] };
        if (d?.value) {
          try { parsed = { ...parsed, ...(typeof d.value === 'string' ? JSON.parse(d.value) : d.value) }; } catch {}
        }
        setCfg(parsed);
        setText((parsed.items || []).join('\n'));
      })
      .catch(() => { setCfg({ enabled: true, items: [] }); setText(''); });
  }, []);

  if (!cfg) return null;

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const items = text.split('\n').map(s => s.trim()).filter(Boolean);
      if (items.length === 0) {
        setMsg('Error: at least one ticker item is required.');
        setSaving(false);
        return;
      }
      const r = await superuserFetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ key: 'broadcast_ticker', value: JSON.stringify({ enabled: !!cfg.enabled, items }) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      let parsedValue = null;
      try {
        parsedValue = JSON.parse(d.setting.value);
        setCfg(parsedValue);
        setText((parsedValue.items || []).join('\n'));
      } catch {}
      // Notify the live <BroadcastTicker/> mounted in App.jsx so the bar
      // updates without a full page reload (and without waiting for the
      // visibilitychange refetch).
      try {
        window.dispatchEvent(new CustomEvent('broadcast-ticker-updated', {
          detail: parsedValue || { enabled: !!cfg.enabled, items },
        }));
      } catch {}
      setMsg('Saved.');
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '7px 10px', borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)', color: 'var(--text-primary)',
    fontSize: 14, fontFamily: 'inherit',
  };

  return (
    <section style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-broadcast-ticker" style={{ marginBottom: 6 }}>📢 Broadcast Ticker (CMS)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Editor-controlled scrolling ticker that runs across the very top of every page.
        One headline per line. Disable to hide the bar entirely.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 580 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={!!cfg.enabled}
            onChange={e => setCfg(c => ({ ...c, enabled: e.target.checked }))}
          />
          Ticker enabled
        </label>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Items (one per line)
          </label>
          <textarea
            rows={8}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'Season 10 ladder live\nInhouse lobby open · /inhouse\nCoaching marketplace beta'}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save ticker'}
          </button>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)' }}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// Task #361 — surfaces the cron_heartbeats table as a small operator-facing
// readout in the admin Config tab. Each row shows the cron name, when it
// last ran (local time), its last status (ok / partial / skipped / error),
// the short summary message recorded by the cron itself, and a red flag if
// the most recent run is older than the cron's expected window. Read-only.
function CronHeartbeatsPanel({ superuserKey }) {
  const [rows, setRows] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const load = React.useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch(`/api/admin/system/heartbeats`, {
        credentials: 'include',
        headers: { 'X-Superuser-Key': superuserKey || '' },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setRows(d.heartbeats || []);
    } catch (e) { setErr(e.message); setRows([]); }
  }, [superuserKey]);
  React.useEffect(() => { load(); }, [load]);
  const fmtAge = (ms) => {
    if (ms == null) return '—';
    const m = Math.round(ms / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  };
  const statusColor = (s) => s === 'ok' ? 'var(--radiant-color)' : s === 'partial' ? '#fbbf24' : s === 'skipped' ? 'var(--text-muted)' : 'var(--dire-color)';
  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-cron-heartbeats" className="section-title" style={{ marginBottom: 6 }}>
        ❤️ Cron heartbeats
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Each scheduled job writes a row here at the end of its tick. An overdue last-ran
        timestamp is a real signal that the cron silently broke. Refreshes on tab open.
      </p>
      {err && <p style={{ color: 'var(--dire-color)' }}>Error: {err}</p>}
      {rows == null ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          No heartbeats recorded yet. Crons write a row the first time they tick after deploy.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>Cron</th>
              <th style={{ padding: 6 }}>Last ran</th>
              <th style={{ padding: 6 }}>Status</th>
              <th style={{ padding: 6 }}>Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 6, fontFamily: 'monospace' }}>{r.name}</td>
                <td style={{ padding: 6, color: r.overdue ? 'var(--dire-color)' : 'var(--text-primary)' }}>
                  {r.last_ran_at ? new Date(r.last_ran_at).toLocaleString() : '—'}
                  {r.age_ms != null && <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>({fmtAge(r.age_ms)})</span>}
                  {r.overdue && <span style={{ marginLeft: 6, color: 'var(--dire-color)', fontWeight: 700 }}>OVERDUE</span>}
                </td>
                <td style={{ padding: 6, color: statusColor(r.last_status), fontWeight: 600 }}>{r.last_status}</td>
                <td style={{ padding: 6, color: 'var(--text-muted)' }}>{r.last_message || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// Read-only visual reference of the full IH ladder (V1 + V3 thresholds).
// Lives in the admin Config tab so admins can confirm at a glance how
// every rank is named, what its symbol is, and what MMR cutoff it uses
// — without leaving the panel.
function TierLadderPreview() {
  // v5.83 — single canonical ladder. Iterate the actual MMR_TIERS export
  // from Leaderboard.jsx (top tier first → bottom tier last) so the preview
  // is always in lockstep with what the leaderboard renders.
  // King is the leaderOnly tier; pass `isLeader` so it actually renders.
  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-tier-ladder" className="section-title" style={{ marginBottom: 6 }}>
        🎖️ Tier Ladder Preview
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Read-only reference of every IH rank (name, symbol, MMR cutoff) in the
        current ladder. Edit thresholds in <code>web/src/pages/Leaderboard.jsx</code>.
        <strong style={{ color: 'var(--accent)', marginLeft: 6 }}>King</strong> is reserved
        for the #1 leaderboard player only — every other player tops out at Warlord.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 460 }}>
        {MMR_TIERS.map((t) => {
          const isKing = t.leaderOnly;
          const previewMmr = isKing ? 9999 : t.min;
          return (
            <div key={t.name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
            }}>
              <TierBadge mmr={previewMmr} dbTiers={null} isLeader={isKing} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {isKing ? '#1 leaderboard only' : `≥ ${t.min} MMR`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Task #127 — Discord guild auto-join health panel.
// Surfaces the in-memory ring buffer maintained by DiscordBot
// (`addUserToLeagueGuild` outcomes over the last 24h) so admins can see
// at a glance whether new signups are actually landing in the Discord
// server, instead of having to tail the throttled alert channel.
function DiscordAutoJoinStatusPanel({ superuserKey }) {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  // Task #142 — 7-day history (sparkline buckets + paginated failure list).
  const [history, setHistory] = React.useState(null);
  const [historyErr, setHistoryErr] = React.useState('');
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [failuresOffset, setFailuresOffset] = React.useState(0);
  const FAILURES_PAGE_SIZE = 20;
  const HISTORY_DAYS = 7;

  const load = React.useCallback(() => {
    if (!superuserKey) return;
    setLoading(true);
    superuserFetch('/api/admin/discord-autojoin-status', { headers: { 'x-superuser-key': superuserKey } })
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else { setData(d); setErr(''); } })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  const loadHistory = React.useCallback((offset = 0) => {
    if (!superuserKey) return;
    setHistoryLoading(true);
    const qs = new URLSearchParams({
      days: String(HISTORY_DAYS),
      failures_limit: String(FAILURES_PAGE_SIZE),
      failures_offset: String(offset),
    }).toString();
    superuserFetch(`/api/admin/discord-autojoin-history?${qs}`, { headers: { 'x-superuser-key': superuserKey } })
      .then(r => r.json())
      .then(d => { if (d.error) setHistoryErr(d.error); else { setHistory(d); setHistoryErr(''); } })
      .catch(e => setHistoryErr(e.message))
      .finally(() => setHistoryLoading(false));
  }, [superuserKey]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { loadHistory(failuresOffset); }, [loadHistory, failuresOffset]);

  const counts = data?.counts || {};
  const successCount = (counts.success_added || 0) + (counts.success_already || 0);
  const failureCount = Object.entries(counts)
    .filter(([k]) => !k.startsWith('success_'))
    .reduce((sum, [, v]) => sum + v, 0);
  const totalRecent = data?.recent_count || 0;

  // Health logic: red if any failures in the last 24h AND no successes after
  // the last failure (i.e. broken right now); amber if there are failures but
  // also more recent successes (transient hiccup); green otherwise.
  let level = 'green';
  let levelLabel = 'Healthy';
  if (!data?.guild_configured || !data?.bot_token_configured) {
    level = 'red';
    levelLabel = 'Not configured';
  } else if (failureCount > 0) {
    const lastFailTs = data?.last_failure?.ts || 0;
    const hasRecentSuccess = (data?.last_success_ts || 0) > lastFailTs;
    level = hasRecentSuccess ? 'amber' : 'red';
    levelLabel = hasRecentSuccess ? 'Recovered after failures' : 'Failures in last 24h';
  } else if (totalRecent === 0) {
    level = 'amber';
    levelLabel = 'No signups recorded yet';
  }

  const COLORS = {
    green: { bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.4)', text: '#4ade80' },
    amber: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.45)', text: '#f59e0b' },
    red: { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.5)', text: '#ef4444' },
  };
  const c = COLORS[level];

  function fmtTs(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
  }

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-discord-autojoin" className="section-title" style={{ marginBottom: 6 }}>
        🤝 Discord Auto-Join Health
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Outcomes of <code>bot.addUserToLeagueGuild</code> over the last 24 hours
        (in-memory ring buffer of the most recent {data?.buffer_capacity || 50} attempts —
        resets on bot restart). If new signups aren't landing in the Discord server,
        the most recent failure code and a remediation hint will show below.
      </p>

      {err && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)', fontSize: 13, color: '#fca5a5', marginBottom: 12 }}>
          Status check failed: {err}
        </div>
      )}

      {data && (
        <>
          <div style={{ padding: '10px 14px', borderRadius: 8, background: c.bg, border: `1px solid ${c.border}`, fontSize: 13, color: c.text, marginBottom: 12, fontWeight: 600 }}>
            ● {levelLabel} — {totalRecent} attempt{totalRecent === 1 ? '' : 's'} recorded in the last 24h
            ({successCount} success / {failureCount} failed)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }}>
            <StatPill label="Added (new member)" value={counts.success_added || 0} tone="ok" />
            <StatPill label="Already in guild" value={counts.success_already || 0} tone="ok" />
            <StatPill label="HTTP 403 (perms)" value={counts.http_403 || 0} tone={counts.http_403 ? 'bad' : 'muted'} />
            <StatPill label="HTTP 404 (not found)" value={counts.http_404 || 0} tone={counts.http_404 ? 'bad' : 'muted'} />
            <StatPill label="HTTP 429 (rate limit)" value={counts.http_429 || 0} tone={counts.http_429 ? 'bad' : 'muted'} />
            <StatPill label="HTTP 401 (token)" value={counts.http_401 || 0} tone={counts.http_401 ? 'bad' : 'muted'} />
            <StatPill label="Network errors" value={counts.network || 0} tone={counts.network ? 'bad' : 'muted'} />
            <StatPill label="Other failures" value={
              Object.entries(counts)
                .filter(([k]) => !k.startsWith('success_') && !['http_401','http_403','http_404','http_429','network'].includes(k))
                .reduce((s, [, v]) => s + v, 0)
            } tone="muted" />
          </div>

          {data.last_failure ? (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              <div style={{ color: '#fca5a5', fontWeight: 600, marginBottom: 4 }}>
                Last failure: <code>{data.last_failure.code}</code> at {fmtTs(data.last_failure.ts)}
                {data.last_failure.discordId && <> for user <code>{data.last_failure.discordId}</code></>}
              </div>
              <div>{data.last_failure.hint}</div>
              {data.last_failure.error && (
                <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                  Discord said: {data.last_failure.error}
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.25)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              No failures recorded in the current ring buffer.
            </div>
          )}

          <DiscordAutoJoinHistorySection
            history={history}
            err={historyErr}
            loading={historyLoading}
            offset={failuresOffset}
            pageSize={FAILURES_PAGE_SIZE}
            days={HISTORY_DAYS}
            onPage={setFailuresOffset}
            onRefresh={() => loadHistory(failuresOffset)}
            fmtTs={fmtTs}
          />

          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span><code>DISCORD_GUILD_ID</code>: {data.guild_configured ? '✓ set' : '✗ missing'}</span>
            <span><code>DISCORD_TOKEN</code>: {data.bot_token_configured ? '✓ set' : '✗ missing'}</span>
            <span><code>DISCORD_LEAGUE_MEMBER_ROLE_ID</code>: {data.league_role_configured ? '✓ set' : '— optional'}</span>
            <span><code>DISCORD_ADMIN_LOG_CHANNEL_ID</code>: {data.admin_log_channel_configured ? '✓ set' : '— alerts disabled'}</span>
            <button className="btn" onClick={load} disabled={loading} style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11 }}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// Task #142 — 7-day timeline + paginated failure list for the auto-join
// health panel. Renders per-day stacked success/failure bars (a poor-
// person's sparkline using divs) so admins can spot multi-day dips that
// the existing 24h rollup hides, plus a tabular drill-down of the failure
// rows behind those dips. All read-only.
function DiscordAutoJoinHistorySection({ history, err, loading, offset, pageSize, days, onPage, onRefresh, fmtTs }) {
  const buckets = history?.buckets || [];
  const failures = history?.failures || [];
  const total = history?.failures_total || 0;
  // Scale every bar against the busiest day so a quiet week isn't flattened.
  const maxCount = Math.max(
    1,
    ...buckets.map(b => (b.success || 0) + (b.failure || 0))
  );
  const dayLabel = (ms) => {
    if (!ms) return '';
    try {
      return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return ''; }
  };
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(total, offset + failures.length);
  const canPrev = offset > 0;
  const canNext = offset + failures.length < total;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
          Last {days} days — daily success vs failure
        </div>
        <button className="btn" onClick={onRefresh} disabled={loading} style={{ padding: '2px 8px', fontSize: 11 }}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {err && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)', fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>
          History load failed: {err}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, buckets.length)}, 1fr)`, gap: 6, alignItems: 'end', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', minHeight: 90, marginBottom: 12 }}>
        {buckets.length === 0 && !loading && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            No history yet.
          </div>
        )}
        {buckets.map((b) => {
          const successFrac = (b.success || 0) / maxCount;
          const failureFrac = (b.failure || 0) / maxCount;
          const total = (b.success || 0) + (b.failure || 0);
          return (
            <div key={b.day} title={`${dayLabel(b.day)} — ${b.success} success / ${b.failure} failure`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 60, width: '100%' }}>
                <div style={{ height: `${failureFrac * 100}%`, background: 'rgba(239,68,68,0.7)', borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
                <div style={{ height: `${successFrac * 100}%`, background: 'rgba(74,222,128,0.7)', borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dayLabel(b.day)}</div>
              <div style={{ fontSize: 10, color: total === 0 ? 'var(--text-muted)' : 'var(--text)', fontWeight: 600 }}>
                {total === 0 ? '—' : total}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
        Recent failures (last {days} days) — {total} total
      </div>
      {failures.length === 0 ? (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.25)', fontSize: 12, color: 'var(--text-muted)' }}>
          No failures in the last {days} days.
        </div>
      ) : (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-card)', textAlign: 'left' }}>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)' }}>When</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)' }}>Code</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)' }}>Discord ID</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)' }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f, i) => (
                <tr key={`${f.ts}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtTs(f.ts)}</td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}><code>{f.code}</code></td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontSize: 11 }}>
                    {/* Task #144 — show nickname (linked to profile) when the
                        discord_id resolves to a known player; fall back to the
                        raw ID so unlinked failures are still actionable. */}
                    {f.nickname && f.accountId ? (
                      <>
                        <a
                          href={`/player/${f.accountId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent)', fontWeight: 600 }}
                        >
                          {f.nickname}
                        </a>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: 6 }}>
                          ({f.discordId})
                        </span>
                      </>
                    ) : (
                      <span style={{ fontFamily: 'monospace' }}>{f.discordId || '—'}</span>
                    )}
                  </td>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-word' }}>{f.error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>Showing {showingFrom}–{showingTo} of {total}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" disabled={!canPrev || loading} onClick={() => onPage(Math.max(0, offset - pageSize))} style={{ padding: '2px 10px', fontSize: 11 }}>← Prev</button>
            <button className="btn" disabled={!canNext || loading} onClick={() => onPage(offset + pageSize)} style={{ padding: '2px 10px', fontSize: 11 }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, tone }) {
  const TONES = {
    ok: { color: '#4ade80', border: 'rgba(74,222,128,0.3)' },
    bad: { color: '#ef4444', border: 'rgba(239,68,68,0.4)' },
    muted: { color: 'var(--text-muted)', border: 'var(--border)' },
  };
  const t = TONES[tone] || TONES.muted;
  return (
    <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg-card)', border: `1px solid ${t.border}` }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: t.color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

// Task #113 — Stripe configuration banner.
// Sits at the top of the Site Settings tab so an admin notices immediately
// when STRIPE_SECRET_KEY is missing in the current environment, rather than
// finding out via a user report of "Payments are not configured" on the
// coaching apply CTA. Reads /api/admin/stripe-status (superuser-only).
function StripeStatusBanner({ superuserKey }) {
  const [status, setStatus] = React.useState(null);
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    if (!superuserKey) return;
    superuserFetch('/api/admin/stripe-status', { headers: { 'x-superuser-key': superuserKey } })
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setStatus(d); })
      .catch(e => setErr(e.message));
  }, [superuserKey]);

  if (err) {
    return (
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)', fontSize: 13, color: '#fca5a5' }}>
        Stripe status check failed: {err}
      </div>
    );
  }
  if (!status) return null;

  const flagOn = status.coaching_marketplace_state === 'on' || status.coaching_marketplace_state === 'preview';
  if (!status.configured && flagOn) {
    return (
      <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.5)', fontSize: 13, color: '#fecaca' }}>
        <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>⚠️ Stripe not configured</div>
        <code>STRIPE_SECRET_KEY</code> is missing on this environment, but the
        coaching marketplace flag is <code>{status.coaching_marketplace_state}</code>.
        Every coaching checkout / "Continue with Stripe" call will return
        <em> "Payments are not configured"</em> until the secret is set on the
        prod host (e.g. <code>~/Dota-Stats-Full/.env</code>) and PM2 is
        restarted.
      </div>
    );
  }
  if (!status.configured) {
    return (
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', fontSize: 12, color: 'var(--text-muted)' }}>
        ℹ️ <code>STRIPE_SECRET_KEY</code> is not set. Payments are disabled.
        The coaching marketplace flag is currently <code>off</code>, so no
        user-facing 503s will fire — but enabling the flag without setting the
        secret will break the apply / booking flow.
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.3)', fontSize: 12, color: 'var(--text-muted)' }}>
      ✓ Stripe configured ({status.webhook_configured ? 'webhook secret set' : 'webhook secret missing'}).
      Coaching marketplace flag: <code>{status.coaching_marketplace_state}</code>.
    </div>
  );
}

// v5.93 — Coaching Marketplace launch kill-switch.
// Surfaces the `coaching_marketplace` feature flag in the admin Config tab so
// it can be flipped between 'on' / 'preview' / 'off' without a DB shell if
// anything goes sideways post-launch. 'preview' = visible to superusers only.
function CoachingMarketplaceFlagPanel({ superuserKey }) {
  const [state, setState] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const load = React.useCallback(() => {
    if (!superuserKey) return;
    getAdminFeatureFlags(superuserKey)
      .then(d => {
        const row = (d.flags || []).find(f => f.key === 'coaching_marketplace');
        setState(row?.state || 'off');
      })
      .catch(e => setMsg('Load failed: ' + e.message));
  }, [superuserKey]);

  React.useEffect(() => { load(); }, [load]);

  async function handleSet(next) {
    if (next === state) return;
    setSaving(true);
    setMsg('');
    try {
      await setFeatureFlag({ key: 'coaching_marketplace', state: next }, superuserKey);
      setState(next);
      setMsg(`Saved — flag is now ${next}.`);
    } catch (e) {
      setMsg('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const OPTIONS = [
    { value: 'on', label: 'On', hint: 'Live for everyone' },
    { value: 'preview', label: 'Preview', hint: 'Superusers only' },
    { value: 'off', label: 'Off', hint: 'Hidden + routes 404' },
  ];

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-coaching-flag" className="section-title" style={{ marginBottom: 6 }}>
        🎓 Coaching Marketplace — feature flag
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Single switch for the <code>coaching_marketplace</code> flag. Use this to roll back to
        <code> preview</code> (superusers only) or <code>off</code> (hidden + every coaching API
        route returns 404) if the launch needs to be paused. Flipping back to <code>on</code>
        re-opens the marketplace immediately for all users.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {OPTIONS.map(opt => {
          const active = state === opt.value;
          return (
            <button
              key={opt.value}
              className="btn"
              disabled={saving || state === null}
              onClick={() => handleSet(opt.value)}
              title={opt.hint}
              style={{
                padding: '6px 14px',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                background: active ? 'rgba(245,158,11,0.15)' : 'var(--bg-card)',
                color: active ? 'var(--accent)' : 'var(--text-primary)',
                fontWeight: active ? 700 : 500,
              }}
            >
              {opt.label}
              <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                {opt.hint}
              </span>
            </button>
          );
        })}
        {msg && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{msg}</span>}
      </div>
    </section>
  );
}

// Task #446 — Discord Rich Presence admin control. Three-state flag toggle
// (on / preview / off) + status table of all users who connected.
function DiscordRichPresenceCard({ superuserKey }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [sortKey, setSortKey] = React.useState('last_published_at');
  const [sortDir, setSortDir] = React.useState('desc');

  const load = React.useCallback(() => {
    if (!superuserKey) return;
    setLoading(true);
    getAdminDiscordRichPresence(superuserKey)
      .then(d => { setData(d); setMsg(''); })
      .catch(e => setMsg('Load failed: ' + e.message))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  React.useEffect(() => { load(); }, [load]);

  async function handleSet(next) {
    if (next === data?.flag?.state) return;
    setSaving(true); setMsg('');
    try {
      await setFeatureFlag({ key: 'discord_rich_presence_enabled', state: next }, superuserKey);
      setMsg(`Saved — flag is now ${next}.`);
      await load();
    } catch (e) {
      setMsg('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function sort(k) {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'last_published_at' || k === 'connected_at' || k === 'publish_count' ? 'desc' : 'asc'); }
  }

  const rows = React.useMemo(() => {
    const arr = [...(data?.connections || [])];
    arr.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      const as = String(av); const bs = String(bv);
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const OPTIONS = [
    { value: 'on', label: 'On', hint: 'Pusher publishes for opted-in users' },
    { value: 'preview', label: 'Preview', hint: 'Connect UI live, publishing paused' },
    { value: 'off', label: 'Off', hint: 'Pusher idle (still records intent)' },
  ];
  const flagState = data?.flag?.state || 'off';
  const stats = data?.stats || {};
  const worker = data?.worker || null;

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-discord-rpc" className="section-title" style={{ marginBottom: 6 }}>
        🎮 Discord Rich Presence — feature flag
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Mirrors each user's site presence (queue / lobby / match) to their Discord profile.
        Per-user opt-in lives on <code>/settings/account</code>. This flag is the global kill-switch:
        when <code>off</code> the pusher worker still records what it <em>would</em> publish so this
        table stays useful, but never calls Discord. Default is <code>off</code> for the staged rollout.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {OPTIONS.map(opt => {
          const active = flagState === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className="btn"
              disabled={saving || loading}
              onClick={() => handleSet(opt.value)}
              aria-pressed={active}
              aria-label={`Set Discord Rich Presence flag to ${opt.label}`}
              title={opt.hint}
              style={{
                padding: '6px 14px',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                background: active ? 'rgba(245,158,11,0.15)' : 'var(--bg-card)',
                color: active ? 'var(--accent)' : 'var(--text-primary)',
                fontWeight: active ? 700 : 500,
              }}
            >
              {opt.label}
              <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                {opt.hint}
              </span>
            </button>
          );
        })}
        {msg && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{msg}</span>}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
        <span>Connected: <strong style={{ color: 'var(--text-primary)' }}>{stats.total ?? '—'}</strong></span>
        <span>Opted-in: <strong style={{ color: 'var(--text-primary)' }}>{stats.opted_in ?? '—'}</strong></span>
        <span>Published 24h: <strong style={{ color: 'var(--text-primary)' }}>{stats.published_24h ?? '—'}</strong></span>
        <span>Total publishes: <strong style={{ color: 'var(--text-primary)' }}>{stats.publish_count_total ?? '—'}</strong></span>
        {worker && (
          <span>
            Worker: <strong style={{ color: 'var(--text-primary)' }}>
              {worker.started ? 'running' : 'idle'}
            </strong>
            {' '}· tick {Math.round(worker.tick_ms / 1000)}s
            {!worker.app_id_configured && ' · ⚠ DISCORD_CLIENT_ID unset'}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No users have connected Rich Presence yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <SortableTh onSort={() => sort('display_name')} active={sortKey === 'display_name'} direction={sortDir}>Player</SortableTh>
                <SortableTh onSort={() => sort('discord_id')} active={sortKey === 'discord_id'} direction={sortDir}>Discord ID</SortableTh>
                <SortableTh onSort={() => sort('opted_in')} active={sortKey === 'opted_in'} direction={sortDir}>Opted in</SortableTh>
                <SortableTh onSort={() => sort('last_state')} active={sortKey === 'last_state'} direction={sortDir}>Last state</SortableTh>
                <SortableTh onSort={() => sort('last_published_at')} active={sortKey === 'last_published_at'} direction={sortDir}>Last published</SortableTh>
                <SortableTh onSort={() => sort('publish_count')} active={sortKey === 'publish_count'} direction={sortDir} style={{ textAlign: 'right' }}>Publishes</SortableTh>
                <SortableTh onSort={() => sort('connected_at')} active={sortKey === 'connected_at'} direction={sortDir}>Connected</SortableTh>
                <SortableTh onSort={() => sort('last_error')} active={sortKey === 'last_error'} direction={sortDir}>Last error</SortableTh>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.account_id}>
                  <td>{r.display_name || <span style={{ color: 'var(--text-muted)' }}>#{r.account_id}</span>}</td>
                  <td><code style={{ fontSize: 11 }}>{r.discord_id}</code></td>
                  <td>{r.opted_in ? '✓' : '—'}</td>
                  <td>{r.last_state || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{r.last_published_at ? new Date(r.last_published_at).toLocaleString() : <span style={{ color: 'var(--text-muted)' }}>never</span>}</td>
                  <td style={{ textAlign: 'right' }}>{r.publish_count || 0}</td>
                  <td>{r.connected_at ? new Date(r.connected_at).toLocaleString() : '—'}</td>
                  <td style={{ color: r.last_error && r.last_error !== 'flag_off' ? 'var(--amber)' : 'var(--text-muted)', fontSize: 12 }}>
                    {r.last_error || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Task #312 — Superuser-only dev shortcut for testing the coaching marketplace
// without going through Stripe Connect Express KYC. Hits the
// /api/admin/coaching/promote-test-coach route which inserts a synthetic
// `acct_test_…` Stripe account id and flips the coach row to status='active',
// so /coaches/listing + /coach/edit + /coach/<id> all work. Bookings will
// fail at Stripe Checkout creation (the synthetic account doesn't exist on
// Stripe's side) — see replit.md → "Test coach end-to-end" for the test-mode
// swap that makes booking checkout succeed.
function TestCoachPanel({ superuserKey }) {
  const [accountId, setAccountId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [err, setErr] = React.useState('');

  async function promote() {
    setBusy(true); setErr(''); setResult(null);
    try {
      const r = await fetch('/api/admin/coaching/promote-test-coach', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ account_id: accountId ? parseInt(accountId, 10) : undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
    } catch (e) {
      setErr(e.message || 'Promote failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-test-coach" className="section-title" style={{ marginBottom: 6 }}>
        🧪 Test: Promote to Coach (skip Stripe Connect)
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Creates an <code>active</code> coach row for the given account (or your own if blank) with a
        synthetic <code>acct_test_…</code> Stripe id, bypassing Connect Express KYC. The profile editor,
        availability, public profile, and <code>/coaches</code> listing all work; bookings will fail at
        Stripe Checkout because the fake account doesn&rsquo;t exist on Stripe&rsquo;s side. For full
        booking end-to-end, see <em>replit.md → Test coach end-to-end</em>.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 13 }}>
          account_id (optional):
          <input
            value={accountId}
            onChange={e => setAccountId(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="leave blank to use your own"
            style={{ marginLeft: 8, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', width: 200 }}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={promote}
          style={{ padding: '6px 14px' }}
        >
          {busy ? 'Promoting…' : 'Promote to coach'}
        </button>
      </div>
      {err ? (
        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: '#3a1414', color: '#fca5a5', border: '1px solid #b91c1c55', fontSize: 13 }}>{err}</div>
      ) : null}
      {result ? (
        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid #16a34a55', fontSize: 13 }}>
          <strong>✓ Promoted</strong> — coach #{result.coach?.account_id} now <code>active</code> (synthetic id <code>{result.coach?.stripe_account_id}</code>).
          <ol style={{ marginTop: 6, marginBottom: 0, paddingLeft: 20 }}>
            {(result.next_steps || []).map((s, i) => <li key={i} style={{ marginTop: 4 }}>{s}</li>)}
          </ol>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link
              to="/coach/edit"
              className="btn"
              style={{ padding: '6px 12px', textDecoration: 'none', fontSize: 13 }}
            >
              → Open coach editor
            </Link>
            <Link
              to={`/coaches/${result.coach?.account_id}`}
              className="btn"
              style={{ padding: '6px 12px', textDecoration: 'none', fontSize: 13, background: 'transparent', border: '1px solid var(--border)' }}
            >
              View public profile
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Task #440 — Community challenges admin (full edition only).
function CommunityChallengesPanel({ superuserKey }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [editing, setEditing] = React.useState(null); // null | 'new' | {row}

  const load = React.useCallback(() => {
    if (!superuserKey) return;
    setLoading(true);
    adminListCommunityChallenges(superuserKey)
      .then(d => setRows(d.challenges || []))
      .catch(e => setMsg('Load failed: ' + e.message))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  React.useEffect(() => { load(); }, [load]);

  function startNew() {
    const now = new Date();
    const end = new Date(Date.now() + 7 * 86400000);
    setEditing({
      id: null,
      title: '',
      description: '',
      prize_text: '',
      starts_at: now.toISOString().slice(0, 16),
      ends_at: end.toISOString().slice(0, 16),
      is_active: true,
      scoring: JSON.stringify({ metric: 'kills', agg: 'sum' }, null, 2),
    });
  }

  function startEdit(row) {
    setEditing({
      id: row.id,
      title: row.title || '',
      description: row.description || '',
      prize_text: row.prize_text || '',
      starts_at: row.starts_at ? new Date(row.starts_at).toISOString().slice(0, 16) : '',
      ends_at: row.ends_at ? new Date(row.ends_at).toISOString().slice(0, 16) : '',
      is_active: !!row.is_active,
      scoring: JSON.stringify(row.scoring || {}, null, 2),
    });
  }

  async function save() {
    if (!editing) return;
    let scoringObj;
    try { scoringObj = JSON.parse(editing.scoring); }
    catch (e) { setMsg('Scoring JSON invalid: ' + e.message); return; }
    const payload = {
      title: editing.title,
      description: editing.description,
      prize_text: editing.prize_text || null,
      starts_at: editing.starts_at,
      ends_at: editing.ends_at,
      is_active: editing.is_active,
      scoring: scoringObj,
    };
    try {
      if (editing.id) await adminUpdateCommunityChallenge(superuserKey, editing.id, payload);
      else await adminCreateCommunityChallenge(superuserKey, payload);
      setMsg('Saved.');
      setEditing(null);
      load();
    } catch (e) {
      setMsg('Save failed: ' + e.message);
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete "${row.title}"? This also removes its scoreboard.`)) return;
    try {
      await adminDeleteCommunityChallenge(superuserKey, row.id);
      load();
    } catch (e) { setMsg('Delete failed: ' + e.message); }
  }

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>🎯 Community Challenges</h2>
        <button type="button" className="btn btn-primary" onClick={startNew}>+ New challenge</button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
        Time-boxed leaderboards scored from match data. Scoring DSL:
        <code style={{ marginLeft: 6 }}>{'{ "metric": "kills|wins|matches|perf|kda|deaths|assists|gpm|xpm|last_hits|hero_damage|tower_damage|hero_healing", "agg": "sum|max|count", "filter": { "team"?: "radiant|dire", "position"?: [1..5], "won"?: true } }'}</code>
      </p>
      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>{msg}</div>}

      {loading ? <div>Loading…</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 8px' }}>Title</th>
              <th style={{ padding: '6px 8px' }}>Window</th>
              <th style={{ padding: '6px 8px' }}>Active</th>
              <th style={{ padding: '6px 8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 12, color: 'var(--text-muted)' }}>No challenges yet.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px' }}>
                  <strong>{r.title}</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.description}</div>
                </td>
                <td style={{ padding: '8px', fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(r.starts_at).toLocaleDateString()} → {new Date(r.ends_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '8px' }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: r.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)',
                    color: r.is_active ? '#22c55e' : 'var(--text-muted)',
                  }}>{r.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                <td style={{ padding: '8px', display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-small" onClick={() => startEdit(r)} aria-label={`Edit ${r.title}`}>Edit</button>
                  <button type="button" className="btn btn-small" onClick={() => remove(r)} aria-label={`Delete ${r.title}`}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div style={{
          marginTop: 16, padding: 16, border: '1px solid var(--border)',
          borderRadius: 10, background: 'var(--bg-card)',
        }}>
          <h3 style={{ marginTop: 0 }}>{editing.id ? 'Edit challenge' : 'New challenge'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', fontSize: 12 }}>
              Title
              <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
            </label>
            <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', fontSize: 12 }}>
              Description
              <textarea rows={2} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
              Starts at
              <input type="datetime-local" value={editing.starts_at} onChange={e => setEditing({ ...editing, starts_at: e.target.value })} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
              Ends at
              <input type="datetime-local" value={editing.ends_at} onChange={e => setEditing({ ...editing, ends_at: e.target.value })} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
              Prize text (optional)
              <input value={editing.prize_text} onChange={e => setEditing({ ...editing, prize_text: e.target.value })} placeholder="e.g. 1 month Pro for the winner" />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, alignSelf: 'end' }}>
              <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
              Active (visible on Home + scored)
            </label>
            <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', fontSize: 12 }}>
              Scoring DSL (JSON)
              <textarea
                rows={8}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
                value={editing.scoring}
                onChange={e => setEditing({ ...editing, scoring: e.target.value })}
              />
            </label>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={save}>Save</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Feature Flags Editor ──────────────────────────────────────────────────
// Generic editor for all feature flags in the DB. Shows every flag returned
// by GET /api/admin/feature-flags with a three-state toggle (on/preview/off)
// and lets the operator change any of them without a DB shell.
function FeatureFlagsEditorCard({ superuserKey }) {
  const [flags, setFlags] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(null);
  const [msg, setMsg] = React.useState('');
  const [newKey, setNewKey] = React.useState('');
  const [newDesc, setNewDesc] = React.useState('');
  const [newState, setNewState] = React.useState('off');
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(() => {
    if (!superuserKey) return;
    setLoading(true); setMsg('');
    getAdminFeatureFlags(superuserKey)
      .then(d => setFlags(d.flags || []))
      .catch(e => setMsg('Load failed: ' + e.message))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  React.useEffect(() => { load(); }, [load]);

  async function handleSet(key, state) {
    setSaving(key); setMsg('');
    try {
      await setFeatureFlag({ key, state }, superuserKey);
      setMsg(`✓ ${key} → ${state}`);
      load();
    } catch (e) {
      setMsg('Save failed: ' + e.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleCreate() {
    if (!newKey.trim()) return;
    setCreating(true); setMsg('');
    try {
      await setFeatureFlag({ key: newKey.trim(), state: newState, description: newDesc.trim() || undefined }, superuserKey);
      setMsg(`✓ Created ${newKey.trim()} (${newState})`);
      setNewKey(''); setNewDesc(''); setNewState('off');
      load();
    } catch (e) {
      setMsg('Create failed: ' + e.message);
    } finally {
      setCreating(false);
    }
  }

  const STATES = [
    { value: 'on', label: 'On', color: '#22c55e' },
    { value: 'preview', label: 'Preview', color: '#f59e0b' },
    { value: 'off', label: 'Off', color: '#6b7280' },
  ];

  const inp = {
    padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg-input, var(--bg-card))', color: 'var(--text-primary)',
    fontSize: 13,
  };

  return (
    <section className="admin-section" style={{ marginTop: 32 }} aria-labelledby="ap-anchor-feature-flags">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <h2 id="ap-anchor-feature-flags" className="section-title" style={{ margin: 0 }}>
          🚦 Feature Flags
        </h2>
        <button type="button" className="btn" style={{ fontSize: 12, padding: '3px 10px' }}
          onClick={load} disabled={loading} aria-label="Refresh feature flags">
          {loading ? '…' : '↻'}
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        All runtime feature flags. <strong>On</strong> = everyone; <strong>Preview</strong> = superusers only;
        <strong> Off</strong> = hidden + routes 404. Changes take effect immediately, no restart needed.
      </p>
      {msg && <div role="status" style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>{msg}</div>}

      {flags && flags.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th align="left" style={{ padding: '6px 10px' }}>Key</th>
                <th align="left" style={{ padding: '6px 10px' }}>Description</th>
                <th align="center" style={{ padding: '6px 10px' }}>State</th>
                <th align="left" style={{ padding: '6px 10px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {flags.map(f => (
                <tr key={f.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12 }}>{f.key}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 12 }}>{f.description || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      background: f.state === 'on' ? 'rgba(34,197,94,0.15)' : f.state === 'preview' ? 'rgba(245,158,11,0.15)' : 'rgba(107,114,128,0.15)',
                      color: f.state === 'on' ? '#22c55e' : f.state === 'preview' ? '#f59e0b' : '#9ca3af',
                    }}>{f.state || 'off'}</span>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {STATES.map(s => (
                        <button
                          key={s.value}
                          type="button"
                          disabled={saving === f.key || f.state === s.value}
                          onClick={() => handleSet(f.key, s.value)}
                          aria-label={`Set ${f.key} to ${s.label}`}
                          style={{
                            padding: '3px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                            border: `1px solid ${f.state === s.value ? s.color : 'var(--border)'}`,
                            background: f.state === s.value ? `${s.color}22` : 'transparent',
                            color: f.state === s.value ? s.color : 'var(--text-muted)',
                            opacity: saving === f.key ? 0.5 : 1,
                            fontWeight: f.state === s.value ? 700 : 400,
                          }}
                        >
                          {saving === f.key && f.state !== s.value ? '…' : s.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {flags && flags.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No flags in DB yet. Create one below.</p>
      )}

      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', userSelect: 'none' }}>
          + Create new flag
        </summary>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="ap-ff-key" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Key</label>
            <input id="ap-ff-key" type="text" value={newKey} onChange={e => setNewKey(e.target.value)}
              placeholder="my_feature_key" aria-label="New feature flag key" style={{ ...inp, width: 200 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="ap-ff-desc" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Description</label>
            <input id="ap-ff-desc" type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="What this flag gates" aria-label="New feature flag description" style={{ ...inp, width: 240 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="ap-ff-state" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Initial state</label>
            <select id="ap-ff-state" value={newState} onChange={e => setNewState(e.target.value)} style={inp}>
              <option value="off">Off</option>
              <option value="preview">Preview</option>
              <option value="on">On</option>
            </select>
          </div>
          <button type="button" className="btn" disabled={!newKey.trim() || creating}
            onClick={handleCreate} style={{ alignSelf: 'flex-end' }}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </details>
    </section>
  );
}

// ── Live Ops Log Viewer ───────────────────────────────────────────────────
// Surfaces the in-memory ops log ring buffer from GET /api/admin/ops/logs.
// Lets the operator filter by source and refresh on demand.
function OpsLogsCard({ superuserKey }) {
  const [logs, setLogs] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [source, setSource] = React.useState('');
  const [error, setError] = React.useState('');

  const load = React.useCallback(() => {
    if (!superuserKey) return;
    setLoading(true); setError('');
    getAdminOpsLogs(superuserKey, source.trim() || undefined)
      .then(d => setLogs(d.logs || []))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [superuserKey, source]);

  function fmtTs(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ts; }
  }

  const levelColor = (l) => {
    if (!l) return 'var(--text-muted)';
    const s = l.toLowerCase();
    if (s === 'error') return '#ef4444';
    if (s === 'warn') return '#f59e0b';
    if (s === 'info') return '#3b82f6';
    return 'var(--text-muted)';
  };

  return (
    <section className="admin-section" style={{ marginTop: 32 }} aria-labelledby="ap-anchor-ops-logs">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 id="ap-anchor-ops-logs" className="section-title" style={{ margin: 0 }}>
          📋 Live Ops Log Buffer
        </h2>
        <input
          type="text"
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder="Filter by source…"
          aria-label="Filter ops logs by source"
          style={{
            padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-input, var(--bg-card))', color: 'var(--text-primary)',
            fontSize: 12, width: 180,
          }}
        />
        <button type="button" className="btn" style={{ fontSize: 12, padding: '4px 12px' }}
          onClick={load} disabled={loading}>
          {loading ? 'Loading…' : logs === null ? 'Load' : 'Refresh'}
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
        In-memory ring buffer (5 000-entry cap). Most-recent entries shown last. Filter by <code>source</code>
        to narrow to a specific subsystem (e.g. <code>parser</code>, <code>stripe</code>, <code>push</code>).
      </p>
      {error && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {logs !== null && (
        logs.length === 0
          ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No logs in buffer{source ? ` matching source "${source}"` : ''}.</p>
          : (
            <div style={{
              maxHeight: 360, overflowY: 'auto', overflowX: 'auto',
              background: 'rgba(0,0,0,0.25)', borderRadius: 8, border: '1px solid var(--border)',
              padding: '8px 0', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
            }}>
              {logs.slice(-200).map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '1px 10px', borderBottom: i < logs.slice(-200).length - 1 ? '1px solid rgba(255,255,255,0.03)' : 0 }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0, minWidth: 70 }}>{fmtTs(l.ts)}</span>
                  <span style={{ color: levelColor(l.level), flexShrink: 0, minWidth: 40 }}>{(l.level || '').toUpperCase()}</span>
                  {l.source && <span style={{ color: '#a78bfa', flexShrink: 0 }}>[{l.source}]</span>}
                  <span style={{ color: 'var(--text-primary)' }}>{l.msg || l.message || JSON.stringify(l)}</span>
                </div>
              ))}
            </div>
          )
      )}
      {logs !== null && logs.length > 200 && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Showing last 200 of {logs.length} entries. Filter by source to narrow the view.
        </p>
      )}
    </section>
  );
}

// ── Shared ops-history series extraction ──────────────────────────────────
// Walks the raw GET /api/admin/ops/history sample array (shape defined by
// readHistory in src/web/opsState.js) and produces one value array per metric.
// Cumulative counters (provisioner success/failure totals) are converted to
// per-sample deltas; a counter reset (process restart) clamps to 0 so a restart
// doesn't render as a misleading negative spike. Used by both the Overview
// "Ops Sparklines" card and the Config-tab "Ops History" card so they can't
// drift apart.
function buildOpsSeries(samples) {
  const empty = {
    http5xx: [], parserDur: [], parserQueue: [], stripeLag: [],
    provInFlight: [], provSucc: [], provFail: [], discordLatency: [], pushSubs: [],
  };
  if (!samples || !samples.length) return empty;
  const out = { ...empty };
  let prevSucc = null;
  let prevFail = null;
  for (const s of samples) {
    out.http5xx.push(s.http5xx);
    out.parserDur.push(s.parserLastDurationMs);
    out.parserQueue.push(s.parserQueueDepth);
    out.stripeLag.push(s.stripeMaxLagMs);
    out.provInFlight.push(s.provisionerInFlight);
    out.discordLatency.push(s.discordGatewayLatencyMs);
    out.pushSubs.push(s.pushSubscriptionCount);
    out.provSucc.push(prevSucc == null || s.provisionerSuccessTotal < prevSucc ? 0 : s.provisionerSuccessTotal - prevSucc);
    out.provFail.push(prevFail == null || s.provisionerFailureTotal < prevFail ? 0 : s.provisionerFailureTotal - prevFail);
    prevSucc = s.provisionerSuccessTotal;
    prevFail = s.provisionerFailureTotal;
  }
  return out;
}

function buildOpsMetrics(series) {
  return [
    { key: 'http5xx', title: 'HTTP 5xx (60m)', values: series.http5xx, color: '#f08a8a' },
    { key: 'parserDur', title: 'Parser last parse (ms)', values: series.parserDur },
    { key: 'parserQueue', title: 'Parser queue depth', values: series.parserQueue },
    { key: 'provSucc', title: 'Provisions ok /min', values: series.provSucc, color: '#6dd58c' },
    { key: 'provFail', title: 'Provisions failed /min', values: series.provFail, color: '#f08a8a' },
    { key: 'provInFlight', title: 'Provisions in-flight', values: series.provInFlight },
    { key: 'stripeLag', title: 'Stripe webhook lag (ms)', values: series.stripeLag },
    { key: 'discordLatency', title: 'Discord latency (ms)', values: series.discordLatency },
    { key: 'pushSubs', title: 'Push subscriptions', values: series.pushSubs },
  ];
}

function opsWindowLabel(hours) {
  return hours < 24 ? `${hours} hours` : hours === 24 ? '24 hours' : '7 days';
}

// ── Ops History (Config tab) ──────────────────────────────────────────────
// Config-tab view of the same persisted 1-minute telemetry samples from
// GET /api/admin/ops/history. Renders accurate per-metric sparklines by reusing
// buildOpsSeries / buildOpsMetrics / MiniSparkline — the same extraction the
// Overview "Ops Sparklines" card uses — so the two never disagree.
function OpsHistoryCard({ superuserKey }) {
  const [samples, setSamples] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [hours, setHours] = React.useState(24);
  const [error, setError] = React.useState('');

  const load = React.useCallback(() => {
    if (!superuserKey) return;
    setLoading(true); setError('');
    getAdminOpsHistory(superuserKey, hours)
      .then(d => setSamples(d.samples || []))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [superuserKey, hours]);

  const series = React.useMemo(() => buildOpsSeries(samples), [samples]);
  const METRICS = buildOpsMetrics(series);

  const HOUR_OPTIONS = [1, 6, 24, 168];

  return (
    <section className="admin-section" style={{ marginTop: 32 }} aria-labelledby="ap-anchor-ops-history">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 id="ap-anchor-ops-history" className="section-title" style={{ margin: 0 }}>
          📈 Ops History
        </h2>
        <div role="group" aria-label="Time window for ops history" style={{ display: 'flex', gap: 4 }}>
          {HOUR_OPTIONS.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(h)}
              aria-pressed={hours === h}
              style={{
                padding: '3px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                border: `1px solid ${hours === h ? 'var(--accent)' : 'var(--border)'}`,
                background: hours === h ? 'rgba(197,169,117,0.15)' : 'transparent',
                color: hours === h ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: hours === h ? 700 : 400,
              }}
            >
              {h < 24 ? `${h}h` : h === 24 ? '24h' : '7d'}
            </button>
          ))}
        </div>
        <button type="button" className="btn" style={{ fontSize: 12, padding: '4px 12px' }}
          onClick={load} disabled={loading}>
          {loading ? 'Loading…' : samples === null ? 'Load' : 'Refresh'}
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
        Persisted 1-minute telemetry samples. Use this to spot sustained error spikes or throughput
        drops across the selected time window.
      </p>
      {error && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {samples !== null && samples.length === 0 && !error && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          No telemetry samples in the selected window yet — the server records one sample per minute.
        </p>
      )}
      {samples !== null && samples.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {METRICS.map(m => (
            <div key={m.key} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 12px',
            }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>
                {m.title}
              </div>
              <MiniSparkline values={m.values} color={m.color} label={`${m.title} trend over last ${opsWindowLabel(hours)}`} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Ops Sparklines (Overview tab) ─────────────────────────────────────────
// Compact at-a-glance health card for the Overview tab. Pulls the persisted
// 1-minute telemetry samples from GET /api/admin/ops/history and renders one
// inline SVG line chart per metric so an operator can spot error spikes /
// throughput drops without opening the full /admin/ops dashboard or the raw
// log buffer. Self-contained (no charting lib): the sparkline is a single
// normalised <path>. Supports a 1h/6h/24h/7d window selector, a manual
// refresh button, and a configurable auto-refresh interval.
function MiniSparkline({ values, color = 'var(--brass, #c5a975)', height = 30, label }) {
  const defined = values.filter(v => v != null && Number.isFinite(v));
  if (defined.length < 2) {
    return (
      <div style={{ marginTop: 6, height: height + 12, color: 'var(--text-muted)', fontSize: 11, display: 'flex', alignItems: 'center' }}>
        collecting…
      </div>
    );
  }
  const min = Math.min(...defined);
  const max = Math.max(...defined);
  const span = max - min || 1;
  const w = 240;
  const h = height;
  const n = values.length;
  let path = '';
  let started = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return;
    const x = n === 1 ? 0 : (i / (n - 1)) * w;
    const y = h - ((v - min) / span) * h;
    path += `${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    started = true;
  });
  const last = defined[defined.length - 1];
  return (
    <div style={{ marginTop: 6 }} aria-label={label}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block' }} aria-hidden="true">
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
        <span>min {Math.round(min)}</span>
        <span>max {Math.round(max)}</span>
        <span>now {Math.round(last)}</span>
      </div>
    </div>
  );
}

function OpsSparklinesCard({ superuserKey }) {
  const [samples, setSamples] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [hours, setHours] = React.useState(24);
  const [autoMs, setAutoMs] = React.useState(60000);
  const [error, setError] = React.useState('');
  const [lastLoaded, setLastLoaded] = React.useState(null);

  const load = React.useCallback(() => {
    if (!superuserKey) return;
    setLoading(true); setError('');
    getAdminOpsHistory(superuserKey, hours)
      .then(d => { setSamples(d.samples || []); setLastLoaded(Date.now()); })
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [superuserKey, hours]);

  // Initial load + reload whenever the window changes.
  React.useEffect(() => { load(); }, [load]);

  // Configurable auto-refresh. 0 disables.
  React.useEffect(() => {
    if (!autoMs || !superuserKey) return undefined;
    const t = setInterval(load, autoMs);
    return () => clearInterval(t);
  }, [autoMs, load, superuserKey]);

  // Walk the sample array once, building one value array per metric.
  // Cumulative counters (provisioner success/failure totals) are converted
  // to per-sample deltas; a counter reset (process restart) clamps to 0 so a
  // restart doesn't render as a misleading negative spike.
  const series = React.useMemo(() => buildOpsSeries(samples), [samples]);

  const METRICS = buildOpsMetrics(series);

  const HOUR_OPTIONS = [1, 6, 24, 168];
  const AUTO_OPTIONS = [
    { ms: 0, label: 'Off' },
    { ms: 10000, label: '10s' },
    { ms: 30000, label: '30s' },
    { ms: 60000, label: '60s' },
  ];

  return (
    <section style={{ marginBottom: 36 }} aria-labelledby="ap-ops-sparklines-h">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 id="ap-ops-sparklines-h" style={{ margin: 0, fontSize: '1.05rem' }}>📈 Ops Sparklines</h2>
        <div role="group" aria-label="Time window for ops sparklines" style={{ display: 'flex', gap: 4 }}>
          {HOUR_OPTIONS.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(h)}
              aria-pressed={hours === h}
              style={{
                padding: '3px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                border: `1px solid ${hours === h ? 'var(--accent)' : 'var(--border)'}`,
                background: hours === h ? 'rgba(197,169,117,0.15)' : 'transparent',
                color: hours === h ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: hours === h ? 700 : 400,
              }}
            >
              {h < 24 ? `${h}h` : h === 24 ? '24h' : '7d'}
            </button>
          ))}
        </div>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Auto-refresh:
          <select
            value={autoMs}
            onChange={e => setAutoMs(Number(e.target.value))}
            aria-label="Auto-refresh interval for ops sparklines"
            style={{ fontSize: 12, padding: '2px 6px' }}
          >
            {AUTO_OPTIONS.map(o => <option key={o.ms} value={o.ms}>{o.label}</option>)}
          </select>
        </label>
        <button type="button" className="btn" style={{ fontSize: 12, padding: '4px 12px' }}
          onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        {lastLoaded && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            updated {new Date(lastLoaded).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>
      {error && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {samples !== null && samples.length === 0 && !error && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          No telemetry samples in the selected window yet — the server records one sample per minute.
        </p>
      )}
      {samples !== null && samples.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {METRICS.map(m => (
            <div key={m.key} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 12px',
            }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>
                {m.title}
              </div>
              <MiniSparkline values={m.values} color={m.color} label={`${m.title} trend over last ${hours < 24 ? `${hours} hours` : hours === 24 ? '24 hours' : '7 days'}`} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── V3 Modifier History Debug ─────────────────────────────────────────────
// Lets a superuser look up any player's per-match V3 PERF modifier history
// for debugging rating anomalies. Uses the existing public (unauthenticated)
// endpoint — wrapped here in an admin UI to make it easy to reach without a
// DB shell or manual curl.
function V3ModifierDebugCard() {
  const [accountId, setAccountId] = React.useState('');
  const [history, setHistory] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  async function handleLookup() {
    const id = accountId.trim();
    if (!id) return;
    setLoading(true); setError(''); setHistory(null);
    try {
      const d = await getPlayerV3ModifierHistory(id);
      setHistory(d.history || []);
    } catch (e) {
      setError(e.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ts; }
  }

  const signColor = v => (v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : 'var(--text-muted)');

  return (
    <section className="admin-section" style={{ marginTop: 32 }} aria-labelledby="ap-anchor-v3-debug">
      <h2 id="ap-anchor-v3-debug" className="section-title" style={{ marginBottom: 8 }}>
        🔬 V3 Modifier History (Rating Debug)
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Per-match TrueSkill V3 PERF modifier history for any player. Enter a Steam account ID to inspect
        the raw modifier values used to update that player&rsquo;s µ/σ each game — useful for diagnosing
        unexpected rating swings or calibration outliers.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="ap-v3-account-id" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Steam account ID</label>
          <input
            id="ap-v3-account-id"
            type="text"
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
            placeholder="e.g. 123456789"
            aria-label="Steam account ID for V3 modifier history lookup"
            style={{
              padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-input, var(--bg-card))', color: 'var(--text-primary)',
              fontSize: 13, width: 200,
            }}
          />
        </div>
        <button type="button" className="btn" disabled={!accountId.trim() || loading} onClick={handleLookup}>
          {loading ? 'Loading…' : 'Look up'}
        </button>
      </div>
      {error && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {history !== null && history.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No V3 modifier records found for account {accountId}.</p>
      )}
      {history !== null && history.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th align="left" style={{ padding: '6px 8px' }}>Match</th>
                <th align="left" style={{ padding: '6px 8px' }}>Date</th>
                <th align="right" style={{ padding: '6px 8px' }}>Modifier</th>
                <th align="right" style={{ padding: '6px 8px' }}>µ before</th>
                <th align="right" style={{ padding: '6px 8px' }}>µ after</th>
                <th align="right" style={{ padding: '6px 8px' }}>σ before</th>
                <th align="right" style={{ padding: '6px 8px' }}>σ after</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 100).map((h, i) => {
                const mod = h.modifier ?? h.perf_modifier ?? null;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                      <a href={`/match/${h.match_id}`} target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--accent)' }}>{h.match_id}</a>
                    </td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{fmtDate(h.created_at || h.match_date)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: mod != null ? signColor(mod) : 'var(--text-muted)' }}>
                      {mod != null ? (mod > 0 ? `+${Number(mod).toFixed(3)}` : Number(mod).toFixed(3)) : '—'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{h.mu_before != null ? Number(h.mu_before).toFixed(2) : '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{h.mu_after != null ? Number(h.mu_after).toFixed(2) : '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{h.sigma_before != null ? Number(h.sigma_before).toFixed(2) : '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{h.sigma_after != null ? Number(h.sigma_after).toFixed(2) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {history.length > 100 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Showing first 100 of {history.length} records.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ── Lootbox Seasonal-Set Management ──────────────────────────────────────
// Lists all lootbox sets and lets the operator retire or un-retire each one.
// Retired sets stop appearing in drop pools and the published odds; anything
// already owned by players stays in their collection.
function LootboxSetsCard({ superuserKey }) {
  const [sets, setSets] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const [msg, setMsg] = React.useState('');
  const [error, setError] = React.useState('');

  // Create-set form state.
  const [showCreate, setShowCreate] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newDesc, setNewDesc] = React.useState('');
  const [pickedSkus, setPickedSkus] = React.useState(() => new Set());
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(() => {
    if (!superuserKey) return;
    setLoading(true); setError(''); setMsg('');
    getLootboxAdminSets(superuserKey)
      .then(d => { setSets(d.sets || []); setItems(d.items || []); })
      .catch(e => setError(e.message || 'Failed to load sets'))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  function toggleSku(sku) {
    setPickedSkus(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }

  function resetCreate() {
    setNewName(''); setNewDesc(''); setPickedSkus(new Set()); setShowCreate(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || pickedSkus.size === 0) {
      setError('Give the set a name and pick at least one item.');
      return;
    }
    setCreating(true); setMsg(''); setError('');
    try {
      const d = await createLootboxSet(superuserKey, {
        name: newName.trim(),
        description: newDesc.trim(),
        itemSkus: Array.from(pickedSkus),
      });
      setMsg(`✓ Created set "${d.set?.name || newName.trim()}" (${pickedSkus.size} item${pickedSkus.size === 1 ? '' : 's'}).`);
      if (d.sets) setSets(d.sets);
      resetCreate();
    } catch (err) {
      setError(`Create failed: ${err.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleRetire(setId, retire) {
    const label = retire ? 'retire' : 'un-retire';
    if (!window.confirm(`${retire ? 'Retire' : 'Un-retire'} set "${setId}"?\n\n${retire ? 'Retired sets stop dropping. Owned items are unaffected.' : 'This set will resume dropping from boxes.'}`)) return;
    setBusy(setId); setMsg(''); setError('');
    try {
      const d = await retireLootboxSet(superuserKey, setId, retire);
      setMsg(`✓ ${label}d "${setId}".`);
      setSets(d.sets || sets);
    } catch (e) {
      setError(`${label} failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  const fmtDate = s => { try { return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s; } };

  return (
    <section style={{ marginBottom: 36 }} aria-labelledby="ap-anchor-lootbox-sets">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 id="ap-anchor-lootbox-sets" style={{ margin: 0 }}>📦 Lootbox Sets</h2>
        <button type="button" className="btn" style={{ fontSize: 12, padding: '3px 10px' }}
          onClick={load} disabled={loading} aria-label="Refresh lootbox sets">
          {loading ? 'Loading…' : sets === null ? 'Load' : 'Refresh'}
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Manage seasonal lootbox sets. Retiring a set removes it from all active drop pools immediately;
        the published odds on the Lootboxes page update automatically. Items already owned by players
        are never removed from their collections.
      </p>
      {error && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {msg && <div role="status" style={{ color: '#22c55e', fontSize: 13, marginBottom: 8 }}>{msg}</div>}
      {sets && sets.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No lootbox sets found.</p>
      )}
      {sets && sets.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th align="left" style={{ padding: '6px 10px' }}>Set ID</th>
                <th align="left" style={{ padding: '6px 10px' }}>Name</th>
                <th align="center" style={{ padding: '6px 10px' }}>Items</th>
                <th align="center" style={{ padding: '6px 10px' }}>Status</th>
                <th align="left" style={{ padding: '6px 10px' }}>Retired at</th>
                <th style={{ padding: '6px 10px' }}></th>
              </tr>
            </thead>
            <tbody>
              {sets.map(s => (
                <tr key={s.set_id || s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>{s.set_id || s.id}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.name || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>{s.item_count ?? '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      background: s.retired ? 'rgba(107,114,128,0.15)' : 'rgba(34,197,94,0.15)',
                      color: s.retired ? '#9ca3af' : '#22c55e',
                    }}>{s.retired ? 'Retired' : 'Active'}</span>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {s.retired_at ? fmtDate(s.retired_at) : '—'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {s.retired ? (
                      <button
                        type="button"
                        disabled={busy === (s.set_id || s.id)}
                        onClick={() => handleRetire(s.set_id || s.id, false)}
                        aria-label={`Un-retire lootbox set ${s.name || s.set_id || s.id}`}
                        style={{
                          padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', color: '#22c55e',
                          opacity: busy === (s.set_id || s.id) ? 0.5 : 1,
                        }}
                      >
                        {busy === (s.set_id || s.id) ? '…' : '↩ Un-retire'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === (s.set_id || s.id)}
                        onClick={() => handleRetire(s.set_id || s.id, true)}
                        aria-label={`Retire lootbox set ${s.name || s.set_id || s.id}`}
                        style={{
                          padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444',
                          opacity: busy === (s.set_id || s.id) ? 0.5 : 1,
                        }}
                      >
                        {busy === (s.set_id || s.id) ? '…' : 'Retire set'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create new set ---------------------------------------------------- */}
      <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <button
          type="button"
          className="btn"
          onClick={() => setShowCreate(v => !v)}
          aria-expanded={showCreate}
          aria-controls="lootbox-create-set-form"
          style={{ fontSize: 13, padding: '5px 12px' }}
        >
          {showCreate ? '× Cancel' : '+ Create new set'}
        </button>

        {showCreate && (
          <form
            id="lootbox-create-set-form"
            onSubmit={handleCreate}
            style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px' }}>
                <span>Set name</span>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. OCE Cup 2027"
                  maxLength={80}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                />
              </label>
              <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4, flex: '2 1 320px' }}>
                <span>Description <span style={{ color: 'var(--text-muted)' }}>(optional)</span></span>
                <input
                  type="text"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Tournament set — retired after the season."
                  maxLength={240}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                />
              </label>
            </div>

            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', margin: 0 }}>
              <legend style={{ fontSize: 13, fontWeight: 600, padding: '0 6px' }}>
                Items <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pickedSkus.size} selected)</span>
              </legend>
              {items.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Load the card to pull the cosmetics catalog.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                  {items.map(it => {
                    const checked = pickedSkus.has(it.sku);
                    return (
                      <label
                        key={it.sku}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
                          padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                          border: `1px solid ${checked ? 'var(--accent, #c5a975)' : 'var(--border)'}`,
                          background: checked ? 'rgba(197,169,117,0.12)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSku(it.sku)}
                        />
                        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {it.label}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                            {it.kind} · {it.rarity}{it.set ? ` · in ${it.set}` : ''}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="submit"
                className="btn"
                disabled={creating || !newName.trim() || pickedSkus.size === 0}
                style={{ padding: '6px 16px', fontSize: 13 }}
              >
                {creating ? 'Creating…' : 'Create set'}
              </button>
              <button
                type="button"
                onClick={resetCreate}
                style={{ padding: '6px 12px', fontSize: 13, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function WelcomeModalPanel({ superuserKey }) {
  const [cfg, setCfg] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    fetch('/api/settings/welcome-modal')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        let parsed = { enabled: false, version: 1, eyebrow: '', title: '', body: '', ctaText: '', ctaHref: '' };
        if (d?.value) {
          try { parsed = { ...parsed, ...(typeof d.value === 'string' ? JSON.parse(d.value) : d.value) }; } catch {}
        }
        setCfg(parsed);
      })
      .catch(() => setCfg({ enabled: false, version: 1, eyebrow: '', title: '', body: '', ctaText: '', ctaHref: '' }));
  }, []);

  if (!cfg) return null;
  const upd = (k, v) => setCfg(c => ({ ...c, [k]: v }));

  const save = async (bumpVersion) => {
    setSaving(true); setMsg('');
    try {
      const payload = { ...cfg };
      // Always bump version on save so previously-dismissed users see the update.
      // The "Save without re-show" button (bumpVersion=false) is preserved for rare edits.
      if (bumpVersion !== false) payload.version = (parseInt(cfg.version, 10) || 1) + 1;
      const r = await superuserFetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ key: 'welcome_modal', value: JSON.stringify(payload) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      try { setCfg(JSON.parse(d.setting.value)); } catch {}
      setMsg(bumpVersion ? 'Saved & re-shown to all users.' : 'Saved.');
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '7px 10px', borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)', color: 'var(--text-primary)',
    fontSize: 14, fontFamily: 'inherit',
  };

  return (
    <section style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-welcome-modal" style={{ marginBottom: 6 }}>📣 Welcome Modal (CMS)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Editor-controlled welcome modal shown to all visitors. Bump the version to re-show it to users
        who already dismissed the previous one.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 580 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          alignSelf: 'flex-start',
          background: cfg.enabled ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: cfg.enabled ? '#22c55e' : '#ef4444',
          border: `1px solid ${cfg.enabled ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
        }}>
          {cfg.enabled ? '✓ Currently ENABLED — visitors will see the modal' : '✗ Currently DISABLED — modal will not show'}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={!!cfg.enabled} onChange={e => upd('enabled', e.target.checked)} />
          Modal enabled
        </label>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Eyebrow</label>
          <input type="text" value={cfg.eyebrow || ''} onChange={e => upd('eyebrow', e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Title *</label>
          <input type="text" value={cfg.title || ''} onChange={e => upd('title', e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Body</label>
          <textarea rows={4} value={cfg.body || ''} onChange={e => upd('body', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>CTA text</label>
            <input type="text" value={cfg.ctaText || ''} onChange={e => upd('ctaText', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>CTA href</label>
            <input type="text" value={cfg.ctaHref || ''} onChange={e => upd('ctaHref', e.target.value)} placeholder="/patch-notes" style={inputStyle} />
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Current version: <strong>v{cfg.version || 1}</strong> · dismiss key: <code>welcome_modal_dismissed_v{cfg.version || 1}</code>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
            {saving ? 'Saving…' : 'Save & re-show to everyone'}
          </button>
          <button className="btn" disabled={saving} onClick={() => save(false)} title="Edit content without re-prompting users who already dismissed">
            Save quietly (no re-show)
          </button>
          <button
            className="btn"
            type="button"
            title="Clears your local dismiss flag for every modal version and reloads the home page so you can verify the modal renders."
            onClick={() => {
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (k && k.startsWith('welcome_modal_dismissed_v')) {
                    localStorage.removeItem(k);
                    i--;
                  }
                }
              } catch {}
              window.open('/', '_blank');
            }}
          >
            🔍 Preview on home (new tab)
          </button>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)' }}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function HomeBannerPanel({ superuserKey }) {
  const [cfg, setCfg] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    fetch('/api/settings/home-banner')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        let parsed = { enabled: false, version: 1, eyebrow: '', title: '', body: '', ctaText: '', ctaHref: '' };
        if (d?.value) {
          try { parsed = { ...parsed, ...(typeof d.value === 'string' ? JSON.parse(d.value) : d.value) }; } catch {}
        }
        setCfg(parsed);
      })
      .catch(() => setCfg({ enabled: false, version: 1, eyebrow: '', title: '', body: '', ctaText: '', ctaHref: '' }));
  }, []);

  if (!cfg) return null;
  const upd = (k, v) => setCfg(c => ({ ...c, [k]: v }));

  const save = async (bumpVersion) => {
    setSaving(true); setMsg('');
    try {
      const payload = { ...cfg };
      if (bumpVersion !== false) payload.version = (parseInt(cfg.version, 10) || 1) + 1;
      const r = await superuserFetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ key: 'home_banner', value: JSON.stringify(payload) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      try { setCfg(JSON.parse(d.setting.value)); } catch {}
      setMsg(bumpVersion ? 'Saved & re-shown to all users.' : 'Saved.');
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '7px 10px', borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)', color: 'var(--text-primary)',
    fontSize: 14, fontFamily: 'inherit',
  };

  return (
    <section style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-home-banner" style={{ marginBottom: 6 }}>🪧 Home Banner (CMS)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Editor-controlled dismissable banner shown at the top of the home page. Bump the version to re-show it to users
        who already dismissed the previous one.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 580 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          alignSelf: 'flex-start',
          background: cfg.enabled ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: cfg.enabled ? '#22c55e' : '#ef4444',
          border: `1px solid ${cfg.enabled ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
        }}>
          {cfg.enabled ? '✓ Currently ENABLED — visitors will see the banner' : '✗ Currently DISABLED — banner will not show'}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={!!cfg.enabled} onChange={e => upd('enabled', e.target.checked)} />
          Banner enabled
        </label>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Eyebrow</label>
          <input type="text" value={cfg.eyebrow || ''} onChange={e => upd('eyebrow', e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Title *</label>
          <input type="text" value={cfg.title || ''} onChange={e => upd('title', e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Body</label>
          <textarea rows={3} value={cfg.body || ''} onChange={e => upd('body', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>CTA text</label>
            <input type="text" value={cfg.ctaText || ''} onChange={e => upd('ctaText', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>CTA href</label>
            <input type="text" value={cfg.ctaHref || ''} onChange={e => upd('ctaHref', e.target.value)} placeholder="/leaderboard" style={inputStyle} />
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Current version: <strong>v{cfg.version || 1}</strong> · dismiss key: <code>home_banner_dismissed_v{cfg.version || 1}</code>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
            {saving ? 'Saving…' : 'Save & re-show to everyone'}
          </button>
          <button className="btn" disabled={saving} onClick={() => save(false)} title="Edit content without re-prompting users who already dismissed">
            Save quietly (no re-show)
          </button>
          <button
            className="btn"
            type="button"
            title="Clears your local dismiss flag for every banner version and reloads the home page so you can verify the banner renders."
            onClick={() => {
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (k && k.startsWith('home_banner_dismissed_v')) {
                    localStorage.removeItem(k);
                    i--;
                  }
                }
              } catch {}
              window.open('/', '_blank');
            }}
          >
            🔍 Preview on home (new tab)
          </button>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)' }}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// Module-level style object — stable reference so inputs never lose focus
// when SideBannerPanel re-renders on state changes.
const SIDE_BANNER_INPUT_STYLE = {
  width: '100%', boxSizing: 'border-box',
  padding: '7px 10px', borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-card)', color: 'var(--text-primary)',
  fontSize: 14, fontFamily: 'inherit',
};

// Extracted to module scope so React keeps the same component type across
// re-renders — an inline component definition causes React to unmount/remount
// the DOM nodes on every keystroke, ejecting focus from the input.
function SideBannerSideForm({ side, label, cfg, updSide }) {
  return (
    <div style={{ flex: 1, minWidth: 260 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: 'var(--brass)' }}>
        {label} Banner
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={!!cfg[side].enabled}
            onChange={e => updSide(side, 'enabled', e.target.checked)}
          />
          Enabled
        </label>
        {[
          { k: 'title',    label: 'Title (bold headline)', ph: 'Season 1 Championship' },
          { k: 'subtitle', label: 'Subtitle',              ph: '$1,000 Prize Pool' },
          { k: 'imageUrl', label: 'Image URL',             ph: 'https://…/banner.jpg' },
          { k: 'linkUrl',  label: 'Link URL (optional)',   ph: '/leaderboard' },
        ].map(({ k, label: lbl, ph }) => (
          <div key={k}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 3, color: 'var(--text-muted)' }}>
              {lbl}
            </label>
            <input
              type="text"
              value={cfg[side][k] || ''}
              onChange={e => updSide(side, k, e.target.value)}
              placeholder={ph}
              style={SIDE_BANNER_INPUT_STYLE}
            />
          </div>
        ))}
        {cfg[side].imageUrl && (
          <img
            src={cfg[side].imageUrl}
            alt="preview"
            style={{ width: 100, borderRadius: 6, border: '1px solid var(--border-subtle)', objectFit: 'cover', aspectRatio: '2/3' }}
          />
        )}
      </div>
    </div>
  );
}

function SideBannerPanel({ superuserKey }) {
  const defaultSide = () => ({ enabled: false, imageUrl: '', title: '', subtitle: '', linkUrl: '' });
  const [cfg, setCfg] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    fetch('/api/settings/side-banners')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        let parsed = { left: defaultSide(), right: defaultSide() };
        if (d?.value) {
          try {
            const raw = typeof d.value === 'string' ? JSON.parse(d.value) : d.value;
            parsed = {
              left: { ...defaultSide(), ...(raw.left || {}) },
              right: { ...defaultSide(), ...(raw.right || {}) },
            };
          } catch {}
        }
        setCfg(parsed);
      })
      .catch(() => setCfg({ left: defaultSide(), right: defaultSide() }));
  }, []);

  if (!cfg) return null;

  const updSide = (side, k, v) => setCfg(c => ({ ...c, [side]: { ...c[side], [k]: v } }));

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const r = await superuserFetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ key: 'side_banners', value: JSON.stringify(cfg) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      try {
        const saved = JSON.parse(d.setting.value);
        setCfg(saved);
        window.dispatchEvent(new CustomEvent('side-banners-updated', { detail: saved }));
      } catch {}
      setMsg('Saved.');
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-side-banners" style={{ marginBottom: 6 }}>🪧 Side Banners (CMS)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Fixed-position left and right banners visible on wide screens (≥ 1600 px).
        Use them for season promos, prize pool announcements, or sponsor graphics.
      </p>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 18 }}>
        <SideBannerSideForm side="left"  label="Left"  cfg={cfg} updSide={updSide} />
        <SideBannerSideForm side="right" label="Right" cfg={cfg} updSide={updSide} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save banners'}
        </button>
        {msg && (
          <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)' }}>
            {msg}
          </span>
        )}
      </div>
    </section>
  );
}

// Task #441 — Weekly Rivals admin panel. Lists this week's pairings,
// allows force-regenerate (wipe + re-pair everyone), per-account
// force-repair (drop the pair and re-pair just that account against
// the unpaired pool), and exemption add/remove.
function WeeklyRivalsPanel({ superuserKey }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [exemptInput, setExemptInput] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await getAdminRivals(superuserKey)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [superuserKey]);

  React.useEffect(() => { load(); }, [load]);

  const onForceRegenerate = async () => {
    if (!confirm('Wipe and re-pair every active player this week? This drops all current H2H scores.')) return;
    setBusy('regen');
    try { await regenerateRivals(superuserKey, true); await load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  };
  const onRepair = async (accountId) => {
    setBusy(`repair:${accountId}`);
    try { await repairRival(superuserKey, accountId); await load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  };
  const onToggleExempt = async (accountId, exempt) => {
    setBusy(`exempt:${accountId}`);
    try { await setRivalExempt(superuserKey, accountId, exempt); await load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  };
  const onAddExempt = async (e) => {
    e.preventDefault();
    const aid = exemptInput.trim();
    if (!aid) return;
    await onToggleExempt(aid, true);
    setExemptInput('');
  };

  return (
    <section
      aria-labelledby="rivals-panel-heading"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 id="rivals-panel-heading" style={{ margin: 0 }}>⚔️ Weekly Rivals</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}
            aria-label="Refresh weekly rivals"
          >🔄 Refresh</button>
          <button
            type="button"
            onClick={onForceRegenerate}
            disabled={busy === 'regen'}
            style={{ background: 'var(--accent)', border: 'none', color: '#000', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            aria-label="Force re-pair everyone this week"
          >{busy === 'regen' ? 'Working…' : '♻️ Force re-pair week'}</button>
        </div>
      </div>

      {err && <div role="alert" style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {loading ? <div>Loading…</div> : data && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            Week of <strong>{String(data.week_start).slice(0, 10)}</strong> · {data.pairings.length} pair{data.pairings.length === 1 ? '' : 's'}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px 8px' }}>Player A</th>
                  <th style={{ padding: '6px 8px' }}>Player B</th>
                  <th style={{ padding: '6px 8px' }}>MMR Δ</th>
                  <th style={{ padding: '6px 8px' }}>H2H (A–B)</th>
                  <th style={{ padding: '6px 8px' }}>Score</th>
                  <th style={{ padding: '6px 8px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.pairings.map(p => (
                  <tr key={`${p.account_id_a}-${p.account_id_b}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <a href={`/player/${p.account_id_a}`} style={{ color: 'var(--accent)' }}>{p.account_id_a}</a>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({p.mmr_a})</span>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <a href={`/player/${p.account_id_b}`} style={{ color: 'var(--accent)' }}>{p.account_id_b}</a>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({p.mmr_b})</span>
                    </td>
                    <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{Math.abs((p.mmr_a || 0) - (p.mmr_b || 0))}</td>
                    <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{p.wins_a}–{p.wins_b}</td>
                    <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{p.score != null ? Number(p.score).toFixed(2) : '—'}</td>
                    <td style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => onRepair(p.account_id_a)}
                        disabled={busy === `repair:${p.account_id_a}`}
                        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
                        aria-label={`Force re-pair account ${p.account_id_a}`}
                      >Re-pair A</button>
                      <button
                        type="button"
                        onClick={() => onToggleExempt(p.account_id_a, true)}
                        disabled={busy === `exempt:${p.account_id_a}`}
                        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
                        aria-label={`Exempt account ${p.account_id_a}`}
                      >Exempt A</button>
                    </td>
                  </tr>
                ))}
                {data.pairings.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>No pairings yet for this week.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>Exemptions ({data.exemptions.length})</h4>
            <form onSubmit={onAddExempt} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <label htmlFor="rival-exempt-input" style={{ position: 'absolute', left: -9999 }}>Account ID to exempt</label>
              <input
                id="rival-exempt-input"
                type="text"
                value={exemptInput}
                onChange={e => setExemptInput(e.target.value)}
                placeholder="Account ID to exempt"
                style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, padding: '6px 8px', fontSize: 13 }}
              />
              <button type="submit" style={{ background: 'var(--accent)', border: 'none', color: '#000', borderRadius: 4, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add</button>
            </form>
            {data.exemptions.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No accounts exempted.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {data.exemptions.map(ex => (
                  <li key={ex.account_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
                    <a href={`/player/${ex.account_id}`} style={{ color: 'var(--accent)' }}>{ex.account_id}</a>
                    <button
                      type="button"
                      onClick={() => onToggleExempt(ex.account_id, false)}
                      disabled={busy === `exempt:${ex.account_id}`}
                      style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 4, padding: '2px 8px', fontSize: 12, cursor: 'pointer' }}
                      aria-label={`Remove exemption for account ${ex.account_id}`}
                    >Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default function AdminPanel() {
  const { isSuperuser, superuserKey, logout } = useSuperuser();
  const { activeSeason } = useSeason();

  const [overview, setOverview] = useState(null);
  const [duplicates, setDuplicates] = useState(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState('');
  const [siteSettings, setSiteSettings] = useState({});
  // TrueSkill V3 is the sole production rating engine; the legacy V1
  // implementation and the V3-vs-V1 admin preview were removed in v5.95.
  const [ranks, setRanks] = useState([]);
  const [rankSyncing, setRankSyncing] = useState(false);
  const [rankSyncMsg, setRankSyncMsg] = useState('');
  const [rankEditId, setRankEditId] = useState(null);
  const [rankEditTier, setRankEditTier] = useState('');
  const [rankEditLbRank, setRankEditLbRank] = useState('');
  const [rankEditMedal, setRankEditMedal] = useState('');
  const [rankEditStars, setRankEditStars] = useState('');
  const MEDAL_NAMES = ['Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];
  const [signups, setSignups] = useState([]);
  const [signupsFilter, setSignupsFilter] = useState('pending');
  const [signupNotes, setSignupNotes] = useState({});
  const [signupFeedback, setSignupFeedback] = useState({});
  const [pendingSignupCount, setPendingSignupCount] = useState(null);

  const [unregistered, setUnregistered] = useState(null);
  const [unregLoading, setUnregLoading] = useState(false);

  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem('admin_active_tab') || 'overview'; } catch { return 'overview'; }
  });
  useEffect(() => {
    try { localStorage.setItem('admin_active_tab', activeTab); } catch {}
  }, [activeTab]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadRanks = useCallback(() => {
    if (!isSuperuser) return;
    getPlayerRanks().then(setRanks).catch(() => {});
  }, [isSuperuser]);

  useEffect(() => { loadRanks(); }, [loadRanks]);

  const loadUnregistered = useCallback(async () => {
    if (!isSuperuser) return;
    setUnregLoading(true);
    try {
      const r = await superuserFetch('/api/admin/unregistered-players', { headers: { 'x-superuser-key': superuserKey } });
      const d = await r.json();
      setUnregistered(Array.isArray(d) ? d : []);
    } catch {
      setUnregistered([]);
    } finally {
      setUnregLoading(false);
    }
  }, [isSuperuser, superuserKey]);

  const loadSignups = useCallback(() => {
    if (!isSuperuser) return;
    getSignupRequests(superuserKey, signupsFilter || null)
      .then(d => setSignups(d.requests || []))
      .catch(() => {});
  }, [isSuperuser, superuserKey, signupsFilter]);

  useEffect(() => { loadSignups(); }, [loadSignups]);

  // Keep a stable pending count for the Quick Links badge
  useEffect(() => {
    if (signupsFilter === 'pending') setPendingSignupCount(signups.length);
  }, [signups, signupsFilter]);

  const authHeader = { 'x-superuser-key': superuserKey };

  const loadOverview = useCallback(() => {
    if (!isSuperuser) return;
    superuserFetch('/api/admin/overview', { headers: authHeader })
      .then(r => r.json())
      .then(setOverview)
      .catch(() => {});
  }, [isSuperuser, superuserKey]);

  useEffect(() => {
    loadOverview();
  }, [isSuperuser, loadOverview]);

  const loadSiteSettings = useCallback(() => {
    if (!isSuperuser) return;
    superuserFetch('/api/admin/settings', { headers: authHeader })
      .then(r => r.json())
      .then(d => setSiteSettings(d.settings || {}))
      .catch(() => {});
  }, [isSuperuser, superuserKey]);

  useEffect(() => { loadSiteSettings(); }, [loadSiteSettings]);

  const handleRecalculate = async () => {
    setRecalcLoading(true);
    setRecalcMsg('');
    try {
      const r = await superuserFetch('/api/admin/recalculate-ratings', { method: 'POST', headers: authHeader });
      const d = await r.json();
      setRecalcMsg(d.message || d.error || 'Done.');
    } catch {
      setRecalcMsg('Request failed.');
    } finally {
      setRecalcLoading(false);
    }
  };

  const handleLoadDuplicates = async () => {
    setDupLoading(true);
    try {
      const r = await superuserFetch('/api/admin/duplicate-matches', { headers: authHeader });
      const d = await r.json();
      setDuplicates(d.duplicates || d || []);
    } catch {
      setDuplicates([]);
    } finally {
      setDupLoading(false);
    }
  };

  if (!isSuperuser) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: 16 }}>🔒 Admin Panel</h2>
        <p style={{ color: 'var(--text-muted)' }}>You must be logged in as superuser to access this page.</p>
        <p style={{ marginTop: 12, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Use the 🛡️ Superuser button in the top navigation to log in.</p>
      </div>
    );
  }

  const ADMIN_NAV = [
    { label: 'Dashboard', items: [
      { id: 'overview', icon: '📊', label: 'Overview' },
    ]},
    { label: 'Match Data', items: [
      { id: 'matches', icon: '🎮', label: 'Matches & Replays' },
    ]},
    { label: 'Bot Tools', items: [
      { id: 'steambot', icon: '🤖', label: 'Steam Bot & Test DMs' },
    ]},
    { label: 'Config', items: [
      { id: 'seasons', icon: '🏆', label: 'Seasons & Ratings' },
      { id: 'config', icon: '⚙️', label: 'Site Settings' },
    ]},
    { label: 'Users', items: [
      { id: 'users', icon: '👥', label: 'Players & Sign-Ups', badge: pendingSignupCount > 0 ? pendingSignupCount : null },
    ]},
    { label: 'Marketplace', items: [
      { id: 'marketplace', icon: '💰', label: 'Gifts, Coaching & Tournaments' },
    ]},
    { label: 'Engagement', items: [
      { id: 'challenges', icon: '🎯', label: 'Community Challenges' },
      { id: 'rivals', icon: '⚔️', label: 'Weekly Rivals' },
    ]},
  ];

  // Searchable index of admin features. Each entry deep-links to a tab and
  // optionally scrolls to a specific section anchor within that tab.
  const SEARCH_INDEX = [
    { label: 'Overview', tab: 'overview', icon: '📊', kw: 'dashboard stats home' },
    { label: 'Quick Links', tab: 'overview', anchor: 'ap-anchor-quick-links', icon: '🔗', kw: 'shortcuts' },
    { label: 'Record a Match', tab: 'matches', anchor: 'ap-anchor-record-match', icon: '📝', kw: 'manual entry add game' },
    { label: 'Maintenance', tab: 'matches', anchor: 'ap-anchor-maintenance', icon: '🛠️', kw: 'recompute rebuild' },
    { label: 'Stored Replays', tab: 'matches', anchor: 'ap-anchor-stored-replays', icon: '🎞️', kw: 'replay file download reparse expire' },
    { label: 'Replay Archive (Dedicated Server)', tab: 'matches', anchor: 'ap-anchor-replay-archive', icon: '🗂️', kw: 'dedicated server path' },
    { label: 'Replay Inspector', tab: 'matches', anchor: 'ap-anchor-replay-inspector', icon: '🔍', kw: 'parse debug' },
    { label: 'Database Backups', tab: 'matches', anchor: 'ap-anchor-db-backups', icon: '💾', kw: 'restore snapshot pg_dump nicknames' },
    { label: 'Test: Provision & Connect', tab: 'steambot', anchor: 'ap-anchor-inhouse-diag', icon: '🔌', kw: 'rcon dedicated server diagnostic steam connect link test' },
    { label: 'Steam Bot Controls', tab: 'steambot', anchor: 'ap-anchor-steam-bot', icon: '🤖', kw: 'lobby login reconnect status' },
    { label: 'Notification Test Harness', tab: 'steambot', anchor: 'ap-anchor-notify-test', icon: '🔔', kw: 'notification test send discord dm web push mvp hot streak tier season wrapped tournament checkin payout coaching achievement quest prediction vod anniversary founders ring' },
    { label: 'Background Job Triggers', tab: 'steambot', anchor: 'ap-anchor-job-run-now', icon: '⚡', kw: 'run now job cron trigger manual sweep puzzle pregen api quota account deletion ops snapshot checkin dq pro match sync payout season rollover weekly report badge expiry background' },
    { label: 'Test Post-Match DM', tab: 'steambot', anchor: 'ap-anchor-test-dm', icon: '✉️', kw: 'discord direct message debug' },
    { label: 'Test RSVP Registration DM', tab: 'steambot', anchor: 'ap-anchor-test-rsvp-dm', icon: '✉️', kw: 'discord rsvp invite' },
    { label: 'Server Error Log', tab: 'steambot', anchor: 'ap-anchor-error-log', icon: '🚨', kw: 'errors crashes log' },
    { label: 'Mass Discord DM', tab: 'steambot', anchor: 'ap-anchor-mass-dm', icon: '📢', kw: 'mass dm broadcast message players discord bulk announce' },
    { label: 'Staff Roles', tab: 'users', anchor: 'ap-anchor-staff-roles', icon: '🛡️', kw: 'admin moderator role permission grant revoke staff tier steam account access owner superuser' },
    { label: 'Season Lifecycle', tab: 'seasons', anchor: 'ap-anchor-season-lifecycle', icon: '📅', kw: 'start end activate launch' },
    { label: 'Season Tiers', tab: 'seasons', anchor: 'ap-anchor-season-tiers', icon: '🏆', kw: 'rank divisions ladder' },
    { label: 'Rating System', tab: 'seasons', anchor: 'ap-anchor-rating-system', icon: '⚖️', kw: 'trueskill mmr recompute' },
    { label: 'Hero Tier Overrides', tab: 'seasons', anchor: 'ap-anchor-hero-tier', icon: '🏆', kw: 'meta heroes' },
    { label: 'Achievement System', tab: 'seasons', anchor: 'ap-anchor-achievements', icon: '🏅', kw: 'badges unlock' },
    { label: 'Cron Heartbeats', tab: 'config', anchor: 'ap-anchor-cron-heartbeats', icon: '❤️', kw: 'cron job heartbeat health monitor schedule overdue winback' },
    { label: 'Engagement', tab: 'config', anchor: 'ap-anchor-engagement', icon: '🎯', kw: 'pinned highlights showcase' },
    { label: 'Broadcast Ticker (CMS)', tab: 'config', anchor: 'ap-anchor-broadcast-ticker', icon: '📢', kw: 'announcement banner' },
    { label: 'Welcome Modal (CMS)', tab: 'config', anchor: 'ap-anchor-welcome-modal', icon: '📣', kw: 'popup intro onboarding cta' },
    { label: 'Home Banner (CMS)', tab: 'config', anchor: 'ap-anchor-home-banner', icon: '🪧', kw: 'home banner hero ad announcement dismissable closeable' },
    { label: 'Tier Ladder Preview', tab: 'config', anchor: 'ap-anchor-tier-ladder', icon: '🎖️', kw: 'rank tier symbol badge ladder reference' },
    { label: 'Coaching Marketplace Flag', tab: 'config', anchor: 'ap-anchor-coaching-flag', icon: '🎓', kw: 'coaching marketplace feature flag toggle on off preview kill switch rollback' },
    { label: 'Draft Sandbox', tab: 'steambot', anchor: 'ap-anchor-draft-sandbox', icon: '🎮', kw: 'draft pick captain test simulator placeholder dummy lobby inhouse' },
    { label: 'Dota 2 Rank Management', tab: 'users', anchor: 'ap-anchor-rank-management', icon: '🎖️', kw: 'rank tier players' },
    { label: 'Manage Nicknames (Players page)', tab: 'users', anchor: 'ap-anchor-nicknames', icon: '✏️', kw: 'nickname rename alias display name' },
    { label: 'Profile Sandbox', tab: 'users', anchor: 'ap-anchor-profile-preview', icon: '👤', kw: 'profile customization edit bio title accent pin sample dummy sandbox test frame premium pro theme' },
    { label: 'Unregistered Players', tab: 'users', anchor: 'ap-anchor-unregistered-players', icon: '👤', kw: 'orphan link account' },
    { label: 'Discord ID Collisions', tab: 'users', anchor: 'ap-anchor-discord-collisions', icon: '🔗', kw: 'discord duplicate merge split collision unique link reconcile' },
    { label: 'Sign-Up Requests', tab: 'users', anchor: 'signup-requests', icon: '📋', kw: 'applications join approve reject pending' },
    { label: 'Economy & Pricing', tab: 'marketplace', anchor: 'ap-anchor-economy-pricing', icon: '💰', kw: 'coin prices packs frame gift pro founders ring economy pricing admin editable live override stripe aud cents monthly lifetime season pass' },
    { label: 'Gift Purchases', tab: 'marketplace', anchor: 'ap-anchor-gifts', icon: '🎁', kw: 'pro gift stripe' },
    { label: 'Founders Pass Refunds', tab: 'marketplace', anchor: 'ap-anchor-founders-refunds', icon: '💍', kw: 'founders ring refund cap race stripe audit failed' },
    { label: 'Coaching Marketplace', tab: 'marketplace', anchor: 'ap-anchor-coaching', icon: '🎓', kw: 'coach payout connect bookings' },
    { label: 'Tournament Brackets', tab: 'marketplace', anchor: 'ap-anchor-tournaments', icon: '🏆', kw: 'tournament prize pool buy-in' },
    { label: 'Community Challenges', tab: 'challenges', icon: '🎯', kw: 'challenge leaderboard scoring quest community event' },
    { label: 'Weekly Rivals', tab: 'rivals', icon: '⚔️', kw: 'rival weekly pairing h2h head to head opponent matchup auto pair' },
    { label: 'V3 Modifier History', tab: 'seasons', anchor: 'ap-anchor-v3-debug', icon: '🔬', kw: 'v3 trueskill modifier mu sigma perf rating debug history player lookup' },
    { label: 'Feature Flags', tab: 'config', anchor: 'ap-anchor-feature-flags', icon: '🚦', kw: 'flags toggle on off preview kill switch rollout feature enable disable runtime' },
    { label: 'Live Ops Logs', tab: 'config', anchor: 'ap-anchor-ops-logs', icon: '📋', kw: 'ops logs live server buffer source filter errors stream ring' },
    { label: 'Ops History', tab: 'config', anchor: 'ap-anchor-ops-history', icon: '📈', kw: 'ops history sparkline telemetry samples 1min samples error spike throughput' },
    { label: 'Lootbox Sets', tab: 'marketplace', anchor: 'ap-anchor-lootbox-sets', icon: '📦', kw: 'lootbox sets seasonal retire cosmetics boxes drops collection active' },
  ];

  const q = searchQuery.trim().toLowerCase();
  const searchResults = q
    ? SEARCH_INDEX.filter(s =>
        s.label.toLowerCase().includes(q) ||
        (s.kw && s.kw.includes(q)) ||
        s.tab.includes(q)
      ).slice(0, 12)
    : [];

  const goToResult = (r) => {
    setActiveTab(r.tab);
    setSearchQuery('');
    if (r.anchor) {
      // wait a tick for the tab to render, then scroll
      setTimeout(() => {
        const el = document.getElementById(r.anchor);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  return (
    <AdminErrorBoundary>
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>🔒 Admin Panel</h1>
        <button className="btn" onClick={logout} style={{ fontSize: '0.85rem' }}>Log out</button>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Manage matches, ratings, and data.</p>

      <div className="ap-grid">
        <aside className="ap-sidebar">
          <div className="ap-search-wrap">
            <input
              type="search"
              className="ap-search-input"
              placeholder="🔍  Search admin…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search admin features"
            />
            {searchResults.length > 0 && (
              <div className="ap-search-results" role="listbox">
                {searchResults.map((r, i) => (
                  <button
                    key={`${r.tab}-${r.anchor || i}`}
                    type="button"
                    className="ap-search-result"
                    onClick={() => goToResult(r)}
                  >
                    <span className="ap-nav-icon" aria-hidden>{r.icon || '•'}</span>
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{r.tab}</div>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {q && searchResults.length === 0 && (
              <div className="ap-search-empty">No matches.</div>
            )}
          </div>
          {ADMIN_NAV.map(group => (
            <div key={group.label} className="ap-nav-group">
              <div className="ap-nav-group-label">{group.label}</div>
              {group.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`ap-nav-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.id)}
                >
                  <span className="ap-nav-icon" aria-hidden>{item.icon}</span>
                  <span className="ap-nav-label">{item.label}</span>
                  {item.badge ? <span className="ap-nav-badge">{item.badge}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </aside>
        <div className="ap-main">

      {activeTab === 'overview' && (<>
      {/* Quick Links */}
      <section id="ap-anchor-quick-links" style={{ marginBottom: 28 }}>
        <h2 style={{ marginBottom: 14 }}>Quick Links</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { to: '/admin/record-match', label: '📝 Record Match' },
            { to: '/upload', label: '⬆️ Upload Replay' },
            { to: '/seasons', label: '🏆 Seasons' },
            { to: '/players', label: '👥 Players & Nicknames' },
            { to: '/patch-notes', label: '📋 Patch Notes' },
            { to: '/matches', label: '📊 Match List' },
            { to: '/admin/smoke-test', label: '🧪 Smoke-test runs' },
            { to: '/admin/browser-smoke', label: '📸 Browser smoke' },
          ].map(({ to, label }) => (
            <Link key={to} to={to} className="btn" style={{ textDecoration: 'none' }}>{label}</Link>
          ))}
          <button
            className="btn"
            onClick={() => {
              const el = document.getElementById('signup-requests');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            style={{ position: 'relative' }}
          >
            📋 Applications
            {pendingSignupCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: '#e74c3c', color: '#fff',
                borderRadius: '50%', width: 18, height: 18,
                fontSize: '0.7rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}>{pendingSignupCount}</span>
            )}
          </button>
        </div>
      </section>

      {/* Overview */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ marginBottom: 14 }}>Overview</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <OverviewCard label="Total Matches" value={overview?.totalMatches} />
          <OverviewCard label="Registered Players" value={overview?.totalPlayers} />
          <OverviewCard label="Manual Entries" value={overview?.manualMatches} />
          <OverviewCard
            label="Active Season"
            value={overview?.activeSeason?.name || 'None'}
            sub={overview?.activeSeason ? `ID: ${overview.activeSeason.id}` : null}
          />
        </div>
      </section>

      {/* Task #702 — Ops history sparklines */}
      <OpsSparklinesCard superuserKey={superuserKey} />

      {/* Task #497 — Site lockdown toggle */}
      <LockdownCard superuserKey={superuserKey} />

      {/* Task #498 — Lockdown access log (hidden when the gate is off) */}
      <LockdownAttemptsCard superuserKey={superuserKey} />

      {/* Twitch channel links for the /live hub */}
      <TwitchLinkCard superuserKey={superuserKey} />

      {/* Task #492 — AI agent traffic */}
      <AgentTrafficCard superuserKey={superuserKey} />
      {/* Task #491 — Brand-asset hotlink report */}
      <AssetHotlinkCard superuserKey={superuserKey} />

      {/* Task #450 — coin betting controls */}
      <BettingControlsCard superuserKey={superuserKey} />

      {/* Task #656 — new-visitor tutorial review controls */}
      <TutorialReviewCard />

      </>)}

      {activeTab === 'matches' && (<>
      {/* Manual Match Entry — moved to its own page */}
      <section id="ap-anchor-record-match" style={{ marginBottom: 36 }}>
        <h2 style={{ marginBottom: 10 }}>Record a Match</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
          Manually record a match result when no replay is available.
        </p>
        <Link to="/admin/record-match" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          📝 Open Record Match Form
        </Link>
      </section>

      {/* Maintenance */}
      <section id="ap-anchor-maintenance" style={{ marginBottom: 36 }}>
        <h2 style={{ marginBottom: 14 }}>Maintenance</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div className="card" style={{ padding: 20, flex: '1 1 280px' }}>
            <h3 style={{ marginBottom: 8 }}>Recalculate Ratings</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 14 }}>
              Wipes and rebuilds all TrueSkill MMR from scratch using every match in chronological order. Run this after any data correction or base MMR change.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleRecalculate} disabled={recalcLoading}>
                {recalcLoading ? 'Recalculating…' : '⚙️ Recalculate Now'}
              </button>
              {recalcMsg && <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{recalcMsg}</span>}
            </div>
          </div>

          <div className="card" style={{ padding: 20, flex: '1 1 280px' }}>
            <h3 style={{ marginBottom: 8 }}>Duplicate Match Detector</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 14 }}>
              Finds matches that share the same players and duration — likely uploaded more than once.
            </p>
            <button className="btn" onClick={handleLoadDuplicates} disabled={dupLoading}>
              {dupLoading ? 'Scanning…' : '🔍 Scan for Duplicates'}
            </button>
            {duplicates !== null && (
              <div style={{ marginTop: 14 }}>
                {duplicates.length === 0 ? (
                  <p style={{ color: '#4caf50', fontSize: '0.88rem' }}>✓ No duplicates found.</p>
                ) : (
                  <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)' }}>
                        <th style={{ textAlign: 'left', paddingBottom: 4 }}>Match ID</th>
                        <th style={{ textAlign: 'left', paddingBottom: 4 }}>Date</th>
                        <th style={{ textAlign: 'left', paddingBottom: 4 }}>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicates.map((d, i) => (
                        <tr key={i}>
                          <td><Link to={`/match/${d.match_id}`} style={{ color: 'var(--accent)' }}>{String(d.match_id).slice(0, 16)}</Link></td>
                          <td>{d.date ? new Date(d.date).toLocaleDateString() : '—'}</td>
                          <td>{d.duration ? `${Math.floor(d.duration / 60)}m` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      </>)}

      {activeTab === 'steambot' && (<>
      {/* Task #297 — One-click dedicated server diagnostic */}
      <InhouseDiagPanel superuserKey={superuserKey} />

      {/* Steam Bot Controls */}
      <SteamBotPanel superuserKey={superuserKey} />

      {/* Draft Sandbox launcher */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 id="ap-anchor-draft-sandbox" className="section-title" style={{ marginBottom: 6 }}>
          🎮 Draft Sandbox
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          Self-contained client-side simulator of the inhouse captain-pick draft using 10 placeholder
          players. Lets you walk through the full 8-pick sequence (manual or auto), see the team panels
          and MMR-balance readout, and verify the draft UX without touching the live lobby, the database,
          or the Steam bot. Picks made here have <strong>zero side effects</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/admin/draft-sandbox" className="btn btn-primary">▶ Launch Draft Sandbox</Link>
          <Link to="/admin/draft-sandbox" className="btn" target="_blank" rel="noreferrer">↗ Open in new tab</Link>
        </div>
      </section>
      </>)}

      {activeTab === 'matches' && (<>
      {/* Database Backups */}
      <DbBackupManager superuserKey={superuserKey} />

      {/* Stored Replays */}
      <ReplayManager superuserKey={superuserKey} />

      {/* Replay Archive (dedicated server) */}
      <ReplayArchiveManager superuserKey={superuserKey} />
      </>)}

      {activeTab === 'steambot' && (<>
      {/* Task #699 — Notification test harness */}
      <NotificationTestPanel superuserKey={superuserKey} />

      {/* Task #699 — Background job run-now center */}
      <JobRunNowPanel superuserKey={superuserKey} />

      {/* Test Post-Match DM */}
      <TestDmPanel superuserKey={superuserKey} />

      {/* Test RSVP Registration DM */}
      <TestRsvpDmPanel superuserKey={superuserKey} />

      {/* Server Error Log */}
      <ErrorLogViewer superuserKey={superuserKey} />

      {/* Task #714 — Mass Discord DM broadcaster */}
      <MassDmPanel superuserKey={superuserKey} />
      </>)}

      {activeTab === 'seasons' && (<>
      {/* Season Tiers — 8-tier ladder per season */}
      <SeasonTiersPanel superuserKey={superuserKey} />

      {/* Season Lifecycle — end conditions + manual close */}
      <SeasonLifecyclePanel superuserKey={superuserKey} />
      </>)}

      {activeTab === 'marketplace' && (<>
      {/* Economy & Pricing — live-editable price overrides (Task #700) */}
      <EconomyPricingPanel superuserKey={superuserKey} />

      {/* Gift Purchases — audit all sent/received gifts */}
      <GiftPurchasesPanel superuserKey={superuserKey} />

      {/* Founders Pass cap-race refund audit (Task #265) */}
      <FoundersRingRefunds superuserKey={superuserKey} />

      {/* Coaching Marketplace — pending KYC + open disputes + revenue */}
      <CoachingAdminPanel superuserKey={superuserKey} />

      {/* Task #320 — Commission controls (default + per-coach overrides) */}
      <CommissionControlsPanel superuserKey={superuserKey} />

      {/* Task #320 — Sponsorship slots + recent orders */}
      <SponsorshipsAdminPanel superuserKey={superuserKey} />

      {/* Task #320 — White-label tenants (Model A) */}
      <TenantsAdminPanel superuserKey={superuserKey} />

      {/* Tournament Brackets — active tournaments and bracket management */}
      <TournamentBracketPanel />
      {/* Lootbox seasonal set management (retire / un-retire sets) */}
      <LootboxSetsCard superuserKey={superuserKey} />
      </>)}

      {activeTab === 'seasons' && (<>
      {/* v5.90 — Rating System: read-only status. The V1/V3 toggle and the
          V3-vs-V1 preview were removed because V3 is now the only supported
          engine and we're not going back. The DB column / setting key is
          left in place so historical data and any external scripts keep
          working unchanged. */}
      <section>
        <h2 id="ap-anchor-rating-system" style={{ marginBottom: 6 }}>⚖️ Rating System</h2>
        <div style={{
          padding: 12, background: 'var(--surface-2, rgba(255,255,255,0.03))',
          borderRadius: 8, marginBottom: 16, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Rating engine:</span>
          <strong style={{ color: 'var(--accent)' }}>TrueSkill V3</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            (per-match Impact-weighted µ updates, σ floored at 2.5, no draw probability)
          </span>
        </div>
      </section>
      {/* ── V3 Modifier History debug lookup ─────────────────────────── */}
      <V3ModifierDebugCard />

      </>)}

      {activeTab === 'challenges' && (<>
      <CommunityChallengesPanel superuserKey={superuserKey} />
      </>)}

      {activeTab === 'rivals' && (<>
      <WeeklyRivalsPanel superuserKey={superuserKey} />
      </>)}

      {activeTab === 'config' && (<>
      {/* ── Cron heartbeats (Task #361) ──────────────────────────────── */}
      <CronHeartbeatsPanel superuserKey={superuserKey} />
      {/* ── Stripe configuration banner (Task #113) ─────────────────── */}
      <StripeStatusBanner superuserKey={superuserKey} />
      {/* ── Discord auto-join health (Task #127) ─────────────────────── */}
      <DiscordAutoJoinStatusPanel superuserKey={superuserKey} />
      {/* ── Tier Ladder Preview ──────────────────────────────────────── */}
      <TierLadderPreview />
      {/* ── Coaching Marketplace flag (v5.93 launch kill-switch) ─────── */}
      <CoachingMarketplaceFlagPanel superuserKey={superuserKey} />
      {/* ── Discord Rich Presence (Task #446) ────────────────────────── */}
      <DiscordRichPresenceCard superuserKey={superuserKey} />
      <TestCoachPanel superuserKey={superuserKey} />
      {/* ── Feature Flags full editor ─────────────────────────────────── */}
      <FeatureFlagsEditorCard superuserKey={superuserKey} />
      {/* ── Live Ops Log Buffer ───────────────────────────────────────── */}
      <OpsLogsCard superuserKey={superuserKey} />
      {/* ── Ops History sparklines ────────────────────────────────────── */}
      <OpsHistoryCard superuserKey={superuserKey} />
      {/* ── Engagement Settings ──────────────────────────────────────── */}
      <EngagementSettingsPanel superuserKey={superuserKey} siteSettings={siteSettings} onSaved={loadSiteSettings} />
      <WelcomeModalPanel superuserKey={superuserKey} />
      <HomeBannerPanel superuserKey={superuserKey} />
      <SideBannerPanel superuserKey={superuserKey} />
      <BroadcastTickerPanel superuserKey={superuserKey} />
      </>)}

      {activeTab === 'users' && (<>
      {/* ── Staff Roles — grant admin/moderator tiers to Steam accounts ─ */}
      <RolesPanel superuserKey={superuserKey} />

      {/* ── Discord ID Collisions (Task 114) ─────────────────────────── */}
      <DiscordIdCollisions superuserKey={superuserKey} />

      {/* ── Discord Auto-Join Retry Queue (Task #138) ────────────────── */}
      <DiscordAutoJoinFailures superuserKey={superuserKey} />

      {/* ── Dota Rank Management ─────────────────────────────────────── */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 id="ap-anchor-rank-management" className="section-title" style={{ marginBottom: 12 }}>🎖️ Dota 2 Rank Management</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Sync Dota 2 rank medals from OpenDota (public profiles) and Steam GC (friends). Manual entries are never overwritten by sync.
          Ranks appear on the Leaderboard and Player Profiles.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            className="btn btn-primary"
            disabled={rankSyncing}
            onClick={async () => {
              setRankSyncing(true);
              setRankSyncMsg('');
              try {
                const r = await triggerRankSync(superuserKey);
                setRankSyncMsg(r.message || 'Sync started in background — refresh in ~30s.');
              } catch (e) {
                setRankSyncMsg(`Error: ${e.message}`);
              } finally {
                setRankSyncing(false);
                setTimeout(loadRanks, 5000);
              }
            }}
          >
            {rankSyncing ? '⏳ Syncing…' : '🔄 Sync Ranks from OpenDota/GC'}
          </button>
          {rankSyncMsg && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{rankSyncMsg}</span>
          )}
        </div>

        {/* v5.89 — one-shot import of nicknames + Discord IDs + Dota ranks
            from the community-edition database into this (full-edition) DB.
            Conservative by default: existing rows are NOT overwritten. The
            server reads COMMUNITY_DATABASE_URL from its env, so set that
            secret on the prod host before clicking. */}
        <div style={{ marginTop: 24, padding: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>📥 Import from Community Edition</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Pulls nicknames, Discord IDs, and Dota ranks from the community-edition DB and upserts them here.
            Requires the <code>COMMUNITY_DATABASE_URL</code> secret to be set on the server, pointing at the
            community Postgres. By default only fills empty columns — toggle <em>overwrite</em> to clobber existing values.
          </p>
          <CommunitySyncButton superuserKey={superuserKey} />
        </div>

        <div className="scoreboard-wrapper">
          <table className="scoreboard" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Player</th>
                <th style={{ textAlign: 'left' }}>Account ID</th>
                <th>Dota Rank</th>
                <th>Source</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ranks.map(r => {
                const isEditing = rankEditId === r.account_id;
                const decoded  = decodeRankTier(r.dota_rank_tier);
                return (
                  <tr key={r.account_id}>
                    <td style={{ fontWeight: 600 }}>{r.nickname || `#${r.account_id}`}</td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.account_id}</td>
                    <td style={{ textAlign: 'center' }}>
                      {r.dota_rank_tier
                        ? <RankBadge rankTier={r.dota_rank_tier} leaderboardRank={r.dota_leaderboard_rank} source={r.dota_rank_source} />
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      }
                    </td>
                    <td style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 11 }}>
                      {r.dota_rank_source || '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {r.dota_rank_updated_at ? new Date(r.dota_rank_updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={rankEditMedal}
                            onChange={e => {
                              const m = e.target.value;
                              setRankEditMedal(m);
                              if (m === '8') {
                                setRankEditTier(80);
                                setRankEditStars('');
                              } else if (m && rankEditStars) {
                                setRankEditTier(parseInt(m) * 10 + parseInt(rankEditStars));
                              }
                            }}
                            style={{ padding: '2px 6px', fontSize: 12 }}
                          >
                            <option value="">Medal…</option>
                            {MEDAL_NAMES.map((name, i) => (
                              <option key={i + 1} value={i + 1}>{name}</option>
                            ))}
                          </select>
                          {rankEditMedal && rankEditMedal !== '8' && (
                            <select
                              value={rankEditStars}
                              onChange={e => {
                                const s = e.target.value;
                                setRankEditStars(s);
                                if (rankEditMedal && s) {
                                  setRankEditTier(parseInt(rankEditMedal) * 10 + parseInt(s));
                                }
                              }}
                              style={{ padding: '2px 6px', fontSize: 12 }}
                            >
                              <option value="">Stars…</option>
                              {[1, 2, 3, 4, 5].map(s => (
                                <option key={s} value={s}>{'★'.repeat(s)}</option>
                              ))}
                            </select>
                          )}
                          {rankEditMedal === '8' && (
                            <input
                              type="number"
                              placeholder="LB rank (optional)"
                              value={rankEditLbRank}
                              onChange={e => setRankEditLbRank(e.target.value)}
                              style={{ width: 130, padding: '2px 6px', fontSize: 12 }}
                            />
                          )}
                          {rankEditTier && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>tier={rankEditTier}</span>
                          )}
                          <button
                            className="btn btn-sm"
                            disabled={!rankEditTier}
                            onClick={async () => {
                              try {
                                const lbRank = rankEditMedal === '8' ? (rankEditLbRank || null) : null;
                                await setManualRank(r.account_id, rankEditTier || null, lbRank, superuserKey);
                                setRankEditId(null);
                                loadRanks();
                              } catch (e) { alert(e.message); }
                            }}
                          >Save</button>
                          <button
                            className="btn btn-sm"
                            style={{ background: 'var(--bg-hover)' }}
                            onClick={() => setRankEditId(null)}
                          >Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => {
                              setRankEditId(r.account_id);
                              const existingTier = r.dota_rank_tier || '';
                              setRankEditTier(existingTier);
                              setRankEditLbRank(r.dota_leaderboard_rank || '');
                              if (existingTier) {
                                const medal = Math.floor(existingTier / 10);
                                const stars = existingTier % 10;
                                setRankEditMedal(String(medal));
                                setRankEditStars(medal === 8 ? '' : String(stars));
                              } else {
                                setRankEditMedal('');
                                setRankEditStars('');
                              }
                            }}
                          >✏️ Edit</button>
                          {r.dota_rank_tier && (
                            <button
                              className="btn btn-sm btn-danger"
                              aria-label={`Clear rank for ${r.nickname || r.account_id}`}
                              onClick={async () => {
                                if (!confirm(`Clear rank for ${r.nickname || r.account_id}?`)) return;
                                try {
                                  await clearPlayerRank(r.account_id, superuserKey);
                                  loadRanks();
                                } catch (e) { alert(e.message); }
                              }}
                            >✕</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Manage Nicknames (link to /players) ──────────────────────── */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 id="ap-anchor-nicknames" className="section-title" style={{ marginBottom: 6 }}>✏️ Manage Nicknames</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          The full nickname editor lives on the <strong>Players</strong> page. Set, edit, or clear a nickname,
          link a Discord ID to a registered nickname, and search/sort the full roster from there.
          Discord shortcut: <code>!adminregister &lt;account_id&gt; &lt;nickname&gt;</code>.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/players" className="btn btn-primary">👥 Open Players & Nicknames editor</Link>
          <Link to="/players" className="btn" target="_blank" rel="noreferrer">↗ Open in new tab</Link>
        </div>
      </section>

      {/* ── Profile Sandbox (fully editable test profile) ────────────── */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 id="ap-anchor-profile-preview" className="section-title" style={{ marginBottom: 6 }}>👤 Profile Sandbox</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          Fully interactive test profile with every customization control wired up — bio, custom title,
          theme accent, profile frame (free + premium), pinned hero with caption, pinned match. The live
          preview updates as you edit. Toggle the <strong>Pro mode</strong> switch to verify the locked
          state vs. the unlocked premium state. Nothing is persisted — pure client-side simulator of
          <code>/settings/profile</code> for previewing changes before they go live to real users.
          (If you instead want to peek at a real player's profile, paste their <code>account_id</code>
          into the URL: <code>/player/&lt;id&gt;</code>.)
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/admin/profile-sandbox" className="btn btn-primary">▶ Launch Profile Sandbox</Link>
          <Link to="/admin/profile-sandbox" className="btn" target="_blank" rel="noreferrer">↗ Open in new tab</Link>
        </div>
      </section>

      {/* ── Unregistered Players ──────────────────────────────────────── */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 id="ap-anchor-unregistered-players" className="section-title" style={{ marginBottom: 12 }}>👤 Unregistered Players</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          Players with match history but no registered nickname. Highlighted rows share a persona name with another account — possible duplicates or alternate accounts.
          Register via <code>!adminregister &lt;account_id&gt; &lt;nickname&gt;</code> in Discord.
        </p>
        <button
          className="btn btn-sm"
          disabled={unregLoading}
          onClick={loadUnregistered}
          style={{ marginBottom: 14 }}
        >
          {unregLoading ? '⏳ Loading…' : '🔍 Check Unregistered Players'}
        </button>
        {unregistered !== null && (
          unregistered.length === 0
            ? <p style={{ color: 'var(--accent-green)', fontSize: 13 }}>✓ All active players are registered.</p>
            : (
              <div className="scoreboard-wrapper">
                <table className="scoreboard" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Account ID</th>
                      <th style={{ textAlign: 'left' }}>Steam Name</th>
                      <th>Games</th>
                      <th>Last Played</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unregistered.map(p => (
                      <tr key={p.account_id} style={p.possible_duplicate ? { background: 'rgba(245,158,11,0.08)' } : {}}>
                        <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          <a href={`/player/${p.account_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{p.account_id}</a>
                        </td>
                        <td style={{ fontWeight: 600 }}>{p.persona_name}</td>
                        <td style={{ textAlign: 'center' }}>{p.games}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          {p.last_played ? new Date(p.last_played).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: 11 }}>
                          {p.possible_duplicate && (
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠ possible duplicate</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}
      </section>

      <section id="signup-requests" style={{ marginTop: 40 }}>
        <h2 className="section-title">Sign-Up Requests</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {['pending', 'approved', 'rejected', ''].map(f => (
            <button
              key={f || 'all'}
              className="btn btn-sm"
              style={{ background: signupsFilter === f ? 'var(--accent)' : 'var(--bg-card)', color: signupsFilter === f ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}
              onClick={() => setSignupsFilter(f)}
            >
              {f ? f.charAt(0).toUpperCase() + f.slice(1) : 'All'}
            </button>
          ))}
          <button className="btn btn-sm" onClick={loadSignups} style={{ marginLeft: 8 }}>Refresh</button>
        </div>
        {signups.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No sign-up requests found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {signups.map(req => {
              const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];
              const pos = Array.isArray(req.preferred_positions) && req.preferred_positions.length > 0
                ? req.preferred_positions.map((p, i) => `${ORDINAL[i] || (i+1+'th')} Pos ${p}`).join(' → ')
                : '';
              const date = req.submitted_at ? new Date(req.submitted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
              const statusColor = req.status === 'approved' ? 'var(--accent-green)' : req.status === 'rejected' ? 'var(--accent-red)' : '#f59e0b';
              return (
                <div key={req.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {req.discord_username}
                        <span style={{ marginLeft: 10, fontSize: 12, color: statusColor, fontWeight: 600, textTransform: 'capitalize' }}>{req.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Discord ID</div>
                      {req.preferred_name && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Name: {req.preferred_name}</div>}
                      {req.steam_url && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Steam: <a href={req.steam_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{req.steam_url}</a></div>}
                      {req.mmr && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Peak MMR / Rank: <strong style={{ color: 'var(--text-primary)' }}>{req.mmr}</strong></div>}
                      {pos && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Position preference: {pos}</div>}
                      {req.referral && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Referral: <span style={{ color: 'var(--text-secondary)' }}>{req.referral}</span></div>}
                      {req.message && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, fontStyle: 'italic' }}>"{req.message}"</div>}
                      {req.admin_notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Admin notes: {req.admin_notes}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Submitted: {date}</div>
                      {signupFeedback[req.id] && (
                        <div style={{ marginTop: 6, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ color: signupFeedback[req.id].dmSent ? 'var(--accent-green)' : '#f59e0b' }}>
                            {signupFeedback[req.id].dmSent ? '✉️ DM sent' : '⚠️ DM not sent (user may have DMs off)'}
                          </span>
                          {signupFeedback[req.id].registered && <span style={{ color: 'var(--accent-green)' }}>✅ Auto-registered</span>}
                          {signupFeedback[req.id].registerError && <span style={{ color: '#f59e0b' }}>⚠️ {signupFeedback[req.id].registerError}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
                      <textarea
                        placeholder="Admin notes (optional)…"
                        value={signupNotes[req.id] ?? (req.admin_notes || '')}
                        onChange={e => setSignupNotes(n => ({ ...n, [req.id]: e.target.value }))}
                        rows={2}
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#15803d', color: '#fff', flex: 1 }}
                          onClick={async () => {
                            try {
                              const result = await updateSignupRequest(req.id, { status: 'approved', adminNotes: signupNotes[req.id] ?? req.admin_notes }, superuserKey);
                              setSignupFeedback(f => ({ ...f, [req.id]: result }));
                              loadSignups();
                            } catch (e) { alert(e.message); }
                          }}
                        >Approve</button>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#7f1d1d', color: '#fff', flex: 1 }}
                          onClick={async () => {
                            try {
                              const result = await updateSignupRequest(req.id, { status: 'rejected', adminNotes: signupNotes[req.id] ?? req.admin_notes }, superuserKey);
                              setSignupFeedback(f => ({ ...f, [req.id]: result }));
                              loadSignups();
                            } catch (e) { alert(e.message); }
                          }}
                        >Reject</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      </>)}

      {activeTab === 'seasons' && (<>
      <section style={{ marginBottom: 36 }}>
        <h2 id="ap-anchor-hero-tier" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🏆 Hero Tier Overrides</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Manually set a hero's tier to override the auto-computed tier (based on win rate). Leave blank to revert to auto-computed.
        </p>
        <HeroTierOverridesPanel superuserKey={superuserKey} selectedSeason={activeSeason} />
      </section>

      </>)}

      {activeTab === 'matches' && (<>
      <section style={{ marginBottom: 36 }}>
        <h2 id="ap-anchor-replay-inspector" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🔍 Replay Inspector</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Upload a <code>.dem</code> file to see the raw account IDs extracted by the parser — useful for verifying accounts before committing a replay.
        </p>
        <ReplayInspectorPanel superuserKey={superuserKey} />
      </section>

      </>)}

      {activeTab === 'seasons' && (<>
      <section style={{ marginBottom: 36 }}>
        <h2 id="ap-anchor-achievements" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🏅 Achievement System</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Achievements are automatically checked after each match. Use this to backfill achievements for all existing matches in the database.
        </p>
        <RecomputeAchievementsPanel superuserKey={superuserKey} />
      </section>
      </>)}

        </div>
      </div>
    </div>
    </AdminErrorBoundary>
  );
}

function RecomputeAchievementsPanel({ superuserKey }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleRecompute = async () => {
    if (!window.confirm('This will scan all players and grant any achievements they have earned but not yet been awarded. This may take a moment. Continue?')) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const data = await recomputeAchievements(superuserKey);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleRecompute}
        disabled={loading}
        style={{
          background: loading ? 'var(--bg-secondary)' : 'var(--accent-blue)',
          color: loading ? 'var(--text-muted)' : '#fff',
          border: 'none', borderRadius: 8, padding: '10px 22px',
          cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14,
        }}
      >
        {loading ? '⏳ Recomputing…' : '🔄 Recompute All Achievements'}
      </button>
      {result && (
        <div style={{ marginTop: 12, padding: '10px 16px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--radiant-color)', color: 'var(--radiant-color)', fontSize: 14 }}>
          ✅ Done! Processed <strong>{result.players}</strong> players and granted <strong>{result.granted}</strong> new achievements.
        </div>
      )}
      {error && (
        <div style={{ marginTop: 12, padding: '10px 16px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--dire-color)', color: 'var(--dire-color)', fontSize: 14 }}>
          ❌ Error: {error}
        </div>
      )}
    </div>
  );
}

function HeroTypeahead({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedHero = value ? ALL_HEROES.find(h => h.id === value) : null;

  const filtered = query.trim()
    ? ALL_HEROES.filter(h => h.name.toLowerCase().includes(query.trim().toLowerCase()))
    : ALL_HEROES;

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery(selectedHero ? selectedHero.name : '');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [selectedHero]);

  const handleFocus = () => {
    if (selectedHero && !query) setQuery(selectedHero.name);
    setOpen(true);
  };

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    onChange(null);
  };

  const handleSelect = (hero) => {
    onChange(hero.id);
    setQuery(hero.name);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: 220 }}>
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder="Search hero name…"
        autoComplete="off"
        style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
          maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {filtered.map(hero => (
            <div
              key={hero.id}
              onMouseDown={() => handleSelect(hero)}
              style={{
                padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                color: value === hero.id ? 'var(--accent-blue)' : 'var(--text-primary)',
                background: value === hero.id ? 'rgba(59,130,246,0.1)' : 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = value === hero.id ? 'rgba(59,130,246,0.1)' : 'transparent'}
            >
              {hero.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>#{hero.id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeroTierOverridesPanel({ superuserKey, selectedSeason }) {
  const seasonId = selectedSeason ? selectedSeason.id : null;
  const [overrides, setOverrides] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [heroId, setHeroId] = useState(null);
  const [tier, setTier] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoadingList(true);
    try {
      const d = await getAdminHeroTierOverrides(seasonId, superuserKey);
      setOverrides(d.overrides || []);
    } catch (e) {
      setMsg('Error: ' + e.message);
    } finally {
      setLoadingList(false);
    }
  }, [seasonId, superuserKey]);

  useEffect(() => { load(); }, [load]);

  const handleSet = async (e) => {
    e.preventDefault();
    if (!heroId || !tier) { setMsg('Hero name and Tier are required'); return; }
    setSaving(true); setMsg('');
    try {
      await setAdminHeroTierOverride({ season_id: seasonId, hero_id: heroId, tier }, superuserKey);
      setHeroId(null); setTier('');
      setMsg('Override saved.');
      await load();
    } catch (e) {
      setMsg('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (hid) => {
    if (!window.confirm('Remove this tier override?')) return;
    try {
      await deleteAdminHeroTierOverride(hid, seasonId, superuserKey);
      setMsg('Override removed.');
      await load();
    } catch (e) {
      setMsg('Error: ' + e.message);
    }
  };

  const TIER_COLORS = { S: '#ff6b35', A: '#f7c059', B: '#a3e635', C: '#60a5fa', D: '#f87171' };

  return (
    <div>
      <form onSubmit={handleSet} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hero</label>
          <HeroTypeahead value={heroId} onChange={setHeroId} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tier</label>
          <select value={tier} onChange={e => setTier(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            <option value="">-- Select --</option>
            {['S', 'A', 'B', 'C', 'D'].map(t => <option key={t} value={t}>{t} Tier</option>)}
          </select>
        </div>
        <button type="submit" disabled={saving} style={{ padding: '7px 18px', borderRadius: 6, background: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {saving ? 'Saving…' : 'Set Override'}
        </button>
      </form>

      {msg && <p style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)', marginBottom: 10 }}>{msg}</p>}

      {loadingList ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading overrides…</p>
      ) : overrides.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No overrides set{selectedSeason ? ` for ${selectedSeason.name}` : ' for all-time'}.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px' }}>Hero</th>
              <th style={{ textAlign: 'left', padding: '6px 10px' }}>Tier</th>
              <th style={{ textAlign: 'left', padding: '6px 10px' }}>Set By</th>
              <th style={{ textAlign: 'left', padding: '6px 10px' }}>Set At</th>
              <th style={{ textAlign: 'left', padding: '6px 10px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map(ov => (
              <tr key={ov.hero_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ fontWeight: 600 }}>{getHeroName(ov.hero_id)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>#{ov.hero_id}</span>
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ background: TIER_COLORS[ov.tier] || '#888', color: '#111', fontWeight: 700, padding: '2px 10px', borderRadius: 5 }}>{ov.tier}</span>
                </td>
                <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{ov.set_by || '—'}</td>
                <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{ov.set_at ? new Date(ov.set_at).toLocaleString() : '—'}</td>
                <td style={{ padding: '8px 10px' }}>
                  <button onClick={() => handleDelete(ov.hero_id)} style={{ padding: '3px 10px', borderRadius: 5, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ReplayInspectorPanel({ superuserKey }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('replay', file);
      const res = await superuserFetch('/api/replay-inspect', {
        method: 'POST',
        headers: { 'x-superuser-key': superuserKey },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <input
          type="file"
          accept=".dem"
          onChange={e => setFile(e.target.files[0] || null)}
          style={{ color: 'var(--text-primary)' }}
        />
        <button
          type="submit"
          disabled={!file || loading}
          style={{ padding: '0.4rem 1.2rem', background: '#1e3a5f', color: '#60a5fa', border: '1px solid #3b82f6', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
        >
          {loading ? 'Parsing…' : 'Inspect Replay'}
        </button>
        {file && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span>}
      </form>
      {error && <div style={{ color: '#f87171', padding: '0.5rem', background: '#1a0808', borderRadius: 4, marginBottom: '1rem' }}>❌ {error}</div>}
      {result && (
        <div>
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {result.match_id && <span>Match ID: <strong style={{ color: 'var(--text-primary)' }}>{result.match_id}</strong></span>}
            {result.duration && <span>Duration: <strong style={{ color: 'var(--text-primary)' }}>{Math.floor(result.duration / 60)}:{String(result.duration % 60).padStart(2, '0')}</strong></span>}
            {result.radiant_win != null && <span>Winner: <strong style={{ color: result.radiant_win ? '#4ade80' : '#f87171' }}>{result.radiant_win ? 'Radiant' : 'Dire'}</strong></span>}
            <span>Players: <strong style={{ color: 'var(--text-primary)' }}>{result.players?.length ?? 0}</strong></span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Slot', 'Team', 'Steam32 (account_id)', 'Steam64', 'Persona Name', 'Hero', 'K/D/A'].map(h => (
                    <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(result.players || []).map((p, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-muted)' }}>{p.slot}</td>
                    <td style={{ padding: '0.35rem 0.6rem', color: p.team === 'radiant' ? '#4ade80' : '#f87171', fontWeight: 600 }}>{p.team}</td>
                    <td style={{ padding: '0.35rem 0.6rem', fontFamily: 'monospace', color: '#60a5fa' }}>{p.account_id || <span style={{ color: '#555' }}>unknown</span>}</td>
                    <td style={{ padding: '0.35rem 0.6rem', fontFamily: 'monospace', color: '#a78bfa', fontSize: '0.78rem' }}>{p.steam64 || '—'}</td>
                    <td style={{ padding: '0.35rem 0.6rem' }}>{p.persona_name || <span style={{ color: '#555' }}>—</span>}</td>
                    <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-muted)' }}>{p.hero_name ? p.hero_name.replace('npc_dota_hero_', '').replace(/_/g, ' ') : '—'}</td>
                    <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-muted)' }}>{p.kills}/{p.deaths}/{p.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── Gift Purchases audit panel ─────────
// ── Economy & Pricing panel (Task #700) ─────────────────────────────────────
// All coin/Stripe prices are now admin-editable via DB overrides that take
// effect within 30 s for new purchases (instantly on save via cache clear).
const ECON_PRICE_GROUPS = [
  {
    label: 'Pro Membership',
    fields: [
      { key: 'pro_monthly_cents',  label: 'Pro Monthly price',           unit: 'AUD cents', note: 'Stripe checkout. Default $6.00 AUD (600 cents).' },
      { key: 'pro_lifetime_cents', label: 'Pro Lifetime / Gift Pro price', unit: 'AUD cents', note: 'Stripe checkout. Default $50.00 AUD (5000 cents).' },
    ],
  },
  {
    label: 'Gift Checkout',
    fields: [
      { key: 'gift_season_pass_cents', label: 'Gift: Season Pass price', unit: 'AUD cents', note: 'Default $7.99 AUD (799 cents).' },
    ],
  },
  {
    label: 'Profile Frames (Stripe)',
    fields: [
      { key: 'frame_gold_cents',     label: 'Gold frame',     unit: 'AUD cents', note: 'Default $2.99 AUD (299 cents).' },
      { key: 'frame_neon_blue_cents', label: 'Neon Blue frame', unit: 'AUD cents', note: 'Default $2.99 AUD (299 cents).' },
      { key: 'frame_cosmic_cents',   label: 'Cosmic frame',   unit: 'AUD cents', note: 'Default $3.99 AUD (399 cents).' },
      { key: 'frame_fire_cents',     label: 'Fire frame',     unit: 'AUD cents', note: 'Default $3.99 AUD (399 cents).' },
    ],
  },
  {
    label: 'Founders Rings (Stripe)',
    fields: [
      { key: 'founders_ring_cents',          label: 'Founders Pass (Inscribed) ring',     unit: 'AUD cents', note: 'Legacy capped ring. Default $9.99 AUD (999 cents).' },
      { key: 'founder_ring_static_cents',    label: 'Individual Static rings (Classic, Laurel)', unit: 'AUD cents', note: 'Default $4.99 AUD (499 cents).' },
      { key: 'founder_ring_animated_cents',  label: 'Individual Animated rings (all others)',    unit: 'AUD cents', note: 'Default $7.99 AUD (799 cents).' },
    ],
  },
  {
    label: 'Coin Cosmetic Prices',
    fields: [
      { key: 'coin_voice_pack_cents',            label: 'Voice Packs (all 5 SKUs)',               unit: 'coins', note: 'Default 800 🪙.' },
      { key: 'coin_layout_theme_cents',          label: 'Layout Themes (all 5 SKUs)',             unit: 'coins', note: 'Default 1200 🪙.' },
      { key: 'coin_frame_cents',                 label: 'Premium Frames (Neon Blue, Cosmic, Fire)', unit: 'coins', note: 'Default 2500 🪙.' },
      { key: 'coin_founder_ring_static_cents',   label: 'Static Founder Rings (Classic, Laurel)',  unit: 'coins', note: 'Default 1200 🪙.' },
      { key: 'coin_founder_ring_animated_cents', label: 'Animated Founder Rings (all others)',     unit: 'coins', note: 'Default 2000 🪙.' },
    ],
  },
  {
    label: 'Coin Top-Up Packs',
    fields: [
      { key: 'coin_pack_starter_coins',   label: 'Starter — coins awarded', unit: 'coins',     note: 'Default 500.' },
      { key: 'coin_pack_starter_cents',   label: 'Starter — price',         unit: 'AUD cents', note: 'Default $4.99 AUD (499 cents).' },
      { key: 'coin_pack_standard_coins',  label: 'Standard — coins awarded', unit: 'coins',    note: 'Default 1200.' },
      { key: 'coin_pack_standard_cents',  label: 'Standard — price',         unit: 'AUD cents', note: 'Default $9.99 AUD (999 cents).' },
      { key: 'coin_pack_premium_coins',   label: 'Premium — coins awarded', unit: 'coins',     note: 'Default 2800.' },
      { key: 'coin_pack_premium_cents',   label: 'Premium — price',         unit: 'AUD cents', note: 'Default $19.99 AUD (1999 cents).' },
      { key: 'coin_pack_whale_coins',     label: 'Whale — coins awarded',   unit: 'coins',     note: 'Default 7500.' },
      { key: 'coin_pack_whale_cents',     label: 'Whale — price',           unit: 'AUD cents', note: 'Default $49.99 AUD (4999 cents).' },
    ],
  },
];

function EconomyPricingPanel({ superuserKey }) {
  const [data, setData] = React.useState(null);
  const [draft, setDraft] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!superuserKey) return;
    try {
      const j = await getAdminEconomyPrices(superuserKey);
      setData(j);
      setDraft({});
      setMsg('');
    } catch (e) { setMsg(`Load error: ${e.message}`); }
  }, [superuserKey]);

  React.useEffect(() => { if (open) load(); }, [open, load]);

  const handleChange = (key, val) => setDraft(d => ({ ...d, [key]: val }));
  const handleReset = (key) => setDraft(d => { const n = { ...d }; delete n[key]; return { ...n, [key]: '' }; });

  const save = async () => {
    if (!window.confirm('Save all economy price overrides? Empty fields will revert to the hardcoded default.')) return;
    setSaving(true); setMsg('');
    try {
      await setAdminEconomyPrices(draft, superuserKey);
      setMsg('Prices saved. Cache cleared — effective for new purchases immediately.');
      load();
    } catch (e) { setMsg(`Save error: ${e.message}`); }
    finally { setSaving(false); }
  };

  const fmtAud = (cents) => cents != null ? `$${(cents / 100).toFixed(2)} AUD` : '—';
  const fmtDate = (ts) => ts ? new Date(ts).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  return (
    <section style={{ marginBottom: 36 }} aria-labelledby="ap-anchor-economy-pricing">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <h2 id="ap-anchor-economy-pricing" style={{ margin: 0 }}>💰 Economy &amp; Pricing</h2>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer' }}>
          {open ? 'Collapse ▲' : 'Expand ▼'}
        </button>
      </div>
      {!open && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
          Live-editable overrides for all Stripe and coin prices — Pro, gifts, frames, founders rings, coin cosmetics, and top-up packs. Click Expand to edit.
        </p>
      )}
      {open && (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0, marginBottom: 12 }}>
            Override any price below. Leave a field blank to use the hardcoded default. Changes take effect immediately for new purchases (30 s TTL cache, cleared on save).
          </p>
          {msg && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: msg.startsWith('Save error') || msg.startsWith('Load error') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: msg.startsWith('Save error') || msg.startsWith('Load error') ? '#ef4444' : 'var(--accent-green)', fontSize: 13 }}>
              {msg}
            </div>
          )}
          {!data && !msg && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>}
          {data && ECON_PRICE_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, marginTop: 0 }}>
                {group.label}
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 10px 4px 0', fontWeight: 500, minWidth: 220 }}>Price point</th>
                    <th style={{ padding: '4px 10px', fontWeight: 500 }}>Default</th>
                    <th style={{ padding: '4px 10px', fontWeight: 500 }}>Current effective</th>
                    <th style={{ padding: '4px 0', fontWeight: 500 }}>Override</th>
                    <th style={{ padding: '4px 0 4px 8px', fontWeight: 500, width: 70 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {group.fields.map(f => {
                    const def = data.defaults?.[f.key];
                    const eff = data.effective?.[f.key];
                    const ov  = data.overrides?.[f.key];
                    const draftVal = draft[f.key];
                    const displayVal = draftVal !== undefined ? draftVal : (ov != null ? String(ov) : '');
                    const isOverridden = ov != null;
                    const isDirty = draftVal !== undefined;
                    return (
                      <tr key={f.key} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '7px 10px 7px 0' }}>
                          <span style={{ fontWeight: isOverridden ? 600 : 400 }}>{f.label}</span>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{f.note}</div>
                        </td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-muted)' }}>
                          {def} {f.unit}
                        </td>
                        <td style={{ padding: '7px 10px', color: isOverridden ? 'var(--accent)' : 'var(--text-muted)', fontWeight: isOverridden ? 600 : 400 }}>
                          {eff} {f.unit}
                          {isOverridden && <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--accent)' }}>overridden</span>}
                        </td>
                        <td style={{ padding: '7px 10px 7px 0' }}>
                          <input
                            type="number" min="1" step="1"
                            value={displayVal}
                            placeholder={String(def)}
                            aria-label={`Override price for ${f.label}`}
                            onChange={e => handleChange(f.key, e.target.value)}
                            style={{ width: 100, padding: '4px 8px', borderRadius: 5, border: `1px solid ${isDirty ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }}
                          />
                        </td>
                        <td style={{ padding: '7px 0 7px 8px' }}>
                          {(isOverridden || (isDirty && displayVal !== '')) && (
                            <button type="button" onClick={() => handleReset(f.key)}
                              aria-label={`Reset ${f.label} to default`}
                              style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              ↩ Reset
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {data && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" onClick={save} disabled={saving}
                style={{ padding: '7px 20px', borderRadius: 6, background: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : '💾 Save all overrides'}
              </button>
              <button type="button" onClick={load}
                style={{ padding: '7px 14px', borderRadius: 6, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
                Refresh
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Blank fields revert to the hardcoded default on save.
              </span>
            </div>
          )}

          {data?.audit?.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Recent changes
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 10px 4px 0', fontWeight: 500 }}>When</th>
                    <th style={{ padding: '4px 10px', fontWeight: 500 }}>Changed by</th>
                    <th style={{ padding: '4px 0', fontWeight: 500 }}>Keys changed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audit.map(row => {
                    const newObj = (() => { try { return JSON.parse(row.new_value || '{}'); } catch { return {}; } })();
                    const oldObj = (() => { try { return JSON.parse(row.old_value || '{}'); } catch { return {}; } })();
                    const changed = Object.keys({ ...newObj, ...oldObj }).filter(k => newObj[k] !== oldObj[k]);
                    return (
                      <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px 5px 0', whiteSpace: 'nowrap' }}>{fmtDate(row.changed_at)}</td>
                        <td style={{ padding: '5px 10px' }}>{row.changed_by}</td>
                        <td style={{ padding: '5px 0', color: 'var(--text-muted)', maxWidth: 400 }}>
                          {changed.length > 0
                            ? changed.map(k => `${k}: ${oldObj[k] ?? 'default'} → ${newObj[k] ?? 'default'}`).join(', ')
                            : 'no changes'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function GiftPurchasesPanel({ superuserKey }) {
  const [gifts, setGifts] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!superuserKey) return;
    setLoading(true);
    setError('');
    try {
      const r = await superuserFetch('/api/admin/gifts?limit=100', {
        credentials: 'include',
        headers: { 'X-Superuser-Key': superuserKey },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setGifts(d.gifts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [superuserKey]);

  function formatGiftType(t) {
    if (!t) return '—';
    if (t === 'pro') return 'Pro Membership';
    if (t === 'season_pass') return 'Season Pass';
    return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function formatMoney(cents, currency) {
    if (cents == null) return '—';
    return `${(currency || 'AUD').toUpperCase()} $${(cents / 100).toFixed(2)}`;
  }

  function formatDate(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleString(); } catch (_) { return s; }
  }

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
        <h2 id="ap-anchor-gifts" style={{ margin: 0 }}>🎁 Gift Purchases</h2>
        <button className="btn" onClick={load} disabled={loading} style={{ fontSize: 12 }}>
          {loading ? 'Loading…' : gifts ? 'Refresh' : 'Load'}
        </button>
      </div>
      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
      {gifts && gifts.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No gift purchases recorded yet.</p>
      )}
      {gifts && gifts.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Gifter</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Recipient</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Amount</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Completed</th>
              </tr>
            </thead>
            <tbody>
              {gifts.map(g => (
                <tr key={g.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '5px 10px 5px 0', whiteSpace: 'nowrap' }}>{formatDate(g.created_at)}</td>
                  <td style={{ padding: '5px 10px 5px 0' }}>{formatGiftType(g.gift_type)}</td>
                  <td style={{ padding: '5px 10px 5px 0' }}>{g.gifter_name || g.gifter_account_id}</td>
                  <td style={{ padding: '5px 10px 5px 0' }}>{g.recipient_name || g.recipient_account_id}</td>
                  <td style={{ padding: '5px 10px 5px 0', whiteSpace: 'nowrap' }}>{formatMoney(g.amount_cents, g.currency)}</td>
                  <td style={{ padding: '5px 10px 5px 0' }}>
                    <span style={{ color: g.status === 'completed' ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: g.status === 'completed' ? 600 : 400 }}>
                      {g.status || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '5px 10px 5px 0', whiteSpace: 'nowrap' }}>{formatDate(g.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ───────── Coaching Marketplace admin panel (T13) ─────────
// Renders nothing if /api/admin/coaching/dashboard returns 404 (flag off).
// Shows pending KYC, open disputes, and revenue summary; lets superusers
// resolve disputes (release/refund) and apply sanctions (warn/suspend).
function CoachingAdminPanel({ superuserKey }) {
  const [data, setData] = React.useState(null);
  const [hidden, setHidden] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const load = React.useCallback(async () => {
    if (!superuserKey) return;
    try {
      const r = await superuserFetch('/api/admin/coaching/dashboard', {
        credentials: 'include',
        headers: { 'X-Superuser-Key': superuserKey },
      });
      if (r.status === 404) { setHidden(true); return; }
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setData(await r.json());
    } catch (e) { setMsg(`Error: ${e.message}`); }
  }, [superuserKey]);

  React.useEffect(() => { load(); }, [load]);

  const resolveDispute = async (id, resolution) => {
    const note = prompt(`Note for ${resolution} (audit log only):`);
    if (note === null) return;
    const r = await superuserFetch(`/api/admin/coaching/dispute/${id}/resolve`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
      body: JSON.stringify({ resolution, note }),
    });
    if (r.ok) { setMsg('Dispute resolved'); load(); }
    else setMsg(`Error: ${(await r.json()).error}`);
  };

  const sanction = async (coachAccountId) => {
    const reason = prompt('Sanction reason:');
    if (!reason) return;
    // Backend (db.applyCoachSanction) accepts only these three canonical
    // severities — must match the CHECK constraint on coach_sanctions.
    const severity = prompt('Severity (warning / suspended / delisted):', 'warning');
    if (!['warning', 'suspended', 'delisted'].includes(severity)) return;
    const r = await superuserFetch('/api/admin/coaching/sanction', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
      body: JSON.stringify({ coach_account_id: coachAccountId, severity, reason }),
    });
    if (r.ok) { setMsg(`Sanction applied: ${severity}`); load(); }
    else setMsg(`Error: ${(await r.json()).error}`);
  };

  if (hidden) return null;
  if (!data) return (
    <section><h2 id="ap-anchor-coaching">🎓 Coaching Marketplace</h2>
      <p style={{ color: 'var(--text-muted)' }}>{msg || 'Loading…'}</p>
    </section>
  );

  return (
    <section>
      <h2 id="ap-anchor-coaching" style={{ marginBottom: 6 }}>🎓 Coaching Marketplace</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Operational dashboard. Revenue figures show the gross 10% platform fee on completed bookings (excluding Stripe processor fees, which are deducted from the coach's split).
        Sanctions are immediate; dispute resolutions trigger refunds/releases.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Stat label="Active coaches" value={data.stats?.active_coaches ?? 0} />
        <Stat label="Pending KYC" value={data.stats?.pending_kyc ?? 0} />
        <Stat label="Open disputes" value={data.stats?.open_disputes ?? 0} accent={data.stats?.open_disputes > 0 ? '#fbbf24' : null} />
        <Stat label="Bookings (30d)" value={data.stats?.bookings_30d ?? 0} />
        <Stat label="Platform fees (30d)" value={`$${((data.stats?.platform_fees_30d_cents || 0) / 100).toFixed(2)}`} />
        <Stat label="Lifetime revenue" value={`$${((data.revenue?.total_cents || 0) / 100).toFixed(2)}`}
              accent="var(--radiant-color)" />
      </div>

      {(data.pending_kyc?.length || 0) > 0 && (
        <>
          <h3 style={{ marginBottom: 6 }}>Pending KYC</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th align="left">Coach</th><th align="left">Stripe acct</th><th align="left">Created</th>
            </tr></thead>
            <tbody>{data.pending_kyc.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 6 }}>{c.display_name || `#${c.id}`}</td>
                <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{c.stripe_account_id || '—'}</td>
                <td style={{ padding: 6 }}>{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}

      {(data.open_disputes?.length || 0) > 0 && (
        <>
          <h3 style={{ marginBottom: 6, color: '#fbbf24' }}>Open disputes ({data.open_disputes.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th align="left">Booking</th><th align="left">Student</th><th align="left">Coach</th>
              <th align="left">Reason</th><th align="right">Amount</th><th></th>
            </tr></thead>
            <tbody>{data.open_disputes.map(d => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 6 }}>#{d.id}</td>
                <td style={{ padding: 6 }}>{d.student_name}</td>
                <td style={{ padding: 6 }}>{d.coach_name}</td>
                <td style={{ padding: 6, maxWidth: 280, fontSize: 12 }}>{d.dispute_reason}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>${(d.amount_cents / 100).toFixed(2)}</td>
                <td style={{ padding: 6 }}>
                  <button onClick={() => resolveDispute(d.id, 'release')}
                    style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--radiant-color)', color: '#fff', border: 0, cursor: 'pointer', marginRight: 4, fontSize: 12 }}>Release</button>
                  <button onClick={() => resolveDispute(d.id, 'refund')}
                    style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--dire-color)', color: '#fff', border: 0, cursor: 'pointer', marginRight: 4, fontSize: 12 }}>Refund</button>
                  <button onClick={() => sanction(d.coach_account_id)}
                    style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>Sanction coach</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}

      {(data.recent_sanctions?.length || 0) > 0 && (
        <>
          <h3 style={{ marginBottom: 6 }}>Recent sanctions</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th align="left">When</th><th align="left">Coach</th>
              <th align="left">Severity</th><th align="left">Reason</th><th align="left">Expires</th>
            </tr></thead>
            <tbody>{data.recent_sanctions.slice(0, 25).map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(s.applied_at).toLocaleString()}
                </td>
                <td style={{ padding: 6 }}>{s.coach_name || `#${s.coach_account_id}`}</td>
                <td style={{ padding: 6 }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: s.severity === 'delisted' ? 'var(--dire-color)'
                              : s.severity === 'suspended' ? '#fbbf24' : 'var(--border)',
                    color: s.severity === 'warning' ? 'var(--text-primary)' : '#fff',
                  }}>{s.severity}</span>
                </td>
                <td style={{ padding: 6, maxWidth: 320, fontSize: 12 }}>{s.reason}</td>
                <td style={{ padding: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}

      {(!data.pending_kyc?.length && !data.open_disputes?.length && !data.recent_sanctions?.length) && (
        <p style={{ color: 'var(--text-muted)' }}>No pending KYC, open disputes, or sanctions. ✓</p>
      )}

      {msg && <p style={{ color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)' }}>{msg}</p>}
    </section>
  );
}

// ───────── Task #320: Commission controls panel ─────────
function CommissionControlsPanel({ superuserKey }) {
  const [data, setData] = React.useState(null);
  const [msg, setMsg] = React.useState('');
  const [defaultPct, setDefaultPct] = React.useState('');

  const load = React.useCallback(async () => {
    if (!superuserKey) return;
    try {
      const r = await superuserFetch('/api/admin/coaching/commission', {
        credentials: 'include', headers: { 'X-Superuser-Key': superuserKey },
      });
      if (r.status === 404) { setData({ hidden: true }); return; }
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      const j = await r.json();
      setData(j);
      setDefaultPct(((j.default_bps || 0) / 100).toFixed(2));
    } catch (e) { setMsg(`Error: ${e.message}`); }
  }, [superuserKey]);
  React.useEffect(() => { load(); }, [load]);

  const saveDefault = async () => {
    const bps = Math.round(parseFloat(defaultPct) * 100);
    if (!Number.isFinite(bps) || bps < 0 || bps > 5000) { setMsg('0–50% only'); return; }
    const r = await superuserFetch('/api/admin/coaching/commission/default', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
      body: JSON.stringify({ bps }),
    });
    if (r.ok) { setMsg(`Default commission saved (${defaultPct}%)`); load(); }
    else setMsg(`Error: ${(await r.json()).error}`);
  };

  const saveCoach = async (coach, rawPct, tier) => {
    let bps = null;
    if (rawPct !== '' && rawPct != null) {
      bps = Math.round(parseFloat(rawPct) * 100);
      if (!Number.isFinite(bps) || bps < 0 || bps > 5000) { setMsg('Coach % must be 0–50'); return; }
    }
    const r = await superuserFetch('/api/admin/coaching/commission/coach', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
      body: JSON.stringify({ account_id: coach.account_id, bps, tier }),
    });
    if (r.ok) { setMsg(`Saved override for #${coach.account_id}`); load(); }
    else setMsg(`Error: ${(await r.json()).error}`);
  };

  if (!data) return <section><h2 id="ap-anchor-commission">💸 Coaching commission</h2><p style={{ color: 'var(--text-muted)' }}>{msg || 'Loading…'}</p></section>;
  if (data.hidden) return null;

  return (
    <section>
      <h2 id="ap-anchor-commission" style={{ marginBottom: 6 }}>💸 Coaching commission</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Site default is applied to every booking unless the coach has an override or is on the premium tier (auto-discount to 7%).
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label htmlFor="default-pct" style={{ fontSize: 13 }}>Site default %:</label>
        <input id="default-pct" type="number" min="0" max="50" step="0.5" value={defaultPct}
          onChange={e => setDefaultPct(e.target.value)}
          style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        <button type="button" onClick={saveDefault}
          style={{ padding: '5px 14px', borderRadius: 6, background: 'var(--accent-blue)', color: '#fff', border: 0, cursor: 'pointer', fontSize: 13 }}>
          Save default
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          (currently {((data.default_bps || 0) / 100).toFixed(2)}%)
        </span>
      </div>

      {(data.coaches?.length || 0) > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th align="left">Coach</th><th align="left">Status</th>
            <th align="left">Override %</th><th align="left">Auto-tier</th>
            <th align="left">Premium</th><th align="left">Earnings preview</th><th></th>
          </tr></thead>
          <tbody>{data.coaches.map(c => (
            <CoachCommissionRow key={c.account_id}
              coach={{ ...c, site_default_bps: data.default_bps }} onSave={saveCoach} />
          ))}</tbody>
        </table>
      ) : <p style={{ color: 'var(--text-muted)' }}>No coaches yet.</p>}
      {msg && <p style={{ marginTop: 10, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)', fontSize: 13 }}>{msg}</p>}
    </section>
  );
}

function CoachCommissionRow({ coach, onSave }) {
  // Override % is editable; tier is auto-assigned by completed sessions +
  // avg rating (see evaluateAndAutoTierCoach in src/db/index.js), but
  // operators can still nudge a coach up/down for special cases.
  const [pct, setPct] = React.useState(coach.commission_override_bps != null ? (coach.commission_override_bps / 100).toFixed(2) : '');
  const [tier, setTier] = React.useState(coach.commission_tier || 'rookie');
  // Live earnings preview — what would the coach actually pocket today on a
  // sample $50 session? Recompute effective rate (override → premium → tier).
  const previewSession = 5000;
  // Mirror server-side resolveCommissionBpsForCoach: rookies inherit the
  // admin-set site default (so the global slider is materially active);
  // established/elite get fixed promotional discounts.
  const siteDefaultBps = coach.site_default_bps ?? 1000;
  let effectiveBps;
  if (pct !== '') effectiveBps = Math.round(parseFloat(pct) * 100) || 0;
  else if (coach.is_premium) effectiveBps = 700;
  else if (tier === 'elite') effectiveBps = 1200;
  else if (tier === 'established') effectiveBps = 1800;
  else effectiveBps = siteDefaultBps;
  const fee = Math.round(previewSession * (effectiveBps / 10000));
  const earnings = previewSession - fee;

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: 6 }}>{coach.display_name || `#${coach.account_id}`}</td>
      <td style={{ padding: 6, fontSize: 12, color: 'var(--text-muted)' }}>{coach.status}</td>
      <td style={{ padding: 6 }}>
        <input type="number" min="0" max="50" step="0.5" value={pct}
          onChange={e => setPct(e.target.value)} placeholder="auto"
          aria-label={`Commission override % for coach ${coach.account_id}`}
          style={{ width: 70, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
      </td>
      <td style={{ padding: 6 }}>
        <select value={tier} onChange={e => setTier(e.target.value)}
          aria-label={`Auto-tier for coach ${coach.account_id}`}
          style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12 }}>
          <option value="rookie">Rookie (site default)</option>
          <option value="established">Established (18%)</option>
          <option value="elite">Elite (12%)</option>
        </select>
      </td>
      <td style={{ padding: 6, fontSize: 12 }}>
        {coach.is_premium ? <span style={{ color: 'var(--accent-gold, #f59e0b)' }}>⭐ Active</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>
      <td style={{ padding: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        on $50: <strong style={{ color: 'var(--radiant-color)' }}>${(earnings / 100).toFixed(2)}</strong>
        <br/><span style={{ color: 'var(--text-muted)' }}>(fee ${(fee / 100).toFixed(2)} = {(effectiveBps / 100).toFixed(2)}%)</span>
      </td>
      <td style={{ padding: 6 }}>
        <button type="button" onClick={() => onSave(coach, pct, tier)}
          style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}>
          Save
        </button>
      </td>
    </tr>
  );
}

// ───────── Task #320: Sponsorships panel ─────────
function SponsorshipsAdminPanel({ superuserKey }) {
  const [data, setData] = React.useState(null);
  const [msg, setMsg] = React.useState('');
  const [draft, setDraft] = React.useState({ slug: '', label: '', monthly_price_cents: 5000, description: '', tenant_id: '' });

  const load = React.useCallback(async () => {
    if (!superuserKey) return;
    try {
      const r = await superuserFetch('/api/admin/sponsorships', { credentials: 'include', headers: { 'X-Superuser-Key': superuserKey } });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setData(await r.json());
    } catch (e) { setMsg(`Error: ${e.message}`); }
  }, [superuserKey]);
  React.useEffect(() => { load(); }, [load]);

  const createSlot = async () => {
    if (!draft.slug || !draft.label) { setMsg('slug + label required'); return; }
    const r = await superuserFetch('/api/admin/sponsorships/slots', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
      body: JSON.stringify(draft),
    });
    if (r.ok) { setMsg('Slot created'); setDraft({ slug: '', label: '', monthly_price_cents: 5000, description: '', tenant_id: '' }); load(); }
    else setMsg(`Error: ${(await r.json()).error}`);
  };

  const toggleActive = async (slot) => {
    const r = await superuserFetch(`/api/admin/sponsorships/slots/${slot.id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
      body: JSON.stringify({ is_active: !slot.is_active }),
    });
    if (r.ok) load();
  };

  if (!data) return <section><h2 id="ap-anchor-sponsorships">📣 Sponsorships</h2><p style={{ color: 'var(--text-muted)' }}>{msg || 'Loading…'}</p></section>;

  return (
    <section>
      <h2 id="ap-anchor-sponsorships" style={{ marginBottom: 6 }}>📣 Sponsorships</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Define named placements (slug + price) and monitor active orders. Public site reads the active sponsor at <code>/api/sponsorships/active/&lt;slug&gt;</code>.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: 8, marginBottom: 16 }}>
        <input placeholder="slug (e.g. home_banner)" value={draft.slug}
          onChange={e => setDraft({ ...draft, slug: e.target.value })}
          aria-label="New slot slug"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        <input placeholder="label" value={draft.label}
          onChange={e => setDraft({ ...draft, label: e.target.value })}
          aria-label="New slot label"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        <input type="number" placeholder="monthly cents" value={draft.monthly_price_cents}
          onChange={e => setDraft({ ...draft, monthly_price_cents: parseInt(e.target.value) || 0 })}
          aria-label="Monthly price in cents"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        <input placeholder="description" value={draft.description}
          onChange={e => setDraft({ ...draft, description: e.target.value })}
          aria-label="Description"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        <input type="number" placeholder="tenant_id (blank = global)" value={draft.tenant_id || ''}
          onChange={e => setDraft({ ...draft, tenant_id: e.target.value })}
          aria-label="Tenant ID (blank = global slot)"
          title="Leave blank for a global slot served on the default tenant. Enter a tenant id to scope this slot to a white-label tenant — it overrides a global slot with the same slug."
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        <button type="button" onClick={createSlot}
          style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--accent-blue)', color: '#fff', border: 0, cursor: 'pointer' }}>
          + Add slot
        </button>
      </div>

      {(data.slots?.length || 0) > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th align="left">Slug</th><th align="left">Label</th>
            <th align="right">Price/mo</th><th align="left">Active</th><th></th>
          </tr></thead>
          <tbody>{data.slots.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 12 }}>{s.slug}</td>
              <td style={{ padding: 6 }}>{s.label}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>${(s.monthly_price_cents / 100).toFixed(2)} {s.currency.toUpperCase()}</td>
              <td style={{ padding: 6 }}>{s.is_active ? '✓' : '✗'}</td>
              <td style={{ padding: 6 }}>
                <button type="button" onClick={() => toggleActive(s)}
                  style={{ padding: '3px 10px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}>
                  {s.is_active ? 'Disable' : 'Enable'}
                </button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p style={{ color: 'var(--text-muted)' }}>No slots yet.</p>}

      {/* Task #342 — per-slot impression/click/CTR rollup so admins can
          compare placements and price them correctly at renewal time. */}
      <h3 style={{ marginBottom: 6 }}>Slot performance</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
        Lifetime impressions, clicks, and CTR across every order ever attached to the slot. CTR shows "—" when a slot has had no impressions yet.
      </p>
      {(data.slot_analytics?.length || 0) > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th align="left">Slug</th><th align="left">Label</th>
            <th align="right">Impressions</th><th align="right">Clicks</th>
            <th align="right">CTR</th>
            {/* Task #349 — 30-day per-slot trend chart (brass = impressions, amber = clicks). */}
            <th align="left">30d trend</th>
            <th align="right">Active orders</th>
            <th align="right">Total orders</th>
          </tr></thead>
          <tbody>{data.slot_analytics.map(a => (
            <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 12 }}>{a.slug}</td>
              <td style={{ padding: 6 }}>{a.label}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>{Number(a.impressions).toLocaleString()}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>{Number(a.clicks).toLocaleString()}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>{a.ctr == null ? '—' : `${(a.ctr * 100).toFixed(2)}%`}</td>
              <td style={{ padding: 6 }}>
                <SponsorshipTrendChart
                  rows={trendRowsFor(data.slot_trends, 'slot_id', a.id)}
                  label={`Slot ${a.slug}`}
                />
              </td>
              <td style={{ padding: 6, textAlign: 'right' }}>{a.active_count}</td>
              <td style={{ padding: 6, textAlign: 'right', color: 'var(--text-muted)' }}>{a.order_count}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p style={{ color: 'var(--text-muted)' }}>No slot telemetry yet.</p>}

      <h3 style={{ marginBottom: 6 }}>Recent orders</h3>
      {(data.orders?.length || 0) > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th align="left">When</th><th align="left">Slot</th><th align="left">Sponsor</th>
            <th align="left">Status</th><th align="right">Amount</th><th align="left">Ends</th>
            <th align="right">Impr.</th><th align="right">Clicks</th><th align="right">CTR</th>
          </tr></thead>
          <tbody>{data.orders.slice(0, 25).map(o => {
            const impressions = Number(o.impressions || 0);
            const clicks = Number(o.clicks || 0);
            const ctr = impressions > 0 ? clicks / impressions : null;
            return (
              <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 6, fontSize: 12, color: 'var(--text-muted)' }}>{new Date(o.created_at).toLocaleString()}</td>
                <td style={{ padding: 6, fontSize: 12 }}>{o.slot_label}</td>
                <td style={{ padding: 6 }}>{o.sponsor_name}</td>
                <td style={{ padding: 6 }}>{o.status}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>${(o.amount_cents / 100).toFixed(2)}</td>
                <td style={{ padding: 6, fontSize: 12, color: 'var(--text-muted)' }}>{new Date(o.ends_at).toLocaleDateString()}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{impressions.toLocaleString()}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{clicks.toLocaleString()}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{ctr == null ? '—' : `${(ctr * 100).toFixed(2)}%`}</td>
              </tr>
            );
          })}</tbody>
        </table>
      ) : <p style={{ color: 'var(--text-muted)' }}>No orders yet.</p>}
      {msg && <p style={{ marginTop: 8, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)', fontSize: 13 }}>{msg}</p>}
    </section>
  );
}

// ───────── Task #333: Tenant data-scope filter (admin tooling) ─────────
// Superuser-only widget that drives the `?tenant_id=` query param on the
// public list endpoints (/api/matches, /api/tournaments, /api/coaches,
// /api/inhouse). Pick a tenant to preview its scoped data without changing
// your Host header; "All tenants" opts out of the filter entirely
// (cross-tenant admin view). The widget surfaces the resulting counts so
// admins can confirm isolation visually before deploying a sub-brand.
function TenantDataScopeFilter({ tenants, superuserKey }) {
  const [scope, setScope] = React.useState(''); // '' = default tenant, 'all', or numeric id
  const [counts, setCounts] = React.useState(null);
  const [err, setErr] = React.useState('');

  const params = React.useMemo(() => {
    if (scope === '') return '';
    if (scope === 'all') return '?tenant_id=all';
    return `?tenant_id=${encodeURIComponent(scope)}`;
  }, [scope]);

  const refresh = React.useCallback(async () => {
    setErr('');
    try {
      const opts = { credentials: 'include', headers: superuserKey ? { 'X-Superuser-Key': superuserKey } : {} };
      const [m, t, c, ih] = await Promise.all([
        fetch(`/api/matches${params}${params ? '&' : '?'}limit=1`, opts).then(r => r.json()),
        fetch(`/api/tournaments${params}`, opts).then(r => r.json()),
        fetch(`/api/coaches${params}`, opts).then(r => r.json()).catch(() => ({ coaches: [] })),
        fetch(`/api/inhouse${params}`, opts).then(r => r.json()),
      ]);
      setCounts({
        matches: m.total ?? (Array.isArray(m.matches) ? m.matches.length : 0),
        tournaments: Array.isArray(t.tournaments) ? t.tournaments.length : 0,
        coaches: Array.isArray(c.coaches) ? c.coaches.length : 0,
        inhouse: Array.isArray(ih.sessions) ? ih.sessions.length : 0,
      });
    } catch (e) { setErr(e.message); }
  }, [params, superuserKey]);

  React.useEffect(() => { refresh(); }, [refresh]);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, marginBottom: 16, background: 'var(--bg-elevated)' }}>
      <label htmlFor="tenant-data-scope" style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
        Data-scope preview (uses <code>?tenant_id=</code> on public list endpoints)
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select id="tenant-data-scope" value={scope} onChange={e => setScope(e.target.value)}
          aria-label="Tenant data scope"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
          <option value="">Default tenant (tenant_id IS NULL)</option>
          <option value="all">All tenants (cross-tenant admin view)</option>
          {tenants.map(t => (
            <option key={t.id} value={t.id}>{t.display_name} (#{t.id})</option>
          ))}
        </select>
        <button type="button" onClick={refresh}
          aria-label="Refresh tenant data scope counts"
          style={{ padding: '6px 12px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer' }}>
          Refresh
        </button>
        {counts && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            matches: <strong style={{ color: 'var(--text-primary)' }}>{counts.matches}</strong>
            {' · '}tournaments: <strong style={{ color: 'var(--text-primary)' }}>{counts.tournaments}</strong>
            {' · '}coaches: <strong style={{ color: 'var(--text-primary)' }}>{counts.coaches}</strong>
            {' · '}inhouse sessions: <strong style={{ color: 'var(--text-primary)' }}>{counts.inhouse}</strong>
          </span>
        )}
      </div>
      {err && <p style={{ marginTop: 6, color: 'var(--dire-color)', fontSize: 12 }}>Error: {err}</p>}
    </div>
  );
}

// ───────── Task #320: Tenants (white-label) panel ─────────
function TenantsAdminPanel({ superuserKey }) {
  const [tenants, setTenants] = React.useState(null);
  const [msg, setMsg] = React.useState('');
  const [draft, setDraft] = React.useState({ slug: '', display_name: '', subdomain: '', plan: 'starter' });

  const load = React.useCallback(async () => {
    if (!superuserKey) return;
    try {
      const r = await superuserFetch('/api/admin/tenants', { credentials: 'include', headers: { 'X-Superuser-Key': superuserKey } });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setTenants((await r.json()).tenants || []);
    } catch (e) { setMsg(`Error: ${e.message}`); }
  }, [superuserKey]);
  React.useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!draft.slug || !draft.display_name) { setMsg('slug + display_name required'); return; }
    const r = await superuserFetch('/api/admin/tenants', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
      body: JSON.stringify(draft),
    });
    if (r.ok) { setMsg('Tenant created'); setDraft({ slug: '', display_name: '', subdomain: '', plan: 'starter' }); load(); }
    else setMsg(`Error: ${(await r.json()).error}`);
  };

  const updateStatus = async (t, status) => {
    const r = await superuserFetch(`/api/admin/tenants/${t.id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
      body: JSON.stringify({ status }),
    });
    if (r.ok) load();
  };

  if (!tenants) return <section><h2 id="ap-anchor-tenants">🏢 White-label tenants</h2><p style={{ color: 'var(--text-muted)' }}>{msg || 'Loading…'}</p></section>;

  return (
    <section>
      <h2 id="ap-anchor-tenants" style={{ marginBottom: 6 }}>🏢 White-label tenants (Model A)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Sub-brand deployments resolved by Host header (subdomain of <code>TENANT_PARENT_DOMAIN</code> or full custom hostname).
        Per-row tenant scoping (matches, tournaments, coaches, inhouse sessions) is enforced server-side — use the
        data-scope filter below to inspect a specific tenant's records without changing your Host header.
      </p>

      <TenantDataScopeFilter tenants={tenants} superuserKey={superuserKey} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 8, marginBottom: 16 }}>
        <input placeholder="slug" value={draft.slug}
          onChange={e => setDraft({ ...draft, slug: e.target.value })}
          aria-label="New tenant slug"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        <input placeholder="display name" value={draft.display_name}
          onChange={e => setDraft({ ...draft, display_name: e.target.value })}
          aria-label="New tenant display name"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        <input placeholder="subdomain (optional)" value={draft.subdomain}
          onChange={e => setDraft({ ...draft, subdomain: e.target.value })}
          aria-label="New tenant subdomain"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
        <select value={draft.plan} onChange={e => setDraft({ ...draft, plan: e.target.value })}
          aria-label="New tenant plan"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
          <option value="starter">starter</option>
          <option value="pro">pro</option>
        </select>
        <button type="button" onClick={create}
          style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--accent-blue)', color: '#fff', border: 0, cursor: 'pointer' }}>
          + Add tenant
        </button>
      </div>

      {tenants.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th align="left">Slug</th><th align="left">Name</th>
            <th align="left">Host</th><th align="left">Plan</th>
            <th align="left">Status</th><th></th>
          </tr></thead>
          <tbody>{tenants.map(t => (
            <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 12 }}>{t.slug}</td>
              <td style={{ padding: 6 }}>{t.display_name}</td>
              <td style={{ padding: 6, fontSize: 12 }}>{t.custom_hostname || (t.subdomain ? `${t.subdomain}.*` : '—')}</td>
              <td style={{ padding: 6 }}>{t.plan}</td>
              <td style={{ padding: 6 }}>{t.status}</td>
              <td style={{ padding: 6 }}>
                {t.status !== 'suspended' ? (
                  <button type="button" onClick={() => updateStatus(t, 'suspended')}
                    aria-label={`Suspend tenant ${t.slug}`}
                    style={{ padding: '3px 10px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
                    Suspend
                  </button>
                ) : (
                  <button type="button" onClick={() => updateStatus(t, 'active')}
                    aria-label={`Reactivate tenant ${t.slug}`}
                    style={{ padding: '3px 10px', borderRadius: 4, background: 'var(--radiant-color)', border: 0, color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                    Reactivate
                  </button>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p style={{ color: 'var(--text-muted)' }}>No tenants yet.</p>}
      {msg && <p style={{ marginTop: 8, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)', fontSize: 13 }}>{msg}</p>}
    </section>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 12,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: accent || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function TournamentBracketPanel() {
  const [tournaments, setTournaments] = useState(null);

  useEffect(() => {
    getTournaments().then(d => setTournaments(Array.isArray(d) ? d : (d?.tournaments || []))).catch(() => setTournaments([]));
  }, []);

  const STATUS_LABELS = { upcoming: 'Upcoming', active: 'Active', completed: 'Completed' };
  const STATUS_COLORS = { upcoming: 'var(--text-muted)', active: 'var(--accent-gold, #f59e0b)', completed: 'var(--radiant-color)' };
  const FORMAT_LABELS = { single_elim: 'Single Elim', double_elim: 'Double Elim', weekend_points: 'Points' };

  const active = tournaments?.filter(t => t.status !== 'completed') || [];
  const completed = tournaments?.filter(t => t.status === 'completed') || [];

  return (
    <section>
      <h2 id="ap-anchor-tournaments" style={{ marginBottom: 6 }}>🏆 Tournament Brackets</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Manage bracket configuration, seeding, and match results from each tournament's detail page.
      </p>

      {tournaments === null ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : tournaments.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No tournaments yet. Create one from the <Link to="/tournaments" style={{ color: 'var(--accent-blue)' }}>Tournaments</Link> page.</p>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <h3 style={{ marginBottom: 8, fontSize: 14 }}>Active / Upcoming</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {active.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {FORMAT_LABELS[t.format] || t.format}
                        {t.bracket_size ? ` · ${t.bracket_size}-player` : ''}
                        {t.bracket_type && t.bracket_type !== 'none' ? ` · ${t.bracket_type}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLORS[t.status] }}>
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                    <Link
                      to={`/tournaments/${t.id}`}
                      style={{
                        padding: '5px 12px', background: 'var(--accent-blue)', color: '#fff',
                        borderRadius: 6, fontSize: 12, textDecoration: 'none', fontWeight: 600,
                      }}
                    >
                      Manage →
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}

          {completed.length > 0 && (
            <>
              <h3 style={{ marginBottom: 8, fontSize: 14, color: 'var(--text-muted)' }}>Completed ({completed.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {completed.slice(0, 5).map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8,
                    opacity: 0.75,
                  }}>
                    <div style={{ flex: 1, fontSize: 13 }}>{t.name}</div>
                    <Link to={`/tournaments/${t.id}`} style={{ fontSize: 12, color: 'var(--accent-blue)', textDecoration: 'none' }}>View bracket</Link>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 14 }}>
            <Link to="/tournaments" style={{
              display: 'inline-block', padding: '7px 16px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: 8, fontSize: 13,
              color: 'var(--text-primary)', textDecoration: 'none',
            }}>
              + Create / manage all tournaments
            </Link>
          </div>
        </>
      )}

      <FailedTournamentPayoutsPanel />
      <PayoutsAwaitingConnectPanel />
      <PaidPayoutReceiptsPanel />
    </section>
  );
}

// Task #614 — admin visibility into prize receipts that were sent. Lists
// recently-paid prizes with their receipt-sent timestamp (`paid_notified_at`,
// Task #582) so operators can confirm a winner actually got their "prize
// landed" DM/push and chase anomalies (paid but never notified). Hidden when
// no prizes have been paid out yet.
// Lightweight fixed-position toast, modelled on QuestTracker's CompletionToast
// (role="status" + aria-live for screen readers, bottom-right, auto-dismiss).
function AdminToast({ toast, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const ok = toast.ok;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        background: 'var(--bg-card)',
        border: `1px solid ${ok ? 'var(--accent-green, #22c55e)' : 'var(--amber)'}`,
        borderRadius: 8, padding: '12px 16px', maxWidth: 320,
        boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}
    >
      <span style={{ fontSize: 22 }} aria-hidden="true">{ok ? '✅' : '⚠️'}</span>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
        {toast.text}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        style={{
          background: 'transparent', border: 0, color: 'var(--text-muted)',
          fontSize: 16, cursor: 'pointer', padding: 0,
        }}
      >×</button>
    </div>
  );
}

function PaidPayoutReceiptsPanel() {
  const { superuserKey } = useSuperuser();
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    if (!superuserKey) return;
    getPaidPayoutReceipts(superuserKey)
      .then(d => setRows(d?.payouts || []))
      .catch(() => setRows([]));
  }, [superuserKey]);

  useEffect(() => { load(); }, [load]);

  const handleResend = async (p) => {
    setBusyId(p.id);
    setFeedback(null);
    try {
      await resendPayoutReceipt(p.id, superuserKey);
      setFeedback({ id: p.id, ok: true, text: 'Receipt re-sent' });
      load();
    } catch (e) {
      setFeedback({ id: p.id, ok: false, text: e.message || 'Failed to resend' });
    } finally {
      setBusyId(null);
    }
  };

  const handleResendAll = async () => {
    setBulkBusy(true);
    setBulkFeedback(null);
    try {
      const d = await resendAllPayoutReceipts(superuserKey);
      const n = d?.notified || 0;
      const text = n === 0 ? 'Nothing to send' : `Sent ${n} receipt${n === 1 ? '' : 's'}`;
      setBulkFeedback({ ok: true, text });
      setToast({ id: Date.now(), ok: true, text: `Prize receipts: ${text}` });
      load();
    } catch (e) {
      const text = e.message || 'Failed to resend';
      setBulkFeedback({ ok: false, text });
      setToast({ id: Date.now(), ok: false, text: `Prize receipts: ${text}` });
    } finally {
      setBulkBusy(false);
    }
  };

  if (!rows || rows.length === 0) return null;

  const total = rows.reduce((s, p) => s + (p.amount_cents || 0), 0);
  const unsent = rows.filter(p => !p.paid_notified_at).length;

  return (
    <div style={{ marginTop: 20, background: 'rgba(34,197,94,0.06)', border: '1px solid #22c55e', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: '#22c55e' }}>✅ Prize receipts sent ({rows.length})</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {bulkFeedback && (
            <span style={{ fontSize: 11, color: bulkFeedback.ok ? '#22c55e' : 'var(--amber)' }}>{bulkFeedback.text}</span>
          )}
          <button
            type="button"
            className="btn"
            style={{ fontSize: 11, padding: '4px 10px' }}
            disabled={bulkBusy || unsent === 0}
            onClick={handleResendAll}
            title={unsent === 0 ? 'Every paid prize has already been receipted' : `Resend the prize receipt to all ${unsent} unsent winner${unsent === 1 ? '' : 's'}`}
          >
            {bulkBusy ? 'Sending…' : `Resend all unsent (${unsent})`}
          </button>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
        Recently-paid prizes (totalling ${(total / 100).toFixed(2)}) and whether each winner has been sent their
        "prize landed" receipt.{unsent > 0 && <> <span style={{ color: 'var(--amber)' }}>{unsent} paid but not yet receipted — chase if this persists.</span></>}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px' }}>Tournament</th>
            <th style={{ padding: '6px 8px' }}>Place</th>
            <th style={{ padding: '6px 8px' }}>Player</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
            <th style={{ padding: '6px 8px' }}>Transferred</th>
            <th style={{ padding: '6px 8px' }}>Receipt sent</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px' }}>
                <Link to={`/tournaments/${p.tournament_id}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>
                  {p.tournament_name}
                </Link>
              </td>
              <td style={{ padding: '6px 8px', fontWeight: 700 }}>#{p.place}</td>
              <td style={{ padding: '6px 8px' }}>{p.display_name}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>${((p.amount_cents || 0) / 100).toFixed(2)}</td>
              <td style={{ padding: '6px 8px', fontSize: 12 }}>
                {p.transferred_at
                  ? <span style={{ color: 'var(--text-muted)' }} title={new Date(p.transferred_at).toLocaleString()}>{new Date(p.transferred_at).toLocaleDateString()}</span>
                  : <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </td>
              <td style={{ padding: '6px 8px', fontSize: 12 }}>
                {p.paid_notified_at
                  ? <span style={{ color: '#22c55e' }} title={new Date(p.paid_notified_at).toLocaleString()}>✓ {new Date(p.paid_notified_at).toLocaleDateString()}</span>
                  : <span style={{ color: 'var(--amber)' }}>Not yet</span>}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  disabled={busyId === p.id}
                  onClick={() => handleResend(p)}
                  title={p.paid_notified_at ? 'Re-send the prize receipt to this winner' : 'Send the prize receipt to this winner'}
                >
                  {busyId === p.id ? 'Sending…' : (p.paid_notified_at ? 'Resend receipt' : 'Send receipt')}
                </button>
                {feedback && feedback.id === p.id && (
                  <div style={{ fontSize: 11, marginTop: 4, color: feedback.ok ? '#22c55e' : 'var(--amber)' }}>
                    {feedback.text}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {toast && (
        <AdminToast key={toast.id} toast={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}

// Task #580 — surfaces pending prize payouts whose winner has no payout-ready
// Connect account, so operators can chase the long-tail (e.g. ping someone in
// Discord). Shows whether/when each winner was nudged (Task #545). Hidden when
// nobody's stuck waiting to connect.
function PayoutsAwaitingConnectPanel() {
  const { superuserKey } = useSuperuser();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!superuserKey) return;
    getPayoutsAwaitingConnect(superuserKey)
      .then(d => setRows(d?.payouts || []))
      .catch(() => setRows([]));
  }, [superuserKey]);

  if (!rows || rows.length === 0) return null;

  const total = rows.reduce((s, p) => s + (p.amount_cents || 0), 0);

  return (
    <div style={{ marginTop: 20, background: 'rgba(245,158,11,0.06)', border: '1px solid var(--amber)', borderRadius: 10, padding: 16 }}>
      <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 14, color: 'var(--amber)' }}>⏳ Winners yet to connect a payout account ({rows.length})</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
        These finalized prizes (totalling ${(total / 100).toFixed(2)}) are stuck waiting on the winner to connect
        a Stripe payout account. Winners are nudged automatically once; chase the long-tail directly if needed.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px' }}>Tournament</th>
            <th style={{ padding: '6px 8px' }}>Place</th>
            <th style={{ padding: '6px 8px' }}>Player</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
            <th style={{ padding: '6px 8px' }}>Nudged</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px' }}>
                <Link to={`/tournaments/${p.tournament_id}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>
                  {p.tournament_name}
                </Link>
              </td>
              <td style={{ padding: '6px 8px', fontWeight: 700 }}>#{p.place}</td>
              <td style={{ padding: '6px 8px' }}>{p.display_name}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>${((p.amount_cents || 0) / 100).toFixed(2)}</td>
              <td style={{ padding: '6px 8px', fontSize: 12 }}>
                {p.connect_notified_at
                  ? <span style={{ color: 'var(--text-muted)' }} title={new Date(p.connect_notified_at).toLocaleString()}>✓ {new Date(p.connect_notified_at).toLocaleDateString()}</span>
                  : <span style={{ color: 'var(--amber)' }}>Not yet</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Task #453 — surfaces every failed Stripe Transfer for tournament prize
// payouts across all events, with a per-row retry. Hidden when nothing failed.
function FailedTournamentPayoutsPanel() {
  const { superuserKey } = useSuperuser();
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    if (!superuserKey) return;
    getFailedTournamentPayouts(superuserKey)
      .then(d => setRows(d?.payouts || []))
      .catch(() => setRows([]));
  }, [superuserKey]);

  useEffect(() => { load(); }, [load]);

  const handleRetry = async (id) => {
    setBusyId(id); setMsg(null);
    try {
      const d = await retryFailedTournamentPayout(id, superuserKey);
      setMsg(d.ok ? 'Transfer succeeded.' : 'Retry failed — see the error.');
      load();
    } catch (e) { setMsg(e.message); }
    finally { setBusyId(null); }
  };

  if (!rows || rows.length === 0) return null;

  return (
    <div style={{ marginTop: 20, background: 'rgba(239,68,68,0.06)', border: '1px solid #ef4444', borderRadius: 10, padding: 16 }}>
      <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 14, color: '#ef4444' }}>⚠️ Failed prize payouts ({rows.length})</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
        These Stripe Transfers failed. Resolve the underlying issue (e.g. the winner finishing KYC) then retry.
      </p>
      {msg && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{msg}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px' }}>Tournament</th>
            <th style={{ padding: '6px 8px' }}>Place</th>
            <th style={{ padding: '6px 8px' }}>Player</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
            <th style={{ padding: '6px 8px' }}>Error</th>
            <th style={{ padding: '6px 8px' }} />
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px' }}>
                <Link to={`/tournaments/${p.tournament_id}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>
                  {p.tournament_name}
                </Link>
              </td>
              <td style={{ padding: '6px 8px', fontWeight: 700 }}>#{p.place}</td>
              <td style={{ padding: '6px 8px' }}>{p.display_name}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>${(p.amount_cents / 100).toFixed(2)}</td>
              <td style={{ padding: '6px 8px', fontSize: 11, color: '#ef4444', maxWidth: 240 }}>{p.transfer_error}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                <button type="button" disabled={busyId === p.id} onClick={() => handleRetry(p.id)}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: busyId === p.id ? 0.5 : 1 }}>
                  {busyId === p.id ? 'Retrying…' : 'Retry'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
