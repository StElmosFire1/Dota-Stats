// Smoke-test checklist template (Task #479).
//
// Single source of truth for the base sections that get cloned into every new
// smoke-test run. `buildTemplateForRun()` returns the base sections plus one
// auto-injected "release:<version>" section per patch note that shipped since
// the last submitted run, so each run has its own bespoke "what's new to test"
// block on top of the standing house checks.
//
// Shape:
//   {
//     key: 'unique-section-key',
//     title: 'Human title shown as the heading',
//     description?: 'Optional sub-heading paragraph',
//     fullEditionOnly?: bool,  // hint only; gate still enforced server-side
//     items: [
//       { key: 'item-key', label: 'What to check' },
//       ...
//     ],
//   }
//
// Per-run state is stored separately as
//   { [sectionKey]: { [itemKey]: { status: 'pending'|'ok'|'flag', note: '' } },
//     _overall: { notes: '' } }

const BASE_SECTIONS = [
  {
    key: 'auth-nav',
    title: 'Sign-in & navigation',
    items: [
      { key: 'steam-signin', label: 'Steam sign-in works (private window, full OpenID redirect, lands signed in).' },
      { key: 'signout', label: 'Sign-out clears the session and protected pages bounce to public view.' },
      { key: 'nav-pages', label: 'Top nav loads on every major page (Home, Players, Leaderboard, Synergy, Coaches, Tournaments, Inhouse, Patch Notes).' },
      { key: 'nav-mobile', label: 'Mobile-width nav (~390px) — hamburger/drawer opens, every item is tappable.' },
    ],
  },
  {
    key: 'home',
    title: 'Home page',
    items: [
      { key: 'live-presence', label: 'Live presence chips show correct colours for in lobby / in match / in queue.' },
      { key: 'recent-matches', label: 'Recent matches list loads and links to match detail.' },
      { key: 'featured-tiles', label: 'Hot streaks / MVP / community challenge tiles render without "undefined".' },
    ],
  },
  {
    key: 'player-profile',
    title: 'Player profile',
    items: [
      { key: 'me-loads', label: '/me loads with rank, tier, PERF, recent matches, signature hero, nemesis widget.' },
      { key: 'other-loads', label: 'Another player profile loads from leaderboard click-through.' },
      { key: 'rating-history', label: 'Rating history chart renders without errors.' },
      { key: 'achievements', label: 'Achievements strip shows badges; hover/focus tooltip works.' },
      { key: 'nemesis-teammate', label: 'Nemesis / best teammate widget populates when there are enough matches.' },
      { key: 'watch-live', label: '"Watch live" / presence chip appears when player is in a lobby.' },
    ],
  },
  {
    key: 'players-list',
    title: 'Players list & live presence',
    items: [
      { key: 'list-loads', label: '/players loads; filter/sort works.' },
      { key: 'live-tab', label: 'Live-now tab shows lobby / drafting / in-match players.' },
      { key: 'avatar-fallback', label: 'Players with no Steam avatar still render a placeholder.' },
    ],
  },
  {
    key: 'leaderboard',
    title: 'Leaderboard & season',
    items: [
      { key: 'current-loads', label: 'Current season leaderboard renders correct headers (rank, tier, PERF, W-L).' },
      { key: 'sort', label: 'Sort by each column works.' },
      { key: 'past-season', label: 'Season selector switches to a past season.' },
      { key: 'season-summary', label: 'Season summary page for a closed season shows finals, most-improved, longest streaks, Hero of the Season.' },
    ],
  },
  {
    key: 'synergy',
    title: 'Synergy / head-to-head heatmap',
    items: [
      { key: 'loads', label: '/synergy loads.' },
      { key: 'teammates', label: 'Teammates mode shows colour-coded WR for stacks (≥2 games).' },
      { key: 'enemies', label: 'Enemies mode toggles cleanly, shows H2H WR.' },
      { key: 'tooltip', label: 'Hover/focus tooltip shows wins/games/WR.' },
    ],
  },
  {
    key: 'match-replay',
    title: 'Match detail & replay viewer',
    items: [
      { key: 'match-loads', label: 'Match page loads for a recent recorded inhouse.' },
      { key: 'scoreboard', label: 'Scoreboard renders all 10 players, GPM/XPM/KDA, items.' },
      { key: 'replay-2d', label: 'Replay viewer 2D opens via "Watch replay".' },
      { key: 'gold-sparkline', label: 'Gold-delta sparkline appears above the scrub bar and jumps playhead on click.' },
      { key: 'hover-inventory', label: 'Hero hover on minimap shows inventory + backpack tooltip at that timestamp.' },
      { key: 'fight-chips', label: 'Fight chips strip lists every detected team fight; clicking a chip jumps to it.' },
      { key: 'share-clip', label: '"Share clip" copies a URL with t/end/focus that autoplays the clip window when pasted.' },
      { key: 'discord-unfurl', label: 'Sharing the clip URL in Discord unfurls with the clip window times.' },
    ],
  },
  {
    key: 'inhouse',
    title: 'Inhouse lobby flow',
    fullEditionOnly: true,
    items: [
      { key: 'signin', label: 'Sign-in page at /inhouse lists open lobby with positions.' },
      { key: 'position', label: 'Register a position 1–5 — appears in right column.' },
      { key: 'accept', label: 'Accept phase fires when 10 sign in (with countdown).' },
      { key: 'draft', label: 'Captain draft UI clickable, timer counts down, suggestions panel (if opted in) appears.' },
      { key: 'provision', label: 'Auto-provision dedicated server within ~30s of 10th pick; boot info shown.' },
      { key: 'failure-recovery', label: 'On provision failure, captains see Retry button and admin Discord ping fires.' },
    ],
  },
  {
    key: 'tournaments',
    title: 'Tournaments (Swiss + check-in)',
    items: [
      { key: 'list', label: '/tournaments list loads.' },
      { key: 'create', label: 'Create a test tournament in admin (format = Swiss).' },
      { key: 'signup', label: 'Sign up with the test account.' },
      { key: 'checkin', label: 'Check-in window opens at start - offset; check-in button works.' },
      { key: 'no-show-dq', label: 'No-show DQ removes uncheked-in players when the sweep runs.' },
      { key: 'round-1', label: 'Swiss round 1 generates pairings; standings page loads.' },
      { key: 'set-winner', label: 'Setting a winner recomputes standings live (Buchholz tiebreak).' },
      { key: 'advance', label: 'Advance round (superuser) generates round 2 with no repeats.' },
      { key: 'prize-splits', label: 'Prize splits editor accepts per-place %; total is validated.' },
      { key: 'payouts', label: 'Payouts table populates once tournament is complete.' },
    ],
  },
  {
    key: 'coaching-marketplace',
    title: 'Coaching marketplace',
    fullEditionOnly: true,
    items: [
      { key: 'filters', label: 'Sidebar filters work (Position 1–5, Language, Price, Min rating, Available-this-week).' },
      { key: 'sort', label: 'Sort dropdown works for each option (relevance / price / rating / next available / most booked).' },
      { key: 'premium-float', label: 'Premium coaches float to the top of each sort.' },
      { key: 'instant-booking', label: 'Instant Booking ⚡ badge appears for coaches whose next slot is <48h.' },
      { key: 'coach-of-month', label: 'Coach of the Month spotlight renders above grid.' },
      { key: 'review-snippets', label: 'Anonymised review snippets show on coach cards + detail page (only for consented coaches).' },
      { key: 'filter-combos', label: 'Filter combinations behave sensibly (no empty-when-it-shouldn\'t-be).' },
    ],
  },
  {
    key: 'coaching-booking',
    title: 'Coaching booking & recurring plans',
    fullEditionOnly: true,
    items: [
      { key: 'book-1to1', label: 'Book 1:1 session → Stripe Checkout → test card 4242 → booking confirmed.' },
      { key: 'confirm-dm', label: 'Confirmation DM lands in Discord.' },
      { key: 'reminder-dm', label: 'Session reminder DM lands ~1h before slot.' },
      { key: 'vod-flow', label: 'VOD review request flow works end-to-end.' },
      { key: 'group-join', label: 'Group session join debits a seat and confirms.' },
      { key: 'plan-editor', label: 'Coach edit → Recurring plans editor lets a coach create a draft plan.' },
      { key: 'plan-publish', label: 'Publish creates Stripe Product + Price (test mode).' },
      { key: 'plan-public', label: 'Public coach profile shows plan card.' },
      { key: 'plan-subscribe', label: 'Subscribe as test student via Stripe (subscription mode); test card works.' },
      { key: 'plan-use', label: 'use_plan:true booking debits quota, $0 charge, plan_subscription_id stamped.' },
      { key: 'plan-list', label: '/me/coaching/plan-subscriptions lists active subs.' },
      { key: 'plan-cancel', label: 'Cancel subscription — access continues until period end.' },
    ],
  },
  {
    key: 'coach-earnings',
    title: 'Coach earnings & Stripe Connect',
    fullEditionOnly: true,
    items: [
      { key: 'earnings-loads', label: 'Coach earnings page loads with month-to-date totals.' },
      { key: 'mrr-tiles', label: 'Three plan-MRR tiles render (MRR cents, active subs, retained this month).' },
      { key: 'refund-reflects', label: 'Refunding a test booking shows ↺ pill + amber summary line on earnings (Task #421).' },
    ],
  },
  {
    key: 'pro-billing',
    title: 'Pro subscription / Stripe billing',
    fullEditionOnly: true,
    items: [
      { key: 'upgrade-page', label: 'Pro upgrade page opens.' },
      { key: 'subscribe', label: 'Subscribe with test card completes Checkout.' },
      { key: 'unlocks', label: 'Pro-only features unlock immediately.' },
      { key: 'manage', label: 'Manage billing opens Stripe Customer Portal.' },
      { key: 'cancel', label: 'Cancel keeps Pro features until period end.' },
    ],
  },
  {
    key: 'coins',
    title: 'Coin economy & frame shop',
    fullEditionOnly: true,
    items: [
      { key: 'balance', label: 'Coin balance shows on profile.' },
      { key: 'buy-coins', label: 'Buy coins via Stripe Checkout credits the right amount.' },
      { key: 'frame-shop', label: 'Frame shop loads with price + ownership state per frame.' },
      { key: 'buy-frame', label: 'Buy frame with coins debits balance and applies frame.' },
      { key: 'gift-frame', label: 'Gift a frame to another user completes end-to-end.' },
    ],
  },
  {
    key: 'notifications',
    title: 'Notifications (web push + Discord DMs)',
    items: [
      { key: 'web-page', label: '/me/notifications page loads.' },
      { key: 'toggles-save', label: 'Each category toggle saves and persists on reload.' },
      { key: 'web-push-subscribe', label: 'Web-push subscribe asks permission and registers service worker.' },
      { key: 'test-push', label: 'Test push delivers a notification.' },
      { key: 'dm-post-match', label: 'post_match_dm fires after a recorded match.' },
      { key: 'dm-match-ready', label: 'match_ready DM fires when lobby hits 10.' },
      { key: 'dm-mvp-vote', label: 'mvp_vote DM prompt arrives after a match.' },
      { key: 'dm-attitude', label: 'attitude_vote DM prompt arrives after a match.' },
      { key: 'dm-hot-streak', label: 'hot_streak DM fires at 5/10 win streak only.' },
      { key: 'dm-schedule', label: 'schedule_reminder T-24h and T-1h DMs land.' },
      { key: 'dm-weekly-recap', label: 'weekly_recap Sunday-night digest lands.' },
      { key: 'dm-coach-confirm', label: 'coaching_booking_confirmed DM on Stripe payment.' },
      { key: 'dm-coach-reminder', label: 'coaching_session_reminder DM ~1h before session.' },
      { key: 'dm-coach-review', label: 'coaching_review_request DM after session ends.' },
    ],
  },
  {
    key: 'discord-bot',
    title: 'Discord bot commands',
    items: [
      { key: 'stats', label: '!stats returns your stats card.' },
      { key: 'last', label: '!last shows last match.' },
      { key: 'season', label: '!season shows current standings.' },
      { key: 'leaderboard', label: '!leaderboard returns top 10.' },
      { key: 'owner-only', label: 'Owner-only commands work as owner only (!perf-backfill 10, !backfill-pick-source).' },
      { key: 'patch-broadcast', label: 'Bot announces in patch channel when a new patch note ships.' },
    ],
  },
  {
    key: 'admin-panel',
    title: 'Admin panel (superuser only)',
    items: [
      { key: 'login', label: 'Superuser password login grants access.' },
      { key: 'match-edit', label: 'Match list loads; can edit / replay a match.' },
      { key: 'backfill-fights', label: '"Backfill fights" runs and shows polling status.' },
      { key: 'season-lifecycle', label: 'Season Lifecycle panel — Edit end conditions, Close Season, Undo Rollover.' },
      { key: 'test-promote-coach', label: '"Promote to Coach (test)" works.' },
      { key: 'backup-restore', label: 'Backup creates snapshot; List shows it; Restore restores ratings tables.' },
      { key: 'feature-flags', label: 'Toggling a feature flag is reflected in the front-end.' },
      { key: 'tournament-admin', label: 'Tournament admin: create / edit / advance round / finalize payouts.' },
    ],
  },
  {
    key: 'public-api',
    title: 'Public API & developer portal',
    items: [
      { key: 'portal-loads', label: '/developers portal loads with endpoint list.' },
      { key: 'create-key', label: 'Create API key with scope read:matches.' },
      { key: 'try-it', label: 'Portal "Try it" runner calls /v1/matches with the pasted key; shows status/latency/rate/body.' },
      { key: 'wrong-scope', label: 'Wrong-scope call is rejected (read:matches key on /v1/teams → 403).' },
      { key: 'rate-headers', label: 'X-RateLimit-* headers present on every response.' },
      { key: 'webhook', label: 'Register webhook for match.finalized; trigger a record; payload arrives with version:1 + full stats.' },
    ],
  },
  {
    key: 'mobile-companion',
    title: 'Mobile companion (write actions)',
    items: [
      { key: 'push-deeplink', label: 'Push notification tap deep-links into the matching action screen.' },
      { key: 'ready-check', label: 'Inhouse ready-check accept/decline reflects on web UI.' },
      { key: 'mvp-vote', label: 'MVP vote screen submits.' },
      { key: 'scrim-respond', label: 'Scrim respond screen works.' },
      { key: 'roster-transfer', label: 'Roster transfer respond works.' },
      { key: 'book-coach', label: 'Book coach screen completes booking (or kicks to Checkout WebView).' },
      { key: 'vod-request', label: 'VOD review request submits.' },
      { key: 'reminder-ack', label: 'Booking reminder ack marks the booking acknowledged.' },
      { key: 'reauth-modal', label: 'Sign out on web → trigger mobile action → reauth modal appears and recovers cleanly.' },
    ],
  },
  {
    key: 'patch-notes',
    title: 'Patch notes feed',
    items: [
      { key: 'page-loads', label: '/patch-notes loads, latest at top.' },
      { key: 'no-dup-warnings', label: 'No duplicate-version warnings in bot startup logs (Task #418).' },
      { key: 'pagination', label: 'Scroll/pagination works to the bottom.' },
    ],
  },
  {
    key: 'observability',
    title: 'Observability sanity',
    items: [
      { key: 'ops-dashboard', label: '/admin/ops dashboard shows live numbers: parser queue depth, webhook lag, error counts.' },
      { key: 'otel-boot', label: 'No OTel boot errors in bot startup logs ([otel] lines).' },
      { key: 'grafana', label: 'Grafana Cloud dashboard (if imported) shows traffic on all 10 panels.' },
    ],
  },
  {
    key: 'community-edition',
    title: 'Community edition spot-check',
    items: [
      { key: 'public-pages', label: 'Public stats, leaderboard, profiles all load on dota.stats.corvidaeinc.com.' },
      { key: 'no-paywall', label: 'No Pro / coaching / tournament / Stripe touchpoints visible anywhere.' },
      { key: 'discord-bot', label: 'Community Discord bot (inhouse-bot PM2) responds to !stats, !last, !leaderboard.' },
    ],
  },
  {
    key: 'cross-cutting',
    title: 'Cross-cutting',
    items: [
      { key: 'console-clean', label: 'Browser console has no red errors clicking through major pages.' },
      { key: '404', label: '404 page renders cleanly for /this-does-not-exist.' },
      { key: 'keyboard-nav', label: 'Tab through home page — every interactive element has visible focus ring.' },
      { key: 'screen-reader', label: 'Screen reader (VoiceOver/NVDA) reads labels on icon-only buttons.' },
      { key: 'mobile-overflow', label: 'Re-open most-used pages at ~390px — nothing overflows.' },
    ],
  },
];

