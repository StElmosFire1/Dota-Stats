---
name: Public API SDKs
description: Where the official client libraries live and the invariant that keeps them correct.
---

# Public API client SDKs

Official thin clients live at repo root in `packages/sdk-js` (`@oce-inhouse/sdk`,
TypeScript) and `packages/sdk-python` (`oce-inhouse-sdk`, stdlib-only). They are
publish-ready but NOT auto-published — pushing to npm/PyPI is a manual
release-time step (no registry creds in-tree). Build output (`dist/`) and
`node_modules/` under `packages/` are gitignored.

**Invariant:** the SDK webhook verifiers must stay byte-for-byte compatible with
`src/web/webhookDispatcher.js` `signPayload` — HMAC-SHA256 over
`<timestampMs>.<rawBody>`, header `t=<ms>,v1=<hex>`, 5-minute replay window. Each
SDK has a test that signs with a local copy of that scheme and asserts the
verifier accepts it.

**Why:** integrators were hand-rolling signature checks; a drift between the
dispatcher and the SDKs would silently reject (or wrongly accept) real deliveries.

**How to apply:** if you ever change the signing scheme in webhookDispatcher,
update both SDK verifiers + their tests in lockstep. New /v1 endpoints must get an
SDK method AND a `SDK_CALLS` sample in `web/src/pages/Developers.jsx` — guarded by
`tests/developerSdkSamples.test.js`.
