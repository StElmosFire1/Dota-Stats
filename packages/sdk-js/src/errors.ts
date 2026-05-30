/**
 * Error thrown when the OCE Inhouse public API returns a non-2xx response.
 * `code` mirrors the machine-readable `error` field documented at /developers
 * (e.g. `insufficient_scope`, `rate_limited`, `not_found`).
 */
export class OceInhouseApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly body: unknown;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    opts: {
      status: number;
      code?: string | null;
      body?: unknown;
      retryAfterSeconds?: number | null;
    },
  ) {
    super(message);
    this.name = 'OceInhouseApiError';
    this.status = opts.status;
    this.code = opts.code ?? null;
    this.body = opts.body ?? null;
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
  }
}

/**
 * Thrown by the webhook verifier when a signature is missing, malformed,
 * outside the replay tolerance window, or fails the HMAC comparison.
 */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}
