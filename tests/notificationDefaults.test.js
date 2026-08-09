// Task #455 — Notification defaults rework.
//
// Snapshot the per-event / per-category default matrix so any future drift
// is caught in CI. Only the genuinely transactional events (MVP voting,
// attitude voting, coaching) and the two celebratory milestones
// (anniversary, season Wrapped) should be default-ON; everything else is
// opt-in. `pro_billing_dm` is a deliberate default-ON exception (billing
// failure DMs must not be silently muted).

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');

// --- v1 categories (used by /api/me/notifications + the settings UI) ---
const EXPECTED_CATEGORY_DEFAULTS = {
  post_match_dm: false,
  mvp_vote: true,
  attitude_vote: true,
  hot_streak: false,
  schedule_reminder: false,
  weekly_recap: false,
  coaching_booking_confirmed: true,
  coaching_session_reminder: true,
  coaching_review_request: true,
  inhouse_pick_warning: false,
  tier_change_announce: false,
  weekly_summary: false,
  match_imminent_push: false,
  pro_billing_dm: true,   // deliberate exception — see catalog comment
  mood_widget: true,      // UI widget, not a DM stream
};

// --- v2 events (used by notify() → isEventEnabled) ---
const EXPECTED_EVENT_DEFAULTS = {
  match_result:            { discord: false, push: false },
  mvp_vote:                { discord: true,  push: false },
  hot_streak:              { discord: false, push: false },
  vod_delivered:           { discord: true,  push: true  },
  vod_purchased:           { discord: true,  push: true  },
  group_session_reminder:  { discord: true,  push: true  },
  lobby_invite:            { discord: false, push: false },
  achievement_unlocked:    { discord: false, push: false },
  prize_pool_change:       { discord: false, push: false },
  tournament_checkin:      { discord: false, push: false },
  tournament_payout_pending: { discord: true, push: true },
  tournament_payout_paid:    { discord: true, push: true },
  coach_booking_confirmed: { discord: true,  push: true  },
  coach_booking_reminder:  { discord: true,  push: true  },
  league_scrim_accepted:   { discord: false, push: false },
  season_rollover:         { discord: false, push: false },
  coach_of_the_month:      { discord: false, push: false },
  quest_completed:         { discord: false, push: false },
  season_wrapped:          { discord: true,  push: false },
  anniversary_shoutout:    { discord: true,  push: false },
  prediction_graded:       { discord: false, push: false },
};

test('v1 NOTIFICATION_CATEGORIES default matrix matches Task #455 policy', () => {
  const actual = {};
  for (const c of db.NOTIFICATION_CATEGORIES) actual[c.key] = c.default !== false;
  assert.deepEqual(actual, EXPECTED_CATEGORY_DEFAULTS);
});

test('v2 NOTIFICATION_EVENTS default matrix matches Task #455 policy', () => {
  const actual = {};
  for (const e of db.NOTIFICATION_EVENTS) {
    actual[e.key] = {
      discord: db.eventDefaultEnabled(e.key, 'discord'),
      push: db.eventDefaultEnabled(e.key, 'push'),
    };
  }
  assert.deepEqual(actual, EXPECTED_EVENT_DEFAULTS);
});

test('only transactional + milestone events are default-ON (v2)', () => {
  const onByDefault = db.NOTIFICATION_EVENTS
    .filter(e => db.eventDefaultEnabled(e.key, 'discord') || db.eventDefaultEnabled(e.key, 'push'))
    .map(e => e.key)
    .sort();
  assert.deepEqual(onByDefault, [
    'anniversary_shoutout',
    'coach_booking_confirmed',
    'coach_booking_reminder',
    'group_session_reminder',
    'mvp_vote',
    'season_wrapped',
    'tournament_payout_paid',
    'tournament_payout_pending',
    'vod_delivered',
    'vod_purchased',
  ]);
});
