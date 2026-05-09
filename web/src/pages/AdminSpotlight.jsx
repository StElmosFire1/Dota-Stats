import React, { useEffect, useState, useCallback } from 'react';
import { useSuperuser } from '../context/SuperuserContext';
import {
  adminListSpotlights, adminCreateSpotlight,
  adminUpdateSpotlight, adminDeleteSpotlight,
} from '../api';

// v6.64 / Task #208 — Profile Spotlight admin page. Superuser-only CRUD on
// the `profile_spotlight` table. Hourly cron in src/discord/bot.js advances
// any row whose ends_at has passed; the public /api/spotlight/current
// endpoint surfaces the current row to the home page Featured Player card.
//
// Supports explicit `starts_at` / `ends_at` scheduling so admins can queue
// future spotlights, and inline editing of any not-yet-ended row. Server
// rejects overlapping windows with HTTP 409.
export default function AdminSpotlight() {
  const { isSuperuser, superuserKey, requestReauth } = useSuperuser() || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const blankForm = () => ({
    id: null, account_id: '', headline: '', blurb: '',
    starts_at: toLocalInput(new Date()),
    ends_at: toLocalInput(new Date(Date.now() + 7 * 24 * 3600_000)),
  });
  const [form, setForm] = useState(blankForm);

  const reload = useCallback(async () => {
    if (!isSuperuser) return;
    setLoading(true); setError(null);
    try {
      const data = await adminListSpotlights(superuserKey);
      setRows(Array.isArray(data?.spotlights) ? data.spotlights : []);
    } catch (e) {
      setError(e.message || 'Failed to load spotlights.');
    }
    setLoading(false);
  }, [isSuperuser, superuserKey]);

  useEffect(() => { reload(); }, [reload]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.headline.trim()) { setError('Headline required.'); return; }
    const startsAt = form.starts_at ? new Date(form.starts_at).toISOString() : null;
    const endsAt = form.ends_at ? new Date(form.ends_at).toISOString() : null;
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setError('End time must be after start time.'); return;
    }
    setBusy(true);
    try {
      if (form.id) {
        await adminUpdateSpotlight(superuserKey, form.id, {
          headline: form.headline.trim(),
          blurb: form.blurb.trim() || null,
          starts_at: startsAt,
          ends_at: endsAt,
        });
      } else {
        const id = parseInt(form.account_id, 10);
        if (!Number.isFinite(id) || id <= 0) { setError('Account ID required.'); setBusy(false); return; }
        await adminCreateSpotlight(superuserKey, {
          account_id: id,
          headline: form.headline.trim(),
          blurb: form.blurb.trim() || null,
          starts_at: startsAt,
          ends_at: endsAt,
        });
      }
      setForm(blankForm());
      await reload();
    } catch (e2) {
      setError(e2.message || 'Failed to save spotlight.');
    }
    setBusy(false);
  };

  const onEdit = (r) => {
    setForm({
      id: r.id,
      account_id: String(r.account_id),
      headline: r.headline || '',
      blurb: r.blurb || '',
      starts_at: r.starts_at ? toLocalInput(new Date(r.starts_at)) : '',
      ends_at: r.ends_at ? toLocalInput(new Date(r.ends_at)) : '',
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onCancelEdit = () => setForm(blankForm());

  const onDelete = async (id) => {
    if (!window.confirm('Delete this spotlight entry?')) return;
    setBusy(true); setError(null);
    try {
      await adminDeleteSpotlight(superuserKey, id);
      if (form.id === id) setForm(blankForm());
      await reload();
    } catch (e) {
      setError(e.message || 'Failed to delete.');
    }
    setBusy(false);
  };

  if (!isSuperuser) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>Profile Spotlight</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          This page is restricted to superusers.
        </p>
        <button type="button" className="btn btn-small" onClick={() => requestReauth?.()}>
          Sign in as superuser
        </button>
      </div>
    );
  }

  const editing = !!form.id;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ marginTop: 0 }}>Profile Spotlight</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Curate the rotating Featured Player card on the home page. Schedule
        future windows with explicit start &amp; end times — overlapping
        windows are rejected. Hourly cron ends any row whose <code>ends_at</code> has passed.
      </p>

      {error ? (
        <div style={{
          marginBottom: 12, padding: '8px 12px', borderRadius: 6,
          background: '#3a1414', color: '#fca5a5', border: '1px solid #b91c1c55', fontSize: 13,
        }}>{error}</div>
      ) : null}

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ marginBottom: 8 }}>
          {editing ? `Edit spotlight #${form.id}` : 'Schedule a new spotlight'}
        </h2>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10, maxWidth: 600 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Account ID</span>
            <input type="number" value={form.account_id}
              onChange={(e) => setForm(f => ({ ...f, account_id: e.target.value }))}
              placeholder="123456789" disabled={editing}
              style={{ ...inputStyle, opacity: editing ? 0.6 : 1 }} />
            {editing ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Account is fixed once created.</span>
            ) : null}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Headline (max 200 chars)</span>
            <input type="text" maxLength={200} value={form.headline}
              onChange={(e) => setForm(f => ({ ...f, headline: e.target.value }))}
              placeholder="Top performer of the week"
              style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Blurb (optional, max 1000 chars)</span>
            <textarea rows={3} maxLength={1000} value={form.blurb}
              onChange={(e) => setForm(f => ({ ...f, blurb: e.target.value }))}
              placeholder="Why is this player featured?"
              style={{ ...inputStyle, resize: 'vertical' }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Starts at (local time)</span>
              <input type="datetime-local" value={form.starts_at}
                onChange={(e) => setForm(f => ({ ...f, starts_at: e.target.value }))}
                style={inputStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ends at (local time)</span>
              <input type="datetime-local" value={form.ends_at}
                onChange={(e) => setForm(f => ({ ...f, ends_at: e.target.value }))}
                style={inputStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Schedule spotlight'}
            </button>
            {editing ? (
              <button type="button" className="btn btn-small" onClick={onCancelEdit}
                style={{ background: 'transparent', border: '1px solid var(--border)' }}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section>
        <h2 style={{ marginBottom: 8 }}>Recent spotlights</h2>
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>No spotlights yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Account</th>
                <th style={th}>Headline</th>
                <th style={th}>Source</th>
                <th style={th}>Starts</th>
                <th style={th}>Ends</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const now = Date.now();
                const ends = r.ends_at ? new Date(r.ends_at).getTime() : 0;
                const starts = r.starts_at ? new Date(r.starts_at).getTime() : 0;
                const ended = !!r.ended_at || (ends && ends < now);
                const status = ended ? 'Ended' : (starts > now ? 'Queued' : 'Active');
                const statusColor = status === 'Ended' ? '#9ca3af' : status === 'Queued' ? '#fbbf24' : '#86efac';
                const statusBg = status === 'Ended' ? 'rgba(75,85,99,0.18)' : status === 'Queued' ? 'rgba(251,191,36,0.18)' : 'rgba(34,197,94,0.18)';
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>{r.display_name || `#${r.account_id}`}</td>
                    <td style={td}>{r.headline}</td>
                    <td style={td}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 999,
                        background: r.source === 'auto' ? 'rgba(245,158,11,0.18)' : 'rgba(197,169,117,0.18)',
                        color: r.source === 'auto' ? '#f59e0b' : 'var(--brass, var(--accent))',
                        textTransform: 'uppercase', letterSpacing: 0.6,
                      }}>{r.source === 'auto' ? 'Auto' : 'Admin'}</span>
                    </td>
                    <td style={td}>{r.starts_at ? new Date(r.starts_at).toLocaleString() : '—'}</td>
                    <td style={td}>{r.ends_at ? new Date(r.ends_at).toLocaleString() : '—'}</td>
                    <td style={td}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 999,
                        background: statusBg, color: statusColor,
                      }}>{status}</span>
                    </td>
                    <td style={td}>
                      {!ended ? (
                        <button type="button" className="btn btn-small"
                          onClick={() => onEdit(r)} disabled={busy}
                          style={{ marginRight: 6 }}>
                          Edit
                        </button>
                      ) : null}
                      <button type="button" className="btn btn-small"
                        onClick={() => onDelete(r.id)} disabled={busy}
                        style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444' }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// `<input type="datetime-local">` wants `YYYY-MM-DDTHH:MM` in *local* time
// (no timezone suffix). Build it from the Date components rather than via
// toISOString (which would shift to UTC).
function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputStyle = {
  padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14,
};
const th = { padding: '6px 8px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 };
const td = { padding: '8px', verticalAlign: 'middle' };
