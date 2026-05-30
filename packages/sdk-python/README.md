# oce-inhouse-sdk

Official Python client for the [OCE Inhouse public API](https://oceinhouse.gg/developers).

- One method per `/v1` endpoint
- Bearer-token auth
- Automatic retry on `429` (honours `Retry-After` / `retry_after_seconds`)
- Built-in signed-webhook verifier (HMAC-SHA256 + 5-minute replay window)
- **Zero runtime dependencies** (standard library only)

## Install

```bash
pip install oce-inhouse-sdk
```

Requires Python 3.8+.

## Quick start

```python
from oce_inhouse import OceInhouseClient

client = OceInhouseClient(api_key="oi_pro_XXXXXXXXXXXX")

board = client.leaderboard(limit=10)
profile = client.profile("76561198000000000")
matches = client.matches(limit=50, season_id=12)
```

Create a key in **Settings → API & webhooks** on the site. Pick least-privilege
scopes — every endpoint enforces its required scope server-side.

### Options

```python
OceInhouseClient(
    api_key="oi_pro_...",
    base_url="https://oceinhouse.gg",  # default
    timeout=15.0,                       # per-request timeout (seconds)
    max_retries=2,                      # retries on HTTP 429
)
```

## Endpoints

| Method | Call |
| --- | --- |
| `GET /v1/status` | `client.status()` |
| `GET /v1/me` | `client.me()` |
| `GET /v1/matches` | `client.matches(limit=..., offset=..., season_id=...)` |
| `GET /v1/matches/:id` | `client.match(match_id)` |
| `GET /v1/leaderboard` | `client.leaderboard(limit=..., season_id=...)` |
| `GET /v1/profile/:id` | `client.profile(account_id)` |
| `GET /v1/teams` | `client.teams(limit=...)` |
| `GET /v1/teams/:id` | `client.team(id)` |
| `GET /v1/inhouse/status` | `client.inhouse_status()` |
| `GET /v1/tournaments` | `client.tournaments(season_id=...)` |
| `GET /v1/tournaments/:id` | `client.tournament(id)` |
| `GET /v1/coaches` | `client.coaches()` |
| `GET /v1/coaches/:id/availability` | `client.coach_availability(id)` |
| `GET /v1/webhooks` | `client.webhooks.list()` |
| `POST /v1/webhooks` | `client.webhooks.create(url=..., events=[...])` |
| `DELETE /v1/webhooks/:id` | `client.webhooks.delete(id)` |

## Errors

Non-2xx responses raise `OceInhouseApiError` with `status`, `code` (the
machine-readable `error` field, e.g. `insufficient_scope`), `body`, and
`retry_after_seconds`.

```python
from oce_inhouse import OceInhouseApiError

try:
    client.matches()
except OceInhouseApiError as err:
    if err.code == "insufficient_scope":
        ...  # grant read:matches on your key
```

## Verifying webhooks

We POST a signed JSON body when a subscribed event fires. **Verify against the
raw request body** — do not re-serialize the parsed JSON.

```python
from oce_inhouse import construct_webhook_event, WebhookVerificationError

# Flask example
@app.post("/webhooks/oce")
def handle():
    try:
        event = construct_webhook_event(
            payload=request.get_data(as_text=True),
            signature=request.headers.get("X-OI-Signature", ""),
            secret=os.environ["OI_WEBHOOK_SECRET"],
        )
    except WebhookVerificationError:
        return "", 400
    if event["event"] == "match.finalized":
        ...  # handle event["data"]
    return "", 200
```

`verify_webhook_signature(payload, signature, secret)` is also exported if you
just want a boolean.

## License

MIT
