/**
 * Feature 8 — One-off entitlements infrastructure.
 *
 * DB helpers around `user_one_off_perks` plus the generic perk catalog
 * checkout endpoints. Verified-badge purchases live in ./verifiedBadge.js
 * but reuse `grantOneOffPerk` / `createOneOffPerkPending` from here via the
 * aggregated `magV3` object.
 */

const { isSuperuserAccountId } = require('../../auth/superusers');

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

  return { grantOneOffPerk, hasOneOffPerk, listOneOffPerks, createOneOffPerkPending };
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
      });
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
