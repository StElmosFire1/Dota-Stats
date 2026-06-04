/**
 * Lootbox & Collection — data layer (Task #664, full edition only).
 *
 * Mirrors the magazineV3 `createDb({ getPool })` pattern. Owns its own schema
 * (idempotent CREATE/ALTER), the atomic open/grant engine, wildcard tokens,
 * the weekly free-box claim, seasonal-set retirement, equip state and the
 * collection/locker queries.
 *
 * All coin movement re-uses the existing `coin_transactions` ledger +
 * `player_profiles.coin_balance` so a box open shows up in the player's coin
 * history exactly like a shop purchase. Cosmetic grants land in
 * `coin_owned_cosmetics` (kind:value) so they merge with the rest of the
 * coin-ownership plumbing for free.
 */

'use strict';

const catalog = require('./catalog');

function createLootboxDb({ getPool }) {
  if (typeof getPool !== 'function') {
    throw new Error('createLootboxDb: { getPool } function is required');
  }

  async function applyLootboxSchema(pool) {
    const p = pool || getPool();

    // Equipped-cosmetic columns on the existing player_profiles table.
    await p.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS equipped_avatar_ring TEXT`);
    await p.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS equipped_profile_banner TEXT`);
    await p.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS equipped_nameplate_fx TEXT`);
    await p.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS equipped_recap_skin TEXT`);

    // Per-open audit log (powers the locker history + analytics).
    await p.query(`
      CREATE TABLE IF NOT EXISTS lootbox_events (
        id SERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL,
        box_id TEXT NOT NULL,
        item_sku TEXT NOT NULL,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        rarity TEXT NOT NULL,
        outcome TEXT NOT NULL,
        refund_coins INTEGER NOT NULL DEFAULT 0,
        token_granted INTEGER NOT NULL DEFAULT 0,
        pro_days INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_lootbox_events_account ON lootbox_events (account_id, created_at DESC)`);

    // Wildcard token balances (legendary dupes mint these; redeem for any one
    // eligible unowned cosmetic).
    await p.query(`
      CREATE TABLE IF NOT EXISTS lootbox_wildcard_tokens (
        account_id BIGINT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // One free box per ISO week (Australia/Sydney, matching the smoke cron tz).
    await p.query(`
      CREATE TABLE IF NOT EXISTS lootbox_free_claims (
        account_id BIGINT NOT NULL,
        week_start DATE NOT NULL,
        claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (account_id, week_start)
      )
    `);

    // Retired seasonal/tournament sets (runtime source of truth, seeded from
    // catalog defaults). A row here == that set's items can no longer drop.
    await p.query(`
      CREATE TABLE IF NOT EXISTS lootbox_retired_sets (
        set_id TEXT PRIMARY KEY,
        retired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        retired_by BIGINT
      )
    `);
    // Seed default-retired sets (idempotent).
    for (const s of Object.values(catalog.SETS)) {
      if (s.retiredByDefault) {
        await p.query(
          `INSERT INTO lootbox_retired_sets (set_id) VALUES ($1) ON CONFLICT (set_id) DO NOTHING`,
          [s.id]
        );
      }
    }

    // Admin-created seasonal sets (Task #703). The static catalog still defines
    // the built-in sets; these are operator-curated groupings of existing
    // catalog cosmetics so a new seasonal rotation can be assembled from the
    // AdminPanel without a DB shell. Retirement re-uses lootbox_retired_sets.
    await p.query(`
      CREATE TABLE IF NOT EXISTS lootbox_custom_sets (
        set_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        item_skus JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Audit trail for dupe-returns changes (Task #807). Mirrors
    // economy_price_audit: who changed the payout overrides, the old + new
    // raw override blobs (JSON text), and when. The live value still lives in
    // site_settings under DUPE_RETURNS_KEY — this table is history only.
    await p.query(`
      CREATE TABLE IF NOT EXISTS lootbox_dupe_returns_audit (
        id SERIAL PRIMARY KEY,
        changed_by TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT NOT NULL,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_lootbox_dupe_returns_audit_changed_at ON lootbox_dupe_returns_audit (changed_at DESC)`);
  }

  function _weekStartExpr() {
    // ISO-ish week start as a DATE in the Sydney tz.
    return `date_trunc('week', (NOW() AT TIME ZONE 'Australia/Sydney'))::date`;
  }

  async function getRetiredSetIds() {
    const p = getPool();
    const r = await p.query(`SELECT set_id FROM lootbox_retired_sets`);
    return r.rows.map((x) => x.set_id);
  }

  // ── Admin-editable dupe returns (Task #804) ───────────────────────────────
  // Duplicate payouts (per-rarity coin refund + the Legendary reward) default
  // to the hardcoded catalog values but can be overridden live from the Admin
  // Panel. Overrides are a JSON blob in site_settings under DUPE_RETURNS_KEY.
  // Mirrors the economy-override accessor: 30 s TTL cache, cleared on save so a
  // change takes effect for new opens within seconds (no redeploy).
  const DUPE_RETURNS_KEY = 'lootbox_dupe_returns';
  let _dupeCache = { data: null, expiresAt: 0 };

  function _dupeDefaults() {
    return {
      refundCoins: {
        common: catalog.DUPE_REFUND_COINS.common || 0,
        rare: catalog.DUPE_REFUND_COINS.rare || 0,
        epic: catalog.DUPE_REFUND_COINS.epic || 0,
        legendary: catalog.DUPE_REFUND_COINS.legendary || 0,
      },
      legendaryRewardType: catalog.DUPE_GRANTS_TOKEN.legendary ? 'token' : 'coins',
      legendaryTokens: 1,
    };
  }

  async function _getRawDupeOverrides() {
    const now = Date.now();
    if (_dupeCache.data !== null && now < _dupeCache.expiresAt) return _dupeCache.data;
    let data = {};
    try {
      const p = getPool();
      const r = await p.query('SELECT value FROM site_settings WHERE key = $1', [DUPE_RETURNS_KEY]);
      const raw = r.rows[0]?.value ?? null;
      const parsed = raw ? JSON.parse(raw) : {};
      data = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (_) {
      data = {};
    }
    _dupeCache = { data, expiresAt: now + 30_000 };
    return data;
  }

  function _clearDupeCache() { _dupeCache = { data: null, expiresAt: 0 }; }

  // Merge a (possibly partial) override blob over the catalog defaults, coercing
  // every value to a sane shape. Bad/missing values fall back to the default.
  function _mergeDupeReturns(overrides) {
    const def = _dupeDefaults();
    const o = (overrides && typeof overrides === 'object') ? overrides : {};
    const intOr = (v, fallback) => {
      if (v == null || v === '') return fallback;
      const n = parseInt(v, 10);
      return (Number.isFinite(n) && n >= 0) ? n : fallback;
    };
    const refundCoins = {
      common: intOr(o.common, def.refundCoins.common),
      rare: intOr(o.rare, def.refundCoins.rare),
      epic: intOr(o.epic, def.refundCoins.epic),
      legendary: intOr(o.legendaryCoins, def.refundCoins.legendary),
    };
    const legendaryRewardType = (o.legendaryRewardType === 'coins' || o.legendaryRewardType === 'token')
      ? o.legendaryRewardType
      : def.legendaryRewardType;
    const tokensRaw = parseInt(o.legendaryTokens, 10);
    const legendaryTokens = (Number.isFinite(tokensRaw) && tokensRaw >= 1) ? tokensRaw : def.legendaryTokens;
    return { refundCoins, legendaryRewardType, legendaryTokens };
  }

  // Effective (merged) dupe returns — the values the open engine actually uses.
  async function getDupeReturns() {
    return _mergeDupeReturns(await _getRawDupeOverrides());
  }

  // Admin GET payload: defaults + raw stored overrides + effective merged view
  // + recent audit history.
  async function getDupeReturnsConfig() {
    const overrides = await _getRawDupeOverrides();
    return {
      defaults: _dupeDefaults(),
      overrides,
      effective: _mergeDupeReturns(overrides),
      audit: await listDupeReturnsAudit(10),
    };
  }

  // Last N dupe-returns changes, newest first (id, changed_by, old/new raw
  // override JSON, timestamp). Mirrors listEconomyPriceAudit.
  async function listDupeReturnsAudit(limit = 20) {
    const p = getPool();
    const n = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const r = await p.query(
      `SELECT id, changed_by, old_value, new_value, changed_at
         FROM lootbox_dupe_returns_audit
        ORDER BY changed_at DESC, id DESC LIMIT $1`,
      [n]
    );
    return r.rows;
  }

  // Persist a validated override blob (plain object). An empty object reverts
  // every field to its catalog default. Clears the cache so it takes effect.
  // Records an audit row (who changed it, old + new raw override JSON) when the
  // stored blob actually changes — mirrors the economy-price audit trail.
  async function saveDupeReturns(overrides, changedBy) {
    const clean = (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) ? overrides : {};
    const p = getPool();
    const oldRaw = await _getRawDupeOverrides();
    const oldValue = JSON.stringify(oldRaw || {});
    const newValue = JSON.stringify(clean);
    await p.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [DUPE_RETURNS_KEY, newValue]
    );
    // Only log when the stored blob genuinely changed, so a no-op save (e.g. a
    // refresh-and-resave with no edits) doesn't spam the history.
    if (newValue !== oldValue) {
      await p.query(
        `INSERT INTO lootbox_dupe_returns_audit (changed_by, old_value, new_value) VALUES ($1, $2, $3)`,
        [changedBy ? String(changedBy) : 'unknown', oldValue, newValue]
      );
    }
    _clearDupeCache();
    return getDupeReturnsConfig();
  }

  // Per-set retirement metadata (id -> { retired, retired_at }).
  async function _retiredMeta() {
    const p = getPool();
    const r = await p.query(`SELECT set_id, retired_at FROM lootbox_retired_sets`);
    const m = new Map();
    for (const row of r.rows) m.set(row.set_id, row.retired_at);
    return m;
  }

  async function getCustomSets() {
    const p = getPool();
    const r = await p.query(
      `SELECT set_id, name, description, item_skus, created_by, created_at
         FROM lootbox_custom_sets ORDER BY created_at DESC`
    );
    return r.rows.map((row) => ({
      ...row,
      item_skus: Array.isArray(row.item_skus) ? row.item_skus : [],
    }));
  }

  // sku -> setId map for every admin-created custom set, so the drop engine and
  // published odds can honour retirement of operator-curated sets.
  async function getCustomSetMembership() {
    const sets = await getCustomSets();
    const map = {};
    for (const s of sets) {
      for (const sku of s.item_skus) {
        if (!(sku in map)) map[sku] = s.set_id;
      }
    }
    return map;
  }

  async function listSets() {
    const retiredMeta = await _retiredMeta();
    const builtIn = Object.values(catalog.SETS).map((s) => {
      const itemCount = catalog.ITEMS.filter((it) => it.set === s.id).length;
      return {
        id: s.id,
        set_id: s.id,
        label: s.label,
        name: s.label,
        description: s.description || '',
        item_count: itemCount,
        custom: false,
        retired: retiredMeta.has(s.id),
        retired_at: retiredMeta.get(s.id) || null,
      };
    });
    const custom = (await getCustomSets()).map((s) => ({
      id: s.set_id,
      set_id: s.set_id,
      label: s.name,
      name: s.name,
      description: s.description || '',
      item_count: s.item_skus.length,
      item_skus: s.item_skus,
      custom: true,
      created_at: s.created_at,
      retired: retiredMeta.has(s.set_id),
      retired_at: retiredMeta.get(s.set_id) || null,
    }));
    return [...builtIn, ...custom];
  }

  function _slugify(name) {
    return String(name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  // Create an admin-curated seasonal set from existing catalog cosmetics.
  async function createSet({ name, description = '', itemSkus = [], by = null }) {
    const trimmed = String(name || '').trim();
    if (!trimmed) { const e = new Error('Set name is required'); e.code = 'BAD_NAME'; throw e; }

    // Validate item SKUs against the catalog (only real cosmetics, deduped).
    const skus = Array.from(new Set((Array.isArray(itemSkus) ? itemSkus : []).map(String)));
    const invalid = skus.filter((sku) => !catalog.getItem(sku));
    if (invalid.length) {
      const e = new Error(`Unknown item SKUs: ${invalid.join(', ')}`); e.code = 'BAD_ITEMS'; throw e;
    }
    if (skus.length === 0) { const e = new Error('Pick at least one item'); e.code = 'NO_ITEMS'; throw e; }

    const p = getPool();
    const existing = new Set([
      ...Object.keys(catalog.SETS),
      ...(await getCustomSets()).map((s) => s.set_id),
    ]);
    const base = _slugify(trimmed) || 'set';
    let setId = base;
    let n = 2;
    while (existing.has(setId)) { setId = `${base}-${n++}`; }

    await p.query(
      `INSERT INTO lootbox_custom_sets (set_id, name, description, item_skus, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [setId, trimmed, String(description || '').trim() || null, JSON.stringify(skus), by]
    );
    return { set_id: setId, name: trimmed, description: String(description || '').trim(), item_skus: skus };
  }

  async function setRetired({ setId, retired, by = null }) {
    const isBuiltIn = !!catalog.SETS[setId];
    let isCustom = false;
    if (!isBuiltIn) {
      const p0 = getPool();
      const r = await p0.query(`SELECT 1 FROM lootbox_custom_sets WHERE set_id = $1`, [setId]);
      isCustom = r.rowCount > 0;
    }
    if (!isBuiltIn && !isCustom) { const e = new Error('Unknown set'); e.code = 'UNKNOWN_SET'; throw e; }
    const p = getPool();
    if (retired) {
      await p.query(
        `INSERT INTO lootbox_retired_sets (set_id, retired_by) VALUES ($1, $2)
         ON CONFLICT (set_id) DO UPDATE SET retired_at = NOW(), retired_by = EXCLUDED.retired_by`,
        [setId, by]
      );
    } else {
      await p.query(`DELETE FROM lootbox_retired_sets WHERE set_id = $1`, [setId]);
    }
    return { setId, retired: !!retired };
  }

  async function getWildcardTokens(accountId) {
    if (!accountId) return 0;
    const p = getPool();
    const r = await p.query(`SELECT balance FROM lootbox_wildcard_tokens WHERE account_id = $1`, [accountId]);
    return r.rows[0]?.balance || 0;
  }

  async function canClaimFree(accountId) {
    const p = getPool();
    const r = await p.query(
      `SELECT 1 AS claimed FROM lootbox_free_claims
        WHERE account_id = $1 AND week_start = ${_weekStartExpr()} LIMIT 1`,
      [accountId]
    );
    const nr = await p.query(
      `SELECT (${_weekStartExpr()} + INTERVAL '7 days')::timestamptz AS next_reset`
    );
    return { canClaim: r.rows.length === 0, nextResetAt: nr.rows[0]?.next_reset || null };
  }

  // Grant N comp Pro days inside an existing transaction. comp rows are
  // time-bounded (isProMember only honours them while current_period_end is in
  // the future), so this is the natural place to stack repeat drops.
  async function _grantCompProDaysTx(client, accountId, days) {
    const sel = await client.query(
      `SELECT id FROM pro_subscriptions
        WHERE account_id = $1 AND plan_type = 'comp'
        ORDER BY current_period_end DESC NULLS LAST
        LIMIT 1 FOR UPDATE`,
      [accountId]
    );
    if (sel.rows.length) {
      await client.query(
        `UPDATE pro_subscriptions
            SET status = 'active',
                current_period_end = GREATEST(COALESCE(current_period_end, NOW()), NOW()) + make_interval(days => $2::int),
                updated_at = NOW()
          WHERE id = $1`,
        [sel.rows[0].id, days]
      );
    } else {
      await client.query(
        `INSERT INTO pro_subscriptions
           (account_id, plan_type, status, current_period_end, amount_cents, currency, purchased_at)
         VALUES ($1, 'comp', 'active', NOW() + make_interval(days => $2::int), 0, 'aud', NOW())`,
        [accountId, days]
      );
    }
  }

  /**
   * Atomic box open. For paid boxes, debits coins (fails INSUFFICIENT_FUNDS).
   * For the free box, enforces the weekly claim (fails ALREADY_CLAIMED). Then
   * rolls a drop, grants it (new cosmetic / dupe-refund / dupe-token / pro
   * time), logs the event, and returns the full outcome.
   */
  async function openBox({ accountId, boxId, rng = Math.random }) {
    if (!accountId) throw new Error('openBox: accountId required');
    const free = boxId === 'free';
    const box = catalog.getBox(boxId);
    if (!box) { const e = new Error('Unknown box'); e.code = 'UNKNOWN_BOX'; throw e; }

    const p = getPool();
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock($1::bigint)`, [accountId]);
      await client.query(`INSERT INTO player_profiles (account_id) VALUES ($1) ON CONFLICT (account_id) DO NOTHING`, [accountId]);

      if (free) {
        const claim = await client.query(
          `INSERT INTO lootbox_free_claims (account_id, week_start)
           VALUES ($1, ${_weekStartExpr()})
           ON CONFLICT (account_id, week_start) DO NOTHING RETURNING account_id`,
          [accountId]
        );
        if (claim.rowCount === 0) {
          await client.query('ROLLBACK');
          const e = new Error('Free box already claimed this week'); e.code = 'ALREADY_CLAIMED'; throw e;
        }
      } else {
        const br = await client.query(
          `SELECT COALESCE(coin_balance, 0)::int AS balance FROM player_profiles WHERE account_id = $1 FOR UPDATE`,
          [accountId]
        );
        const bal = br.rows[0]?.balance ?? 0;
        if (bal < box.price) {
          await client.query('ROLLBACK');
          const e = new Error(`Insufficient coins (have ${bal}, need ${box.price})`); e.code = 'INSUFFICIENT_FUNDS'; throw e;
        }
        await client.query(
          `INSERT INTO coin_transactions (account_id, delta, reason, ref_match_id) VALUES ($1, $2, $3, NULL)`,
          [accountId, -box.price, `lootbox:${boxId}`.slice(0, 64)]
        );
        await client.query(
          `UPDATE player_profiles SET coin_balance = coin_balance - $1 WHERE account_id = $2`,
          [box.price, accountId]
        );
      }

      // Roll against the live retired-set state, inside the transaction.
      const retiredRows = await client.query(`SELECT set_id FROM lootbox_retired_sets`);
      const retired = retiredRows.rows.map((x) => x.set_id);
      // Ownership-aware: read the player's owned cosmetics so the roll prefers
      // items they don't already have. A dupe only happens once they own
      // everything in the rolled rarity bucket.
      const ownedRows = await client.query(
        `SELECT kind, value FROM coin_owned_cosmetics WHERE account_id = $1`,
        [accountId]
      );
      const ownedSkus = new Set(ownedRows.rows.map((r) => `${r.kind}:${r.value}`));
      // Honour retirement of admin-created custom sets too (sku -> setId map).
      const membership = await getCustomSetMembership();
      const item = catalog.rollDrop(free ? 'free' : boxId, retired, rng, ownedSkus, membership);

      // Resolve the live (admin-editable) dupe returns once per open.
      const dupeReturns = await getDupeReturns();

      let outcome = 'new';
      let isNew = false;
      let refundCoins = 0;
      let tokenGranted = 0;
      let proDays = 0;

      if (item.kind === 'pro_time') {
        proDays = item.days;
        await _grantCompProDaysTx(client, accountId, proDays);
        outcome = 'pro_time';
      } else {
        const claim = await client.query(
          `INSERT INTO coin_owned_cosmetics (account_id, kind, value, coins_spent) VALUES ($1, $2, $3, 0)
           ON CONFLICT (account_id, kind, value) DO NOTHING RETURNING id`,
          [accountId, item.kind, item.value]
        );
        // Legendary dupes mint wildcard token(s) only when the admin-configured
        // reward type is 'token'; otherwise (and for all other rarities) they
        // pay a coin refund. Token count + coin amounts are all live-editable.
        const grantsToken = item.rarity === 'legendary' && dupeReturns.legendaryRewardType === 'token';
        if (claim.rowCount > 0) {
          isNew = true;
          outcome = 'new';
        } else if (grantsToken) {
          tokenGranted = dupeReturns.legendaryTokens || 1;
          await client.query(
            `INSERT INTO lootbox_wildcard_tokens (account_id, balance) VALUES ($1, $2)
             ON CONFLICT (account_id) DO UPDATE SET balance = lootbox_wildcard_tokens.balance + $2, updated_at = NOW()`,
            [accountId, tokenGranted]
          );
          outcome = 'dupe_token';
        } else {
          refundCoins = dupeReturns.refundCoins[item.rarity] || 0;
          if (refundCoins > 0) {
            await client.query(
              `INSERT INTO coin_transactions (account_id, delta, reason, ref_match_id) VALUES ($1, $2, $3, NULL)`,
              [accountId, refundCoins, `lootbox_dupe:${item.sku}`.slice(0, 64)]
            );
            await client.query(
              `UPDATE player_profiles SET coin_balance = coin_balance + $1 WHERE account_id = $2`,
              [refundCoins, accountId]
            );
          }
          outcome = 'dupe_refund';
        }
      }

      await client.query(
        `INSERT INTO lootbox_events
           (account_id, box_id, item_sku, kind, value, rarity, outcome, refund_coins, token_granted, pro_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [accountId, boxId, item.sku, item.kind, item.value, item.rarity, outcome, refundCoins, tokenGranted, proDays]
      );

      const balr = await client.query(`SELECT COALESCE(coin_balance, 0)::int AS balance FROM player_profiles WHERE account_id = $1`, [accountId]);
      const tokr = await client.query(`SELECT balance FROM lootbox_wildcard_tokens WHERE account_id = $1`, [accountId]);

      await client.query('COMMIT');
      return {
        box: { id: box.id, label: box.label, price: box.price },
        item: {
          sku: item.sku, kind: item.kind, value: item.value, label: item.label,
          rarity: item.rarity, boxExclusive: !!item.boxExclusive, set: item.set || null,
          special: !!item.special, days: item.days || null,
        },
        rarity: item.rarity,
        outcome,
        isNew,
        refundCoins,
        tokenGranted,
        proDays,
        newBalance: balr.rows[0]?.balance ?? 0,
        wildcardTokens: tokr.rows[0]?.balance ?? 0,
      };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Redeem a wildcard token for any one eligible (non-retired, non-special)
   * cosmetic the player doesn't already own.
   */
  async function redeemWildcard({ accountId, sku }) {
    if (!accountId) throw new Error('redeemWildcard: accountId required');
    const item = catalog.getItem(sku);
    if (!item || !catalog.isCosmeticKind(item.kind)) {
      const e = new Error('Not a redeemable cosmetic'); e.code = 'BAD_SKU'; throw e;
    }
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock($1::bigint)`, [accountId]);

      // Reject retired-set items (can't acquire what no longer exists in pools).
      if (item.set) {
        const rr = await client.query(`SELECT 1 FROM lootbox_retired_sets WHERE set_id = $1`, [item.set]);
        if (rr.rows.length) { await client.query('ROLLBACK'); const e = new Error('That set is retired'); e.code = 'RETIRED'; throw e; }
      }

      await client.query(
        `INSERT INTO lootbox_wildcard_tokens (account_id, balance) VALUES ($1, 0) ON CONFLICT (account_id) DO NOTHING`,
        [accountId]
      );
      const tr = await client.query(`SELECT balance FROM lootbox_wildcard_tokens WHERE account_id = $1 FOR UPDATE`, [accountId]);
      const tokens = tr.rows[0]?.balance ?? 0;
      if (tokens < 1) { await client.query('ROLLBACK'); const e = new Error('No wildcard tokens'); e.code = 'NO_TOKENS'; throw e; }

      const claim = await client.query(
        `INSERT INTO coin_owned_cosmetics (account_id, kind, value, coins_spent) VALUES ($1, $2, $3, 0)
         ON CONFLICT (account_id, kind, value) DO NOTHING RETURNING id`,
        [accountId, item.kind, item.value]
      );
      if (claim.rowCount === 0) { await client.query('ROLLBACK'); const e = new Error('Already owned'); e.code = 'ALREADY_OWNED'; throw e; }

      await client.query(
        `UPDATE lootbox_wildcard_tokens SET balance = balance - 1, updated_at = NOW() WHERE account_id = $1`,
        [accountId]
      );
      await client.query(
        `INSERT INTO lootbox_events (account_id, box_id, item_sku, kind, value, rarity, outcome)
         VALUES ($1, 'wildcard', $2, $3, $4, $5, 'wildcard')`,
        [accountId, item.sku, item.kind, item.value, item.rarity]
      );
      await client.query('COMMIT');
      return { ok: true, item: { sku: item.sku, kind: item.kind, value: item.value, label: item.label, rarity: item.rarity }, wildcardTokens: tokens - 1 };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async function getEquipped(accountId) {
    if (!accountId) return {};
    const p = getPool();
    const r = await p.query(
      `SELECT equipped_avatar_ring, equipped_profile_banner, equipped_nameplate_fx, equipped_recap_skin
         FROM player_profiles WHERE account_id = $1`,
      [accountId]
    );
    const row = r.rows[0] || {};
    return {
      avatar_ring: row.equipped_avatar_ring || null,
      profile_banner: row.equipped_profile_banner || null,
      nameplate_fx: row.equipped_nameplate_fx || null,
      recap_skin: row.equipped_recap_skin || null,
    };
  }

  const _EQUIP_COLUMN = {
    avatar_ring: 'equipped_avatar_ring',
    profile_banner: 'equipped_profile_banner',
    nameplate_fx: 'equipped_nameplate_fx',
    recap_skin: 'equipped_recap_skin',
  };

  async function equipCosmetic({ accountId, kind, value }) {
    if (!accountId) throw new Error('equipCosmetic: accountId required');
    const col = _EQUIP_COLUMN[kind];
    if (!col) { const e = new Error('Unknown cosmetic kind'); e.code = 'BAD_KIND'; throw e; }
    const p = getPool();
    await p.query(`INSERT INTO player_profiles (account_id) VALUES ($1) ON CONFLICT (account_id) DO NOTHING`, [accountId]);

    // Empty/null clears the slot.
    if (value == null || value === '') {
      await p.query(`UPDATE player_profiles SET ${col} = NULL, updated_at = NOW() WHERE account_id = $1`, [accountId]);
      return { kind, value: null };
    }
    const item = catalog.getItem(`${kind}:${value}`);
    if (!item) { const e = new Error('Unknown cosmetic'); e.code = 'BAD_SKU'; throw e; }
    // Must own it (granted via box / wildcard / free box → coin_owned_cosmetics).
    const owned = await p.query(
      `SELECT 1 FROM coin_owned_cosmetics WHERE account_id = $1 AND kind = $2 AND value = $3 LIMIT 1`,
      [accountId, kind, value]
    );
    if (!owned.rows.length) { const e = new Error('You do not own that cosmetic'); e.code = 'NOT_OWNED'; throw e; }
    await p.query(`UPDATE player_profiles SET ${col} = $2, updated_at = NOW() WHERE account_id = $1`, [accountId, value]);
    return { kind, value };
  }

  async function listEvents(accountId, limit = 30) {
    if (!accountId) return [];
    const p = getPool();
    const r = await p.query(
      `SELECT id, box_id, item_sku, kind, value, rarity, outcome, refund_coins, token_granted, pro_days, created_at
         FROM lootbox_events WHERE account_id = $1 ORDER BY id DESC LIMIT $2`,
      [accountId, Math.max(1, Math.min(100, limit))]
    );
    return r.rows;
  }

  /**
   * Collection / locker view: every collectible cosmetic in the catalog with
   * an owned + equipped + retired flag, grouped by kind, plus X/Y counts.
   */
  async function getCollection(accountId) {
    const p = getPool();
    const ownedRows = accountId
      ? (await p.query(`SELECT kind, value FROM coin_owned_cosmetics WHERE account_id = $1`, [accountId])).rows
      : [];
    const owned = new Set(ownedRows.map((r) => `${r.kind}:${r.value}`));
    const equipped = accountId ? await getEquipped(accountId) : {};
    const retired = new Set(await getRetiredSetIds());

    const groups = {};
    let collected = 0;
    let total = 0;
    for (const it of catalog.ITEMS) {
      if (!catalog.isCosmeticKind(it.kind)) continue; // pro_time isn't collectible
      total += 1;
      const isOwned = owned.has(it.sku);
      if (isOwned) collected += 1;
      if (!groups[it.kind]) groups[it.kind] = { kind: it.kind, items: [], collected: 0, total: 0 };
      groups[it.kind].total += 1;
      if (isOwned) groups[it.kind].collected += 1;
      groups[it.kind].items.push({
        sku: it.sku, kind: it.kind, value: it.value, label: it.label, rarity: it.rarity,
        boxExclusive: !!it.boxExclusive, set: it.set || null,
        retired: it.set ? retired.has(it.set) : false,
        owned: isOwned,
        equipped: equipped[it.kind] === it.value,
      });
    }
    return {
      collected, total,
      groups: Object.values(groups),
      equipped,
    };
  }

  return {
    applyLootboxSchema,
    getRetiredSetIds,
    getCustomSets,
    getCustomSetMembership,
    getDupeReturns,
    getDupeReturnsConfig,
    saveDupeReturns,
    listDupeReturnsAudit,
    listSets,
    createSet,
    setRetired,
    getWildcardTokens,
    canClaimFree,
    openBox,
    redeemWildcard,
    getEquipped,
    equipCosmetic,
    listEvents,
    getCollection,
  };
}

module.exports = { createLootboxDb };
