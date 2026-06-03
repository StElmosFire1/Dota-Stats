import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getActiveCommunityChallenges } from '../api';
import { challengeSummaryShort } from '../lib/challengeSummary';

// Task #440 — Active community challenge tile for the Home page.
// Renders the most recent active challenge with top 3 + viewer's rank.

function fmtScore(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtEnds(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours}h left`;
  return '<1h left';
}

export default function CommunityChallengeTile() {
  const [challenges, setChallenges] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getActiveCommunityChallenges()
      .then(d => { if (!cancelled) setChallenges(d.challenges || []); })
      .catch(() => { if (!cancelled) setChallenges([]); });
    return () => { cancelled = true; };
  }, []);

  if (challenges === null) return null;
  if (challenges.length === 0) return null;

  const c = challenges[0];
  const top = c.top || [];
  const myRank = c.my_rank;

  return (
    <section
      aria-labelledby={`challenge-tile-${c.id}-title`}
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber, #f59e0b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Community Challenge
          </div>
          <h3 id={`challenge-tile-${c.id}-title`} style={{ margin: '4px 0 2px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
            {c.title}
          </h3>
          {c.description && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{c.description}</p>
          )}
          {challengeSummaryShort(c.scoring) && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 700, color: 'var(--brass, #c5a975)' }}>Scoring:</span>{' '}
              {challengeSummaryShort(c.scoring)}
            </p>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {fmtEnds(c.ends_at)}
        </span>
      </div>

      {c.prize_text && (
        <div style={{
          fontSize: 12, color: 'var(--text-primary)',
          padding: '6px 10px', background: 'rgba(245,158,11,0.1)',
          borderRadius: 6, marginBottom: 10,
        }}>
          🏆 {c.prize_text}
        </div>
      )}

      {top.length > 0 ? (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {top.slice(0, 3).map((row, i) => (
            <li
              key={row.account_id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                padding: '8px 10px', background: 'var(--bg-hover)', borderRadius: 6,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, width: 22, textAlign: 'center', color: 'var(--brass, #c5a975)' }}>
                  {i + 1}
                </span>
                <Link to={`/player/${row.account_id}`} style={{
                  fontSize: 13, color: 'var(--text-primary)', textDecoration: 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {row.name || `Account ${row.account_id}`}
                </Link>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                {fmtScore(row.score)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          No scores recorded yet — play a match to get on the board.
        </p>
      )}

      {myRank ? (
        <div style={{
          marginTop: 10, padding: '8px 10px', borderRadius: 6,
          background: 'rgba(245,158,11,0.08)',
          border: '1px dashed rgba(245,158,11,0.4)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
          fontSize: 12,
        }}>
          <span style={{ color: 'var(--text-muted)' }}>
            Your rank: <strong style={{ color: 'var(--text-primary)' }}>#{myRank.rank}</strong> of {myRank.total}
          </span>
          <span style={{ color: 'var(--accent)' }}>Score {fmtScore(myRank.score)}</span>
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <Link to={`/challenges/${c.id}`} className="btn btn-small" style={{ fontSize: 12 }}>
          View full leaderboard →
        </Link>
      </div>
    </section>
  );
}
