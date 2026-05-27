import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import {
  adminGetSmokeTestRun,
  adminUpdateSmokeTestItem,
  adminUpdateSmokeTestOverallNotes,
  adminSubmitSmokeTestRun,
  adminSmokeTestRunExportUrl,
} from '../api';

// Task #479 — single smoke-test run editor. Renders the run's snapshotted
// template, lets the operator flip each item between pending / ok / flag
// and add a note, auto-saves on change/blur, then submit when done.
export default function AdminSmokeTestRun() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isSuperuser, superuserKey } = useSuperuser() || {};
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [overallNotes, setOverallNotes] = useState('');
  const [overallSaving, setOverallSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!isSuperuser) return;
    setLoading(true); setError(null);
    try {
      const data = await adminGetSmokeTestRun(superuserKey, id);
      setRun(data?.run || null);
      setOverallNotes(data?.run?.overall_notes || data?.run?.state?._overall?.notes || '');
    } catch (e) {
      setError(e.message || 'Failed to load run.');
    }
    setLoading(false);
  }, [isSuperuser, superuserKey, id]);

  useEffect(() => { reload(); }, [reload]);

  const submitted = !!run?.submitted_at;
  const template = run?.template || [];
  const state = run?.state || {};

  const summary = useMemo(() => {
    let total = 0, ok = 0, flag = 0, pending = 0;
    for (const s of template) {
      for (const it of (s.items || [])) {
        total += 1;
        const cell = (state[s.key] && state[s.key][it.key]) || {};
        if (cell.status === 'ok') ok += 1;
        else if (cell.status === 'flag') flag += 1;
        else pending += 1;
      }
    }
    return { total, ok, flag, pending };
  }, [template, state]);

  const patchItem = async (sectionKey, itemKey, patch) => {
    if (submitted) return;
    const k = `${sectionKey}::${itemKey}`;
    setSavingKey(k);
    // Optimistic local update
    setRun(prev => {
      if (!prev) return prev;
      const next = { ...prev, state: { ...(prev.state || {}) } };
      next.state[sectionKey] = { ...(next.state[sectionKey] || {}) };
      next.state[sectionKey][itemKey] = { ...(next.state[sectionKey][itemKey] || {}), ...patch };
      return next;
    });
    try {
      const data = await adminUpdateSmokeTestItem(superuserKey, id, {
        sectionKey, itemKey, ...patch,
      });
      if (data?.run) setRun(data.run);
    } catch (e) {
      setError(e.message || 'Failed to save.');
    }
    setSavingKey(null);
  };

  const saveOverallNotes = async () => {
    if (submitted) return;
    setOverallSaving(true);
    try {
      const data = await adminUpdateSmokeTestOverallNotes(superuserKey, id, overallNotes);
      if (data?.run) setRun(data.run);
    } catch (e) {
      setError(e.message || 'Failed to save notes.');
    }
    setOverallSaving(false);
  };

  const submit = async () => {
    if (!window.confirm('Submit this smoke-test run? After submitting it becomes read-only.')) return;
    setSubmitting(true);
    try {
      // Flush any focused textarea so its pending blur-save lands before
      // submit triggers the server-side summary recompute. Then re-pull the
      // run once to confirm we see the latest server state.
      if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      // Give any just-fired blur-saves a tick to dispatch to the server. The
      // server-side submit is itself atomic (row-locked + summary recomputed
      // from current state), so this is belt-and-braces for UX freshness.
      await new Promise(r => setTimeout(r, 50));
      const data = await adminSubmitSmokeTestRun(superuserKey, id);
      if (data?.run) setRun(data.run);
    } catch (e) {
      setError(e.message || 'Failed to submit.');
    }
    setSubmitting(false);
  };

  const savesInFlight = !!savingKey || overallSaving;

  if (!isSuperuser) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1>Smoke-test run</h1>
        <p>Superuser access required.</p>
      </div>
    );
  }
  if (loading) return <div className="container" style={{ padding: 24 }}><p>Loading…</p></div>;
  if (!run) return <div className="container" style={{ padding: 24 }}><p>Run not found.</p></div>;

  return (
    <div className="container" style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>🧪 Smoke-test run #{run.id}</h1>
        {submitted
          ? <span className="badge" style={{ background: 'var(--gold)', color: 'var(--ink-navy)', padding: '2px 8px', borderRadius: 4 }}>Submitted</span>
          : <span className="badge" style={{ background: 'var(--amber)', color: 'var(--ink-navy)', padding: '2px 8px', borderRadius: 4 }}>In progress</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link to="/admin/smoke-test" className="btn btn-sm">← All runs</Link>
          <a href={adminSmokeTestRunExportUrl(run.id)} target="_blank" rel="noreferrer" className="btn btn-sm">↗ Export .md</a>
        </span>
      </div>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Started {new Date(run.started_at).toLocaleString()}
        {run.base_release_version ? ` · base v${run.base_release_version}` : ''}
        {submitted ? ` · submitted ${new Date(run.submitted_at).toLocaleString()}` : ''}.
        {' '}<strong>{summary.ok}</strong> ok · <strong>{summary.flag}</strong> flagged · <strong>{summary.pending}</strong> pending (of {summary.total}).
      </p>

      {error && (
        <div role="alert" style={{ padding: 10, border: '1px solid var(--amber)', borderRadius: 6, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {template.map(section => (
        <SectionBlock
          key={section.key}
          section={section}
          state={state[section.key] || {}}
          submitted={submitted}
          savingKey={savingKey}
          onPatch={patchItem}
        />
      ))}

      <section style={{ marginTop: 24, padding: 16, border: '1px solid var(--brass)', borderRadius: 6 }}>
        <h2 style={{ marginTop: 0 }}>Overall notes</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Anything that didn't fit in a specific section — release-wide
          impressions, prod incidents, what we should tighten next.
        </p>
        <textarea
          value={overallNotes}
          onChange={e => setOverallNotes(e.target.value)}
          onBlur={saveOverallNotes}
          rows={5}
          disabled={submitted}
          aria-label="Overall notes"
          style={{ width: '100%', fontFamily: 'inherit', padding: 8 }}
        />
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {overallSaving ? 'Saving…' : submitted ? 'Read-only.' : 'Saved on blur.'}
        </div>
      </section>

      {!submitted && (
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {savesInFlight && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
              Waiting for in-flight saves to finish…
            </span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={submitting || savesInFlight}
            aria-label="Submit smoke-test run"
            title={savesInFlight ? 'Waiting for in-flight saves to finish' : undefined}
          >
            {submitting ? 'Submitting…' : '✓ Submit run'}
          </button>
        </div>
      )}
    </div>
  );
}

function SectionBlock({ section, state, submitted, savingKey, onPatch }) {
  const isRelease = section.key && section.key.startsWith('release:');
  return (
    <section
      style={{
        marginTop: 18,
        padding: 14,
        border: `1px solid ${isRelease ? 'var(--gold)' : 'var(--brass)'}`,
        borderRadius: 6,
        background: isRelease ? 'rgba(245,158,11,0.05)' : 'transparent',
      }}
      aria-labelledby={`smoketest-section-${section.key}`}
    >
      <h2 id={`smoketest-section-${section.key}`} style={{ marginTop: 0, marginBottom: 4 }}>
        {isRelease ? '🆕 ' : ''}{section.title}
      </h2>
      {section.description && (
        <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: 13 }}>{section.description}</p>
      )}
      {section.fullEditionOnly && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0 }}>
          Full edition only.
        </p>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {(section.items || []).map(item => {
          const cell = state[item.key] || {};
          const k = `${section.key}::${item.key}`;
          const saving = savingKey === k;
          return (
            <li key={item.key} style={{ padding: '10px 0', borderBottom: '1px dashed rgba(197,169,117,0.25)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <StatusPills
                  value={cell.status || 'pending'}
                  disabled={submitted}
                  onChange={v => onPatch(section.key, item.key, { status: v })}
                  itemLabel={item.label}
                />
                <span style={{ flex: 1 }}>{item.label}</span>
                {saving && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>saving…</span>}
              </div>
              <textarea
                placeholder="Notes (optional)"
                aria-label={`Notes for: ${item.label}`}
                defaultValue={cell.note || ''}
                disabled={submitted}
                rows={2}
                onBlur={e => {
                  const v = e.target.value;
                  if (v !== (cell.note || '')) onPatch(section.key, item.key, { note: v });
                }}
                style={{ width: '100%', marginTop: 6, fontFamily: 'inherit', padding: 6, fontSize: 13 }}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatusPills({ value, disabled, onChange, itemLabel }) {
  const opts = [
    { v: 'pending', label: '○', name: 'Pending', tint: 'transparent' },
    { v: 'ok', label: '✓', name: 'OK', tint: 'rgba(34,197,94,0.18)' },
    { v: 'flag', label: '!', name: 'Flag', tint: 'rgba(245,158,11,0.25)' },
  ];
  return (
    <div role="radiogroup" aria-label={`Status for: ${itemLabel}`} style={{ display: 'inline-flex', gap: 4 }}>
      {opts.map(o => {
        const selected = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.name}
            disabled={disabled}
            onClick={() => onChange(o.v)}
            style={{
              minWidth: 28,
              height: 28,
              borderRadius: 4,
              border: selected ? '2px solid var(--gold)' : '1px solid var(--brass)',
              background: selected ? o.tint : 'transparent',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              padding: 0,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