// Extract a single-sentence headline from a patch note body so the auto-injected
// items have something useful to verify. Strips markdown bold/italics and
// trims to ~140 chars.
function _summarise(bullet) {
  if (typeof bullet !== 'string') return null;
  let s = bullet.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim();
  // First sentence-ish: cut at the first ". " (period+space) if it lands in
  // the first 200 chars.
  const dot = s.indexOf('. ');
  if (dot > 30 && dot < 200) s = s.slice(0, dot + 1);
  if (s.length > 180) s = s.slice(0, 177) + '…';
  return s;
}

function _bulletsFor(note) {
  if (Array.isArray(note.notes) && note.notes.length) return note.notes;
  if (typeof note.content === 'string' && note.content.trim()) {
    // First few paragraphs as fallback bullets.
    return note.content.split(/\n\n+/).slice(0, 4);
  }
  return [];
}

// Build the per-run template:
//   base sections, then one auto-injected section per patch note in
//   `patchNotesSince` (newest first). Each release section gets one
//   "verify" item per top-level bullet (capped at 6) plus an open-ended
//   "anything else broken?" slot.
function buildTemplateForRun({ patchNotesSince = [] } = {}) {
  const releaseSections = (patchNotesSince || []).map((note) => {
    const bullets = _bulletsFor(note);
    const items = bullets.slice(0, 6).map((b, i) => {
      const label = _summarise(b);
      return label
        ? { key: `bullet-${i}`, label: `Verify: ${label}` }
        : null;
    }).filter(Boolean);
    items.push({ key: 'release-overall', label: 'Anything else off about this release on the live site?' });
    return {
      key: `release:${note.version}`,
      title: `v${note.version} — ${note.title || 'Release check'}`,
      description: note.published_at ? `Shipped ${note.published_at}.` : undefined,
      releaseVersion: note.version,
      items,
    };
  });
  // Release sections come FIRST so the operator hits "what just changed" before
  // the standing house checks.
  return [...releaseSections, ...BASE_SECTIONS];
}

