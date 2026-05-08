/**
 * Magazine v3 monetization bundle — public surface.
 *
 * This module replaces the old monolithic `src/monetization/magazineV3.js`.
 * Everything that used to be exported from that file is re-exported here,
 * unchanged, so consumers (`src/db/index.js`, `src/web/server.js`, the test
 * suite) keep working without edits.
 *
 * Layout (one file per feature):
 *   ./constants.js       — shared price/limit constants
 *   ./urlSafety.js       — _isSafeHttpUrl / _assertPublicHttpUrl / _esc
 *   ./schema.js          — applyMagazineV3Schema (all migrations)
 *   ./oneOffPerks.js     — feature 8: one-off entitlements + catalog checkout
 *   ./replayQuota.js     — feature 1: replay download quota
 *   ./weeklyReport.js    — feature 2: weekly AI report + email + worker
 *   ./coachPairing.js    — feature 3: AI coach pairing
 *   ./sponsorships.js    — feature 4: org sponsorship slots
 *   ./embed.js           — feature 5: Pro /embed/:accountId widget
 *   ./pickem.js          — feature 6: pickem season + leaderboard
 *   ./verifiedBadge.js   — feature 7: verified badges
 *   ./stripeWebhook.js   — purpose-dispatch for verified Stripe events
 *   ./db.js              — combines per-feature DB helpers into one `magV3`
 *   ./routes.js          — combines per-feature route mounters
 */

const { applyMagazineV3Schema } = require('./schema');
const { createMagazineV3Db } = require('./db');
const { mountMagazineV3Routes } = require('./routes');
const { handleStripeWebhookPurpose } = require('./stripeWebhook');
const { scoreCoachMatch } = require('./coachPairing');
const {
  startWeeklyReportWorker,
  validateWeeklyReportJson,
  WEEKLY_REPORT_SCHEMA,
} = require('./weeklyReport');
const {
  REPLAY_RATE_LIMIT_PER_DAY,
  ALLOWED_VERIFIED_PROVIDERS,
  VERIFIED_BADGE_PRICE_CENTS,
  SPONSORSHIP_MONTHLY_PRICE_CENTS,
} = require('./constants');
const {
  _isSafeHttpUrl,
  _assertPublicHttpUrl,
  _isPrivateIp,
} = require('./urlSafety');

module.exports = {
  applyMagazineV3Schema,
  createMagazineV3Db,
  mountMagazineV3Routes,
  handleStripeWebhookPurpose,
  scoreCoachMatch,
  startWeeklyReportWorker,
  validateWeeklyReportJson,
  WEEKLY_REPORT_SCHEMA,
  REPLAY_RATE_LIMIT_PER_DAY,
  ALLOWED_VERIFIED_PROVIDERS,
  VERIFIED_BADGE_PRICE_CENTS,
  SPONSORSHIP_MONTHLY_PRICE_CENTS,
  _isSafeHttpUrl,
  _assertPublicHttpUrl,
  _isPrivateIp,
};
