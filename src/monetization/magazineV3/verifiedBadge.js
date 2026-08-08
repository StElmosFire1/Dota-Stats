/**
 * Feature 7 — Verified badges (paid + admin-approved + code-challenge proof).
 *
 * Trust model:
 *   - paid checkout (`/verified/checkout`) records a `pending` row that is
 *     NOT shown publicly until either an admin approves it or the user
 *     completes the code-challenge proof flow
 *   - code-challenge flow (`/verified/challenge/start` + `/check`) is the
 *     OAuth alternative — issues a one-time code, fetches the public proof
 *     URL (with SSRF guard), substring-matches the code, then promotes the
 *     row to `verified`
 *   - 180-day expiry; a nightly worker tick flips expired rows back to
 *     `pending` so the user must re-prove
 */

const { ALLOWED_VERIFIED_PROVIDERS, VERIFIED_BADGE_PRICE_CENTS } = require('./constants');
const { _isSafeHttpUrl, _assertPublicHttpUrl } = require('./urlSafety');
const { idem, idemBucket } = require('../../payments/stripeIdem');

function createDb({ getPool }) {
  // ---- Round-4: verified-badge code challenge + email opt-in helpers ----
  function _generateChallengeCode() {
    // 16 hex chars (~64 bits) is plenty: collision space is per-account.
    const crypto = require('crypto');
    return 'OI-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  async function createVerificationChallenge({ accountId, provider, handle, proofUrl }) {
    if (!ALLOWED_VERIFIED_PROVIDERS.has(provider) && provider !== 'steam') {
      throw new Error('Bad provider');
    }
    if (!_isSafeHttpUrl(proofUrl)) throw new Error('proofUrl must be http(s)');
    if (typeof handle !== 'string' || handle.length === 0 || handle.length > 80) {
      throw new Error('Bad handle');
    }
    const code = _generateChallengeCode();
    const p = getPool();
    const r = await p.query(
      `INSERT INTO verified_badge_challenges
        (account_id, provider, handle, proof_url, challenge_code)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (account_id, provider) DO UPDATE
         SET handle = EXCLUDED.handle,
             proof_url = EXCLUDED.proof_url,
             challenge_code = EXCLUDED.challenge_code,
             created_at = NOW(),
             attempts_count = 0,
             last_attempt_at = NULL,
             verified_at = NULL,
             expires_at = NOW() + INTERVAL '24 hours'
       RETURNING *`,
      [accountId, provider, handle, proofUrl, code]
    );
    return r.rows[0];
  }

  async function getActiveVerificationChallenge(accountId, provider) {
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM verified_badge_challenges
        WHERE account_id = $1 AND provider = $2 AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1`,
      [accountId, provider]
    );
    return r.rows[0] || null;
  }

  // Mark a challenge as completed and promote the pending verified_badges
  // row to status='verified'. Caller is responsible for the actual fetch +
  // substring-match (kept out of the DB layer so it can be unit-tested).
  async function completeVerificationChallenge(challengeId) {
    const p = getPool();
    const c = await p.query(
      `UPDATE verified_badge_challenges
          SET verified_at = NOW(), last_attempt_at = NOW()
        WHERE id = $1 AND verified_at IS NULL
        RETURNING *`,
      [challengeId]
    );
    const ch = c.rows[0];
    if (!ch) return null;
    // Upsert the verified_badges row to verified status. 180-day expiry
    // matches the admin-approval path so the worker re-checks every 6 mo.
    await p.query(
      `INSERT INTO verified_badges
        (account_id, provider, handle, source, status, approved_at, expires_at, revoked_at)
       VALUES ($1,$2,$3,'code_challenge','verified', NOW(),
               NOW() + INTERVAL '180 days', NULL)
       ON CONFLICT (account_id, provider) DO UPDATE
         SET handle = EXCLUDED.handle, source = 'code_challenge',
             status = 'verified', approved_at = NOW(),
             expires_at = NOW() + INTERVAL '180 days', revoked_at = NULL`,
      [ch.account_id, ch.provider, ch.handle]
    );
    return ch;
  }

  // ---- 7: verified badges ----
  async function getVerifiedBadges(accountId) {
    if (!accountId) return [];
    const p = getPool();
    const r = await p.query(
      // Round-6 hardening: explicitly require status='verified' as well
      // as revoked_at IS NULL. Belt-and-braces — current write paths keep
      // the two in sync (pending rows are inserted with revoked_at=NOW(),
      // and only completeVerificationChallenge / admin-approve flips both)
      // but a future code path that clears revoked_at without bumping
      // status would otherwise mis-grant trust. Status filter prevents that.
      `SELECT id, provider, handle, verified_at, expires_at, source
         FROM verified_badges
        WHERE account_id = $1
          AND status = 'verified'
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY verified_at DESC`,
      [accountId]
    );
    return r.rows;
  }

  async function upsertVerifiedBadge({ accountId, provider, handle, source = 'oauth', oneOffPerkId = null, expiresAt = null }) {
    const p = getPool();
    const r = await p.query(
      `INSERT INTO verified_badges (account_id, provider, handle, source, one_off_perk_id, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (account_id, provider) DO UPDATE
         SET handle = EXCLUDED.handle,
             source = EXCLUDED.source,
             one_off_perk_id = EXCLUDED.one_off_perk_id,
             expires_at = EXCLUDED.expires_at,
             revoked_at = NULL,
             verified_at = NOW()
       RETURNING *`,
      [accountId, provider, handle, source, oneOffPerkId, expiresAt]
    );
    return r.rows[0];
  }

  // ---- 7 (review fix): pending verification + admin approval ----
  async function createPendingVerificationRequest({ accountId, provider, handle, oneOffPerkId = null }) {
    const p = getPool();
    // Insert as status='pending' AND revoked_at=NOW() so getVerifiedBadges()
    // (which filters revoked_at IS NULL) does NOT surface it as verified.
    const r = await p.query(
      `INSERT INTO verified_badges
         (account_id, provider, handle, source, one_off_perk_id, status, revoked_at)
       VALUES ($1,$2,$3,'paid',$4,'pending', NOW())
       ON CONFLICT (account_id, provider) DO UPDATE
         SET handle = EXCLUDED.handle,
             one_off_perk_id = EXCLUDED.one_off_perk_id,
             status = CASE WHEN verified_badges.status = 'verified'
                            THEN verified_badges.status
                            ELSE 'pending' END,
             revoked_at = CASE WHEN verified_badges.status = 'verified'
                                THEN verified_badges.revoked_at
                                ELSE NOW() END
       RETURNING *`,
      [accountId, provider, handle, oneOffPerkId]
    );
    return r.rows[0];
  }

  async function listPendingVerifications() {
    const p = getPool();
    const r = await p.query(
      `SELECT id, account_id, provider, handle, verified_at, one_off_perk_id
         FROM verified_badges
        WHERE status = 'pending'
        ORDER BY verified_at ASC
        LIMIT 100`
    );
    return r.rows;
  }

  async function approveVerification(id, moderatorAccountId) {
    const p = getPool();
    const r = await p.query(
      `UPDATE verified_badges
          SET status = 'verified',
              source = 'admin',
              approved_by = $2,
              approved_at = NOW(),
              revoked_at = NULL,
              verified_at = NOW(),
              expires_at = NOW() + INTERVAL '180 days'
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [id, moderatorAccountId]
    );
    return r.rows[0] || null;
  }

  async function rejectVerification(id, moderatorAccountId, reason) {
    const p = getPool();
    const r = await p.query(
      `UPDATE verified_badges
          SET status = 'rejected',
              approved_by = $2,
              approved_at = NOW(),
              revoked_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [id, moderatorAccountId]
    );
    return r.rows[0] || null;
  }

  // Periodic re-check: any verified badge older than expires_at flips back
  // to 'pending' (and revoked_at=NOW()) so the user must re-prove.
  async function expireStaleVerifiedBadges() {
    const p = getPool();
    const r = await p.query(
      `UPDATE verified_badges
          SET status = 'pending',
              revoked_at = NOW()
        WHERE status = 'verified'
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
        RETURNING id, account_id, provider`
    );
    return r.rows;
  }

  return {
    _generateChallengeCode,
    createVerificationChallenge, getActiveVerificationChallenge,
    completeVerificationChallenge,
    getVerifiedBadges, upsertVerifiedBadge,
    createPendingVerificationRequest, listPendingVerifications,
    approveVerification, rejectVerification, expireStaleVerifiedBadges,
  };
}

function mountRoutes({ router, express, deps, requireAuth }) {
  const { db, magV3, isSuperuser, getStripe, getSiteUrl } = deps;

  // ---------------------------------------------------------------
  // 7 — Verified badges
  // ---------------------------------------------------------------
  router.get('/players/:id/verified-badges', async (req, res) => {
    try {
      const accountId = parseInt(req.params.id, 10);
      const rows = await magV3.getVerifiedBadges(accountId);
      // Public — strip internal columns.
      res.json({
        badges: rows.map(b => ({
          provider: b.provider, handle: b.handle,
          verified_at: b.verified_at, source: b.source,
        })),
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/verified/checkout', express.json(), requireAuth, async (req, res) => {
    try {
      const { provider, handle } = req.body || {};
      if (!ALLOWED_VERIFIED_PROVIDERS.has(provider)) {
        return res.status(400).json({ error: `provider must be one of ${[...ALLOWED_VERIFIED_PROVIDERS].join(', ')}` });
      }
      if (typeof handle !== 'string' || handle.length < 1 || handle.length > 64) {
        return res.status(400).json({ error: 'handle must be 1-64 chars' });
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
            product_data: {
              name: `OCE Inhouse — Verified ${provider} badge`,
              description: `One-off verified badge linking your OCE Inhouse profile to @${handle} on ${provider}.`,
            },
            unit_amount: VERIFIED_BADGE_PRICE_CENTS,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/settings/profile?verified=${provider}`,
        cancel_url: `${baseUrl}/settings/profile?verified=cancelled`,
        metadata: {
          purpose: 'verified_badge',
          account_id: String(req.session.accountId),
          provider, handle,
        },
      }, idem('checkout', 'verified_badge', req.session.accountId, provider, handle, idemBucket()));
      res.json({ url: session.url });
    } catch (err) {
      console.error('[API] verified/checkout:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // OAuth-style verification — graceful: returns 503 when secrets missing
  // so the frontend can fall back to the paid path.
  router.post('/verified/oauth/start', express.json(), requireAuth, async (req, res) => {
    const { provider } = req.body || {};
    if (!ALLOWED_VERIFIED_PROVIDERS.has(provider)) {
      return res.status(400).json({ error: 'Bad provider' });
    }
    const envKey = `${provider.toUpperCase()}_OAUTH_CLIENT_ID`;
    if (!process.env[envKey]) {
      return res.status(503).json({
        error: `${provider} OAuth not configured. Use the paid verification path instead.`,
        oauth_unavailable: true,
      });
    }
    res.status(501).json({ error: 'OAuth flow not yet wired in this build.' });
  });

  // ---------------------------------------------------------------
  // 7 (round-4) — Code-challenge verification flow.
  // OAuth alternative that works without per-provider client IDs.
  // Flow: (1) user posts handle + public profile URL; we issue a one-time
  // code. (2) user pastes the code on that public profile. (3) user hits
  // /check; we fetch the URL and match the substring. (4) on success we
  // upsert the verified_badges row to status='verified' (180-day expiry).
  // ---------------------------------------------------------------
  router.post('/verified/challenge/start', express.json(), requireAuth, async (req, res) => {
    try {
      const { provider, handle, proofUrl } = req.body || {};
      const ch = await magV3.createVerificationChallenge({
        accountId: req.session.accountId,
        provider, handle, proofUrl,
      });
      res.json({
        challenge_id: ch.id,
        provider: ch.provider,
        challenge_code: ch.challenge_code,
        proof_url: ch.proof_url,
        expires_at: ch.expires_at,
        instructions: `Paste the code "${ch.challenge_code}" anywhere on the public profile at ${ch.proof_url} and then call /api/verified/challenge/check.`,
      });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Failed to create challenge' });
    }
  });

  router.post('/verified/challenge/check', express.json(), requireAuth, async (req, res) => {
    try {
      const { provider } = req.body || {};
      const ch = await magV3.getActiveVerificationChallenge(req.session.accountId, provider);
      if (!ch) {
        return res.status(404).json({ error: 'No active challenge — start one first.' });
      }
      // Bound attempts so this can't be used to hammer arbitrary URLs.
      if ((ch.attempts_count || 0) >= 6) {
        return res.status(429).json({ error: 'Too many attempts — wait for the challenge to expire.' });
      }
      // SECURITY (round-5 review): SSRF hardening. Even though the URL was
      // validated as http(s) at /start time, an attacker could still target
      // internal services (localhost, 169.254.x metadata endpoints, RFC1918
      // ranges). Resolve the hostname and reject any address that's not a
      // public unicast IP before we ever issue the request.
      try {
        await _assertPublicHttpUrl(ch.proof_url);
      } catch (e) {
        await db.getPool().query(
          `UPDATE verified_badge_challenges
              SET attempts_count = attempts_count + 1, last_attempt_at = NOW()
            WHERE id = $1`, [ch.id]);
        return res.status(400).json({ error: `Proof URL rejected: ${e.message}` });
      }
      // Best-effort fetch with a tight timeout. Fetch is built-in on Node 18+.
      let body = '';
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(ch.proof_url, {
          signal: ctrl.signal,
          redirect: 'error', // don't follow into private ranges
          headers: { 'User-Agent': 'OCEInhouse-Verifier/1.0' },
        });
        clearTimeout(timer);
        if (r.ok) body = (await r.text()).slice(0, 200_000);
      } catch (e) {
        // Increment attempt counter so a broken URL doesn't loop forever.
        await db.getPool().query(
          `UPDATE verified_badge_challenges
              SET attempts_count = attempts_count + 1, last_attempt_at = NOW()
            WHERE id = $1`, [ch.id]);
        return res.status(502).json({ error: `Could not fetch proof URL: ${e.message}` });
      }
      const found = body.includes(ch.challenge_code);
      await db.getPool().query(
        `UPDATE verified_badge_challenges
            SET attempts_count = attempts_count + 1, last_attempt_at = NOW()
          WHERE id = $1`, [ch.id]);
      if (!found) {
        return res.status(400).json({
          error: `Challenge code "${ch.challenge_code}" not found at the proof URL. Make sure it is publicly visible (no privacy gates) and try again.`,
        });
      }
      const result = await magV3.completeVerificationChallenge(ch.id);
      res.json({ verified: true, challenge: result });
    } catch (err) {
      console.error('[API] verified/challenge/check:', err.message);
      res.status(500).json({ error: err.message || 'Verification failed' });
    }
  });

  // ---------------------------------------------------------------
  // 7 (review fix) — Verified-badge admin approval routes.
  // Replaces the old "buy verified instantly" model: paid checkout files
  // a pending request, a superuser must explicitly approve or reject.
  // OAuth flow remains the alternate fast-path (still 503 until configured).
  // ---------------------------------------------------------------
  router.get('/admin/verified/pending', async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const rows = await magV3.listPendingVerifications();
      res.json({ pending: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post('/admin/verified/:id/approve', express.json(), async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const id = parseInt(req.params.id, 10);
      const row = await magV3.approveVerification(id, req.session?.accountId || 0);
      if (!row) return res.status(404).json({ error: 'No matching pending request.' });
      res.json({ verified: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post('/admin/verified/:id/reject', express.json(), async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const id = parseInt(req.params.id, 10);
      const row = await magV3.rejectVerification(id, req.session?.accountId || 0, req.body?.reason || null);
      if (!row) return res.status(404).json({ error: 'No matching pending request.' });
      res.json({ rejected: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}

module.exports = { createDb, mountRoutes };
