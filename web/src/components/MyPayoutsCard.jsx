import React, { useEffect, useState } from 'react';
import { getMyPayouts, reportPayoutProblem } from '../api';

function StatusBadge({ status }) {
  const map = {
    paid: { bg: 'rgba(16,185,129,0.15)', fg: '#10b981', label: 'Paid' },
    pending: { bg: 'rgba(245,158,11,0.15)', fg: 'var(--amber)', label: 'Pending' },
    failed: { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444', label: 'Failed' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
      {s.label}
    </span>
  );
}

function fmtMoney(cents, currency) {
  const amount = (Number(cents) || 0) / 100;
  const cur = String(currency || 'aud').toUpperCase();
  return `$${amount.toFixed(2)} ${cur}`;
}

function fmtDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function ReportProblemRow({ payout, colSpan }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const [errMsg, setErrMsg] = useState(null);

  if (state === 'done') {
    return (
      <tr>
        <td colSpan={colSpan} style={{ padding: '6px 8px', color: '#10b981', fontSize: 12 }}>
          ✓ Thanks — we've flagged this payout for an operator to look into. We'll follow up via Discord.
        </td>
      </tr>
    );
  }

  const submit = async () => {
    setState('sending');
    setErrMsg(null);
    try {
      await reportPayoutProblem(payout.id, note.trim());
      setState('done');
    } catch (e) {
      setErrMsg(e.message || 'Failed to submit report');
      setState('error');
    }
  };

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '4px 8px' }}>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline',
            }}
            aria-expanded="false"
          >
            Didn't receive this? Report a payment problem
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 0' }}>
            <label htmlFor={`payout-report-${payout.id}`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Tell us what's wrong (optional) — e.g. the money never reached your bank.
            </label>
            <textarea
              id={`payout-report-${payout.id}`}
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Optional details to help us chase it…"
              style={{
                width: '100%', resize: 'vertical', fontSize: 13, padding: '6px 8px',
                borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg-primary)', color: 'var(--text)',
              }}
            />
            {state === 'error' && (
              <div role="alert" style={{ fontSize: 12, color: '#ef4444' }}>{errMsg}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={submit}
                disabled={state === 'sending'}
                style={{
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700,
                  cursor: state === 'sending' ? 'default' : 'pointer', opacity: state === 'sending' ? 0.6 : 1,
                }}
              >
                {state === 'sending' ? 'Sending…' : 'Send report'}
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setState('idle'); setErrMsg(null); }}
                disabled={state === 'sending'}
                style={{
                  background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
                  borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function MyPayoutsCard() {
  const [payouts, setPayouts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    getMyPayouts()
      .then(d => { if (live) setPayouts(d?.payouts || []); })
      .catch(e => { if (live) setError(e.message || 'Failed to load payouts'); });
    return () => { live = false; };
  }, []);

  // Self-hide when there's nothing to show (most players never win a prize).
  if (error) return null;
  if (payouts === null) return null;
  if (payouts.length === 0) return null;

  const totalPaid = payouts
    .filter(p => p.transfer_status === 'paid')
    .reduce((sum, p) => sum + (Number(p.amount_cents) || 0), 0);

  return (
    <div id="my-payouts" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginTop: 12, scrollMarginTop: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>💰 My prize payouts</div>
        {totalPaid > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Total received: <span style={{ color: '#10b981', fontWeight: 700 }}>{fmtMoney(totalPaid, payouts[0]?.currency)}</span>
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <caption style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}>
            Prizes you have been paid across all tournaments
          </caption>
          <thead>
            <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
              <th scope="col" style={{ padding: '6px 8px' }}>Tournament</th>
              <th scope="col" style={{ padding: '6px 8px' }}>Place</th>
              <th scope="col" style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
              <th scope="col" style={{ padding: '6px 8px' }}>Status</th>
              <th scope="col" style={{ padding: '6px 8px' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map(p => {
              const date = fmtDate(p.transferred_at) || fmtDate(p.finalized_at);
              return (
                <React.Fragment key={p.id}>
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{p.tournament_name || `Tournament #${p.tournament_id}`}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 700 }}>#{p.place}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtMoney(p.amount_cents, p.currency)}</td>
                    <td style={{ padding: '6px 8px' }}><StatusBadge status={p.transfer_status} /></td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{date || '—'}</td>
                  </tr>
                  {p.transfer_status === 'paid' && (
                    <ReportProblemRow payout={p} colSpan={5} />
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {payouts.some(p => p.transfer_status !== 'paid' && (Number(p.amount_cents) || 0) > 0) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Prizes still <b>pending</b> or <b>failed</b> usually mean a payout account isn't connected yet — connect one from the tournament's page to receive them.
        </div>
      )}
    </div>
  );
}
