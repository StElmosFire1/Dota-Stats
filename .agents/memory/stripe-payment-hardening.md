---
name: Stripe payment hardening
description: Durable conventions for the Stripe money paths — idempotency keys, webhook inbox claim/lease, key-mode gate.
---

- Every money-mutating Stripe call (checkout create, capture, cancel, refund) carries an idempotency key via the shared payments helper — including cron/bot-side calls, not just web routes. The same logical operation on the same row uses the same key so retries and races replay the first Stripe response instead of re-charging.
- **Why:** a retry after Stripe accepted a request but before the response landed would otherwise double-charge or double-refund.
- Webhook deliveries are persisted and atomically claimed (opaque-token lease with stale-claim takeover; terminal-status writes require the current token, so a worker that lost its lease can't overwrite the new owner) in a durable inbox before any side effect runs; already-processed replays short-circuit; the terminal status write is awaited before ACKing. If the inbox write fails, the route returns 5xx and does NOT process — Stripe's retry is the recovery path. A sweep re-claims and re-runs failed and stale rows, which is also the fulfillment-retry mechanism (no separate pending-fulfillments table).
- **How to apply:** add new webhook event types inside the central processor function, never inline in the route, and keep all fulfillment idempotent (ON CONFLICT / status-guarded) because the sweep or a concurrent worker may re-run an event.
- Startup refuses to boot on Stripe key-mode/environment mismatch (test key in prod, live in dev); an env override exists for emergencies, and a feature-health probe live-verifies mode plus sampled Connect accounts.
- Notification event keys must be registered in the notifications catalog or notify() silently drops them.
