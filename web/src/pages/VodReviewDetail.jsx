import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as api from '../api';

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function VodReviewDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [noteForm, setNoteForm] = useState({ t_seconds: 0, text: '' });
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.getVodReview(id)
      .then(setData)
      .catch(e => setError(e.message));
  };
  useEffect(load, [id]);

  if (error) return <div style={{ padding: 24, color: 'var(--dire-color)' }}>{error}</div>;
  if (!data) return <div style={{ padding: 24 }}>Loading…</div>;
  const { review, notes, is_coach } = data;

  const addNote = async (e) => {
    e.preventDefault();
    if (!noteForm.text.trim()) return;
    setBusy(true);
    try {
      await api.addVodNote(review.id, { t_seconds: parseInt(noteForm.t_seconds) || 0, text: noteForm.text.trim() });
      setNoteForm({ t_seconds: 0, text: '' });
      load();
    } catch (err) { alert(err.message); }
    finally { setBusy(false); }
  };

  const remove = async (noteId) => {
    if (!window.confirm('Delete this note?')) return;
    try { await api.deleteVodNote(review.id, noteId); load(); }
    catch (e) { alert(e.message); }
  };

  const deliver = async () => {
    if (!window.confirm('Mark this review as delivered? This captures payment.')) return;
    try { await api.deliverVodReview(review.id); load(); }
    catch (e) { alert(e.message); }
  };

  const refund = async () => {
    if (!window.confirm('Refund this review? The student will get their money back.')) return;
    try { await api.refundVodReview(review.id); load(); }
    catch (e) { alert(e.message); }
  };

  const canEdit = is_coach && ['paid', 'in_progress'].includes(review.status);

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}>
      <p><Link to="/me/coaching/vod" style={{ color: 'var(--accent)' }}>← My VOD reviews</Link></p>
      <h1>VOD review #{review.id}</h1>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Status: <strong>{review.status}</strong></div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Coach: <strong>{review.coach_name}</strong> · Student: <strong>{review.student_name}</strong></div>
            {review.match_id && (
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Match: <Link to={`/replay/${review.match_id}?vodReview=${review.id}`} style={{ color: 'var(--accent)' }}>#{review.match_id}</Link>
              </div>
            )}
            {review.replay_url && (
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Replay: <a href={review.replay_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>external link ↗</a>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {is_coach && ['paid', 'in_progress'].includes(review.status) && notes.length > 0 && (
              <button type="button" onClick={deliver} aria-label="Deliver review"
                style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--radiant-color)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 }}>
                ✓ Deliver
              </button>
            )}
            {['paid', 'in_progress'].includes(review.status) && (
              <button type="button" onClick={refund} aria-label="Refund review"
                style={{ padding: '6px 14px', borderRadius: 6, background: 'transparent', border: '1px solid var(--dire-color)', color: 'var(--dire-color)', cursor: 'pointer' }}>
                Refund
              </button>
            )}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Question</div>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{review.question}</div>
        </div>
      </div>

      <h3>Timestamped notes</h3>
      {notes.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No notes yet. {is_coach ? 'Add the first one below.' : 'Coach hasn\'t started yet.'}</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {notes.map(n => (
            <div key={n.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 70, fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>
                {review.match_id ? (
                  <Link to={`/replay/${review.match_id}?vodReview=${review.id}&t=${n.t_seconds}`} style={{ color: 'var(--accent)' }}>{fmtTime(n.t_seconds)}</Link>
                ) : fmtTime(n.t_seconds)}
              </div>
              <div style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{n.text}</div>
              {is_coach && (
                <button type="button" onClick={() => remove(n.id)} aria-label={`Delete note at ${fmtTime(n.t_seconds)}`}
                  style={{ background: 'transparent', border: 0, color: 'var(--dire-color)', cursor: 'pointer', fontSize: 13 }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <form onSubmit={addNote} style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            t (sec)
            <input type="number" min={0} value={noteForm.t_seconds}
              onChange={e => setNoteForm(f => ({ ...f, t_seconds: e.target.value }))}
              style={{ width: 100, padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13, flex: 1, minWidth: 240 }}>
            Note
            <input value={noteForm.text} onChange={e => setNoteForm(f => ({ ...f, text: e.target.value }))}
              placeholder="e.g. Bad farming pattern — should rotate to mid here"
              style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          </label>
          <button type="submit" disabled={busy || !noteForm.text.trim()}
            style={{ padding: '8px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700, opacity: (busy || !noteForm.text.trim()) ? 0.5 : 1 }}>
            + Add note
          </button>
        </form>
      )}
    </div>
  );
}
