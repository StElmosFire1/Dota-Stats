// Task #913 — equip-then-refund for one-off cosmetic perks: revoking a perk
// via revokeOneOffPerksByPaymentIntent must also clear the matching equipped
// / selected player_profiles value when the player no longer owns it via
// another source (Pro, coin purchase), and must LEAVE it when still owned.
//
// Same fake-pg-pool pattern as tests/refundUnequip.test.js: stub `pg` before
// requiring ../src/db so getPool() binds to an in-memory fixture.

const test = require('node:test');
const assert = require('node:assert/strict');

function makeFakePool(state) {
  // state: {
  //   perks:         [{ id, account_id, perk_key, revoked_at, stripe_payment_intent, expires_at }],
  //   coinCosmetics: [{ account_id, kind, value }],
  //   proAccounts:   Set<accountId>,
  //   profiles:      Map<accountId, { selected_voice_pack, profile_layout_theme, vanity_slug, vanity_slug_released_at }>,
  //   slugReleases:  [],
  // }
  return {
    async query(sqlRaw, params = []) {
      const sql = String(sqlRaw).replace(/\s+/g, ' ').trim();

      // revokeOneOffPerksByPaymentIntent — flip active perk rows.
      if (sql.startsWith('UPDATE user_one_off_perks SET revoked_at = NOW()')) {
        const [pi] = params;
        const hit = state.perks.filter(
          r => r.stripe_payment_intent === pi && r.revoked_at == null);
        for (const r of hit) r.revoked_at = '2026-08-09T00:00:00Z';
        return { rows: hit.map(r => ({ ...r })), rowCount: hit.length };
      }

      // hasOneOffPerk — active perk lookup.
      if (sql.startsWith('SELECT 1 FROM user_one_off_perks')) {
        const [accountId, perkKey] = params;
        const hit = state.perks.some(
          r => r.account_id === accountId && r.perk_key === perkKey && r.revoked_at == null);
        return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
      }

      // _isProMember
      if (sql.includes('FROM pro_subscriptions')) {
        const [accountId] = params;
        const pro = state.proAccounts.has(accountId);
        return { rows: pro ? [{ '?column?': 1 }] : [], rowCount: pro ? 1 : 0 };
      }

      // _hasCoinCosmetic
      if (sql.includes('SELECT 1 FROM coin_owned_cosmetics')) {
        const [accountId, kind, value] = params;
        const hit = state.coinCosmetics.some(
          c => c.account_id === accountId && c.kind === kind && c.value === value);
        return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
      }

      // hasActiveVanitySlug — grandfathered-holder checkout guard.
      if (sql.startsWith('SELECT 1 FROM player_profiles')) {
        const prof = state.profiles.get(params[0]);
        const hit = !!(prof && prof.vanity_slug != null);
        return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
      }

      // Reads of the equipped columns.
      if (sql.startsWith('SELECT selected_voice_pack FROM player_profiles')) {
        const prof = state.profiles.get(params[0]);
        return { rows: prof ? [{ selected_voice_pack: prof.selected_voice_pack }] : [], rowCount: prof ? 1 : 0 };
      }
      if (sql.startsWith('SELECT profile_layout_theme FROM player_profiles')) {
        const prof = state.profiles.get(params[0]);
        return { rows: prof ? [{ profile_layout_theme: prof.profile_layout_theme }] : [], rowCount: prof ? 1 : 0 };
      }
      if (sql.startsWith('SELECT vanity_slug FROM player_profiles')) {
        const prof = state.profiles.get(params[0]);
        // slugReadOverride simulates a stale read (concurrency race probe).
        const slug = state.slugReadOverride !== undefined ? state.slugReadOverride : prof?.vanity_slug;
        return { rows: prof ? [{ vanity_slug: slug }] : [], rowCount: prof ? 1 : 0 };
      }

      // Unequip writes.
      if (sql.startsWith('UPDATE player_profiles SET selected_voice_pack = NULL')) {
        const [accountId, pack] = params;
        const prof = state.profiles.get(accountId);
        let n = 0;
        if (prof && prof.selected_voice_pack === pack) { prof.selected_voice_pack = null; n = 1; }
        return { rows: [], rowCount: n };
      }
      if (sql.startsWith('UPDATE player_profiles SET profile_layout_theme = NULL')) {
        const [accountId, theme] = params;
        const prof = state.profiles.get(accountId);
        let n = 0;
        if (prof && prof.profile_layout_theme === theme) { prof.profile_layout_theme = null; n = 1; }
        return { rows: [], rowCount: n };
      }
      if (sql.startsWith('UPDATE player_profiles SET vanity_slug = NULL')) {
        // Slug-constrained clear: WHERE account_id = $1 AND vanity_slug = $2.
        const [accountId, slug] = params;
        const prof = state.profiles.get(accountId);
        let n = 0;
        if (prof && prof.vanity_slug != null && prof.vanity_slug === slug) {
          prof.vanity_slug = null;
          prof.vanity_slug_released_at = '2026-08-09T00:00:00Z';
          n = 1;
        }
        return { rows: n ? [{ vanity_slug: null }] : [], rowCount: n };
      }
      if (sql.startsWith('INSERT INTO vanity_slug_releases')) {
        if (state.failReleaseInsert) throw new Error('boom: release insert failed');
        const [slug, prevAccountId] = params;
        state.slugReleases.push({ slug, prev_account_id: prevAccountId });
        return { rows: [], rowCount: 1 };
      }

      throw new Error('unexpected query in fake pool: ' + sql.slice(0, 100));
    },

    // Transactional client for the vanity release (BEGIN/COMMIT/ROLLBACK).
    // Snapshots the touched profile at BEGIN and restores it on ROLLBACK so
    // the fake pool honours transaction semantics.
    async connect() {
      const pool = this;
      let snapshot = null;
      return {
        async query(sqlRaw, params = []) {
          const sql = String(sqlRaw).replace(/\s+/g, ' ').trim();
          state.txCalls.push(sql.split(' ')[0] === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' ? sql : sql.slice(0, 40));
          if (sql === 'BEGIN') {
            snapshot = new Map([...state.profiles].map(([k, v]) => [k, { ...v }]));
            return { rows: [], rowCount: 0 };
          }
          if (sql === 'COMMIT') { snapshot = null; return { rows: [], rowCount: 0 }; }
          if (sql === 'ROLLBACK') {
            if (snapshot) state.profiles = snapshot;
            snapshot = null;
            return { rows: [], rowCount: 0 };
          }
          return pool.query(sqlRaw, params);
        },
        release() {},
      };
    },
  };
}

function loadDbWithFakePool(fakePool) {
  delete require.cache[require.resolve('pg')];
  delete require.cache[require.resolve('../src/db')];
  delete require.cache[require.resolve('../src/db/index.js')];
  require.cache[require.resolve('pg')] = {
    id: require.resolve('pg'),
    filename: require.resolve('pg'),
    loaded: true,
    exports: { Pool: function FakePool() { return fakePool; } },
  };
  return require('../src/db');
}

function baseState() {
  return {
    perks: [],
    coinCosmetics: [],
    proAccounts: new Set(),
    profiles: new Map(),
    slugReleases: [],
    txCalls: [],
    failReleaseInsert: false,
    slugReadOverride: undefined,
  };
}

test('voice-pack perk refund clears the selected voice pack when nothing else owns it', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 301, perk_key: 'cosmetic:voice_pack', revoked_at: null, stripe_payment_intent: 'pi_vp_1' });
  state.profiles.set(301, { selected_voice_pack: 'captain', profile_layout_theme: null, vanity_slug: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  const revoked = await db.magV3.revokeOneOffPerksByPaymentIntent('pi_vp_1');
  assert.equal(revoked.length, 1);
  assert.equal(state.perks[0].revoked_at != null, true);
  assert.equal(state.profiles.get(301).selected_voice_pack, null,
    'selected voice pack must be cleared after the refund revokes the perk');
});

