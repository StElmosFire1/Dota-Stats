"""Thin, dependency-free client for the OCE Inhouse public API (/v1)."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

from .errors import OceInhouseApiError

DEFAULT_BASE_URL = "https://oceinhouse.gg"
_USER_AGENT = "oce-inhouse-sdk-python/1.0"


class WebhooksResource:
    """Webhook subscription endpoints (Pro-tier keys with ``write:webhooks``)."""

    def __init__(self, client: "OceInhouseClient") -> None:
        self._client = client

    def list(self) -> Dict[str, Any]:
        """``GET /v1/webhooks`` — list this account's subscriptions."""
        return self._client._request("GET", "/webhooks")

    def create(self, url: str, events: List[str]) -> Dict[str, Any]:
        """``POST /v1/webhooks`` — create a subscription."""
        return self._client._request(
            "POST", "/webhooks", body={"url": url, "events": events}
        )

    def delete(self, webhook_id: int) -> Dict[str, Any]:
        """``DELETE /v1/webhooks/:id`` — delete a subscription."""
        return self._client._request("DELETE", f"/webhooks/{webhook_id}")


class OceInhouseClient:
    """Typed-ish client for the OCE Inhouse public API.

    One method per ``/v1`` endpoint, bearer auth, and automatic retry on 429.

    >>> client = OceInhouseClient(api_key="oi_pro_...")
    >>> board = client.leaderboard(limit=10)
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 15.0,
        max_retries: int = 2,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.webhooks = WebhooksResource(self)

    # ---- transport -------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Dict[str, Any]] = None,
        body: Optional[Any] = None,
        auth: bool = True,
    ) -> Any:
        url = f"{self.base_url}/v1{path}"
        if query:
            params = {
                k: v for k, v in query.items() if v is not None and v != ""
            }
            if params:
                url = f"{url}?{urllib.parse.urlencode(params)}"

        headers = {"Accept": "application/json", "User-Agent": _USER_AGENT}
        if auth and self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        attempt = 0
        while True:
            status, parsed, retry_after = self._send(method, url, headers, data)

            if status == 429 and attempt < self.max_retries:
                wait = retry_after if retry_after is not None else 2 ** attempt
                attempt += 1
                time.sleep(max(0.0, wait))
                continue

            if status < 200 or status >= 300:
                code = None
                message = f"HTTP {status}"
                if isinstance(parsed, dict):
                    code = parsed.get("error")
                    message = parsed.get("message") or code or message
                raise OceInhouseApiError(
                    message,
                    status=status,
                    code=code,
                    body=parsed,
                    retry_after_seconds=retry_after,
                )

            return parsed

    def _send(self, method, url, headers, data):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                parsed = _parse(raw)
                return resp.status, parsed, _retry_after(resp.headers, parsed)
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            parsed = _parse(raw)
            return exc.code, parsed, _retry_after(exc.headers, parsed)
        except urllib.error.URLError as exc:
            raise OceInhouseApiError(
                f"Network error calling {method} {url}: {exc.reason}",
                status=0,
            ) from exc

    # ---- endpoints -------------------------------------------------------

    def status(self) -> Dict[str, Any]:
        """``GET /v1/status`` — service status, version, events + scopes."""
        return self._request("GET", "/status", auth=False)

    def me(self) -> Dict[str, Any]:
        """``GET /v1/me`` — inspect the calling API key."""
        return self._request("GET", "/me")

    def matches(
        self,
        *,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        season_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """``GET /v1/matches`` — list recorded matches (reverse-chron)."""
        return self._request(
            "GET",
            "/matches",
            query={"limit": limit, "offset": offset, "season_id": season_id},
        )

    def match(self, match_id: Any) -> Dict[str, Any]:
        """``GET /v1/matches/:matchId`` — full match detail."""
        return self._request("GET", f"/matches/{urllib.parse.quote(str(match_id))}")

    def leaderboard(
        self,
        *,
        limit: Optional[int] = None,
        season_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """``GET /v1/leaderboard`` — top players by MMR."""
        return self._request(
            "GET", "/leaderboard", query={"limit": limit, "season_id": season_id}
        )

    def profile(self, account_id: Any) -> Dict[str, Any]:
        """``GET /v1/profile/:accountId`` — player profile."""
        return self._request("GET", f"/profile/{urllib.parse.quote(str(account_id))}")

    def teams(self, *, limit: Optional[int] = None) -> Dict[str, Any]:
        """``GET /v1/teams`` — list active teams with member counts."""
        return self._request("GET", "/teams", query={"limit": limit})

    def team(self, team_id: int) -> Dict[str, Any]:
        """``GET /v1/teams/:id`` — team detail + roster."""
        return self._request("GET", f"/teams/{urllib.parse.quote(str(team_id))}")

    def inhouse_status(self) -> Dict[str, Any]:
        """``GET /v1/inhouse/status`` — current inhouse session state."""
        return self._request("GET", "/inhouse/status")

    def tournaments(self, *, season_id: Optional[int] = None) -> Dict[str, Any]:
        """``GET /v1/tournaments`` — list tournaments + status."""
        return self._request("GET", "/tournaments", query={"season_id": season_id})

    def tournament(self, tournament_id: int) -> Dict[str, Any]:
        """``GET /v1/tournaments/:id`` — tournament detail + bracket."""
        return self._request(
            "GET", f"/tournaments/{urllib.parse.quote(str(tournament_id))}"
        )

    def coaches(self) -> Dict[str, Any]:
        """``GET /v1/coaches`` — active coaches accepting bookings."""
        return self._request("GET", "/coaches")

    def coach_availability(self, coach_id: int) -> Dict[str, Any]:
        """``GET /v1/coaches/:id/availability`` — recurring availability slots."""
        return self._request(
            "GET", f"/coaches/{urllib.parse.quote(str(coach_id))}/availability"
        )


def _parse(raw: str) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return raw


def _retry_after(headers, parsed) -> Optional[float]:
    header = headers.get("Retry-After") if headers else None
    if header is not None:
        try:
            return float(header)
        except (TypeError, ValueError):
            pass
    if isinstance(parsed, dict):
        val = parsed.get("retry_after_seconds")
        if isinstance(val, (int, float)):
            return float(val)
    return None
