import React, { useState, useEffect } from 'react';
import { useSeason } from '../context/SeasonContext';
import { useAdmin } from '../context/AdminContext';
import { useSuperuser } from '../context/SuperuserContext';
import { useSteamAuth } from '../context/SteamAuthContext';
import {
  createSeason, activateSeason, getSeasonBuyins, setSeasonBuyinAmount,
  createBuyinCheckout, getAllPlayers, deleteSeasonApi, getSeasonPayouts,
  addSeasonPayout, deleteSeasonPayout, setPayoutWinner,
} from '../api';

function fmtAUD(cents) {
  return `$${(cents / 100).toFixed(2)} AUD`;
}

const PAYOUT_TYPES = [
  { value: 'leaderboard_1', label: '#1 on Final Leaderboard' },
  { value: 'leaderboard_2', label: '#2 on Final Leaderboard' },
  { value: 'leaderboard_3', label: '#3 on Final Leaderboard' },
  { value: 'position_1_mvp', label: 'Best Carry (Position 1)' },
  { value: 'position_2_mvp', label: 'Best Mid (Position 2)' },
  { value: 'position_3_mvp', label: 'Best Offlaner (Position 3)' },
  { value: 'position_4_mvp', label: 'Best Soft Support (Position 4)' },
  { value: 'position_5_mvp', label: 'Best Hard Support (Position 5)' },
  { value: 'most_wins', label: 'Most Wins' },
  { value: 'best_winrate', label: 'Best Win Rate (min. 10 games)' },
  { value: 'best_kda', label: 'Best KDA' },
  { value: 'best_gpm', label: 'Best Avg GPM' },
  { value: 'best_xpm', label: 'Best Avg XPM' },
  { value: 'most_kills', label: 'Most Total Kills' },
  { value: 'best_hero_damage', label: 'Best Avg Hero Damage' },
  { value: 'most_matches', label: 'Most Matches Played' },
  { value: 'custom', label: 'Custom Award' },
];

function labelFor(type) {
  return PAYOUT_TYPES.find(t => t.value === type)?.label || type;
}

