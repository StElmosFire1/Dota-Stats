// Task #383 — Leagues browse + (superuser) create.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listLeagues, createLeague } from '../api';
import { useSuperuser } from '../context/SuperuserContext';

const FORMATS = [
  { value: 'round_robin', label: 'Round robin' },
  { value: 'single_elim', label: 'Single elimination' },
  { value: 'double_elim', label: 'Double elimination' },
];

export default function Leagues() {
  const { isSuperuser } = useSuperuser();
  const [leagues, setLeagues] = useState([]);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState({ name: '', format: 'single_elim', description: '' });
  const [busy, setBusy] = useState(false);

  const refresh = () => listLeagues().then(d => setLeagues(d.leagues || [])).catch(e => setErr(e.message));
  useEffect(() => { refresh(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await createLeague(form);
      setForm({ name: '', format: 'single_elim', description: '' });
      refresh();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', margin: 0 }}>Leagues</h1>
        <Link to="/teams" style={{ fontSize: 13 }}>← Teams</Link>
      </header>

      {err ? <p style={{ color: 'crimson' }}>{err}</p> : null}

      {isSuperuser && (
        <section className="card" style={{ padding: 14, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Create a league (operator)</h2>
          <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Name</span>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Format</span>
              <select value={form.format} onChange={e => setForm({ ...form, format: e.target.value })}
                style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }}>
                {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Description</span>
              <textarea value={form.description} rows={2}
                onChange={e => setForm({ ...form, description: e.target.value })}
                style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
            </label>
            <button type="submit" disabled={busy} style={{ gridColumn: '1 / -1', padding: '8px 14px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
              {busy ? 'Creating…' : 'Create league'}
            </button>
          </form>
        </section>
      )}

      <section>
        {leagues.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No leagues yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {leagues.map(l => (
              <Link key={l.id} to={`/leagues/${l.id}`} className="card"
                style={{ padding: 14, textDecoration: 'none', color: 'inherit', borderLeft: '4px solid var(--accent)' }}>
                <h3 style={{ margin: '0 0 4px' }}>{l.name}</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                  {FORMATS.find(f => f.value === l.format)?.label || l.format} · {l.status} · {l.team_count} team{l.team_count === 1 ? '' : 's'}
                </p>
                {l.description ? <p style={{ margin: '6px 0 0', fontSize: 13 }}>{l.description.slice(0, 120)}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
