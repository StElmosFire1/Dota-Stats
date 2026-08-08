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

// ---- Lootbox Lab simulation history (Task #786) ---------------------------
// Lightweight in-memory log of recent simulate runs, keyed per box tier, so
// operators can compare distributions across catalog edits without re-running.
// Intentionally NOT persisted to the DB: it stores only aggregate rarity
// distributions (no individual drops), and losing it on restart is fine.
const LAB_HISTORY_MAX_PER_BOX = 20;
const labSimHistory = new Map(); // boxId -> [entry, ...] newest first

function recordLabSimulation(entry) {
  const list = labSimHistory.get(entry.boxId) || [];
  list.unshift(entry);
  if (list.length > LAB_HISTORY_MAX_PER_BOX) list.length = LAB_HISTORY_MAX_PER_BOX;
  labSimHistory.set(entry.boxId, list);
}

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
      const membership = lb.getCustomSetMembership ? await lb.getCustomSetMembership() : null;
      const boxes = [...Object.values(catalog.BOXES), catalog.FREE_BOX].map((b) => ({
        id: b.id,
        label: b.label,
        price: b.price,
        blurb: b.blurb,
        odds: catalog.publishedOdds(b.id, retired, membership),
      }));
      // Surface the live (admin-editable) dupe returns so any published copy
      // reflects what the open transaction actually pays out.
      const dupe = lb.getDupeReturns ? await lb.getDupeReturns() : null;
      res.json({
        edition: 'full',
        rarities: catalog.RARITY_META,
        dupeRefundCoins: dupe ? dupe.refundCoins : catalog.DUPE_REFUND_COINS,
        dupeGrantsToken: dupe ? { legendary: dupe.legendaryRewardType === 'token' } : catalog.DUPE_GRANTS_TOKEN,
        dupeReturns: dupe,
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
  // The catalog item list rides along so the AdminPanel "Create new set" form
  // can render an item picker without a second round-trip.
  router.get('/admin/lootbox/sets', requireSuperuser, async (req, res) => {
    try {
      const items = catalog.ITEMS.map((it) => ({
        sku: it.sku, kind: it.kind, value: it.value, label: it.label,
        rarity: it.rarity, set: it.set || null, special: !!it.special,
      }));
      res.json({ sets: await lb.listSets({ includeRetirementActor: true }), items });
    } catch (err) {
      console.error('[lootbox] admin sets:', err.message);
      res.status(500).json({ error: 'Failed to load sets' });
    }
  });

  // ---- Admin: create a new seasonal set -----------------------------------
  router.post('/admin/lootbox/sets', requireSuperuser, json, async (req, res) => {
    try {
      const name = String(req.body?.name || '');
      const description = String(req.body?.description || '');
      const itemSkus = Array.isArray(req.body?.itemSkus) ? req.body.itemSkus : [];
      const created = await lb.createSet({
        name, description, itemSkus, by: req.session.accountId || null,
      });
      res.json({ ok: true, set: created, sets: await lb.listSets({ includeRetirementActor: true }) });
    } catch (err) {
      if (['BAD_NAME', 'BAD_ITEMS', 'NO_ITEMS'].includes(err.code)) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      console.error('[lootbox] admin create set:', err.message);
      res.status(500).json({ error: 'Failed to create set' });
    }
  });

  // ---- Admin: dupe returns (coin refunds + Legendary reward) -------------
  // Task #804 — read/write the admin-editable duplicate payout overrides.
  router.get('/admin/lootbox/dupe-returns', requireSuperuser, async (req, res) => {
    try {
      const cfg = await lb.getDupeReturnsConfig();
      res.json(cfg);
    } catch (err) {
      console.error('[lootbox] admin dupe-returns GET:', err.message);
      res.status(500).json({ error: 'Failed to load dupe returns' });
    }
  });

  // Paged audit history for dupe-returns changes (Task #810). Lets the admin
  // UI page back beyond the first 10 entries shown in the config payload.
  // Read-only, superuser-only. Returns { audit: [...], total }.
  router.get('/admin/lootbox/dupe-returns/audit', requireSuperuser, async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      const [audit, total] = await Promise.all([
        lb.listDupeReturnsAudit(limit, offset),
        lb.countDupeReturnsAudit(),
      ]);
      res.json({ audit, total });
    } catch (err) {
      console.error('[lootbox] admin dupe-returns audit GET:', err.message);
      res.status(500).json({ error: 'Failed to load dupe returns history' });
    }
  });

  router.post('/admin/lootbox/dupe-returns', requireSuperuser, json, async (req, res) => {
    try {
      const body = req.body || {};
      const MAX_COINS = 1_000_000;
      const MAX_TOKENS = 100;
      const out = {};

      // Per-rarity coin refunds for common/rare/epic. Blank/omitted → default.
      const parseCoins = (val, label) => {
        if (val === '' || val == null) return undefined; // revert to default
        const n = parseInt(val, 10);
        if (!Number.isFinite(n) || String(val).trim() !== String(n) || n < 0 || n > MAX_COINS) {
          const e = new Error(`Invalid ${label}: must be a whole number between 0 and ${MAX_COINS}`);
          e.code = 'BAD_INPUT';
          throw e;
        }
        return n;
      };

      const common = parseCoins(body.common, 'Common refund');
      if (common !== undefined) out.common = common;
      const rare = parseCoins(body.rare, 'Rare refund');
      if (rare !== undefined) out.rare = rare;
      const epic = parseCoins(body.epic, 'Epic refund');
      if (epic !== undefined) out.epic = epic;
      const legendaryCoins = parseCoins(body.legendaryCoins, 'Legendary coin reward');
      if (legendaryCoins !== undefined) out.legendaryCoins = legendaryCoins;

      // Legendary reward type: coins | token. Blank/omitted → default.
      if (body.legendaryRewardType != null && body.legendaryRewardType !== '') {
        const t = String(body.legendaryRewardType);
        if (t !== 'coins' && t !== 'token') {
          return res.status(400).json({ error: 'Legendary reward type must be "coins" or "token"' });
        }
        out.legendaryRewardType = t;
      }

      // Legendary token count (≥ 1). Blank/omitted → default.
      if (body.legendaryTokens != null && body.legendaryTokens !== '') {
        const n = parseInt(body.legendaryTokens, 10);
        if (!Number.isFinite(n) || String(body.legendaryTokens).trim() !== String(n) || n < 1 || n > MAX_TOKENS) {
          return res.status(400).json({ error: `Invalid Legendary token count: must be a whole number between 1 and ${MAX_TOKENS}` });
        }
        out.legendaryTokens = n;
      }

      const changedBy = req.session?.accountId ? String(req.session.accountId) : 'superuser';
      const cfg = await lb.saveDupeReturns(out, changedBy);
      res.json({ ok: true, ...cfg });
    } catch (err) {
      if (err.code === 'BAD_INPUT') return res.status(400).json({ error: err.message });
      console.error('[lootbox] admin dupe-returns POST:', err.message);
      res.status(500).json({ error: 'Failed to save dupe returns' });
    }
  });

  router.post('/admin/lootbox/sets/retire', requireSuperuser, json, async (req, res) => {
    try {
      const setId = String(req.body?.setId || '');
      const retired = !!req.body?.retired;
      const result = await lb.setRetired({ setId, retired, by: req.session.accountId || null });
      res.json({ ok: true, ...result, sets: await lb.listSets({ includeRetirementActor: true }) });
    } catch (err) {
      if (err.code === 'UNKNOWN_SET') return res.status(400).json({ error: err.message, code: err.code });
      console.error('[lootbox] admin retire:', err.message);
      res.status(500).json({ error: 'Failed to update set' });
    }
  });

  // ---- Admin: Lootbox Lab — inspect a box's live catalog -----------------
  // Returns the full published odds for a box tier (same data the player UI
  // shows, but also including per-item detail flags). Superuser-only.
  router.get('/admin/lootbox/lab/inspect', requireSuperuser, async (req, res) => {
    try {
      const boxId = String(req.query.boxId || '');
      if (!catalog.isValidBoxId(boxId)) {
        return res.status(400).json({ error: 'Unknown box id' });
      }
      const retired = await lb.getRetiredSetIds();
      const membership = lb.getCustomSetMembership ? await lb.getCustomSetMembership() : null;
      const box = catalog.getBox(boxId);
      const odds = catalog.publishedOdds(boxId, retired, membership);
      const dupe = lb.getDupeReturns ? await lb.getDupeReturns() : null;
      res.json({
        box: { id: box.id, label: box.label, price: box.price, blurb: box.blurb, rarityWeights: box.rarityWeights },
        odds,
        dupeRefundCoins: dupe ? dupe.refundCoins : catalog.DUPE_REFUND_COINS,
        dupeGrantsToken: dupe ? { legendary: dupe.legendaryRewardType === 'token' } : catalog.DUPE_GRANTS_TOKEN,
        dupeReturns: dupe,
      });
    } catch (err) {
      console.error('[lootbox] lab inspect:', err.message);
      res.status(500).json({ error: 'Failed to inspect box' });
    }
  });

  // ---- Admin: Lootbox Lab — community ownership counts (Task #785) -------
  // How many distinct players own each cosmetic (kind, value). Loaded
  // on-demand alongside the catalog inspect so the Lab can badge each item
  // with "Owned by N players". Read-only, superuser-only.
  router.get('/admin/lootbox/lab/ownership', requireSuperuser, async (req, res) => {
    try {
      const rows = await lb.getOwnershipCounts();
      // Map keyed by "kind:value" for O(1) lookup in the UI.
      const counts = {};
      for (const row of rows) counts[`${row.kind}:${row.value}`] = row.owners;
      res.json({ counts });
    } catch (err) {
      console.error('[lootbox] lab ownership:', err.message);
      res.status(500).json({ error: 'Failed to load ownership counts' });
    }
  });

  // ---- Admin: Lootbox Lab — recent simulation history (Task #786) --------
  // Returns the last ~20 simulate runs for a box tier (or all tiers when no
  // boxId is given). In-memory only; cleared on server restart.
  router.get('/admin/lootbox/lab/history', requireSuperuser, (req, res) => {
    try {
      const boxId = req.query.boxId ? String(req.query.boxId) : null;
      if (boxId) {
        if (!catalog.isValidBoxId(boxId)) {
          return res.status(400).json({ error: 'Unknown box id' });
        }
        return res.json({ boxId, runs: labSimHistory.get(boxId) || [] });
      }
      const runs = [];
      for (const list of labSimHistory.values()) runs.push(...list);
      runs.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
      res.json({ boxId: null, runs });
    } catch (err) {
      console.error('[lootbox] lab history:', err.message);
      res.status(500).json({ error: 'Failed to load simulation history' });
    }
  });

  // ---- Admin: Lootbox Lab — dry-run simulate opens -----------------------
  // Rolls the real drop logic N times with zero side effects (no coin debit,
  // no grant, no event log, no free-claim consumption). Supports:
  //   boxId      — box tier to simulate
  //   count      — 1..1000, defaults to 1
  //   forceRarity — skip the rarity roll and pick from this rarity's pool
  //   forceSku    — return this specific item without any roll
  // When forceRarity/forceSku are set and count > 1 the forced item is
  // returned for every roll (useful to preview an animation for a specific
  // cosmetic/rarity N times).
  router.post('/admin/lootbox/lab/simulate', requireSuperuser, json, async (req, res) => {
    try {
      const boxId = String(req.body?.boxId || '');
      if (!catalog.isValidBoxId(boxId)) {
        return res.status(400).json({ error: 'Unknown box id' });
      }
      const rawCount = parseInt(req.body?.count, 10);
      const count = Number.isFinite(rawCount) && rawCount >= 1 ? Math.min(rawCount, 1000) : 1;
      const forceRarity = req.body?.forceRarity ? String(req.body.forceRarity) : null;
      const forceSku = req.body?.forceSku ? String(req.body.forceSku) : null;

      const retired = await lb.getRetiredSetIds();
      const membership = lb.getCustomSetMembership ? await lb.getCustomSetMembership() : null;

      // Build eligible item pool once.
      const pool = catalog.eligibleItems(boxId, retired, membership);
      const byRarity = {};
      for (const r of catalog.RARITIES) byRarity[r] = [];
      for (const it of pool) byRarity[it.rarity].push(it);

      // Forced-item validation: check the forced SKU is actually in the pool.
      let forcedItem = null;
      if (forceSku) {
        forcedItem = pool.find(it => it.sku === forceSku) || null;
        if (!forcedItem) {
          return res.status(400).json({ error: `Item ${forceSku} is not in the active drop pool for box ${boxId}` });
        }
      }

      // Forced-rarity validation.
      if (forceRarity && !catalog.RARITIES.includes(forceRarity)) {
        return res.status(400).json({ error: `Unknown rarity: ${forceRarity}` });
      }
      if (forceRarity && !forcedItem && byRarity[forceRarity].length === 0) {
        return res.status(400).json({ error: `No items of rarity ${forceRarity} in the active pool for box ${boxId}` });
      }

      const rolls = [];
      const distribution = { common: 0, rare: 0, epic: 0, legendary: 0 };

      for (let i = 0; i < count; i++) {
        let item;
        if (forcedItem) {
          item = forcedItem;
        } else if (forceRarity) {
          const bucket = byRarity[forceRarity];
          item = bucket[Math.floor(Math.random() * bucket.length)];
        } else {
          item = catalog.rollDrop(boxId, retired, Math.random, null, membership);
        }
        rolls.push({
          sku: item.sku,
          kind: item.kind,
          value: item.value,
          label: item.label,
          rarity: item.rarity,
          boxExclusive: !!item.boxExclusive,
          set: item.set || null,
          special: !!item.special,
          days: item.days || null,
        });
        distribution[item.rarity] = (distribution[item.rarity] || 0) + 1;
      }

      // Compute distribution percentages alongside raw counts.
      const distPct = {};
      for (const r of catalog.RARITIES) {
        distPct[r] = { count: distribution[r] || 0, pct: count > 0 ? +((distribution[r] || 0) / count * 100).toFixed(1) : 0 };
      }

      // Log the run for the "Recent simulations" history (aggregate only —
      // no individual drops, no sensitive data).
      recordLabSimulation({
        at: new Date().toISOString(),
        by: req.session?.accountId ? String(req.session.accountId) : 'superuser',
        boxId,
        count,
        forced: !!(forcedItem || forceRarity),
        forceRarity: forceRarity || null,
        forceSku: forceSku || null,
        distribution: distPct,
      });

      res.json({ ok: true, count, rolls, distribution: distPct, forced: !!(forcedItem || forceRarity) });
    } catch (err) {
      console.error('[lootbox] lab simulate:', err.message);
      res.status(500).json({ error: 'Failed to simulate' });
    }
  });
}

module.exports = { mountLootboxRoutes };
