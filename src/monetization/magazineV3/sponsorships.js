/**
 * Feature 4 — Org sponsorship slots.
 *
 * Sponsorship lifecycle: pending_payment → pending_moderation → pending_acceptance
 * → active|declined|rejected. Includes the org-onboarding moderation queue
 * (`org_sponsors`) that gates who is allowed to purchase a slot.
 */

const { SPONSORSHIP_MONTHLY_PRICE_CENTS, SPONSORSHIP_REVSHARE_BPS } = require('./constants');
const { _isSafeHttpUrl } = require('./urlSafety');

function createDb({ getPool }) {
  // ---- 4: sponsorships ----
  async function createSponsorshipPending(row) {
    const p = getPool();
    const r = await p.query(
      `INSERT INTO org_sponsorships
        (sponsor_account_id, target_account_id, slot_type, headline, body_md,
         image_url, link_url, stripe_session_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending_payment')
       RETURNING *`,
      [row.sponsorAccountId, row.targetAccountId, row.slotType || 'profile_chip',
       row.headline, row.bodyMd || null, row.imageUrl || null, row.linkUrl || null,
       row.stripeSessionId]
    );
    return r.rows[0];
  }

  async function markSponsorshipPaid(stripeSessionId, stripeSubscriptionId) {
    const p = getPool();
    const r = await p.query(
      `UPDATE org_sponsorships
          SET stripe_subscription_id = COALESCE($2, stripe_subscription_id),
              status = CASE WHEN status = 'pending_payment' THEN 'pending_moderation' ELSE status END,
              updated_at = NOW()
        WHERE stripe_session_id = $1
        RETURNING *`,
      [stripeSessionId, stripeSubscriptionId]
    );
    return r.rows[0] || null;
  }

  async function moderateSponsorship(id, { approve, moderatorAccountId, notes }) {
    const p = getPool();
    const newStatus = approve ? 'pending_acceptance' : 'rejected';
    const r = await p.query(
      `UPDATE org_sponsorships
          SET status = $2, moderated_by = $3, moderated_at = NOW(),
              moderation_notes = $4, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, newStatus, moderatorAccountId, notes || null]
    );
    return r.rows[0] || null;
  }

  async function acceptSponsorship(id, accountId) {
    const p = getPool();
    const r = await p.query(
      `UPDATE org_sponsorships
          SET status = 'active', accepted_at = NOW(), activated_at = NOW(),
              expires_at = COALESCE(expires_at, NOW() + INTERVAL '30 days'),
              updated_at = NOW()
        WHERE id = $1 AND target_account_id = $2 AND status = 'pending_acceptance'
        RETURNING *`,
      [id, accountId]
    );
    return r.rows[0] || null;
  }

  async function declineSponsorship(id, accountId) {
    const p = getPool();
    const r = await p.query(
      `UPDATE org_sponsorships
          SET status = 'declined', cancelled_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND target_account_id = $2
          AND status IN ('pending_acceptance','active')
        RETURNING *`,
      [id, accountId]
    );
    return r.rows[0] || null;
  }

  async function getActiveSponsorshipsForTarget(accountId) {
    if (!accountId) return [];
    const p = getPool();
    const r = await p.query(
      `SELECT id, sponsor_account_id, headline, body_md, image_url, link_url,
              activated_at, expires_at
         FROM org_sponsorships
        WHERE target_account_id = $1 AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY activated_at DESC`,
      [accountId]
    );
    return r.rows;
  }

  async function getInboundSponsorships(accountId) {
    if (!accountId) return [];
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM org_sponsorships
        WHERE target_account_id = $1
          AND status IN ('pending_acceptance','active','declined')
        ORDER BY created_at DESC LIMIT 20`,
      [accountId]
    );
    return r.rows;
  }

  async function listPendingModerationSponsorships() {
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM org_sponsorships
        WHERE status = 'pending_moderation'
        ORDER BY created_at ASC`
    );
    return r.rows;
  }

  async function getSponsorship(id) {
    const p = getPool();
    const r = await p.query(`SELECT * FROM org_sponsorships WHERE id = $1`, [id]);
    return r.rows[0] || null;
  }

  // ---- 4 (review fix): org sponsor onboarding moderation queue ----
  async function createOrgSponsorApplication({ ownerAccountId, orgName, website, contactEmail, description }) {
    const p = getPool();
    const r = await p.query(
      `INSERT INTO org_sponsors (owner_account_id, org_name, website, contact_email, description)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ownerAccountId, orgName, website, contactEmail, description]
    );
    return r.rows[0];
  }
  async function listPendingOrgSponsors() {
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM org_sponsors WHERE status = 'pending_review' ORDER BY created_at ASC LIMIT 100`
    );
    return r.rows;
  }
  async function moderateOrgSponsor(id, { approve, moderatorAccountId, notes }) {
    const p = getPool();
    const r = await p.query(
      `UPDATE org_sponsors
          SET status = $2, moderated_by = $3, moderated_at = NOW(),
              moderation_notes = $4, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [id, approve ? 'approved' : 'rejected', moderatorAccountId, notes || null]
    );
    return r.rows[0] || null;
  }
  async function isApprovedOrgSponsor(accountId) {
    if (!accountId) return false;
    const p = getPool();
    const r = await p.query(
      `SELECT 1 FROM org_sponsors WHERE owner_account_id = $1 AND status = 'approved' LIMIT 1`,
      [accountId]
    );
    return r.rowCount > 0;
  }

  return {
    createSponsorshipPending, markSponsorshipPaid, moderateSponsorship,
    acceptSponsorship, declineSponsorship, getActiveSponsorshipsForTarget,
    getInboundSponsorships, listPendingModerationSponsorships, getSponsorship,
    createOrgSponsorApplication, listPendingOrgSponsors, moderateOrgSponsor,
    isApprovedOrgSponsor,
  };
}

