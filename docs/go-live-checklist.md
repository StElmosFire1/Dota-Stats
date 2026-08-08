# Production go-live checklist

The single authoritative checklist for taking `oceinhouse.gg` (full edition) live
with real payments. Work through it top to bottom; every box should be `[x]`
before opening the site to the public. Same tick conventions as
`docs/site-smoke-test.md` (`[ ]` unchecked · `[x]` good · `[!]` issue, note below).

Payments stay on **Stripe** for everything: Pro subscriptions, one-off cosmetic
perks, season buy-ins, and Stripe Connect escrow for coaching/tournament payouts.
Your share lands in your Stripe balance and pays out to your linked bank account
from the Stripe dashboard — no in-app withdrawal step exists or is needed.

---

## 1. Stripe live mode

Do this on the prod bot host (`~/Dota-Stats-Full`, PM2 process `oi-bot`), with
the owner + agent together. Full deploys are owner-run (the agent has no SSH to
the host) — the agent prepares paste blocks, the owner runs them.

- [ ] **Live secret key set** — replace `STRIPE_SECRET_KEY` with the `sk_live_...`
      key in the PM2 process env, then `pm2 restart oi-bot --update-env`.
- [ ] **Boot key-mode gate passes** — startup logs
      `[Stripe] Key mode OK — live key matches NODE_ENV=production`.
      If it instead logs `KEY MODE MISMATCH` and exits, the key and `NODE_ENV`
      disagree — fix the key, never ship with `STRIPE_ALLOW_MODE_MISMATCH=1`.
- [ ] **Live webhook endpoint registered** — in the Stripe dashboard (live mode),
      add endpoint `https://oceinhouse.gg/api/stripe/webhook` with the events the
      test-mode endpoint subscribes to (at minimum: `checkout.session.completed`,
      `charge.refunded`, `charge.dispute.*`, `payment_intent.succeeded`,
      `payment_intent.payment_failed`, `invoice.*`, `customer.subscription.*`,
      `account.updated`).
- [ ] **Live webhook secret set** — copy the endpoint's `whsec_...` into
      `STRIPE_WEBHOOK_SECRET` in the PM2 env and restart.
- [ ] **Live price IDs** — recreate products/prices in live mode and update
      `STRIPE_PRO_MONTHLY_PRICE_ID` (and any other price-ID env vars) — live and
      test mode do NOT share products.
- [ ] **Payout bank account linked** — Stripe dashboard → Settings → Payouts
      shows a verified bank account and an automatic payout schedule.
- [ ] **Connect live mode ready** — Connect settings (branding, platform profile)
      completed in live mode; note that all coaches must re-onboard in live mode
      (test-mode `acct_...` ids do not exist under the live key; the feature-health
      key-mode probe spot-checks a small sample of active coach accounts, so treat
      it as an early-warning signal, not proof that every account was re-onboarded).
- [ ] **One real payment + refund** — owner buys the cheapest one-off perk with a
      real card, confirms the perk activates (webhook path, not redirect), then
      refunds it from the Stripe dashboard and confirms the perk is revoked and
      the refund shows in the admin Payment Review page.

> Notes:

---

## 2. Environment

Reference: `docs/env-vars.md` (authoritative per-variable detail). The Task #856
fail-fast gate refuses to boot production with critical vars missing.

- [ ] `NODE_ENV=production` on the PM2 process.
- [ ] `SESSION_SECRET` — 32+ chars, **stable across restarts** (rotating it logs
      everyone out on every deploy).
- [ ] `SESSION_COOKIE_DOMAIN` / `CANONICAL_HOST` — defaults are correct for
      `oceinhouse.gg` in production; only set to override.
- [ ] `SUPERUSER_STEAM_IDS` — co-owner Steam account ids listed (the owner's id
      is a hardcoded always-on default, so this can't lock the owner out).
- [ ] `DATABASE_URL`, `DISCORD_TOKEN` set; `STRIPE_SECRET_KEY` +
      `STRIPE_WEBHOOK_SECRET` covered in section 1.
- [ ] `DISABLE_STEAM=true` — **intentional**: the auto-lobby system never shipped,
      so Steam stays off at launch. `/inhouse` lobby flow fails soft; everything
      else runs. Do not "fix" this.
- [ ] `ERROR_ALERT_WEBHOOK_URL` — set so uncaught errors/500s ping a Discord
      channel.
- [ ] Lockdown: turn the site-lockdown toggle OFF (AdminPanel → Overview) at the
      go-live moment; leave `FULL_SITE_LOCKDOWN` unset so the DB toggle stays in
      control.

> Notes:

---

## 3. Smoke run (owner)

- [ ] Complete a full pass of `docs/site-smoke-test.md` against the live site
      and paste the ticked document back into chat.
- Record it here:

| Date | Commit SHA | Result | Notes |
|------|-----------|--------|-------|
|      |           |        |       |

> Notes:

---

## 4. Rollback (paste-ready, owner-run on the bot host)

If a deploy goes bad, roll back to the previous good commit — `deploy.sh` re-runs
every hard gate (tests, money paths, migrations, health check) on the way back:

```bash
cd ~/Dota-Stats-Full
git fetch origin && git log --oneline origin/main -10   # find the last good SHA
DEPLOY_REF=<previous-good-sha> bash deploy.sh
```

`DEPLOY_REF` pins the deploy to that exact commit (a plain `git reset` would be
undone by the script's own `git reset --hard origin/main`).

Notes:
- `deploy.sh` already fails loudly (with recent PM2 logs) if the post-restart
  health check never reports `ok:true`, so a broken build is never silently left live.
- Database migrations are forward-only; if a migration itself must be reverted,
  restore from the pre-deploy `pg_dump` backup per `migrations/README.md` BEFORE
  resetting the code.
- Emergency lock: set `FULL_SITE_LOCKDOWN=1` + `pm2 restart oi-bot --update-env`
  to gate the whole site behind owner sign-in while you repair.

---

## 5. Known-resolved items (do not re-litigate)

- **Lockdown login persistence** — signing in with Steam while the lockdown gate
  is on used to drop the superuser flag and re-trigger the gate. Fixed (Task #708):
  the Steam-login session regenerate carries the superuser flag forward (admin is
  deliberately re-derived live from the role table). Guarded by
  `tests/lockdownGateTokenExchange.test.js` and `tests/superuserSteamAllowlist.test.js`,
  which run in the hard deploy gate (`npm test`) on every deploy.
- **Test-vs-live key confusion** — impossible to boot prod with a test key (or
  dev with a live key): `src/payments/stripeKeyMode.js` exits at startup on
  mismatch, and the feature-health probe continuously re-verifies against
  Stripe's own `livemode` plus a sample of Connect accounts.
- **Public-URL reachability** — `deploy.sh` health-checks localhost AND (in
  production, or when `PUBLIC_HEALTH_URL` is set) the public site, so a
  DNS/proxy/TLS breakage fails the deploy loudly instead of passing on localhost.