test('voice-pack perk refund keeps the pack when still owned via coins', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 302, perk_key: 'cosmetic:voice_pack', revoked_at: null, stripe_payment_intent: 'pi_vp_2' });
  state.coinCosmetics.push({ account_id: 302, kind: 'voice_pack', value: 'hype' });
  state.profiles.set(302, { selected_voice_pack: 'hype', profile_layout_theme: null, vanity_slug: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.magV3.revokeOneOffPerksByPaymentIntent('pi_vp_2');
  assert.equal(state.profiles.get(302).selected_voice_pack, 'hype',
    'coin ownership must keep the voice pack equipped after a Stripe refund');
});

test('voice-pack perk refund keeps the pack for a Pro member', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 303, perk_key: 'cosmetic:voice_pack', revoked_at: null, stripe_payment_intent: 'pi_vp_3' });
  state.proAccounts.add(303);
  state.profiles.set(303, { selected_voice_pack: 'calm', profile_layout_theme: null, vanity_slug: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.magV3.revokeOneOffPerksByPaymentIntent('pi_vp_3');
  assert.equal(state.profiles.get(303).selected_voice_pack, 'calm',
    'Pro membership must keep the voice pack equipped after a Stripe refund');
});

test('theme-pack perk refund clears a premium layout theme when nothing else owns it', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 304, perk_key: 'cosmetic:theme_pack', revoked_at: null, stripe_payment_intent: 'pi_tp_1' });
  state.profiles.set(304, { selected_voice_pack: null, profile_layout_theme: 'carbon', vanity_slug: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.magV3.revokeOneOffPerksByPaymentIntent('pi_tp_1');
  assert.equal(state.profiles.get(304).profile_layout_theme, null,
    'premium layout theme must be cleared after the refund revokes the perk');
});