function mountRoutes({ router, express, deps, requireAuth }) {
  const { db, magV3, isSuperuser, getStripe, getSiteUrl } = deps;

  // ---------------------------------------------------------------
  // 4 — Org sponsorships
  // ---------------------------------------------------------------
  router.post('/sponsorships/checkout', express.json(), requireAuth, async (req, res) => {
    try {
      const sponsorAccountId = req.session.accountId;
      // Review fix: only sponsors that have completed org-onboarding moderation
      // (or superusers) may purchase a sponsorship slot. This prevents random
      // accounts from putting paid copy on someone else's profile.
      if (!isSuperuser(req) && !(await magV3.isApprovedOrgSponsor(sponsorAccountId))) {
        return res.status(403).json({
          error: 'Your organisation must be approved before purchasing sponsorship slots.',
          needs_org_onboarding: true,
        });
      }
      const { targetAccountId, headline, bodyMd, imageUrl, linkUrl } = req.body || {};
      if (!targetAccountId || !headline) {
        return res.status(400).json({ error: 'targetAccountId and headline are required' });
      }
      if (typeof headline !== 'string' || headline.length > 80) {
        return res.status(400).json({ error: 'headline must be a string ≤80 chars' });
      }
      if (bodyMd && (typeof bodyMd !== 'string' || bodyMd.length > 500)) {
        return res.status(400).json({ error: 'bodyMd must be ≤500 chars' });
      }
      // SECURITY (round-4): reject non-http(s) link/image URLs server-side.
      if (linkUrl && !_isSafeHttpUrl(linkUrl)) {
        return res.status(400).json({ error: 'linkUrl must be an absolute http(s) URL' });
      }
      if (imageUrl && !_isSafeHttpUrl(imageUrl)) {
        return res.status(400).json({ error: 'imageUrl must be an absolute http(s) URL' });
      }
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });
      const baseUrl = getSiteUrl();
      // Connect rev-share (round-4): if the sponsorship target is a
      // payouts-active coach (i.e. has Stripe Connect Express set up via the
      // coaching marketplace), route SPONSORSHIP_REVSHARE_BPS basis points of
      // each monthly invoice to them as a destination charge with an
      // application fee. Players without Connect onboarding still receive
      // 100% platform retention so the existing flow continues to work.
      let revshareConfig = null;
      try {
        if (typeof db.getCoachByAccountId === 'function') {
          const coach = await db.getCoachByAccountId(targetAccountId);
          if (coach?.stripe_account_id && coach?.status === 'active') {
            const targetBps = SPONSORSHIP_REVSHARE_BPS;
            const platformFeeCents = Math.round(
              SPONSORSHIP_MONTHLY_PRICE_CENTS * (10000 - targetBps) / 10000
            );
            revshareConfig = {
              destination: coach.stripe_account_id,
              application_fee_percent: Math.round((10000 - targetBps) / 100),
              platform_fee_cents: platformFeeCents,
              target_share_cents: SPONSORSHIP_MONTHLY_PRICE_CENTS - platformFeeCents,
            };
          }
        }
      } catch { /* fall through — no rev share */ }
      const sessionParams = {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'aud',
            recurring: { interval: 'month' },
            product_data: {
              name: 'OCE Inhouse — Org Sponsorship Slot (monthly)',
              description: 'One profile sponsorship slot, billed monthly. Cancel anytime.',
            },
            unit_amount: SPONSORSHIP_MONTHLY_PRICE_CENTS,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/sponsorships/sent?checkout=success`,
        cancel_url: `${baseUrl}/sponsorships/sent?checkout=cancelled`,
        metadata: {
          purpose: 'org_sponsorship',
          sponsor_account_id: String(sponsorAccountId),
          target_account_id: String(targetAccountId),
          revshare_target_bps: revshareConfig ? String(SPONSORSHIP_REVSHARE_BPS) : '0',
        },
      };
      if (revshareConfig) {
        // Subscription destination charges: routes funds to the connected
        // account, applies an application_fee_percent that stays with the
        // platform. Same plumbing the coaching booking checkout uses.
        sessionParams.subscription_data = {
          application_fee_percent: revshareConfig.application_fee_percent,
          transfer_data: { destination: revshareConfig.destination },
        };
      }
      const session = await stripe.checkout.sessions.create(sessionParams);
      const row = await magV3.createSponsorshipPending({
        sponsorAccountId, targetAccountId,
        headline, bodyMd, imageUrl, linkUrl,
        stripeSessionId: session.id,
      });
      res.json({ url: session.url, sponsorship_id: row.id });
    } catch (err) {
      console.error('[API] sponsorships/checkout:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout' });
    }
  });

  router.get('/me/sponsorships/inbox', requireAuth, async (req, res) => {
    try {
      const rows = await magV3.getInboundSponsorships(req.session.accountId);
      res.json({ sponsorships: rows });
    } catch (err) {
      console.error('[API] sponsorships/inbox:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/sponsorships/:id/accept', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const row = await magV3.acceptSponsorship(id, req.session.accountId);
      if (!row) return res.status(404).json({ error: 'No matching pending sponsorship for this account.' });
      res.json({ sponsorship: row });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/sponsorships/:id/decline', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const row = await magV3.declineSponsorship(id, req.session.accountId);
      if (!row) return res.status(404).json({ error: 'No matching sponsorship for this account.' });
      res.json({ sponsorship: row });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/players/:id/sponsorships', async (req, res) => {
    try {
      const accountId = parseInt(req.params.id, 10);
      const rows = await magV3.getActiveSponsorshipsForTarget(accountId);
      // Public — only safe fields (no internal IDs / sponsor account).
      res.json({
        sponsorships: rows.map(r => ({
          headline: r.headline, body_md: r.body_md,
          image_url: r.image_url, link_url: r.link_url,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin moderation queue.
  router.get('/admin/sponsorships/pending', async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'Superuser only' });
    try {
      const rows = await magV3.listPendingModerationSponsorships();
      res.json({ sponsorships: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/sponsorships/:id/moderate', express.json(), async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'Superuser only' });
    try {
      const id = parseInt(req.params.id, 10);
      const { approve, notes } = req.body || {};
      const row = await magV3.moderateSponsorship(id, {
        approve: !!approve,
        moderatorAccountId: req.session?.accountId || null,
        notes,
      });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json({ sponsorship: row });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------
  // 4 (review fix) — Org sponsor onboarding application + moderation.
  // ---------------------------------------------------------------
  router.post('/orgs/onboard', express.json(), requireAuth, async (req, res) => {
    try {
      const ownerAccountId = req.session.accountId;
      const { orgName, website, contactEmail, description } = req.body || {};
      if (!orgName || typeof orgName !== 'string' || orgName.length > 80) {
        return res.status(400).json({ error: 'orgName required (≤80 chars)' });
      }
      if (description && (typeof description !== 'string' || description.length > 1000)) {
        return res.status(400).json({ error: 'description ≤1000 chars' });
      }
      const row = await magV3.createOrgSponsorApplication({
        ownerAccountId, orgName, website: website || null,
        contactEmail: contactEmail || null, description: description || null,
      });
      res.json({ application: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.get('/admin/orgs/pending', async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const rows = await magV3.listPendingOrgSponsors();
      res.json({ pending: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post('/admin/orgs/:id/moderate', express.json(), async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const id = parseInt(req.params.id, 10);
      const { approve, notes } = req.body || {};
      const row = await magV3.moderateOrgSponsor(id, {
        approve: !!approve, moderatorAccountId: req.session?.accountId || 0,
        notes: notes || null,
      });
      if (!row) return res.status(404).json({ error: 'No such application.' });
      res.json({ application: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}

module.exports = { createDb, mountRoutes };
