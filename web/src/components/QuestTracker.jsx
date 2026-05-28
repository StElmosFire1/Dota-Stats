import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getMyQuests } from '../api';
import { useSteamAuth } from '../context/SteamAuthContext';

// Task #440 — Daily / Weekly quest tracker widget.
//
// Renders the signed-in player's currently-assigned quests grouped by
// period. When a quest transitions from in-progress to completed
// between renders, an in-page "Quest complete!" toast is shown for ~5s.
// (Server-side notify() also fires a Discord DM + web push, gated by
// the user's `quest_completed` notification preference.)

function nextDailyResetMs() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}
function nextWeeklyResetMs() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sun
  const daysUntilMonday = (8 - day) % 7 || 7;
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntilMonday);
  next.setUTCHours(0, 0, 0, 0);
  return next.getTime() - now.getTime();
}
function fmtCountdown(ms) {
  if (ms <= 0) return 'resetting…';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ProgressBar({ value, target, completed }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
  return (
    <div style={{
      height: 6, background: 'var(--bg-hover)', borderRadius: 3,
      overflow: 'hidden', marginTop: 6,
    }}>
      <div style={{
        height: '100%', width: pct + '%',
        background: completed ? 'var(--accent-green, #22c55e)' : 'var(--amber, #f59e0b)',
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}

function QuestRow({ q }) {
  const completed = !!q.completed_at;
  return (
    <li style={{
      listStyle: 'none', padding: '10px 12px',
      background: 'var(--bg-hover)', borderRadius: 8,
      border: `1px solid ${completed ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
      opacity: completed ? 0.85 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {completed && <span aria-hidden="true" style={{ marginRight: 6 }}>✅</span>}
          {q.title}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          color: completed ? 'var(--accent-green, #22c55e)' : 'var(--brass, #c5a975)',
        }}>
          +{q.xp_reward} XP
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
        {q.description}
      </div>
      <ProgressBar value={q.progress} target={q.target} completed={completed} />
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, textAlign: 'right' }}>
        {q.progress.toLocaleString()} / {q.target.toLocaleString()}
      </div>
    </li>
  );
}

function CompletionToast({ quest, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        background: 'var(--bg-card)', border: '1px solid var(--accent-green, #22c55e)',
        borderRadius: 8, padding: '12px 16px', maxWidth: 320,
        boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}
    >
      <span style={{ fontSize: 22 }}>🎯</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Quest complete: {quest.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          +{quest.xp_reward} Season Pass XP awarded
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        style={{
          background: 'transparent', border: 0, color: 'var(--text-muted)',
          fontSize: 16, cursor: 'pointer', padding: 0,
        }}
      >×</button>
    </div>
  );
}

export default function QuestTracker({ compact = false }) {
  const { user } = useSteamAuth();
  const [quests, setQuests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const prevCompletionRef = useRef(null);

  const load = useCallback(async () => {
    if (!user?.accountId) { setQuests([]); return; }
    setLoading(true);
    try {
      const d = await getMyQuests();
      setQuests(d.quests || []);
    } catch {
      setQuests([]);
    } finally {
      setLoading(false);
    }
  }, [user?.accountId]);

  useEffect(() => { load(); }, [load]);

  // Detect newly-completed quests between renders and show a toast for each.
  useEffect(() => {
    if (!quests.length) return;
    const prev = prevCompletionRef.current;
    if (prev) {
      const newlyDone = quests.filter(q =>
        q.completed_at && !prev.has(q.id)
      );
      if (newlyDone.length > 0) {
        setToasts(t => [...t, ...newlyDone.map(q => ({ ...q, key: `${q.id}:${q.completed_at}` }))]);
      }
    }
    prevCompletionRef.current = new Set(quests.filter(q => q.completed_at).map(q => q.id));
  }, [quests]);

  // Soft poll every 60s so a quest that completes elsewhere updates the widget.
  useEffect(() => {
    if (!user?.accountId) return undefined;
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [user?.accountId, load]);

  // Live countdowns until the next daily / weekly reset (UTC bucket boundaries
  // — matches `_dayBucket` / `_weekBucket` in src/db/index.js). Declared above
  // any early return so hook order stays stable across auth-state changes.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  if (!user?.accountId) return null;

  const dailies = quests.filter(q => q.period === 'daily');
  const weeklies = quests.filter(q => q.period === 'weekly');
  const dailyResetText = fmtCountdown(nextDailyResetMs(now));
  const weeklyResetText = fmtCountdown(nextWeeklyResetMs(now));

  return (
    <section
      aria-label="Daily and weekly quests"
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: compact ? 14 : 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{
          margin: 0, fontSize: compact ? 14 : 16, fontWeight: 700,
          color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          🎯 Quests
        </h3>
        {loading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading…</span>}
      </div>

      {dailies.length > 0 && (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 6,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Daily
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }} title="Time until daily quests refresh">
              ⏱ refresh in {dailyResetText}
            </div>
          </div>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 0, margin: 0 }}>
            {dailies.map(q => <QuestRow key={q.id} q={q} />)}
          </ul>
        </>
      )}

      {weeklies.length > 0 && (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            margin: '12px 0 6px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Weekly
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }} title="Time until weekly quests refresh">
              ⏱ refresh in {weeklyResetText}
            </div>
          </div>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 0, margin: 0 }}>
            {weeklies.map(q => <QuestRow key={q.id} q={q} />)}
          </ul>
        </>
      )}

      {!loading && quests.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Play an inhouse match to unlock today's quests.
        </p>
      )}

      {toasts.map(t => (
        <CompletionToast
          key={t.key}
          quest={t}
          onDismiss={() => setToasts(ts => ts.filter(x => x.key !== t.key))}
        />
      ))}
    </section>
  );
}
