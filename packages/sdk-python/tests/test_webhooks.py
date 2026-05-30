import hashlib
import hmac
import json
import os
import sys
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from oce_inhouse import (  # noqa: E402
    WebhookVerificationError,
    construct_webhook_event,
    verify_webhook_signature,
)

SECRET = "whsec_test_secret"


def sign_payload(secret, timestamp_ms, raw_body):
    """Mirror of webhookDispatcher.signPayload in the main server."""
    digest = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp_ms}.{raw_body}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp_ms},v1={digest}"


def test_accepts_server_signed_payload():
    now = int(time.time() * 1000)
    payload = json.dumps({"event": "match.finalized", "data": {"match_id": 1}})
    signature = sign_payload(SECRET, now, payload)
    assert verify_webhook_signature(payload, signature, SECRET, now_ms=now) is True


def test_rejects_tampered_body():
    now = int(time.time() * 1000)
    payload = json.dumps({"event": "match.finalized", "data": {"match_id": 1}})
    signature = sign_payload(SECRET, now, payload)
    tampered = payload.replace("1", "2")
    assert verify_webhook_signature(tampered, signature, SECRET, now_ms=now) is False


def test_rejects_stale_timestamp():
    signed_at = int(time.time() * 1000) - 10 * 60 * 1000
    payload = json.dumps({"event": "lobby.full"})
    signature = sign_payload(SECRET, signed_at, payload)
    assert verify_webhook_signature(payload, signature, SECRET) is False


def test_rejects_wrong_secret():
    now = int(time.time() * 1000)
    payload = json.dumps({"event": "lobby.full"})
    signature = sign_payload(SECRET, now, payload)
    assert verify_webhook_signature(payload, signature, "nope", now_ms=now) is False


def test_construct_returns_envelope():
    now = int(time.time() * 1000)
    envelope = {"event": "match.finalized", "delivered_at": "x", "data": {"match_id": 7}}
    payload = json.dumps(envelope)
    signature = sign_payload(SECRET, now, payload)
    assert construct_webhook_event(payload, signature, SECRET, now_ms=now) == envelope


def test_construct_raises_on_bad_signature():
    with pytest.raises(WebhookVerificationError):
        construct_webhook_event("{}", "t=1,v1=deadbeef", SECRET)
