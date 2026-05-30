"""Signed-webhook verification helpers.

Mirrors the server scheme: ``HMAC-SHA256`` over ``<timestamp>.<raw_body>``,
delivered in the ``X-OI-Signature: t=<ms>,v1=<hex>`` header, with a 5-minute
replay window.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from typing import Any, Dict, Optional

from .errors import WebhookVerificationError

_SIGNATURE_RE = re.compile(r"t=(\d+),v1=([0-9a-f]+)")
_DEFAULT_TOLERANCE_SECONDS = 5 * 60


def verify_webhook_signature(
    payload: str,
    signature: str,
    secret: str,
    *,
    tolerance_seconds: int = _DEFAULT_TOLERANCE_SECONDS,
    now_ms: Optional[int] = None,
) -> bool:
    """Return ``True`` if ``signature`` is valid for ``payload``.

    ``payload`` must be the exact raw request body string — do not re-serialize
    parsed JSON. ``tolerance_seconds`` of 0 disables the replay-window check.
    """
    if not payload or not signature or not secret:
        return False
    match = _SIGNATURE_RE.search(signature)
    if not match:
        return False
    timestamp_ms = int(match.group(1))
    current_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    if tolerance_seconds > 0:
        age_seconds = abs(current_ms - timestamp_ms) / 1000.0
        if age_seconds > tolerance_seconds:
            return False
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp_ms}.{payload}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, match.group(2))


def construct_webhook_event(
    payload: str,
    signature: str,
    secret: str,
    *,
    tolerance_seconds: int = _DEFAULT_TOLERANCE_SECONDS,
    now_ms: Optional[int] = None,
) -> Dict[str, Any]:
    """Verify the signature and return the parsed event envelope.

    Raises :class:`WebhookVerificationError` when verification fails — modelled
    on Stripe's ``construct_event``.
    """
    if not signature:
        raise WebhookVerificationError("Missing X-OI-Signature header.")
    if not verify_webhook_signature(
        payload,
        signature,
        secret,
        tolerance_seconds=tolerance_seconds,
        now_ms=now_ms,
    ):
        raise WebhookVerificationError(
            "Webhook signature verification failed "
            "(bad signature or outside the replay window)."
        )
    try:
        return json.loads(payload)
    except (ValueError, TypeError) as exc:
        raise WebhookVerificationError("Webhook payload is not valid JSON.") from exc
