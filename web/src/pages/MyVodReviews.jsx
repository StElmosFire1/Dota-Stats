import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';

const STATUS_COLOR = {
  pending: '#9ca3af', paid: '#3b82f6', in_progress: '#f59e0b',
  delivered: '#10b981', refunded: '#ef4444', cancelled: '#6b7280',
};

function fmtPrice(c, cur = 'aud') { return `$${(c / 100).toFixed(2)} ${String(cur).toUpperCase()}`; }

export default function MyVodReviews() {
  const [data, setData] = useState({ as_student: [], as_coach: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listMyVodReviews()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--dire-color)' }}>{error}</div>;

  const renderRow = (v, mine) => (
    <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: 8 }}>
        <Link to={`/vod-reviews/${v.id}`} style={{ color: 'var(--accent)' }}>#{v.id}</Link>
      </td>
      <td style={{ padding: 8 }}>{mine === 'student' ? v.coach_name : v.student_name}</td>
      <td style={{ padding: 8, fontSize: 13 }}>{v.match_id || '—'}</td>
      <td style={{ padding: 8, fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.question}</td>
      <td style={{ padding: 8 }}>
        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, color: '#fff', background: STATUS_COLOR[v.status] || '#6b7280' }}>{v.status}</span>
      </td>
      <td style={{ padding: 8, textAlign: 'right' }}>{fmtPrice(v.price_cents, v.currency)}</td>
    </tr>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
      <h1>My VOD reviews</h1>

      <h3 style={{ marginTop: 16 }}>As student</h3>
      {data.as_student.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No VOD reviews yet. <Link to="/coaches" style={{ color: 'var(--accent)' }}>Browse coaches →</Link></p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '2px solid var(--border)' }}><th align="left">#</th><th align="left">Coach</th><th align="left">Match</th><th align="left">Question</th><th align="left">Status</th><th align="right">Price</th></tr></thead>
          <tbody>{data.as_student.map(v => renderRow(v, 'student'))}</tbody>
        </table>
      )}

      {data.as_coach.length > 0 && (
        <>
          <h3 style={{ marginTop: 32 }}>As coach</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)' }}><th align="left">#</th><th align="left">Student</th><th align="left">Match</th><th align="left">Question</th><th align="left">Status</th><th align="right">Price</th></tr></thead>
            <tbody>{data.as_coach.map(v => renderRow(v, 'coach'))}</tbody>
          </table>
        </>
      )}
    </div>
  );
}
