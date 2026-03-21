import React, { useState, useEffect } from 'react';
import { useSeason } from '../context/SeasonContext';
import { useAdmin } from '../context/AdminContext';
import { createSeason, activateSeason, getSeasonBuyins, setSeasonBuyinAmount, createBuyinCheckout, getAllPlayers } from '../api';

function fmtAUD(cents) {
  return `$${(cents / 100).toFixed(2)} AUD`;
}

function BuyinModal({ season, players, onClose }) {
  const [displayName, setDisplayName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 480, margin: 16 }}>
        <h3 style={{ marginTop: 0 }}>Pay Season Buy-in — {season.name}</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
          Amount: <strong>{fmtAUD(season.buyin_amount_cents)}</strong>. You will be redirected to Stripe to complete payment.
        </p>

        <form onSubmit={handleSubmit}>
          {players.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                Select your player (optional):
              </label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={accountId}
                onChange={handlePlayerSelect}
              >
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
              required
            />
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
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          Set to 0 to disable buy-in for this season.
        </p>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
              Amount in AUD ($):
            </label>
            <input
              className="input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 20.00"
              value={dollars}
              onChange={e => setDollars(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving…' : 'Save Amount'}
            </button>
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
              <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent, #7c6bff)' }}>
                {fmtAUD(totalCents)}
              </span>
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
                    <tr>
                      <th>#</th>
                      <th>Player</th>
                      <th>Amount</th>
                      <th>Paid At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paid.map((b, i) => (
                      <tr key={b.id}>
                        <td style={{ color: 'var(--muted)', fontSize: 13 }}>{i + 1}</td>
                        <td><strong>{b.display_name}</strong></td>
                        <td>{fmtAUD(b.amount_cents)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                          {b.paid_at ? new Date(b.paid_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {pending.length > 0 && (
              <>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Pending ({pending.length})
                </h4>
                <table className="table" style={{ width: '100%' }}>
                  <thead>
                    <tr><th>Player</th><th>Amount</th><th>Status</th></tr>
                  </thead>
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

export default function Seasons() {
  const { seasons, activeSeason, refreshSeasons } = useSeason();
  const { isAdmin, adminKey, setShowModal } = useAdmin();
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [players, setPlayers] = useState([]);

  const [buyinModal, setBuyinModal] = useState(null);
  const [buyinAmountModal, setBuyinAmountModal] = useState(null);
  const [buyinListModal, setBuyinListModal] = useState(null);

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
    if (!isAdmin) { setShowModal(true); return; }
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
    if (!isAdmin) { setShowModal(true); return; }
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

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>Seasons</h2>

      {buyinModal && (
        <BuyinModal season={buyinModal} players={players} onClose={() => setBuyinModal(null)} />
      )}
      {buyinAmountModal && (
        <BuyinAmountModal
          season={buyinAmountModal}
          adminKey={adminKey}
          onClose={() => setBuyinAmountModal(null)}
          onSaved={refreshSeasons}
        />
      )}
      {buyinListModal && (
        <BuyinListModal season={buyinListModal} onClose={() => setBuyinListModal(null)} />
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Create New Season</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
          Creating a season sets it as active — new replay uploads will be automatically assigned to it.
        </p>
        {!isAdmin && (
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--muted)' }}>
            <button className="btn btn-small" onClick={() => setShowModal(true)}>Login as admin</button>
            {' '}to manage seasons.
          </div>
        )}
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input"
            placeholder="Season name (e.g. Season 1, Winter 2025)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ flex: '1 1 200px', minWidth: 160 }}
            required
            disabled={!isAdmin}
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
          The active season is where new uploads go. Set a buy-in amount to enable Stripe payments and prize pool tracking.
        </p>

        {seasons.length === 0 ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
            No seasons yet. Create one above.
          </div>
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
                        {hasBuyin ? (
                          <span style={{ fontWeight: 600, color: 'var(--accent, #7c6bff)' }}>
                            {fmtAUD(s.buyin_amount_cents)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 13 }}>—</span>
                        )}
                      </td>
                      <td>
                        {s.active
                          ? <span className="badge badge-radiant">Active</span>
                          : s.is_legacy
                            ? <span style={{ color: 'var(--muted)', fontSize: 13 }}>Legacy</span>
                            : <span style={{ color: 'var(--muted)', fontSize: 13 }}>Inactive</span>
                        }
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {!s.active && (
                            <button
                              className="btn btn-small"
                              disabled={loading}
                              onClick={() => handleActivate(s.id)}
                              title={isAdmin ? '' : 'Admin login required'}
                            >
                              Set Active
                            </button>
                          )}
                          {s.active && (
                            <button
                              className="btn btn-small btn-danger"
                              disabled={loading}
                              onClick={() => handleActivate(null)}
                              title={isAdmin ? 'Remove active season' : 'Admin login required'}
                            >
                              Deactivate
                            </button>
                          )}
                          {hasBuyin && (
                            <button
                              className="btn btn-small btn-primary"
                              onClick={() => setBuyinModal(s)}
                            >
                              Pay Buy-in
                            </button>
                          )}
                          {hasBuyin && (
                            <button
                              className="btn btn-small"
                              onClick={() => setBuyinListModal(s)}
                            >
                              Prize Pool
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              className="btn btn-small"
                              onClick={() => setBuyinAmountModal(s)}
                              title="Set buy-in amount for this season"
                            >
                              {hasBuyin ? 'Edit Buy-in' : 'Set Buy-in'}
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
