/**
 * Feature 8 — One-off entitlements infrastructure.
 *
 * DB helpers around `user_one_off_perks` plus the generic perk catalog
 * checkout endpoints. Verified-badge purchases live in ./verifiedBadge.js
 * but reuse `grantOneOffPerk` / `createOneOffPerkPending` from here via the
 * aggregated `magV3` object.
 */

const { isSuperuserAccountId } = require('../../auth/superusers');
const { idem, idemBucket } = require('../../payments/stripeIdem');
const cosm = require('../../profileCosmetics');

function createDb({ getPool }) {
  async function grantOneOffPerk({ accountId, perkKey, source = 'stripe', stripeSessionId = null, stripePaymentIntent = null, amountCents = null, currency = null, expiresAt = null, metadata = null }) {
    if (!accountId) throw new Error('grantOneOffPerk: accountId required');
    if (!perkKey) throw new Error('grantOneOffPerk: perkKey required');
    const p = getPool();
    // SECURITY (Task #157 round-3 review): if a pending row already exists
    // for this Stripe session (created by createOneOffPerkPending pre-checkout),
    // the webhook ACTIVATES it by clearing revoked_at and stamping the real
    // payment intent. This is the ONLY path that flips a perk from pending to
    // active — pre-webhook code never grants access.
    if (stripeSessionId) {
      const existing = await p.query(
        `SELECT * FROM user_one_off_perks WHERE stripe_session_id = $1 LIMIT 1`,
        [stripeSessionId]
      );
      if (existing.rows.length) {
        const row = existing.rows[0];
        if (row.revoked_at !== null) {
          // Activate the pending row.
          const upd = await p.query(
            `UPDATE user_one_off_perks
                SET revoked_at = NULL,
                    source = $2,
                    stripe_payment_intent = COALESCE($3, stripe_payment_intent),
                    amount_cents = COALESCE($4, amount_cents),
                    currency = COALESCE($5, currency),
                    expires_at = COALESCE($6, expires_at),
                    metadata = COALESCE($7::jsonb, metadata),
                    granted_at = NOW()
              WHERE id = $1
              RETURNING *`,
            [row.id, source, stripePaymentIntent, amountCents, currency,
             expiresAt, metadata ? JSON.stringify(metadata) : null]
          );
          return upd.rows[0];
        }
        return row; // already active — idempotent
      }
    }
    const r = await p.query(
      `INSERT INTO user_one_off_perks
        (account_id, perk_key, source, stripe_session_id, stripe_payment_intent,
         amount_cents, currency, expires_at, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [accountId, perkKey, source, stripeSessionId, stripePaymentIntent,
       amountCents, currency, expiresAt, metadata ? JSON.stringify(metadata) : null]
    );
    return r.rows[0];
  }

  async function hasOneOffPerk(accountId, perkKey) {
    if (!accountId || !perkKey) return false;
    // Owner perk — superusers hold every one-off perk.
    if (isSuperuserAccountId(accountId)) return true;
    const p = getPool();
    const r = await p.query(
      `SELECT 1 FROM user_one_off_perks
        WHERE account_id = $1 AND perk_key = $2
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1`,
      [accountId, perkKey]
    );
    return r.rows.length > 0;
  }

  async function listOneOffPerks(accountId) {
    if (!accountId) return [];
    // Owner perk — superusers hold every catalogued one-off perk. Synthesize a
    // row per catalog key so the perks UI shows them all as owned.
    if (isSuperuserAccountId(accountId)) {
      return Object.keys(ONE_OFF_PERK_CATALOG).map((perk_key) => ({
        id: null,
        perk_key,
        source: 'owner_perk',
        granted_at: null,
        expires_at: null,
        amount_cents: null,
        currency: null,
        stripe_payment_intent: null,
        metadata: null,
      }));
    }
    const p = getPool();
    const r = await p.query(
      `SELECT id, perk_key, source, granted_at, expires_at, amount_cents, currency,
              stripe_payment_intent, metadata
         FROM user_one_off_perks
        WHERE account_id = $1 AND revoked_at IS NULL
        ORDER BY granted_at DESC`,
      [accountId]
    );
    return r.rows;
  }

  async function createOneOffPerkPending({ accountId, perkKey, stripeSessionId, amountCents, currency, metadata }) {
    // SECURITY (Task #157 round-3 review): pre-checkout intent record. Inserts
    // a row with revoked_at = NOW() so hasOneOffPerk() returns false until the
    // verified Stripe webhook calls grantOneOffPerk() with the same session_id,
    // which clears revoked_at. This is the idempotency anchor for the webhook
    // and the audit trail for the checkout, but it grants nothing on its own.
    if (!accountId) throw new Error('createOneOffPerkPending: accountId required');
    if (!perkKey) throw new Error('createOneOffPerkPending: perkKey required');
    if (!stripeSessionId) throw new Error('createOneOffPerkPending: stripeSessionId required');
    const p = getPool();
    const existing = await p.query(
      `SELECT * FROM user_one_off_perks WHERE stripe_session_id = $1 LIMIT 1`,
      [stripeSessionId]
    );
    if (existing.rows.length) return existing.rows[0];
    const r = await p.query(
      `INSERT INTO user_one_off_perks
        (account_id, perk_key, source, stripe_session_id,
         amount_cents, currency, metadata, revoked_at)
       VALUES ($1,$2,'stripe_pending',$3,$4,$5,$6, NOW())
       RETURNING *`,
      [accountId, perkKey, stripeSessionId, amountCents, currency,
       metadata ? JSON.stringify(metadata) : null]
    );
    return r.rows[0];
  }

  // Task #881 — refund revocation. Called from the charge.refunded webhook:
  // stamps revoked_at = NOW() on the active perk row(s) matching the Stripe
  // payment intent. Idempotent (revoked rows are skipped) and best-effort at
  // the call site. Returns the revoked rows (empty array when nothing matched).
  async function revokeOneOffPerksByPaymentIntent(stripePaymentIntent) {
    if (!stripePaymentIntent) return [];
    const p = getPool();
    const r = await p.query(
      `UPDATE user_one_off_perks
          SET revoked_at = NOW()
        WHERE stripe_payment_intent = $1
          AND revoked_at IS NULL
        RETURNING *`,
      [stripePaymentIntent]
    );
    // Task #913 — same equip-then-refund gap closed for frames/rings (Task
    // #910): a revoked cosmetic perk must not keep pointing profiles at a
    // cosmetic the player lost. Ownership-aware (Pro, coin purchase, or a
    // superuser's owner-perk keeps the value equipped) and best-effort per
    // row — an unequip failure must never make the refund webhook retry the
    // revocation.
    for (const row of r.rows) {
      try {
        await _unequipRevokedPerkCosmetic(p, row.account_id, row.perk_key);
      } catch (e) {
        console.warn('[magV3] refund perk unequip failed for account', row.account_id, row.perk_key, '—', e?.message || e);
      }
    }
    return r.rows;
  }

  // ---- Task #913 helpers ------------------------------------------------

  async function _isProMember(accountId) {
    // Mirrors db.isProMember's live-Pro rule (active/lifetime/past_due,
    // comp rows only while current_period_end is in the future).
    const p = getPool();
    const r = await p.query(
      `SELECT 1 FROM pro_subscriptions
        WHERE account_id = $1 AND status IN ('active','lifetime','past_due')
          AND (plan_type IS DISTINCT FROM 'comp'
               OR (current_period_end IS NOT NULL AND current_period_end > NOW()))
        LIMIT 1`,
      [accountId]
    );
    return r.rows.length > 0;
  }

  async function _hasCoinCosmetic(accountId, kind, value) {
    const p = getPool();
    const r = await p.query(
      `SELECT 1 FROM coin_owned_cosmetics WHERE account_id = $1 AND kind = $2 AND value = $3 LIMIT 1`,
      [accountId, kind, value]
    );
    return r.rowCount > 0;
  }

  // Clears the equipped/selected player_profiles value matching a revoked
  // perk key, unless the player still owns it via another source.
  async function _unequipRevokedPerkCosmetic(p, accountId, perkKey) {
    if (!accountId || !perkKey) return;
    // Owner perk — superusers own every cosmetic; never unequip.
    if (isSuperuserAccountId(accountId)) return;

    if (perkKey === 'cosmetic:voice_pack') {
      // A duplicate active voice-pack entitlement (nothing enforces a single
      // active row) still grants access — post-revocation check, so the
      // refunded row no longer counts.
      if (await hasOneOffPerk(accountId, 'cosmetic:voice_pack')) return;
      const prof = await p.query(
        `SELECT selected_voice_pack FROM player_profiles WHERE account_id = $1`,
        [accountId]
      );
      const pack = prof.rows[0]?.selected_voice_pack;
      if (!pack) return;
      // Free packs (none today) need no ownership; premium packs stay
      // equipped when still covered by Pro or a coin purchase.
      if (!cosm.isPremiumVoicePack(pack)) return;
      if (await _isProMember(accountId)) return;
      if (await _hasCoinCosmetic(accountId, 'voice_pack', pack)) return;
      await p.query(
        `UPDATE player_profiles SET selected_voice_pack = NULL
          WHERE account_id = $1 AND selected_voice_pack = $2`,
        [accountId, pack]
      );
      return;
    }

    if (perkKey === 'cosmetic:theme_pack') {
      // Duplicate active theme-pack entitlement still grants access.
      if (await hasOneOffPerk(accountId, 'cosmetic:theme_pack')) return;
      const prof = await p.query(
        `SELECT profile_layout_theme FROM player_profiles WHERE account_id = $1`,
        [accountId]
      );
      const theme = prof.rows[0]?.profile_layout_theme;
      if (!theme) return;
      // Free themes (court-pitch) are always allowed.
      if (!cosm.isPremiumLayoutTheme(theme)) return;
      if (await _isProMember(accountId)) return;
      if (await _hasCoinCosmetic(accountId, 'layout_theme', theme)) return;
      await p.query(
        `UPDATE player_profiles SET profile_layout_theme = NULL
          WHERE account_id = $1 AND profile_layout_theme = $2`,
        [accountId, theme]
      );
      return;
    }

    if (perkKey === 'cosmetic:vanity_url') {
      // Still owned via the coin-purchased add-on, or via another active
      // vanity perk row (post-revocation check, so the refunded row no
      // longer counts)?
      if (await _hasCoinCosmetic(accountId, 'cosmetic', 'vanity_url')) return;
      if (await hasOneOffPerk(accountId, 'cosmetic:vanity_url')) return;
      // Release like db.releaseVanitySlug: clear the slug and record the
      // release so the reclaim cooldown applies to other players. Atomic —
      // a partial failure must not leave the slug cleared without a release
      // record (that would make it immediately claimable, bypassing the
      // cooldown). The slug is read+locked INSIDE the transaction and the
      // UPDATE is constrained to that exact slug, so a concurrent slug
      // change can never clear a newer slug while recording a stale one.
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        const cur = await client.query(
          `SELECT vanity_slug FROM player_profiles WHERE account_id = $1 FOR UPDATE`,
          [accountId]
        );
        const slug = cur.rows[0]?.vanity_slug;
        if (!slug) {
          await client.query('COMMIT');
          return;
        }
        const upd = await client.query(
          `UPDATE player_profiles
              SET vanity_slug = NULL,
                  vanity_slug_released_at = NOW(),
                  updated_at = NOW()
            WHERE account_id = $1 AND vanity_slug = $2
            RETURNING vanity_slug`,
          [accountId, slug]
        );
        if (upd.rowCount > 0) {
          await client.query(
            `INSERT INTO vanity_slug_releases (slug, prev_account_id, released_at)
               VALUES ($1, $2, NOW())`,
            [String(slug).toLowerCase(), String(accountId)]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* already rolled back */ }
        throw err;
      } finally {
        client.release();
      }
    }
  }

  // Task #913 — true iff the account currently holds an unreleased vanity
  // slug. Used to block a redundant vanity add-on purchase by grandfathered
  // holders (slug from the era it was bundled with Pro): refunding such a
  // purchase would otherwise release a slug they own independently of it.
  async function hasActiveVanitySlug(accountId) {
    if (!accountId) return false;
    const p = getPool();
    const r = await p.query(
      `SELECT 1 FROM player_profiles WHERE account_id = $1 AND vanity_slug IS NOT NULL LIMIT 1`,
      [accountId]
    );
    return r.rows.length > 0;
  }

  return { grantOneOffPerk, hasOneOffPerk, listOneOffPerks, createOneOffPerkPending, revokeOneOffPerksByPaymentIntent, hasActiveVanitySlug };
}

// Round-8: aligned to the spec'd one-off cosmetic catalog —
// themes, animated cover FX packs, trophy frames, achievement borders,
// voice packs, vanity-URL slugs, spotlight credits. Pre-existing keys
// are kept for backward compat with already-issued perks.
const ONE_OFF_PERK_CATALOG = {
  // ---- Spec'd round-8 cosmetics ----
  'cosmetic:theme_pack':          { name: 'Profile Theme Pack',       cents: 700 },
  'cosmetic:cover_fx_pack':       { name: 'Animated Cover FX Pack',   cents: 900 },
  'cosmetic:trophy_frame':        { name: 'Trophy Frame',             cents: 600 },
  'cosmetic:achievement_border':  { name: 'Achievement Border',       cents: 500 },
  'cosmetic:voice_pack':          { name: 'Hero Voice Pack',          cents: 800 },
  'cosmetic:vanity_url':          { name: 'Vanity URL Slug',          cents: 1200 },
  'cosmetic:spotlight_credit':    { name: 'Spotlight Credit',         cents: 1500 },
  // ---- Earlier rounds (kept for back-compat) ----
  'cosmetic:profile_glow':        { name: 'Profile Glow Effect',      cents: 500 },
  'cosmetic:animated_avatar':     { name: 'Animated Avatar Frame',    cents: 800 },
  'cosmetic:scoreboard_theme':    { name: 'Scoreboard Theme Pack',    cents: 600 },
  'cosmetic:patch_note_shoutout': { name: 'Patch Note Shoutout',      cents: 1500 },
  'cosmetic:profile_banner':      { name: 'Profile Banner Image',     cents: 700 },
  'cosmetic:custom_title':        { name: 'Custom Profile Title',     cents: 600 },
  'cosmetic:hero_loadout_pin':    { name: 'Extra Pinned Hero Slot',   cents: 400 },
  'cosmetic:match_pin':           { name: 'Extra Pinned Match Slot',  cents: 400 },
  'cosmetic:embed_theme':         { name: 'Custom Embed Accent',      cents: 500 },
  'cosmetic:replay_pack_10':      { name: '10-pack Replay Quota',     cents: 300 },
};

function mountRoutes({ router, express, deps, requireAuth }) {
  const { magV3, getStripe, getSiteUrl } = deps;

  // ---------------------------------------------------------------
  // 8 — One-off perks listing for self + generic checkout.
  // ---------------------------------------------------------------
  router.get('/me/perks', requireAuth, async (req, res) => {
    try {
      const rows = await magV3.listOneOffPerks(req.session.accountId);
      res.json({ perks: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Generic one-off perk checkout (review fix). Supports any catalogued
  // cosmetic perk so feature-8 infra is actually consumed beyond the
  // verified badge. Stripe webhook routes back through `one_off_perk`.
  // Catalogue is intentionally tiny and server-controlled — never trust
  // client to choose price.
  router.get('/perks/catalog', (req, res) => {
    res.json({ perks: Object.entries(ONE_OFF_PERK_CATALOG).map(([k, v]) => ({ key: k, ...v })) });
  });
  router.post('/perks/checkout', express.json(), requireAuth, async (req, res) => {
    try {
      const accountId = req.session.accountId;
      const perkKey = String(req.body?.perkKey || '');
      const perk = ONE_OFF_PERK_CATALOG[perkKey];
      if (!perk) return res.status(400).json({ error: 'Unknown perkKey' });
      // If user already owns this active perk, refuse.
      if (await magV3.hasOneOffPerk(accountId, perkKey)) {
        return res.status(409).json({ error: 'You already own this perk.' });
      }
      // Task #913 — grandfathered vanity holders (active slug, no purchased
      // perk) must not buy the add-on: a later refund of that redundant
      // purchase would release a slug they own under the grandfathering
      // policy.
      if (perkKey === 'cosmetic:vanity_url' && await magV3.hasActiveVanitySlug(accountId)) {
        return res.status(409).json({ error: 'You already hold a custom URL — no purchase needed to keep or manage it.' });
      }
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });
      const baseUrl = getSiteUrl();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: { name: perk.name },
            unit_amount: perk.cents,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/profile?perk=success`,
        cancel_url: `${baseUrl}/profile?perk=cancelled`,
        metadata: {
          purpose: 'one_off_perk',
          account_id: String(accountId),
          perk_key: perkKey,
        },
      }, idem('checkout', 'one_off_perk', accountId, perkKey, idemBucket()));
      await magV3.createOneOffPerkPending({
        accountId, perkKey,
        stripeSessionId: session.id,
        amountCents: perk.cents, currency: 'aud',
        metadata: { name: perk.name },
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('[API] perks/checkout:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout' });
    }
  });
}

module.exports = { createDb, mountRoutes, ONE_OFF_PERK_CATALOG };
