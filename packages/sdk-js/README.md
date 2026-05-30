# @oce-inhouse/sdk

Official TypeScript / Node client for the [OCE Inhouse public API](https://oceinhouse.gg/developers).

- Typed method per `/v1` endpoint
- Bearer-token auth
- Automatic retry on `429` (honours `Retry-After` / `retry_after_seconds`)
- Built-in signed-webhook verifier (HMAC-SHA256 + 5-minute replay window)

## Install

```bash
npm install @oce-inhouse/sdk
```

Requires Node 18+ (uses the global `fetch`). For older runtimes, pass a `fetch`
implementation in the client options.

## Quick start

```ts
import { OceInhouseClient } from '@oce-inhouse/sdk';

const client = new OceInhouseClient({ apiKey: 'oi_pro_XXXXXXXXXXXX' });

const board = await client.leaderboard({ limit: 10 });
const profile = await client.profile('76561198000000000');
const matches = await client.matches({ limit: 50, season_id: 12 });
```

Create a key in **Settings → API & webhooks** on the site. Pick least-privilege
scopes — every endpoint enforces its required scope server-side.

### Options

```ts
new OceInhouseClient({
  apiKey: 'oi_pro_…',
  baseUrl: 'https://oceinhouse.gg', // default
  timeoutMs: 15000,                 // per-request timeout
  maxRetries: 2,                    // retries on HTTP 429
});
```

## Endpoints

| Method | Call |
| --- | --- |
| `GET /v1/status` | `client.status()` |
| `GET /v1/me` | `client.me()` |
| `GET /v1/matches` | `client.matches({ limit, offset, season_id })` |
| `GET /v1/matches/:id` | `client.match(matchId)` |
| `GET /v1/leaderboard` | `client.leaderboard({ limit, season_id })` |
| `GET /v1/profile/:id` | `client.profile(accountId)` |
| `GET /v1/teams` | `client.teams({ limit })` |
| `GET /v1/teams/:id` | `client.team(id)` |
| `GET /v1/inhouse/status` | `client.inhouseStatus()` |
| `GET /v1/tournaments` | `client.tournaments({ season_id })` |
| `GET /v1/tournaments/:id` | `client.tournament(id)` |
| `GET /v1/coaches` | `client.coaches()` |
| `GET /v1/coaches/:id/availability` | `client.coachAvailability(id)` |
| `GET /v1/webhooks` | `client.webhooks.list()` |
| `POST /v1/webhooks` | `client.webhooks.create({ url, events })` |
| `DELETE /v1/webhooks/:id` | `client.webhooks.delete(id)` |

## Errors

Non-2xx responses throw `OceInhouseApiError` with `status`, `code` (the
machine-readable `error` field, e.g. `insufficient_scope`), `body`, and
`retryAfterSeconds`.

```ts
import { OceInhouseApiError } from '@oce-inhouse/sdk';

try {
  await client.matches();
} catch (err) {
  if (err instanceof OceInhouseApiError && err.code === 'insufficient_scope') {
    // grant read:matches on your key
  }
}
```

## Verifying webhooks

We POST a signed JSON body when a subscribed event fires. **Verify against the
raw request body** — do not re-serialize the parsed JSON.

```ts
import { constructWebhookEvent } from '@oce-inhouse/sdk';
import express from 'express';

const app = express();

app.post(
  '/webhooks/oce',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    try {
      const event = constructWebhookEvent({
        payload: req.body.toString('utf8'),
        signature: req.header('X-OI-Signature') || '',
        secret: process.env.OI_WEBHOOK_SECRET!,
      });
      if (event.event === 'match.finalized') {
        // handle event.data
      }
      res.sendStatus(200);
    } catch {
      res.sendStatus(400);
    }
  },
);
```

`verifyWebhookSignature(opts)` is also exported if you just want a boolean.

## License

MIT
