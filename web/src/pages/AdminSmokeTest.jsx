import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import {
  adminListSmokeTestRuns,
  adminStartSmokeTestRun,
  adminSmokeTestRunExportUrl,
} from '../api';

// Task #479 — Smoke-test runs index. Superuser-only. Lists previous runs and
// lets the operator start a new one. Each new run snapshots the base
// checklist + auto-injected "what just shipped" sections drawn from the
// patch notes published since the last submitted run.
export default function AdminSmokeTest() {
  const { isSuperuser, superuserKey } = useSuperuser() || {};
  const nav = useNavigate();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!isSuperuser) return;
    setLoading(true); setError(null);
    try {
      const data = await adminListSmokeTestRuns(superuserKey);
      setRuns(Array.isArray(data?.runs) ? data.runs : []);
    } catch (e) {
      setError(e.message || 'Failed to load smoke-test runs.');
    }
    setLoading(false);
  }, [isSuperuser, superuserKey]);

  useEffect(() => { reload(); }, [reload]);

  const startNew = async () => {
    setError(null); setBusy(true);
    try {
      const data = await adminStartSmokeTestRun(superuserKey);
      const id = data?.run?.id;
      if (id) nav(`/admin/smoke-test/${id}`);
      else throw new Error('Server did not return a run id.');
    } catch (e) {
      setError(e.message || 'Failed to start new run.');
    }
    setBusy(false);
  };

  if (!isSuperuser) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1>Smoke-test runs</h1>
        <p>Superuser access required.</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>🧪 Smoke-test runs</h1>
        <Link to="/admin" className="btn btn-sm" style={{ marginLeft: 'auto' }}>← Admin</Link>
      </div>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Per-release verification checklists. Each new run gets the standing house
        checks plus one auto-injected section per patch note shipped since the
        last submitted run.
      </p>

      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={startNew}
          disabled={busy}
          aria-label="Start a new smoke-test run"
        >
          {busy ? 'Starting…' : '▶ Start new run'}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ padding: 10, border: '1px solid var(--amber)', borderRadius: 6, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : runs.length === 0 ? (
        <p>No runs yet. Start your first one above.</p>
      ) : (
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Started</th>
              <th scope="col">Submitted</th>
              <th scope="col">Release at start</th>
              <th scope="col">Summary</th>
              <th scope="col" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {runs.map(r => {
              const s = r.summary || {};
              return (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{new Date(r.started_at).toLocaleString()}</td>
                  <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : <em style={{ color: 'var(--text-muted)' }}>in progress</em>}</td>
                  <td>{r.base_release_version ? `v${r.base_release_version}` : '—'}</td>
                  <td>
                    {s.total != null
                      ? `${s.ok || 0} ok · ${s.flag || 0} flag · ${s.pending || 0} pending (of ${s.total})`
                      : '—'}
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <Link to={`/admin/smoke-test/${r.id}`} className="btn btn-sm">Open</Link>
                    {r.submitted_at && (
                      <a className="btn btn-sm" href={adminSmokeTestRunExportUrl(r.id)} target="_blank" rel="noreferrer">.md</a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
