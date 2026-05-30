"""Official Python client for the OCE Inhouse public API."""

from .client import OceInhouseClient, WebhooksResource
from .errors import OceInhouseApiError, WebhookVerificationError
from .webhooks import construct_webhook_event, verify_webhook_signature

__version__ = "1.0.0"

__all__ = [
    "OceInhouseClient",
    "WebhooksResource",
    "OceInhouseApiError",
    "WebhookVerificationError",
    "verify_webhook_signature",
    "construct_webhook_event",
    "__version__",
]