test('theme-pack perk refund leaves the FREE default theme untouched', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 305, perk_key: 'cosmetic:theme_pack', revoked_at: null, stripe_payment_intent: 'pi_tp_2' });
  state.profiles.set(305, { selected_voice_pack: null, profile_layout_theme: 'court-pitch', vanity_slug: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.magV3.revokeOneOffPerksByPaymentIntent('pi_tp_2');
  assert.equal(state.profiles.get(305).profile_layout_theme, 'court-pitch',
    'free themes require no ownership and must stay equipped');
});

test('theme-pack perk refund keeps a coin-owned premium theme', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 306, perk_key: 'cosmetic:theme_pack', revoked_at: null, stripe_payment_intent: 'pi_tp_3' });
  state.coinCosmetics.push({ account_id: 306, kind: 'layout_theme', value: 'holo' });
  state.profiles.set(306, { selected_voice_pack: null, profile_layout_theme: 'holo', vanity_slug: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.magV3.revokeOneOffPerksByPaymentIntent('pi_tp_3');
  assert.equal(state.profiles.get(306).profile_layout_theme, 'holo',
    'coin ownership must keep the layout theme equipped after a Stripe refund');
});

test('vanity-url perk refund releases the slug and records the release', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 307, perk_key: 'cosmetic:vanity_url', revoked_at: null, stripe_payment_intent: 'pi_vu_1' });
  state.profiles.set(307, { selected_voice_pack: null, profile_layout_theme: null, vanity_slug: 'shadowfiend' });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.magV3.revokeOneOffPerksByPaymentIntent('pi_vu_1');
  assert.equal(state.profiles.get(307).vanity_slug, null,
    'vanity slug must be released after the refund revokes the perk');
  assert.deepEqual(state.slugReleases, [{ slug: 'shadowfiend', prev_account_id: '307' }],
    'the release must be recorded so the reclaim cooldown applies');
});

