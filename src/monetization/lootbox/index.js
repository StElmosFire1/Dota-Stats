/**
 * Lootbox & Collection — public surface (Task #664, full edition only).
 *
 * Layout:
 *   ./catalog.js — single source of truth (boxes, odds, items, dupe rules)
 *   ./db.js      — schema + atomic open engine + wildcard + collection
 *   ./routes.js  — HTTP routes mounted under /api
 *
 * Wired in `src/db/index.js` (db.lootbox = createLootboxDb({ getPool })) and
 * `src/web/server.js` createApiRouter (mountLootboxRoutes). Community edition
 * never imports this module — it stays paywall/monetisation-free by policy.
 */

'use strict';

const catalog = require('./catalog');
const { createLootboxDb } = require('./db');
const { mountLootboxRoutes } = require('./routes');

module.exports = {
  catalog,
  createLootboxDb,
  mountLootboxRoutes,
};
