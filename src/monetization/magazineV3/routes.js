/**
 * Route aggregator. Mirrors the original `mountMagazineV3Routes` export:
 *   - validates required wiring (router, app, express, deps) up front
 *   - defines the shared `requireAuth` middleware
 *   - delegates each feature to its own `mountRoutes`
 */

const oneOffPerks = require('./oneOffPerks');
const replayQuota = require('./replayQuota');
const weeklyReport = require('./weeklyReport');
const coachPairing = require('./coachPairing');
const sponsorships = require('./sponsorships');
const embed = require('./embed');
const pickem = require('./pickem');
const verifiedBadge = require('./verifiedBadge');

function mountMagazineV3Routes({ router, app, express, deps }) {
  // (round-7 review note) Be defensive about required wiring rather than
  // silently mounting a partial route set. The embed widget mounts a
  // top-level `/embed/:accountId` page on `app`; if a future caller
  // forgets to pass `app`, fail fast at startup instead of letting the
  // embed surface 404 in production while everything else looks fine.
  if (!router) throw new Error('mountMagazineV3Routes: `router` is required');
  if (!app) throw new Error('mountMagazineV3Routes: `app` is required (used to mount /embed/:accountId)');
  if (!express) throw new Error('mountMagazineV3Routes: `express` is required');
  if (!deps) throw new Error('mountMagazineV3Routes: `deps` is required');

  function requireAuth(req, res, next) {
    if (!req.session?.accountId) {
      return res.status(401).json({ error: 'Sign in with Steam' });
    }
    next();
  }

  const ctx = { router, app, express, deps, requireAuth };
  replayQuota.mountRoutes(ctx);
  weeklyReport.mountRoutes(ctx);
  coachPairing.mountRoutes(ctx);
  sponsorships.mountRoutes(ctx);
  pickem.mountRoutes(ctx);
  verifiedBadge.mountRoutes(ctx);
  oneOffPerks.mountRoutes(ctx);
  embed.mountRoutes(ctx);
}

module.exports = { mountMagazineV3Routes };
