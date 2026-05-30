import crypto from 'node:crypto';
import { WebhookVerificationError } from './errors';
import type { WebhookEvent } from './types';

const SIGNATURE_RE = /t=(\d+),v1=([0-9a-f]+)/;
const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export interface VerifyWebhookOptions {
  /** The exact raw request body string. Do NOT re-serialize the parsed JSON. */
  payload: string;
  /** Value of the `X-OI-Signature` header (e.g. `t=1716800062000,v1=abc…`). */
  signature: string;
  /** The subscription secret shown when the webhook was created. */
  secret: string;
  /** Replay window in seconds. Defaults to 300 (5 minutes). 0 disables the check. */
  toleranceSeconds?: number;
  /** Override the clock (ms since epoch) — for tests. */
  now?: number;
}

/**
 * Verify an outbound webhook signature using the same scheme as the server
 * (`HMAC-SHA256` over `<timestamp>.<raw_body>`) and enforce the 5-minute
 * replay window. Returns `true`/`false` and never throws on a bad signature.
 */
export function verifyWebhookSignature(opts: VerifyWebhookOptions): boolean {
  const {
    payload,
    signature,
    secret,
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
    now = Date.now(),
  } = opts;
  if (!payload || !signature || !secret) return false;
  const m = SIGNATURE_RE.exec(signature);
  if (!m) return false;
  const timestampMs = Number(m[1]);
  if (!Number.isFinite(timestampMs)) return false;
  if (toleranceSeconds > 0) {
    const ageSeconds = Math.abs(now - timestampMs) / 1000;
    if (ageSeconds > toleranceSeconds) return false;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestampMs}.${payload}`)
    .digest('hex');
  const got = Buffer.from(m[2], 'utf8');
  const exp = Buffer.from(expected, 'utf8');
  if (got.length !== exp.length) return false;
  return crypto.timingSafeEqual(got, exp);
}

/**
 * Verify a webhook signature and return the parsed event envelope. Throws a
 * {@link WebhookVerificationError} when verification fails — modelled on
 * Stripe's `constructEvent`. Use this in your HTTP handler:
 *
 * ```ts
 * const event = constructWebhookEvent({
 *   payload: rawBody,
 *   signature: req.headers['x-oi-signature'],
 *   secret: process.env.OI_WEBHOOK_SECRET,
 * });
 * ```
 */
export function constructWebhookEvent<T = unknown>(
  opts: VerifyWebhookOptions,
): WebhookEvent<T> {
  if (!opts.signature) {
    throw new WebhookVerificationError('Missing X-OI-Signature header.');
  }
  if (!verifyWebhookSignature(opts)) {
    throw new WebhookVerificationError(
      'Webhook signature verification failed (bad signature or outside the replay window).',
    );
  }
  try {
    return JSON.parse(opts.payload) as WebhookEvent<T>;
  } catch {
    throw new WebhookVerificationError('Webhook payload is not valid JSON.');
  }
}