test('vanity-url perk refund keeps the slug when the add-on is coin-owned', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 308, perk_key: 'cosmetic:vanity_url', revoked_at: null, stripe_payment_intent: 'pi_vu_2' });
  state.coinCosmetics.push({ account_id: 308, kind: 'cosmetic', value: 'vanity_url' });
  state.profiles.set(308, { selected_voice_pack: null, profile_layout_theme: null, vanity_slug: 'kotl' });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.magV3.revokeOneOffPerksByPaymentIntent('pi_vu_2');
  assert.equal(state.profiles.get(308).vanity_slug, 'kotl',
    'coin ownership of the add-on must keep the slug after a Stripe refund');
  assert.equal(state.slugReleases.length, 0);
});

test('vanity-url perk refund keeps the slug when a SECOND active vanity perk row exists', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 310, perk_key: 'cosmetic:vanity_url', revoked_at: null, stripe_payment_intent: 'pi_vu_3' });
  state.perks.push({ id: 2, account_id: 310, perk_key: 'cosmetic:vanity_url', revoked_at: null, stripe_payment_intent: 'pi_vu_other' });
  state.profiles.set(310, { selected_voice_pack: null, profile_layout_theme: null, vanity_slug: 'invoker' });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.magV3.revokeOneOffPerksByPaymentIntent('pi_vu_3');
  assert.equal(state.profiles.get(310).vanity_slug, 'invoker',
    'a second active vanity entitlement must keep the slug');
  assert.equal(state.slugReleases.length, 0);
});

test('vanity release is transactional: a failed release insert rolls the slug clear back', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 311, perk_key: 'cosmetic:vanity_url', revoked_at: null, stripe_payment_intent: 'pi_vu_4' });
  state.profiles.set(311, { selected_voice_pack: null, profile_layout_theme: null, vanity_slug: 'lina' });
  state.failReleaseInsert = true;
  const db = loadDbWithFakePool(makeFakePool(state));

  // Best-effort: the revocation itself still succeeds despite the cleanup failure.
  const revoked = await db.magV3.revokeOneOffPerksByPaymentIntent('pi_vu_4');
  assert.equal(revoked.length, 1);
  assert.equal(state.txCalls.includes('ROLLBACK'), true, 'the transaction must roll back');
  assert.equal(state.profiles.get(311).vanity_slug, 'lina',
    'the slug clear must be rolled back so a partial failure cannot bypass the reclaim cooldown');
  assert.equal(state.slugReleases.length, 0);
});

test('voice-pack refund keeps the pack when a DUPLICATE active voice-pack perk row exists', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 312, perk_key: 'cosmetic:voice_pack', revoked_at: null, stripe_payment_intent: 'pi_vp_dup_1' });
  state.perks.push({ id: 2, account_id: 312, perk_key: 'cosmetic:voice_pack', revoked_at: null, stripe_payment_intent: 'pi_vp_dup_2' });
  state.profiles.set(312, { selected_voice_pack: 'cinematic', profile_layout_theme: null, vanity_slug: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.magV3.revokeOneOffPerksByPaymentIntent('pi_vp_dup_1');
  assert.equal(state.profiles.get(312).selected_voice_pack, 'cinematic',
    'a second active voice-pack entitlement must keep the pack equipped');
});

test('theme-pack refund keeps the theme when a DUPLICATE active theme-pack perk row exists', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 313, perk_key: 'cosmetic:theme_pack', revoked_at: null, stripe_payment_intent: 'pi_tp_dup_1' });
  state.perks.push({ id: 2, account_id: 313, perk_key: 'cosmetic:theme_pack', revoked_at: null, stripe_payment_intent: 'pi_tp_dup_2' });
  state.profiles.set(313, { selected_voice_pack: null, profile_layout_theme: 'broadcast', vanity_slug: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.magV3.revokeOneOffPerksByPaymentIntent('pi_tp_dup_1');
  assert.equal(state.profiles.get(313).profile_layout_theme, 'broadcast',
    'a second active theme-pack entitlement must keep the theme equipped');
});

