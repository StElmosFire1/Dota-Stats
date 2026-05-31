/**
 * Lootbox & Collection — HTTP routes (Task #664, full edition only).
 *
 * Mounted from createApiRouter under /api. Mirrors the magazineV3 mount
 * contract: { router, app, express, deps } with deps.lootbox (the DB helper
 * bundle), deps.isSuperuser(req) and an internal requireAuth middleware.
 *
 * Coins-only. The catalog endpoint is intentionally public so the published
 * odds are inspectable by anyone — it is literally the same object the server
 * rolls against.
 */

'use strict';

const catalog = require('./catalog');

function mountLootboxRoutes({ router, express, deps }) {
  if (!router) throw new Error('mountLootboxRoutes: `router` is required');
  if (!express) throw new Error('mountLootboxRoutes: `express` is required');
  if (!deps || !deps.lootbox) throw new Error('mountLootboxRoutes: `deps.lootbox` is required');

  const lb = deps.lootbox;
  const isSuperuser = deps.isSuperuser || (() => false);
  const json = express.json();

  function requireAuth(req, res, next) {
    if (!req.session?.accountId) return res.status(401).json({ error: 'Sign in with Steam' });
    next();
  }
  function requireSuperuser(req, res, next) {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'Superuser only' });
    next();
  }

  // ---- Public catalog (single source of truth for published odds) ---------
  router.get('/lootbox/catalog', async (req, res) => {
    try {
      const retired = await lb.getRetiredSetIds();
      const boxes = [...Object.values(catalog.BOXES), catalog.FREE_BOX].map((b) => ({
        id: b.id,
        label: b.label,
        price: b.price,
        blurb: b.blurb,
        odds: catalog.publishedOdds(b.id, retired),
      }));
      res.json({
        edition: 'full',
        rarities: catalog.RARITY_META,
        dupeRefundCoins: catalog.DUPE_REFUND_COINS,
        dupeGrantsToken: catalog.DUPE_GRANTS_TOKEN,
        sets: await lb.listSets(),
        boxes,
      });
    } catch (err) {
      console.error('[lootbox] catalog:', err.message);
      res.status(500).json({ error: 'Failed to load lootbox catalog' });
    }
  });

  // ---- Signed-in summary --------------------------------------------------
  router.get('/lootbox/me', requireAuth, async (req, res) => {
    try {
      const accountId = req.session.accountId;
      const [balanceRow, tokens, free, equipped, events] = await Promise.all([
        deps.db.getCoinBalance(accountId).catch(() => 0),
        lb.getWildcardTokens(accountId),
        lb.canClaimFree(accountId),
        lb.getEquipped(accountId),
        lb.listEvents(accountId, 20),
      ]);
      res.json({
        coinBalance: typeof balanceRow === 'number' ? balanceRow : (balanceRow?.balance ?? 0),
        wildcardTokens: tokens,
        freeBox: free,
        equipped,
        recent: events,
      });
    } catch (err) {
      console.error('[lootbox] me:', err.message);
      res.status(500).json({ error: 'Failed to load lootbox state' });
    }
  });

  // ---- Collection / locker ------------------------------------------------
  router.get('/lootbox/collection', requireAuth, async (req, res) => {
    try {
      const data = await lb.getCollection(req.session.accountId);
      res.json(data);
    } catch (err) {
      console.error('[lootbox] collection:', err.message);
      res.status(500).json({ error: 'Failed to load collection' });
    }
  });

  // ---- Open a paid box ----------------------------------------------------
  router.post('/lootbox/open', requireAuth, json, async (req, res) => {
    try {
      const boxId = String(req.body?.boxId || '');
      if (boxId === 'free' || !catalog.BOXES[boxId]) {
        return res.status(400).json({ error: 'Unknown box' });
      }
      const result = await lb.openBox({ accountId: req.session.accountId, boxId });
      res.json(result);
    } catch (err) {
      if (err.code === 'INSUFFICIENT_FUNDS') return res.status(402).json({ error: err.message, code: err.code });
      console.error('[lootbox] open:', err.message);
      res.status(500).json({ error: 'Failed to open box' });
    }
  });

  // ---- Claim the weekly free box ------------------------------------------
  router.post('/lootbox/free', requireAuth, async (req, res) => {
    try {
      const result = await lb.openBox({ accountId: req.session.accountId, boxId: 'free' });
      res.json(result);
    } catch (err) {
      if (err.code === 'ALREADY_CLAIMED') return res.status(409).json({ error: err.message, code: err.code });
      console.error('[lootbox] free:', err.message);
      res.status(500).json({ error: 'Failed to claim free box' });
    }
  });

  // ---- Redeem a wildcard token --------------------------------------------
  router.post('/lootbox/wildcard/redeem', requireAuth, json, async (req, res) => {
    try {
      const sku = String(req.body?.sku || '');
      const result = await lb.redeemWildcard({ accountId: req.session.accountId, sku });
      res.json(result);
    } catch (err) {
      if (err.code === 'NO_TOKENS') return res.status(402).json({ error: err.message, code: err.code });
      if (err.code === 'ALREADY_OWNED') return res.status(409).json({ error: err.message, code: err.code });
      if (err.code === 'BAD_SKU') return res.status(400).json({ error: err.message, code: err.code });
      if (err.code === 'RETIRED') return res.status(409).json({ error: err.message, code: err.code });
      console.error('[lootbox] wildcard:', err.message);
      res.status(500).json({ error: 'Failed to redeem token' });
    }
  });

  // ---- Equip / unequip ----------------------------------------------------
  router.post('/lootbox/equip', requireAuth, json, async (req, res) => {
    try {
      const kind = String(req.body?.kind || '');
      const value = req.body?.value;
      const result = await lb.equipCosmetic({ accountId: req.session.accountId, kind, value });
      res.json({ ok: true, ...result });
    } catch (err) {
      if (err.code === 'BAD_KIND' || err.code === 'BAD_SKU') return res.status(400).json({ error: err.message, code: err.code });
      if (err.code === 'NOT_OWNED') return res.status(403).json({ error: err.message, code: err.code });
      console.error('[lootbox] equip:', err.message);
      res.status(500).json({ error: 'Failed to equip cosmetic' });
    }
  });

  // ---- Admin: seasonal-set retirement -------------------------------------
  router.get('/admin/lootbox/sets', requireSuperuser, async (req, res) => {
    try {
      res.json({ sets: await lb.listSets() });
    } catch (err) {
      console.error('[lootbox] admin sets:', err.message);
      res.status(500).json({ error: 'Failed to load sets' });
    }
  });

  router.post('/admin/lootbox/sets/retire', requireSuperuser, json, async (req, res) => {
    try {
      const setId = String(req.body?.setId || '');
      const retired = !!req.body?.retired;
      const result = await lb.setRetired({ setId, retired, by: req.session.accountId || null });
      res.json({ ok: true, ...result, sets: await lb.listSets() });
    } catch (err) {
      if (err.code === 'UNKNOWN_SET') return res.status(400).json({ error: err.message, code: err.code });
      console.error('[lootbox] admin retire:', err.message);
      res.status(500).json({ error: 'Failed to update set' });
    }
  });
}

module.exports = { mountLootboxRoutes };
