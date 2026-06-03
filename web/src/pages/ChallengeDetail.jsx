import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCommunityChallenge } from '../api';
import { challengeSummary } from '../lib/challengeSummary';

// Task #440 — Full leaderboard view for a single community challenge.

function fmtScore(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtRange(start, end) {
  try {
    const s = new Date(start).toLocaleDateString();
    const e = new Date(end).toLocaleDateString();
    return `${s} → ${e}`;
  } catch { return ''; }
}

export default function ChallengeDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    getCommunityChallenge(id)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setErr(e.message || 'Failed to load.'); });
    return () => { cancelled = true; };
  }, [id]);

  if (err) return <div style={{ padding: 32, textAlign: 'center' }}>⚠️ {err}</div>;
  if (!data) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>;

  const { challenge, leaderboard, my_rank: myRank } = data;
  const board = leaderboard || [];
  const inTop = myRank && board.some(r => Number(r.account_id) === Number(myRank.account_id));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ marginBottom: 8 }}>
        <Link to="/" style={{ fontSize: 12, color: 'var(--text-muted)' }}>← Home</Link>
      </div>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber, #f59e0b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Community Challenge
        </div>
        <h1 style={{ margin: '4px 0 6px', fontSize: 26 }}>{challenge.title}</h1>
        {challenge.description && (
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{challenge.description}</p>
        )}
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          {fmtRange(challenge.starts_at, challenge.ends_at)}
          {challenge.prize_text ? <> · 🏆 {challenge.prize_text}</> : null}
        </div>
        {challengeSummary(challenge.scoring) && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            fontSize: 13, color: 'var(--text-secondary)',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--brass, #c5a975)' }}>How scoring works:</span>{' '}
            {challengeSummary(challenge.scoring)}
          </div>
        )}
      </header>

      {myRank && !inTop && (
        <div style={{
          padding: '10px 14px', marginBottom: 14, borderRadius: 8,
          background: 'rgba(245,158,11,0.08)', border: '1px dashed rgba(245,158,11,0.4)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13,
        }}>
          <span>Your rank: <strong>#{myRank.rank}</strong> of {myRank.total}</span>
          <span style={{ color: 'var(--accent)' }}>Score {fmtScore(myRank.score)}</span>
        </div>
      )}

      <section aria-label="Leaderboard">
        {board.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No scores recorded yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 10px' }}>Rank</th>
                <th style={{ padding: '8px 10px' }}>Player</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Score</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Matches</th>
              </tr>
            </thead>
            <tbody>
              {board.map((row) => {
                const mine = myRank && Number(row.account_id) === Number(myRank.account_id);
                return (
                  <tr key={row.account_id} style={{
                    borderTop: '1px solid var(--border)',
                    background: mine ? 'rgba(245,158,11,0.08)' : 'transparent',
                  }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--brass, #c5a975)' }}>
                      {row.rank}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <Link to={`/player/${row.account_id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                        {row.name || `Account ${row.account_id}`}
                      </Link>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>
                      {fmtScore(row.score)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {row.matches_counted}
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