test('vanity release never clears a slug that changed after the locked read (slug-constrained UPDATE)', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 314, perk_key: 'cosmetic:vanity_url', revoked_at: null, stripe_payment_intent: 'pi_vu_5' });
  state.profiles.set(314, { selected_voice_pack: null, profile_layout_theme: null, vanity_slug: 'newslug' });
  // Simulate a stale read: the transaction's SELECT sees the old slug while
  // the profile row already holds 'newslug'.
  state.slugReadOverride = 'oldslug';
  const db = loadDbWithFakePool(makeFakePool(state));

  await db.magV3.revokeOneOffPerksByPaymentIntent('pi_vu_5');
  assert.equal(state.profiles.get(314).vanity_slug, 'newslug',
    'the slug-constrained UPDATE must not clear a slug that no longer matches the read value');
  assert.equal(state.slugReleases.length, 0,
    'no release record may be written for a slug that was not actually cleared');
});

// ── Task #913 grandfathering guard ─────────────────────────────────────────
// A grandfathered vanity holder (active slug, no purchased perk) owns their
// slug independently of any Stripe entitlement, so buying the add-on must be
// blocked — otherwise a later refund of that redundant purchase would
// release a slug they still own.

test('hasActiveVanitySlug reflects an unreleased slug (the checkout-guard source)', async () => {
  const state = baseState();
  state.profiles.set(401, { selected_voice_pack: null, profile_layout_theme: null, vanity_slug: 'earthshaker' });
  state.profiles.set(402, { selected_voice_pack: null, profile_layout_theme: null, vanity_slug: null });
  const db = loadDbWithFakePool(makeFakePool(state));

  assert.equal(await db.magV3.hasActiveVanitySlug(401), true);
  assert.equal(await db.magV3.hasActiveVanitySlug(402), false);
  assert.equal(await db.magV3.hasActiveVanitySlug(null), false);
});

test('both vanity checkout routes refuse grandfathered holders (source-level pin)', () => {
  const fs = require('fs');
  // Dedicated shop route: 409 when an active slug exists without the perk.
  const serverSrc = fs.readFileSync(require.resolve('../src/web/server.js'), 'utf8');
  const shopStart = serverSrc.indexOf("'/shop/vanity-url/stripe-checkout'");
  assert.ok(shopStart > -1, 'shop vanity checkout route exists');
  const shopBranch = serverSrc.slice(shopStart, shopStart + 2500);
  assert.match(shopBranch, /getVanitySlugByAccount\(accountId\)/);
  assert.match(shopBranch, /curSlug\?\.slug && !curSlug\?\.released_at/);
  assert.match(shopBranch, /status\(409\)/);
  // Generic perk-catalog checkout: same guard keyed on the vanity perk.
  const perkSrc = fs.readFileSync(require.resolve('../src/monetization/magazineV3/oneOffPerks.js'), 'utf8');
  assert.match(perkSrc, /perkKey === 'cosmetic:vanity_url' && await magV3\.hasActiveVanitySlug\(accountId\)/);
});

test('refund of an unrelated perk key touches no equipped values', async () => {
  const state = baseState();
  state.perks.push({ id: 1, account_id: 309, perk_key: 'cosmetic:spotlight_credit', revoked_at: null, stripe_payment_intent: 'pi_other_1' });
  state.profiles.set(309, { selected_voice_pack: 'roast', profile_layout_theme: 'heritage', vanity_slug: 'sven' });
  const db = loadDbWithFakePool(makeFakePool(state));

  const revoked = await db.magV3.revokeOneOffPerksByPaymentIntent('pi_other_1');
  assert.equal(revoked.length, 1);
  const prof = state.profiles.get(309);
  assert.equal(prof.selected_voice_pack, 'roast');
  assert.equal(prof.profile_layout_theme, 'heritage');
  assert.equal(prof.vanity_slug, 'sven');
});
