import React, { useEffect, useState } from 'react';

export default function DraftPickClock({ startsAt, deadlineAt, seconds = 30, complete, isMyTurn }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick(value => value + 1), 250);
    return () => clearInterval(timer);
  }, []);
  // Read wall time on every render, including a new turn arriving between
  // ticks; a stale tick must not fabricate a one-second grace period.
  const now = Date.now();
  const end = deadlineAt ? new Date(deadlineAt).getTime() : null;
  const start = startsAt ? new Date(startsAt).getTime() : end == null ? null : end - seconds * 1000;
  const grace = start != null && start > now ? Math.ceil((start - now) / 1000) : 0;
  const remaining = end == null ? 0 : Math.min(seconds, Math.max(0, Math.ceil((end - now) / 1000)));
  const title = complete ? 'All picks recorded' : end == null ? 'Waiting for draft clock'
    : grace ? `Timer starts in ${grace}s` : remaining ? `${remaining}s` : 'Auto-pick pending';
  return <div className="pb-draft-clock">
    <div className="pb-draft-clock-line">
      <span>{complete ? 'Draft complete' : grace ? 'Get ready · you can pick now' : isMyTurn ? 'Your pick' : 'Pick timer'}</span>
      <strong role="timer" aria-label="Draft pick clock">{title}</strong>
    </div>
    <div className="pb-draft-clock-track" aria-hidden="true">
      <span style={{ width: `${complete ? 100 : grace ? 100 : remaining / seconds * 100}%` }} />
    </div>
  </div>;
}
