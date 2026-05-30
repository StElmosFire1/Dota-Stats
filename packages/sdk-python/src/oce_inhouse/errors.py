"""Exceptions raised by the OCE Inhouse SDK."""

from __future__ import annotations

from typing import Any, Optional


class OceInhouseApiError(Exception):
    """Raised when the public API returns a non-2xx response.

    ``code`` mirrors the machine-readable ``error`` field documented at
    ``/developers`` (e.g. ``insufficient_scope``, ``rate_limited``,
    ``not_found``).
    """

    def __init__(
        self,
        message: str,
        *,
        status: int,
        code: Optional[str] = None,
        body: Any = None,
        retry_after_seconds: Optional[float] = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.body = body
        self.retry_after_seconds = retry_after_seconds


class WebhookVerificationError(Exception):
    """Raised when a webhook signature cannot be verified."""
