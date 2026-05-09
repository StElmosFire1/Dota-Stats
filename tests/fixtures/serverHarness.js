// Shared test harness for booting src/web/server.js with heavy
// transitive deps stubbed and the `db` module replaced via require.cache.
//
// Lifted from tests/foundersRingCheckoutWebhook.test.js (Task #240) so
// new test files (e.g. tests/superuserAdminRouteAuth.test.js, Task #267)
// can re-use the exact same boot sequence without copy-pasting it.

const Module = require('module');

function stubModule(specifier, exports, fromPath = __filename) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

function _stubServerDeps(dbOverrides = {}) {
  const captured = {
    grantCalls: [],
    hasEntitlementCalls: [],
    countEntitlementHoldersCalls: [],
    stripeCreateCalls: [],
  };

  const baseDb = {
    isProMember: async () => false,
    getPlayerProfileCustomization: async () => ({ cover_fx: [], pinned_achievements: [] }),
    setPlayerProfileCustomization: async (_id, fields) => fields,
    getOwnedEntitlements: async () => [],
    getMergedAccountIds: async (id) => [id],
    getPlayerAchievements: async () => [],
    hasFrameUnlocked: async () => true,
    getPool: () => ({ query: async () => ({ rows: [] }) }),
    hasEntitlement: async (accountId, sku) => {
      captured.hasEntitlementCalls.push({ accountId, sku });
      return false;
    },
    countEntitlementHolders: async (sku) => {
      captured.countEntitlementHoldersCalls.push({ sku });
      return 0;
    },
    grantEntitlementWithCap: async (args) => {
      captured.grantCalls.push(args);
      return { ok: true, granted: true, reason: null };
    },
  };
  const merged = { ...baseDb };
  for (const [k, v] of Object.entries(dbOverrides)) {
    if (k === 'hasEntitlement') {
      merged.hasEntitlement = async (accountId, sku) => {
        captured.hasEntitlementCalls.push({ accountId, sku });
        return v(accountId, sku);
      };
    } else if (k === 'countEntitlementHolders') {
      merged.countEntitlementHolders = async (sku) => {
        captured.countEntitlementHoldersCalls.push({ sku });
        return v(sku);
      };
    } else if (k === 'grantEntitlementWithCap') {
      merged.grantEntitlementWithCap = async (args) => {
        captured.grantCalls.push(args);
        return v(args);
      };
    } else {
      merged[k] = v;
    }
  }
  const proxiedDb = new Proxy(merged, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => null;
    },
  });

  stubModule('../../src/replay/replayParser',  { getReplayParser:  () => ({ parserReady: false }) });
  stubModule('../../src/stats/statsService',   { getStatsService:  () => ({}) });
  stubModule('../../src/services/groqService', { generateChatResponse: async () => '', generateWeeklyRecapBlurb: async () => '' });
  stubModule('../../src/discord/bot',          { getDiscordBot:    () => ({ isInLeagueGuild: async () => ({ inGuild: null }) }) });
  stubModule('../../src/web/voiceEventQueue',  { enqueue: () => {}, drain: () => {} });
  stubModule('../../src/monetization/magazineV3', {
    mountMagazineV3Routes: () => {},
    handleStripeWebhookPurpose: async () => null,
    startWeeklyReportWorker: () => {},
    REPLAY_RATE_LIMIT_PER_DAY: 0,
  });

  const stripeStub = {
    __nextEvent: null,
    __refundResult: null,
    __refundShouldThrow: null,
    __refundCalls: [],
    checkout: {
      sessions: {
        create: async (args) => {
          captured.stripeCreateCalls.push(args);
          return { id: 'cs_test_fake', url: 'https://stripe.test/checkout/cs_test_fake' };
        },
      },
    },
    refunds: {
      create: async (args) => {
        stripeStub.__refundCalls.push(args);
        if (stripeStub.__refundShouldThrow) throw stripeStub.__refundShouldThrow;
        return stripeStub.__refundResult || { id: 're_test_fake', status: 'succeeded' };
      },
    },
    webhooks: {
      constructEvent: (_body, _sig, _secret) => {
        if (!stripeStub.__nextEvent) {
          throw new Error('test bug: stripeStub.__nextEvent not set');
        }
        return stripeStub.__nextEvent;
      },
    },
  };
  const stripeFactory = (_key) => stripeStub;
  stubModule('stripe', stripeFactory);

  const dbPath = require.resolve('../../src/db');
  delete require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: proxiedDb };

  return { captured, proxiedDb, stripeStub };
}

async function _invokeHandler(route, req) {
  let resJson = null;
  let resStatus = 200;
  let nextErr = null;
  const res = {
    headersSent: false,
    status(code) { resStatus = code; return this; },
    json(obj) { resJson = obj; this.headersSent = true; return this; },
    set() { return this; },
    setHeader() { return this; },
    send(obj) { resJson = obj; this.headersSent = true; return this; },
  };
  const stack = [...route.stack];
  for (const layer of stack) {
    if (res.headersSent) break;
    await new Promise((resolve, reject) => {
      try {
        const ret = layer.handle(req, res, (err) => { if (err) nextErr = err; resolve(); });
        if (ret && typeof ret.then === 'function') ret.then(() => resolve(), reject);
        else if (res.headersSent) resolve();
      } catch (err) { reject(err); }
    });
    if (nextErr) throw nextErr;
  }
  return { status: resStatus, body: resJson };
}

function _withUnreffedIntervals(fn) {
  return async (...args) => {
    const orig = global.setInterval;
    global.setInterval = (...a) => {
      const id = orig(...a);
      if (id && typeof id.unref === 'function') id.unref();
      return id;
    };
    try { return await fn(...args); }
    finally { global.setInterval = orig; }
  };
}

function _loadServerFresh() {
  delete require.cache[require.resolve('../../src/web/server')];
  return require('../../src/web/server');
}

function _withSuperuserPassword(password, fn) {
  return async (...args) => {
    const prev = process.env.SUPERUSER_PASSWORD;
    process.env.SUPERUSER_PASSWORD = password;
    try { return await fn(...args); }
    finally {
      if (prev === undefined) delete process.env.SUPERUSER_PASSWORD;
      else process.env.SUPERUSER_PASSWORD = prev;
    }
  };
}

module.exports = {
  stubModule,
  _stubServerDeps,
  _invokeHandler,
  _withUnreffedIntervals,
  _loadServerFresh,
  _withSuperuserPassword,
};