function BuyinModal({ season, players, onClose }) {
  const { steamUser } = useSteamAuth();
  const [displayName, setDisplayName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (steamUser) {
      setAccountId(steamUser.accountId);
      const p = players.find(pl => String(pl.account_id) === String(steamUser.accountId));
      setDisplayName(p ? (p.nickname || p.persona_name || String(p.account_id)) : (steamUser.displayName || ''));
    }
  }, [steamUser, players]);

  function handlePlayerSelect(e) {
    const val = e.target.value;
    if (!val) { setDisplayName(''); setAccountId(''); return; }
    const p = players.find(pl => String(pl.account_id) === val);
    if (p) {
      setDisplayName(p.nickname || p.persona_name || String(p.account_id));
      setAccountId(val);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) { setError('Name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const { url } = await createBuyinCheckout(season.id, name, accountId || null);
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  const isSteamVerified = !!steamUser && String(accountId) === String(steamUser.accountId);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 480, margin: 16 }}>
        <h3 style={{ marginTop: 0 }}>Pay Season Buy-in — {season.name}</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
          Amount: <strong>{fmtAUD(season.buyin_amount_cents)}</strong>. You will be redirected to Stripe to complete payment.
        </p>

        {steamUser ? (
          <div style={{
            background: '#1b2838', border: '1px solid #4c6b22', borderRadius: 6,
            padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#a4d007'
          }}>
            ✓ Signed in as <strong>{steamUser.displayName || steamUser.accountId}</strong> via Steam — identity verified
          </div>
        ) : (
          <div style={{
            background: 'var(--surface2, #1e1e2e)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '8px 12px', marginBottom: 14, fontSize: 13, color: 'var(--muted)'
          }}>
            For 100% identity verification, <button className="btn btn-small" style={{ fontSize: 12 }} onClick={() => window.location.href = '/auth/steam'}>sign in with Steam</button> before paying.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!steamUser && players.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                Select your player (optional):
              </label>
              <select className="input" style={{ width: '100%' }} value={accountId} onChange={handlePlayerSelect}>
                <option value="">— Enter name manually below —</option>
                {players.map(p => (
                  <option key={p.account_id} value={p.account_id}>
                    {p.nickname || p.persona_name || String(p.account_id)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
              Your name (as it will appear on the prize pool list):
            </label>
            <input
              className="input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              type="text"
              placeholder="Enter your name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              readOnly={isSteamVerified}
              required
            />
            {isSteamVerified && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Name auto-filled from your Steam sign-in and locked.
              </div>
            )}
          </div>

          {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Redirecting to Stripe…' : `Pay ${fmtAUD(season.buyin_amount_cents)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BuyinAmountModal({ season, adminKey, onClose, onSaved }) {
  const [dollars, setDollars] = useState(
    season.buyin_amount_cents ? String((season.buyin_amount_cents / 100).toFixed(2)) : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    const val = parseFloat(dollars);
    if (isNaN(val) || val < 0) { setError('Enter a valid amount (e.g. 20 for $20)'); return; }
    setLoading(true);
    setError('');
    try {
      await setSeasonBuyinAmount(season.id, Math.round(val * 100), adminKey);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 400, margin: 16 }}>
        <h3 style={{ marginTop: 0 }}>Set Buy-in Amount — {season.name}</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>Set to 0 to disable buy-in for this season.</p>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Amount in AUD ($):</label>
            <input
              className="input" style={{ width: '100%', boxSizing: 'border-box' }}
              type="number" min="0" step="0.01" placeholder="e.g. 20.00"
              value={dollars} onChange={e => setDollars(e.target.value)} required
            />
          </div>
          {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Save Amount'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BuyinListModal({ season, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSeasonBuyins(season.id).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [season.id]);

  const paid = data?.buyins?.filter(b => b.status === 'paid') || [];
  const pending = data?.buyins?.filter(b => b.status !== 'paid') || [];
  const totalCents = data?.totalCents || 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 560, margin: 16, maxHeight: '80vh', overflowY: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Buy-ins — {season.name}</h3>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Loading…</div>
        ) : (
          <>
            <div style={{
              background: 'var(--surface2, #1e1e2e)', borderRadius: 8, padding: '12px 16px',
              marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>Total Prize Pool</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent, #7c6bff)' }}>{fmtAUD(totalCents)}</span>
            </div>
            {paid.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>No confirmed buy-ins yet.</p>
            ) : (
              <>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Confirmed ({paid.length})
                </h4>
                <table className="table" style={{ width: '100%', marginBottom: 16 }}>
                  <thead>
                    <tr><th>#</th><th>Player</th><th>Verified</th><th>Amount</th><th>Paid At</th></tr>
                  </thead>
                  <tbody>
                    {paid.map((b, i) => (
                      <tr key={b.id}>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{i + 1}</td>
                        <td><strong>{b.display_name}</strong></td>
                        <td>
                          {b.account_id
                            ? <span style={{ color: '#4ade80', fontSize: 13, fontWeight: 600 }} title="Linked to Steam account">✓ Linked</span>
                            : <span style={{ color: 'var(--muted)', fontSize: 12 }}>— Manual</span>}
                        </td>
                        <td>{fmtAUD(b.amount_cents)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                          {b.paid_at ? new Date(b.paid_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {paid.some(b => !b.account_id) && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                    "Manual" entries were not linked to a Steam account. Players should sign in with Steam before paying to show as Linked.
                  </p>
                )}
              </>
            )}
            {pending.length > 0 && (
              <>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Pending ({pending.length})</h4>
                <table className="table" style={{ width: '100%' }}>
                  <thead><tr><th>Player</th><th>Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {pending.map(b => (
                      <tr key={b.id}>
                        <td>{b.display_name}</td>
                        <td>{fmtAUD(b.amount_cents)}</td>
                        <td><span style={{ color: 'var(--muted)', fontSize: 12 }}>{b.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function PayoutsModal({ season, players, adminKey, onClose }) {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ category_type: '', label: '', amount_dollars: '', amount_percent: '', payout_mode: 'cents', notes: '' });
  const [formError, setFormError] = useState('');
  const [winnerEditing, setWinnerEditing] = useState(null);
  const [winnerValue, setWinnerValue] = useState('');

  const reload = () => {
    setLoading(true);
    getSeasonPayouts(season.id).then(d => { setPayouts(d.payouts || []); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(reload, [season.id]);

  function handleTypeChange(e) {
    const val = e.target.value;
    const preset = PAYOUT_TYPES.find(t => t.value === val);
    setForm(f => ({ ...f, category_type: val, label: preset?.value !== 'custom' ? (preset?.label || f.label) : f.label }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.category_type) { setFormError('Select a category type'); return; }
    if (!form.label.trim()) { setFormError('Label is required'); return; }
    const isPercent = form.payout_mode === 'percent';
    if (isPercent) {
      const pct = parseFloat(form.amount_percent);
      if (isNaN(pct) || pct < 0 || pct > 100) { setFormError('Enter a valid % (0–100)'); return; }
    } else {
      const dollars = parseFloat(form.amount_dollars);
      if (isNaN(dollars) || dollars < 0) { setFormError('Enter a valid dollar amount'); return; }
    }
    setAdding(true); setFormError('');
    try {
      const dollars = parseFloat(form.amount_dollars) || 0;
      const pct = parseFloat(form.amount_percent) || 0;
      await addSeasonPayout(
        season.id, form.category_type, form.label.trim(),
        isPercent ? 0 : Math.round(dollars * 100),
        form.notes || null, adminKey,
        form.payout_mode, pct
      );
      setForm({ category_type: '', label: '', amount_dollars: '', amount_percent: '', payout_mode: 'cents', notes: '' });
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(payoutId) {
    if (!window.confirm('Remove this payout category?')) return;
    try {
      await deleteSeasonPayout(season.id, payoutId, adminKey);
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSetWinner(payout) {
    const p = players.find(pl => String(pl.account_id) === winnerValue);
    const displayName = p ? (p.nickname || p.persona_name || String(p.account_id)) : winnerValue;
    const accountId = p ? p.account_id : null;
    try {
      await setPayoutWinner(season.id, payout.id, accountId, displayName, adminKey);
      setWinnerEditing(null);
      setWinnerValue('');
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  const totalPrizeCents = payouts.reduce((s, p) => s + p.amount_cents, 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 680, margin: 16, maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Prize Categories — {season.name}</h3>

        {totalPrizeCents > 0 && (
          <div style={{
            background: 'var(--surface2, #1e1e2e)', borderRadius: 8, padding: '10px 16px',
            marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ color: 'var(--muted)', fontSize: 14 }}>Total Allocated Prize Money</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent, #7c6bff)' }}>{fmtAUD(totalPrizeCents)}</span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Loading…</div>
        ) : payouts.length === 0 ? (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>No prize categories set up yet.</p>
        ) : (
          <table className="table" style={{ width: '100%', marginBottom: 20 }}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Prize</th>
                <th>Winner</th>
                {adminKey && <th></th>}
              </tr>
            </thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{labelFor(p.category_type)}</div>
                    {p.notes && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontStyle: 'italic' }}>{p.notes}</div>}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--accent, #7c6bff)' }}>
                    {p.payout_mode === 'percent'
                      ? `${parseFloat(p.amount_percent).toFixed(1)}% of pool`
                      : fmtAUD(p.amount_cents)}
                  </td>
                  <td>
                    {winnerEditing === p.id ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select
                          className="input"
                          value={winnerValue}
                          onChange={e => setWinnerValue(e.target.value)}
                          style={{ fontSize: 12, padding: '4px 6px' }}
                        >
                          <option value="">— Select player —</option>
                          {players.map(pl => (
                            <option key={pl.account_id} value={pl.account_id}>
                              {pl.nickname || pl.persona_name || String(pl.account_id)}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn-small btn-primary" onClick={() => handleSetWinner(p)}>Save</button>
                        <button className="btn btn-small" onClick={() => { setWinnerEditing(null); setWinnerValue(''); }}>Cancel</button>
                      </div>
                    ) : p.winner_display_name ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ color: '#4ade80', fontWeight: 600 }}>🏆 {p.winner_display_name}</span>
                        {adminKey && (
                          <button className="btn btn-small" style={{ fontSize: 10 }} onClick={() => { setWinnerEditing(p.id); setWinnerValue(p.winner_account_id ? String(p.winner_account_id) : ''); }}>
                            Change
                          </button>
                        )}
                      </div>
                    ) : (
                      adminKey
                        ? <button className="btn btn-small" onClick={() => { setWinnerEditing(p.id); setWinnerValue(''); }}>Set Winner</button>
                        : <span style={{ color: 'var(--muted)', fontSize: 12 }}>TBD</span>
                    )}
                  </td>
                  {adminKey && (
                    <td>
                      <button
                        className="btn btn-small btn-danger"
                        style={{ fontSize: 11 }}
                        onClick={() => handleDelete(p.id)}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {adminKey && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Add Prize Category</h4>
            <form onSubmit={handleAdd}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Category Type</label>
                  <select className="input" style={{ width: '100%' }} value={form.category_type} onChange={handleTypeChange} required>
                    <option value="">Select type…</option>
                    {PAYOUT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                    Prize Amount
                    <span style={{ display: 'inline-flex', gap: 2, marginLeft: 8, verticalAlign: 'middle' }}>
                      {['cents', 'percent'].map(mode => (
                        <button
                          key={mode} type="button"
                          onClick={() => setForm(f => ({ ...f, payout_mode: mode }))}
                          style={{
                            padding: '1px 8px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: form.payout_mode === mode ? 'var(--accent-blue)' : 'var(--bg-hover)',
                            color: form.payout_mode === mode ? '#fff' : 'var(--text-muted)',
                          }}
                        >{mode === 'cents' ? 'AUD $' : '% of pool'}</button>
                      ))}
                    </span>
                  </label>
                  {form.payout_mode === 'cents' ? (
                    <input
                      className="input" style={{ width: '100%', boxSizing: 'border-box' }}
                      type="number" min="0" step="0.01" placeholder="e.g. 50.00"
                      value={form.amount_dollars} onChange={e => setForm(f => ({ ...f, amount_dollars: e.target.value }))} required
                    />
                  ) : (
                    <input
                      className="input" style={{ width: '100%', boxSizing: 'border-box' }}
                      type="number" min="0" max="100" step="0.5" placeholder="e.g. 30 (= 30% of prize pool)"
                      value={form.amount_percent} onChange={e => setForm(f => ({ ...f, amount_percent: e.target.value }))} required
                    />
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Label (displayed publicly)</label>
                <input
                  className="input" style={{ width: '100%', boxSizing: 'border-box' }}
                  type="text" placeholder="e.g. First Place Prize"
                  value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Notes (optional)</label>
                <input
                  className="input" style={{ width: '100%', boxSizing: 'border-box' }}
                  type="text" placeholder="e.g. Based on TrueSkill MMR at season end"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              {formError && <div className="error-msg" style={{ marginBottom: 10 }}>{formError}</div>}
              <button type="submit" className="btn btn-primary" disabled={adding}>
                {adding ? 'Adding…' : 'Add Category'}
              </button>
            </form>
          </div>
        )}

        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Seasons() {
  const { seasons, activeSeason, refreshSeasons } = useSeason();
  const { isAdmin, adminKey, setShowModal: setAdminModal } = useAdmin();
  const { isSuperuser, superuserKey, setShowModal: setSuperuserModal } = useSuperuser();
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [players, setPlayers] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [buyinModal, setBuyinModal] = useState(null);
  const [buyinAmountModal, setBuyinAmountModal] = useState(null);
  const [buyinListModal, setBuyinListModal] = useState(null);
  const [payoutsModal, setPayoutsModal] = useState(null);

  useEffect(() => {
    getAllPlayers().then(data => {
      const list = data?.players || data || [];
      setPlayers(list.filter(p => p.account_id).sort((a, b) => {
        const na = (a.nickname || a.persona_name || '').toLowerCase();
        const nb = (b.nickname || b.persona_name || '').toLowerCase();
        return na.localeCompare(nb);
      }));
    }).catch(() => {});
  }, []);

  function feedback(err, ok) {
    setError(err || '');
    setSuccess(ok || '');
    if (ok) setTimeout(() => setSuccess(''), 3000);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    if (!isAdmin) { setAdminModal(true); return; }
    setLoading(true);
    try {
      await createSeason(newName.trim(), adminKey);
      setNewName('');
      await refreshSeasons();
      feedback('', 'Season created and set as active.');
    } catch (err) {
      feedback(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate(id) {
    if (!isAdmin) { setAdminModal(true); return; }
    setLoading(true);
    try {
      await activateSeason(id, adminKey);
      await refreshSeasons();
      feedback('', id === null ? 'No active season (uploads unassigned).' : 'Season activated.');
    } catch (err) {
      feedback(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(season) {
    if (!isSuperuser) { setSuperuserModal(true); return; }
    setLoading(true);
    try {
      await deleteSeasonApi(season.id, superuserKey);
      await refreshSeasons();
      setDeleteConfirm(null);
      feedback('', `Season "${season.name}" deleted.`);
    } catch (err) {
      feedback(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isSuperuser) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Superuser Access Required</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          Season management is restricted to superusers only.
        </p>
        <button className="btn btn-primary" onClick={() => setSuperuserModal(true)}>
          Login as Superuser
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>Seasons</h2>

      {buyinModal && <BuyinModal season={buyinModal} players={players} onClose={() => setBuyinModal(null)} />}
      {buyinAmountModal && <BuyinAmountModal season={buyinAmountModal} adminKey={adminKey} onClose={() => setBuyinAmountModal(null)} onSaved={refreshSeasons} />}
      {buyinListModal && <BuyinListModal season={buyinListModal} onClose={() => setBuyinListModal(null)} />}
      {payoutsModal && <PayoutsModal season={payoutsModal} players={players} adminKey={isAdmin ? adminKey : null} onClose={() => setPayoutsModal(null)} />}

      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 400, margin: 16 }}>
            <h3 style={{ marginTop: 0, color: 'var(--danger, #f87171)' }}>Delete Season?</h3>
            <p style={{ color: 'var(--muted)' }}>
              Are you sure you want to permanently delete <strong>{deleteConfirm.name}</strong>?
              This will also remove all buy-in records and payout categories for this season.
              Matches assigned to this season will have their season reference cleared.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)} disabled={loading}>
                {loading ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Create New Season</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
          Creating a season sets it as active — new replay uploads will be automatically assigned to it.
        </p>
        {!isAdmin && (
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--muted)' }}>
            <button className="btn btn-small" onClick={() => setAdminModal(true)}>Login as admin</button>
            {' '}to manage seasons.
          </div>
        )}
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text" className="input"
            placeholder="Season name (e.g. Season 1, Winter 2025)"
            value={newName} onChange={e => setNewName(e.target.value)}
            style={{ flex: '1 1 200px', minWidth: 160 }} required disabled={!isAdmin}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !isAdmin}>
            {loading ? 'Creating…' : 'Create Season'}
          </button>
        </form>
        {error && <div className="error-msg" style={{ marginTop: 10 }}>{error}</div>}
        {success && <div className="success-msg" style={{ marginTop: 10 }}>{success}</div>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>All Seasons</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          Set a buy-in amount and prize categories to track prize pool allocation. Sign in with Steam before paying to verify your identity.
        </p>

        {seasons.length === 0 ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>No seasons yet. Create one above.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Buy-in</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map(s => {
                  const hasBuyin = s.buyin_amount_cents > 0;
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        {s.is_legacy && (
                          <span style={{
                            marginLeft: 8, fontSize: 11, padding: '1px 6px',
                            background: 'var(--surface2, #2a2a3a)', color: 'var(--muted)',
                            borderRadius: 4, verticalAlign: 'middle', border: '1px solid var(--border)'
                          }}>Legacy</span>
                        )}
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          {new Date(s.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td>
                        {hasBuyin
                          ? <span style={{ fontWeight: 600, color: 'var(--accent, #7c6bff)' }}>{fmtAUD(s.buyin_amount_cents)}</span>
                          : <span style={{ color: 'var(--muted)', fontSize: 13 }}>—</span>}
                      </td>
                      <td>
                        {s.active
                          ? <span className="badge badge-radiant">Active</span>
                          : s.is_legacy
                            ? <span style={{ color: 'var(--muted)', fontSize: 13 }}>Legacy</span>
                            : <span style={{ color: 'var(--muted)', fontSize: 13 }}>Inactive</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                          {!s.active && (
                            <button className="btn btn-small" disabled={loading} onClick={() => handleActivate(s.id)}>Set Active</button>
                          )}
                          {s.active && (
                            <button className="btn btn-small btn-danger" disabled={loading} onClick={() => handleActivate(null)}>Deactivate</button>
                          )}
                          {hasBuyin && (
                            <button className="btn btn-small btn-primary" onClick={() => setBuyinModal(s)}>Pay Buy-in</button>
                          )}
                          {hasBuyin && (
                            <button className="btn btn-small" onClick={() => setBuyinListModal(s)}>Prize Pool</button>
                          )}
                          <button className="btn btn-small" onClick={() => setPayoutsModal(s)}>
                            Prize Categories
                          </button>
                          {isAdmin && (
                            <button className="btn btn-small" onClick={() => setBuyinAmountModal(s)} title="Set buy-in amount">
                              {hasBuyin ? 'Edit Buy-in' : 'Set Buy-in'}
                            </button>
                          )}
                          {isSuperuser && (
                            <button
                              className="btn btn-small btn-danger"
                              style={{ fontSize: 11, opacity: 0.8 }}
                              onClick={() => setDeleteConfirm(s)}
                              title="Superuser: delete this season"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {seasons.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
            {activeSeason
              ? <>Active season: <strong>{activeSeason.name}</strong> — new uploads will be tagged to this season.</>
              : 'No active season — new uploads will have no season assigned.'}
          </div>
        )}
      </div>
    </div>
  );
}
