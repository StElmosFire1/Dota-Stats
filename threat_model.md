# Threat Model

## Project Overview

Dota 2 Inhouse Stats Bot is a Node.js application with two deployable editions: a full OCE Inhouse site and a community edition. The production system combines an Express web/API server (`src/web/server.js` and `community-edition/src/web/server.js`), React frontends (`web/src/`, `community-edition/web/src/`), a Discord bot and Steam-integrated services (`src/index.js` and related modules), PostgreSQL persistence, Stripe payments, and replay-processing services including a local Java parser and SSH-based replay retrieval.

The main production users are public visitors, signed-in Steam users, paid/pro users, coaches/students, tournament participants, and operators using upload/admin or superuser controls. Per project assumptions, only production-reachable behavior matters for this scan; mockup sandboxes and local artifacts are out of scope unless a production path is demonstrated. TLS is provided by the platform in production.

## Assets

- **User sessions and Steam identities** — authenticated sessions (`express-session` cookies), Steam account IDs, and profile-linked state. Compromise enables impersonation, signup abuse, and access to paid/user-scoped features.
- **Administrative credentials and operator privileges** — `SUPERUSER_PASSWORD`, `UPLOAD_KEY`, and any browser-held equivalents. These secrets guard match mutation, replay management, backups, inhouse controls, feature flags, and other sensitive operations.
- **Match and replay data** — recorded match metadata, parsed replay stats, stored replay paths/files, and inhouse session state. Tampering affects competitive integrity and can expose internal infrastructure details.
- **Payment and marketplace state** — Stripe checkout sessions, tournament entries, coaching bookings, dispute/refund state, and Stripe Connect onboarding. Abuse can create unauthorized charges, payouts, bookings, or financial state changes.
- **Application secrets and service credentials** — database credentials, `SESSION_SECRET`, Stripe secrets, Steam credentials, VAPID keys, and SSH/replay-fetch access. Exposure can lead to full service compromise.
- **Discord/community operations** — bot-triggered DMs, announcements, role-related actions, and live inhouse orchestration. Abuse impacts availability, trust, and community operations.

## Trust Boundaries

- **Browser to API** — all frontend requests cross from untrusted client code into the Express API. The browser must never be trusted to hold privileged backend secrets or to enforce authorization.
- **Public to authenticated user** — public pages exist alongside Steam-authenticated features such as tournament signup, coaching booking, and user-specific data. Server-side checks must bind actions to the logged-in account.
- **Authenticated user to admin/superuser** — operator-only actions are protected by shared secrets and special routes. This is a high-risk boundary because many dangerous routes mutate match data, feature flags, replay paths, server operations, and financial workflows.
- **API to PostgreSQL** — the API has broad authority over match history, tournament state, coaching records, feature flags, and user metadata. Injection or broken authorization at the route layer would expose or corrupt core business data.
- **API to external services** — Stripe, Steam/OpenID, Discord, SSH replay retrieval, and the local parser each consume trusted server-side credentials. Requests crossing these boundaries must validate origin, input, and authorization.
- **Production vs dev-only artifacts** — `artifacts/mockup-sandbox/`, attached assets, local logs, and scan artifacts are not production surfaces unless explicitly wired into runtime. Repeated scans should ignore them by default.

## Scan Anchors

- **Production entry points:** `src/index.js`, `src/web/server.js`, `community-edition/src/web/server.js`.
- **Highest-risk code areas:** auth/admin helpers near the top of both server files; Stripe/tournament/coaching routes in `src/web/server.js`; replay upload/download and dedicated-server/replay fetch paths; frontend admin credential handling in `web/src/context/*`, `community-edition/web/src/context/*`, and `web/src/api.js` / `community-edition/web/src/api.js`.
- **Public/authenticated/admin surfaces:** public stats/profile pages and some tournament/coaching reads; Steam-authenticated tournament/coaching/user routes; shared-secret-protected admin/superuser operations for match mutation, replay management, backups, feature flags, and inhouse controls.
- **Usually ignore unless proven reachable:** `artifacts/mockup-sandbox/`, `attached_assets/`, local backups/logs, generated scan output, and other non-runtime workspace files.

## Threat Categories

### Spoofing

The application relies on Steam OpenID sessions for end users and shared secrets for admin/superuser workflows. The system must ensure session cookies are signed with strong deployment-specific secrets, and every privileged route must distinguish correctly between public, signed-in, admin, and superuser callers. Webhook-like payment callbacks must verify Stripe signatures before mutating financial state.

Required guarantees:
- Production deployments of both editions MUST use strong, deployment-specific `SESSION_SECRET` values and MUST fail closed rather than accept predictable defaults.
- Shared operator credentials MUST NOT be exposed to browser JavaScript as reusable bearer secrets.
- Admin and superuser roles MUST be enforced server-side with distinct credentials and scopes where distinct roles are intended.
- Stripe webhook handlers MUST reject unsigned or improperly signed requests.

### Tampering

Many routes can change match outcomes, replay paths, tournament entries, feature flags, coaching bookings, and inhouse session state. The main tampering risk is direct HTTP access to mutating endpoints that operators believe are gated by auth, role separation, or rollout flags.

Required guarantees:
- All mutating routes MUST enforce authorization on the server, never only in the UI.
- Feature flags that are documented as rollout gates MUST actually protect the underlying routes, not just hide controls in the frontend.
- Replay, upload, and file-path inputs MUST remain constrained to intended directories and validated before use.
- Financial state transitions MUST be driven by verified server-side state, not client-supplied assertions.

### Information Disclosure

The sensitive data in this project is less about classic PII and more about operational secrets, replay paths, Stripe/session identifiers, and internal server state. Because the frontend is a full React app, any privileged secret copied into browser storage becomes reachable to XSS, malicious extensions, or other browser-compromise scenarios.

Required guarantees:
- API responses MUST not expose secrets, internal-only payment identifiers, or infrastructure details to unauthorized users.
- Browser storage MUST NOT contain reusable admin/superuser secrets.
- Error messages and logs MUST avoid leaking sensitive credentials, internal file paths, or third-party secrets.
- Replay download and stored-file metadata endpoints MUST remain properly scoped.

### Denial of Service

The application exposes expensive flows such as replay upload/parsing, Stripe-backed booking paths, Steam/Discord side effects, and large admin operations. Attackers could target public or weakly protected endpoints to create operational load or block legitimate use.

Required guarantees:
- Authentication and public-write endpoints MUST remain rate limited.
- Replay upload and parsing flows MUST continue enforcing file-size and chunk-count limits.
- External-service calls should remain bounded by timeouts and access checks before expensive work begins.
- Admin-only operational endpoints MUST stay inaccessible to normal users.

### Elevation of Privilege

This is the most important category for this codebase. The server exposes powerful operator routes for backups, replay administration, dedicated-server controls, inhouse orchestration, feature-flag changes, and payment-adjacent workflows. Any confusion between upload/admin and superuser roles, or any reuse of browser-held shared secrets, can turn a lower-trust foothold into full platform control.

Required guarantees:
- The upload/admin credential MUST NOT satisfy superuser-only authorization checks unless the design explicitly collapses those roles everywhere.
- Operator authentication MUST use scoped, revocable server-managed sessions or equivalent controls instead of long-lived shared secrets injected into arbitrary browser requests.
- Preview or disabled premium features MUST not remain reachable directly over HTTP.
- User-scoped routes for tournament, coaching, and profile actions MUST bind every operation to the authenticated account unless an explicitly authorized admin override is present.
