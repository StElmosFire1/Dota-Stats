// Response + parameter shapes for the OCE Inhouse public API (/v1).
// These mirror the JSON returned by src/web/publicApiRouter.js. Fields the
// server may omit are typed as optional / nullable.

export interface StatusResponse {
  ok: boolean;
  version: string;
  product_version: string;
  state: string;
  events: string[];
  scopes: string[];
  defaults: {
    anon_per_minute: number;
    free_per_minute: number;
    pro_per_minute: number;
  };
  docs: string;
}

export interface KeyInfo {
  key_id: number;
  label: string | null;
  tier: 'free' | 'pro';
  account_id: string | null;
  scopes: string[];
  rate_per_min: number | null;
  created_at: string | null;
  last_used_at: string | null;
}

export interface MatchSummary {
  match_id: string | number;
  season_id: number | null;
  radiant_win: boolean | null;
  duration: number | null;
  start_time: string | number | null;
  recorded_at: string | null;
  patch: string | null;
  lobby_name: string | null;
}

export interface MatchListResponse {
  matches: MatchSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListMatchesParams {
  limit?: number;
  offset?: number;
  season_id?: number;
}

export interface LeaderboardEntry {
  account_id: string;
  display_name: string | null;
  mmr: number | null;
  wins: number | null;
  losses: number | null;
  games: number | null;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  season_id: number | null;
  limit: number;
}

export interface LeaderboardParams {
  limit?: number;
  season_id?: number;
}

export interface PlayerProfile {
  account_id: string;
  display_name: string | null;
  rating: {
    mmr: number | null;
    mu: number | null;
    sigma: number | null;
    rank_tier: number | null;
  } | null;
  stats: {
    games: number | null;
    wins: number | null;
    losses: number | null;
    perf: number | null;
  } | null;
}

export interface TeamSummary {
  id: number;
  name: string;
  tag: string | null;
  owner_account_id: string | null;
  member_count: number | null;
  created_at: string | null;
}

export interface TeamListResponse {
  teams: TeamSummary[];
  limit: number;
}

export interface TeamMember {
  account_id: string;
  display_name: string | null;
  role: string;
  joined_at: string | null;
}

export interface TeamDetail {
  id: number;
  name: string;
  tag: string | null;
  owner_account_id: string | null;
  created_at: string | null;
  members: TeamMember[];
}

export interface ListTeamsParams {
  limit?: number;
}

export interface InhouseStatusResponse {
  active: boolean;
  session: {
    id: number;
    state: string;
    captain_radiant: string | null;
    captain_dire: string | null;
    created_at: string | null;
    updated_at: string | null;
    players: number | null;
  } | null;
}

export interface Tournament {
  id: number;
  name: string;
  description: string | null;
  status: string;
  format: string;
  season_id: number | null;
  start_date: string | null;
  end_date: string | null;
  buy_in_cents: number | null;
  prize_pool_cents: number | null;
  max_participants: number | null;
}

export interface TournamentListResponse {
  tournaments: Tournament[];
}

export interface TournamentParticipant {
  account_id: string;
  display_name: string | null;
  seed: number | null;
}

export interface TournamentMatch {
  id: number;
  bracket: string;
  round: number;
  slot: number;
  p1_account_id: string | null;
  p2_account_id: string | null;
  winner_account_id: string | null;
  inhouse_match_id: string | number | null;
}

export interface TournamentDetail extends Tournament {
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
}

export interface ListTournamentsParams {
  season_id?: number;
}

export interface Coach {
  id: number;
  account_id: string;
  display_name: string | null;
  headline: string | null;
  rate_cents: number | null;
  languages: string | string[] | null;
  accepting_bookings: boolean;
}

export interface CoachListResponse {
  coaches: Coach[];
}

export interface CoachAvailabilityResponse {
  coach_id: number;
  slots: unknown[];
}

export interface WebhookSubscription {
  id: number;
  url: string;
  events: string[];
  active: boolean;
  created_at: string | null;
  secret?: string;
}

export interface WebhookListResponse {
  subscriptions: WebhookSubscription[];
}

export interface CreateWebhookParams {
  url: string;
  events: string[];
}

export interface DeleteWebhookResponse {
  ok: boolean;
}

/** Decoded `match.finalized` (version 1) webhook payload. */
export interface MatchFinalizedEvent {
  version: number;
  match_id: number;
  radiant_win: boolean;
  duration: number;
  season_id: number;
  patch: string;
  recorded_at: string;
  players: Array<{
    account_id: string;
    hero_id: number;
    team: 'radiant' | 'dire';
    slot: number;
    kills: number;
    deaths: number;
    assists: number;
    last_hits: number;
    denies: number;
    gpm: number;
    xpm: number;
    hero_damage: number;
    tower_damage: number;
    hero_healing: number;
    net_worth: number;
    level: number;
    items: number[];
  }>;
}

/** Envelope every outbound webhook delivery is wrapped in. */
export interface WebhookEvent<T = unknown> {
  event: string;
  delivered_at: string;
  data: T;
}