// Empty-state object for a fresh run, indexed [sectionKey][itemKey].
function buildInitialState(template) {
  const state = { _overall: { notes: '' } };
  for (const section of template) {
    state[section.key] = {};
    for (const item of section.items) {
      state[section.key][item.key] = { status: 'pending', note: '' };
    }
  }
  return state;
}

// Roll up counts across the state object.
function summariseState(template, state) {
  let total = 0, ok = 0, flag = 0, pending = 0;
  for (const section of template) {
    for (const item of section.items) {
      total += 1;
      const cell = (state[section.key] && state[section.key][item.key]) || {};
      if (cell.status === 'ok') ok += 1;
      else if (cell.status === 'flag') flag += 1;
      else pending += 1;
    }
  }
  return { total, ok, flag, pending };
}

// Render the run as paste-back-friendly markdown.
function exportRunAsMarkdown({ run, template, state }) {
  const summary = summariseState(template, state);
  const lines = [];
  lines.push(`# Smoke-test run #${run.id}`);
  lines.push('');
  lines.push(`- **Started:** ${run.started_at}`);
  if (run.submitted_at) lines.push(`- **Submitted:** ${run.submitted_at}`);
  if (run.base_release_version) lines.push(`- **Base release at start:** v${run.base_release_version}`);
  lines.push(`- **Summary:** ${summary.ok} ok / ${summary.flag} flagged / ${summary.pending} pending (of ${summary.total}).`);
  lines.push('');
  for (const section of template) {
    lines.push(`## ${section.title}`);
    if (section.description) lines.push(`_${section.description}_`); lines.push('');
    for (const item of section.items) {
      const cell = (state[section.key] && state[section.key][item.key]) || {};
      const box = cell.status === 'ok' ? '[x]' : cell.status === 'flag' ? '[!]' : '[ ]';
      lines.push(`- ${box} ${item.label}`);
      if (cell.note && cell.note.trim()) {
        for (const line of cell.note.split(/\n/)) {
          lines.push(`  > ${line}`);
        }
      }
    }
    lines.push('');
  }
  if (state._overall && state._overall.notes && state._overall.notes.trim()) {
    lines.push('## Overall notes');
    for (const line of state._overall.notes.split(/\n/)) lines.push(`> ${line}`);
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = {
  BASE_SECTIONS,
  buildTemplateForRun,
  buildInitialState,
  summariseState,
  exportRunAsMarkdown,
};
