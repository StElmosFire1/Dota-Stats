/**
 * Shared constants for the Magazine v3 monetization bundle.
 * See ./index.js for the public surface and module-level overview.
 */

const VERIFIED_BADGE_PRICE_CENTS = 500; // AUD $5 one-off
const SPONSORSHIP_MONTHLY_PRICE_CENTS = 1900; // AUD $19/month per slot
// Round-4 review: how much of each monthly invoice is routed to the
// sponsored player when they have Stripe Connect Express set up. Expressed
// as basis points (7000 = 70%) so the math stays integer-clean. The
// remainder stays with the platform as `application_fee_percent`. Reused
// by /api/sponsorships/checkout's destination-charge plumbing.
const SPONSORSHIP_REVSHARE_BPS = 7000;
const REPLAY_RATE_LIMIT_PER_DAY = 25; // even Pro users are bounded
const WEEKLY_REPORT_CACHE_HOURS = 24 * 7;
const ALLOWED_VERIFIED_PROVIDERS = new Set(['twitter', 'twitch', 'youtube']);

module.exports = {
  VERIFIED_BADGE_PRICE_CENTS,
  SPONSORSHIP_MONTHLY_PRICE_CENTS,
  SPONSORSHIP_REVSHARE_BPS,
  REPLAY_RATE_LIMIT_PER_DAY,
  WEEKLY_REPORT_CACHE_HOURS,
  ALLOWED_VERIFIED_PROVIDERS,
};
