/**
 * DB facade aggregator. Returns a single `magV3` object combining the DB
 * helpers exported by every feature module, in the same shape src/web/server.js
 * and tests/magazineV3.test.js have always expected.
 *
 * `pickem.createDb` depends on `hasOneOffPerk` from oneOffPerks (for season
 * champion award), so we wire that explicitly.
 */

const oneOffPerks = require('./oneOffPerks');
const replayQuota = require('./replayQuota');
const weeklyReport = require('./weeklyReport');
const sponsorships = require('./sponsorships');
const pickem = require('./pickem');
const verifiedBadge = require('./verifiedBadge');

function createMagazineV3Db({ getPool }) {
  const oneOffs = oneOffPerks.createDb({ getPool });
  return Object.freeze({
    ...oneOffs,
    ...replayQuota.createDb({ getPool }),
    ...weeklyReport.createDb({ getPool }),
    ...sponsorships.createDb({ getPool }),
    ...pickem.createDb({ getPool, hasOneOffPerk: oneOffs.hasOneOffPerk }),
    ...verifiedBadge.createDb({ getPool }),
  });
}

module.exports = { createMagazineV3Db };
