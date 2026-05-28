import React from 'react';
import { getPlayerFormSummary } from '../api';
import { getHeroName } from '../heroNames';

// Task #444 — Pre-match mood & form widget. Renders a soft signal of the
// player's recent form: last-7d W-L, best weekday WR delta, and any "hot"
// hero over the last 10 games. Hidden when the viewer toggles
// `mood_widget` off in notification prefs (the caller passes `enabled`).
//
// Read-only display surface: no buttons, no interactive elements, so it
// stays trivially accessible. Colour cues are deliberately gentle — green
// for ≥60% WR / W-heavy record, brass for in-between, muted text for cold
// signals. We never use red; this is a vibe widget, not a scolding.
function pct(n, d) {
  if (!d) return null;
  return Math.round((n / d) * 100);
}

function formColor(wins, losses) {
  const g = wins + losses;
  if (g < 3) return 'var(--text-muted)';
  const wr = wins / g;
  if (wr >= 0.6) return 'var(--accent-green, #4ade80)';
  if (wr >= 0.4) return 'var(--brass, #c5a975)';
  return 'var(--text-muted)';
}

function tinyVibe(summary) {
  if (!summary) return null;
  const w7 = summary.last7?.wins || 0;
  const l7 = summary.last7?.losses || 0;
  const wd = summary.weekday;
  const hot = summary.hotHero;
  if (!w7 && !l7 && !hot && !wd) return 'No recent inhouse games yet — your next one writes the story.';
  if (hot && hot.wr >= 0.75) return `Your ${getHeroName(hot.hero_id)} is on fire.`;
  if (w7 >= 5 && w7 > l7 * 2) return "Hot week. Ride it.";
  if (wd && wd.lift >= 0.1) {
    const today = new Intl.DateTimeFormat('en-AU', {
      weekday: 'long', timeZone: 'Australia/Sydney',
    }).format(new Date());
    if (today === wd.day) return `${wd.day}s are your day — that's today.`;
    return `${wd.day}s tend to go your way.`;
  }
  if (l7 > w7 && (w7 + l7) >= 3) return "Quiet week — one good game flips the trend.";
  return 'Steady. Anything could happen tonight.';
}

export default function MoodFormWidget({ accountId, compact = false, viewerOwnsWidget = true }) {
  const [data, setData] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);
  // Gate render on the viewer's `mood_widget` notification pref. The pref
  // endpoint requires sign-in; for signed-out viewers (or someone else's
  // profile) we just default-show. The pref is the only thing controlling
  // visibility — the API stays open.
  const [prefEnabled, setPrefEnabled] = React.useState(true);
  React.useEffect(() => {
    if (!viewerOwnsWidget) return;
    let alive = true;
    fetch('/api/me/notifications', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!alive || !j?.categories) return;
        const row = j.categories.find(c => c.key === 'mood_widget' || c.category === 'mood_widget');
        if (row) setPrefEnabled(!!row.enabled);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [viewerOwnsWidget]);
  React.useEffect(() => {
    if (!accountId) return;
    let alive = true;
    getPlayerFormSummary(accountId)
      .then(s => { if (alive) { setData(s); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [accountId]);

  if (!accountId) return null;
  if (!prefEnabled) return null;
  if (!loaded) return null;
  if (!data || data.sample === 0) return null;

  const last7 = data.last7 || { wins: 0, losses: 0, games: 0 };
  const last14 = data.last14 || { wins: 0, losses: 0, games: 0 };
  const wd = data.weekday;
  const hot = data.hotHero;
  const vibe = tinyVibe(data);

  const chip = (label, content, color) => (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 6,
      padding: '6px 12px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 999,
      fontSize: 12,
    }}>
      <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, fontWeight: 700 }}>{label}</span>
      <span style={{ color: color || 'var(--text)', fontWeight: 700 }}>{content}</span>
    </div>
  );

  return (
    <section
      aria-label="Pre-match mood and form"
      style={{
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--brass) 8%, var(--bg-card)) 0%, var(--bg-card) 100%)',
        border: '1px solid color-mix(in srgb, var(--brass) 30%, var(--border))',
        borderRadius: 10,
        padding: compact ? '10px 14px' : '14px 18px',
        marginTop: compact ? 8 : 12,
        marginBottom: compact ? 8 : 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{
          fontFamily: 'var(--font-condensed, var(--font))',
          fontSize: 12, fontWeight: 700, letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: 'var(--brass, #c5a975)',
        }}>
          ✨ Pre-match vibe
        </span>
        {vibe && (
          <span style={{ fontSize: 13, color: 'var(--text)', fontStyle: 'italic' }}>
            {vibe}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(last7.games > 0) && chip(
          'Last 7d',
          `${last7.wins}W-${last7.losses}L`,
          formColor(last7.wins, last7.losses),
        )}
        {(last14.games > 0 && last14.games !== last7.games) && chip(
          'Last 14d',
          `${last14.wins}W-${last14.losses}L`,
          formColor(last14.wins, last14.losses),
        )}
        {wd && chip(
          `${wd.day}s`,
          `${pct(wd.wins, wd.games)}% WR ${wd.lift >= 0 ? '+' : ''}${Math.round(wd.lift * 100)}%`,
          wd.lift >= 0.05 ? 'var(--accent-green, #4ade80)' : 'var(--text-muted)',
        )}
        {hot && chip(
          'Hot',
          `${getHeroName(hot.hero_id)} ${hot.wins}-${hot.games - hot.wins} last ${hot.games}`,
          'var(--accent-green, #4ade80)',
        )}
      </div>
    </section>
  );
}
