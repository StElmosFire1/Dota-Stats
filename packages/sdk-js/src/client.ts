import { OceInhouseApiError } from './errors';
import type {
  StatusResponse,
  KeyInfo,
  MatchListResponse,
  MatchSummary,
  ListMatchesParams,
  LeaderboardResponse,
  LeaderboardParams,
  PlayerProfile,
  TeamListResponse,
  TeamDetail,
  ListTeamsParams,
  InhouseStatusResponse,
  TournamentListResponse,
  TournamentDetail,
  ListTournamentsParams,
  CoachListResponse,
  CoachAvailabilityResponse,
  WebhookListResponse,
  WebhookSubscription,
  CreateWebhookParams,
  DeleteWebhookResponse,
} from './types';

const DEFAULT_BASE_URL = 'https://oceinhouse.gg';

export interface OceInhouseClientOptions {
  /** Scoped API key (`oi_fre_…` / `oi_pro_…`). Optional for `/v1/status`. */
  apiKey?: string;
  /** Override the API host. Defaults to `https://oceinhouse.gg`. */
  baseUrl?: string;
  /** Per-request timeout in ms. Defaults to 15000. */
  timeoutMs?: number;
  /**
   * Number of automatic retries when the API returns 429 (rate limited).
   * Honours `Retry-After` / `retry_after_seconds`. Defaults to 2.
   */
  maxRetries?: number;
  /** Inject a custom fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
}

interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  auth?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Thin, typed client for the OCE Inhouse public API. One method per `/v1`
 * endpoint, bearer auth, and automatic retry on 429.
 *
 * ```ts
 * const client = new OceInhouseClient({ apiKey: 'oi_pro_…' });
 * const board = await client.leaderboard({ limit: 10 });
 * ```
 */
export class OceInhouseClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  /** Webhook subscription management (Pro-tier keys with `write:webhooks`). */
  readonly webhooks: WebhooksResource;

  constructor(options: OceInhouseClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.maxRetries = options.maxRetries ?? 2;
    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== 'function') {
      throw new Error(
        'No fetch implementation available. Use Node 18+ or pass `fetch` in the client options.',
      );
    }
    this.fetchImpl = f;
    this.webhooks = new WebhooksResource(this);
  }

  /** @internal */
  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.auth !== false && this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    let body: string | undefined;
    if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      headers['Content-Type'] = 'application/json';
    }

    let attempt = 0;
    // attempts = 1 initial + maxRetries
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
      } catch (err: unknown) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        throw new OceInhouseApiError(`Network error calling ${method} ${path}: ${msg}`, {
          status: 0,
        });
      } finally {
        clearTimeout(timer);
      }

      const text = await res.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }

      if (res.status === 429 && attempt < this.maxRetries) {
        const wait = this.retryDelayMs(res, parsed, attempt);
        attempt += 1;
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const errObj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
        const code = typeof errObj.error === 'string' ? errObj.error : null;
        const message =
          (typeof errObj.message === 'string' && errObj.message) ||
          code ||
          `HTTP ${res.status}`;
        throw new OceInhouseApiError(message, {
          status: res.status,
          code,
          body: parsed,
          retryAfterSeconds: this.parseRetryAfter(res, parsed),
        });
      }

      return parsed as T;
    }
  }

  private retryDelayMs(res: Response, parsed: unknown, attempt: number): number {
    const fromHeader = this.parseRetryAfter(res, parsed);
    if (fromHeader != null) return Math.max(0, fromHeader * 1000);
    // Exponential backoff fallback: 1s, 2s, 4s…
    return 1000 * 2 ** attempt;
  }

  private parseRetryAfter(res: Response, parsed: unknown): number | null {
    const header = res.headers.get('Retry-After');
    if (header) {
      const n = Number(header);
      if (Number.isFinite(n)) return n;
    }
    if (parsed && typeof parsed === 'object') {
      const v = (parsed as Record<string, unknown>).retry_after_seconds;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return null;
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const url = new URL(`${this.baseUrl}/v1${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  // ---- Endpoints ---------------------------------------------------------

  /** `GET /v1/status` — service status, version, events + scopes. No auth. */
  status(): Promise<StatusResponse> {
    return this.request('GET', '/status', { auth: false });
  }

  /** `GET /v1/me` — inspect the calling API key. */
  me(): Promise<KeyInfo> {
    return this.request('GET', '/me');
  }

  /** `GET /v1/matches` — list recorded matches (reverse-chron). */
  matches(params: ListMatchesParams = {}): Promise<MatchListResponse> {
    return this.request('GET', '/matches', { query: params as Record<string, unknown> });
  }

  /** `GET /v1/matches/:matchId` — full match detail. */
  match(matchId: string | number): Promise<MatchSummary & Record<string, unknown>> {
    return this.request('GET', `/matches/${encodeURIComponent(String(matchId))}`);
  }

  /** `GET /v1/leaderboard` — top players by MMR. */
  leaderboard(params: LeaderboardParams = {}): Promise<LeaderboardResponse> {
    return this.request('GET', '/leaderboard', { query: params as Record<string, unknown> });
  }

  /** `GET /v1/profile/:accountId` — player profile (rating, W/L, PERF). */
  profile(accountId: string | number): Promise<PlayerProfile> {
    return this.request('GET', `/profile/${encodeURIComponent(String(accountId))}`);
  }

  /** `GET /v1/teams` — list active teams with member counts. */
  teams(params: ListTeamsParams = {}): Promise<TeamListResponse> {
    return this.request('GET', '/teams', { query: params as Record<string, unknown> });
  }

  /** `GET /v1/teams/:id` — team detail + roster. */
  team(id: number): Promise<TeamDetail> {
    return this.request('GET', `/teams/${encodeURIComponent(String(id))}`);
  }

  /** `GET /v1/inhouse/status` — current inhouse session state. */
  inhouseStatus(): Promise<InhouseStatusResponse> {
    return this.request('GET', '/inhouse/status');
  }

  /** `GET /v1/tournaments` — list tournaments + status. */
  tournaments(params: ListTournamentsParams = {}): Promise<TournamentListResponse> {
    return this.request('GET', '/tournaments', { query: params as Record<string, unknown> });
  }

  /** `GET /v1/tournaments/:id` — tournament detail + bracket. */
  tournament(id: number): Promise<TournamentDetail> {
    return this.request('GET', `/tournaments/${encodeURIComponent(String(id))}`);
  }

  /** `GET /v1/coaches` — active coaches accepting bookings. */
  coaches(): Promise<CoachListResponse> {
    return this.request('GET', '/coaches');
  }

  /** `GET /v1/coaches/:id/availability` — recurring availability slots. */
  coachAvailability(id: number): Promise<CoachAvailabilityResponse> {
    return this.request('GET', `/coaches/${encodeURIComponent(String(id))}/availability`);
  }
}

/** Webhook subscription endpoints — Pro-tier keys with `write:webhooks`. */
export class WebhooksResource {
  constructor(private readonly client: OceInhouseClient) {}

  /** `GET /v1/webhooks` — list this account's webhook subscriptions. */
  list(): Promise<WebhookListResponse> {
    return this.client.request('GET', '/webhooks');
  }

  /** `POST /v1/webhooks` — create a subscription. */
  create(params: CreateWebhookParams): Promise<WebhookSubscription> {
    return this.client.request('POST', '/webhooks', { body: params });
  }

  /** `DELETE /v1/webhooks/:id` — delete a subscription. */
  delete(id: number): Promise<DeleteWebhookResponse> {
    return this.client.request('DELETE', `/webhooks/${encodeURIComponent(String(id))}`);
  }
}
