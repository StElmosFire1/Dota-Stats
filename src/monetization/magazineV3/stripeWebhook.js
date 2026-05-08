/**
 * Stripe webhook dispatcher for the Magazine v3 monetization bundle.
 *
 * Called from src/web/server.js's verified-signature webhook handler with
 * the parsed `purpose` from session.metadata. This file is the ONLY place
 * that flips perks/sponsorships from pending → active, anchoring the
 * "no payment without verified webhook" guarantee in the threat model.
 */

async function handleStripeWebhookPurpose({ purpose, session, db, magV3, log }) {
  if (purpose === 'verified_badge') {
    const accountId = session.metadata?.account_id;
    const provider = session.metadata?.provider;
    const handle = session.metadata?.handle;
    if (!accountId || !provider || !handle) {
      log.warn('[mag-v3] verified_badge webhook missing metadata');
      return;
    }
    // SECURITY (Task #157 review fix): payment alone does NOT grant a
    // verified badge — that would let anyone "buy verified" and undermine
    // the badge's authenticity. The paid checkout funds *processing* of
    // a verification request. We:
    //   1. Grant a `pending_verification:<provider>` perk so the user can
    //      see their request was received.
    //   2. Insert a row into `verified_badges` with `source='pending'`
    //      AND `revoked_at = NOW()` so it is NOT exposed by
    //      getVerifiedBadges(). The badge only flips to `verified` after
    //      either an OAuth handshake or a superuser approval (see the
    //      `/api/admin/verified/:id/approve` route).
    const perk = await magV3.grantOneOffPerk({
      accountId, perkKey: `pending_verification:${provider}`,
      source: 'stripe',
      stripeSessionId: session.id,
      stripePaymentIntent: session.payment_intent || null,
      amountCents: session.amount_total || null,
      currency: session.currency || null,
      metadata: { provider, handle, status: 'pending_verification' },
    });
    await magV3.createPendingVerificationRequest({
      accountId, provider, handle, oneOffPerkId: perk?.id || null,
    });
    log.log('[mag-v3] verified_badge: pending_verification recorded', accountId, provider);
    return;
  }
  if (purpose === 'org_sponsorship') {
    const row = await magV3.markSponsorshipPaid(
      session.id,
      session.subscription || null,
    );
    if (row) log.log('[mag-v3] sponsorship paid -> moderation', row.id);
    else log.warn('[mag-v3] org_sponsorship webhook: no row for session', session.id);
    return;
  }
  if (purpose === 'one_off_perk') {
    const accountId = session.metadata?.account_id;
    const perkKey = session.metadata?.perk_key;
    if (!accountId || !perkKey) return;
    await magV3.grantOneOffPerk({
      accountId, perkKey, source: 'stripe',
      stripeSessionId: session.id,
      stripePaymentIntent: session.payment_intent || null,
      amountCents: session.amount_total || null,
      currency: session.currency || null,
    });
    log.log('[mag-v3] one_off_perk granted', accountId, perkKey);
    return;
  }
}

module.exports = { handleStripeWebhookPurpose };
