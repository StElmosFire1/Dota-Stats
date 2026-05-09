// PlayerProfile parity test (Task #92)
//
// Guards the v5.91 audit: every section on a player profile must render the
// same for the profile owner and a public visitor. The only allowed visual
// diff is the explicitly opt-in owner UI ("✏️ Edit Profile",
// "🎓 Apply to coach" / "⚙️ Coach profile", invite/referral card) and its
// inverse (the "🎁 Gift Pro" / "🎫 Gift Season Pass" buttons that show only
// when viewing someone *else*'s profile while signed in).
//
// If a future PR re-introduces an `isOwnProfile` guard around an entire
// `<h2 className="section-title">` block, the parity assertion below will
// fail loudly.

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Stub recharts ─────────────────────────────────────────────────────────
// Recharts pulls in ResizeObserver and SVG layout that jsdom can't really
// render — and we don't actually care about the chart contents, only that
// the parent <section> with its <h2 className="section-title"> is present.
vi.mock('recharts', () => {
  const Passthrough = ({ children }) => <div>{children}</div>;
  const Empty = () => null;
  return {
    ResponsiveContainer: Passthrough,
    LineChart: Passthrough,
    Line: Empty,
    XAxis: Empty,
    YAxis: Empty,
    CartesianGrid: Empty,
    Tooltip: Empty,
  };
});

// ── Mock api.js ───────────────────────────────────────────────────────────
// Return rich-enough data to make every conditional section render.
const PLAYER = {
  rating: { mmr: 5000, wins: 50, losses: 30, games_played: 80, display_name: 'Tester' },
  nickname: 'Tester',
  seasonMmr: 5050,
  averages: {
    total_matches: 80, wins: 50, losses: 30,
    avg_kills: 8, avg_deaths: 5, avg_assists: 12,
    total_kills: 640, total_deaths: 400, total_assists: 960,
    avg_gpm: 500, avg_xpm: 600,
    avg_hero_damage: 18000, avg_tower_damage: 2500, avg_hero_healing: 1500,
    avg_last_hits: 200, avg_denies: 10,
    avg_obs_placed: 8, avg_sen_placed: 6, avg_camps_stacked: 2,
    total_firstbloods: 5, fb_rate: 6.3,
    pudge_games_with_hooks: 0, total_hook_attempts: 0, total_hook_hits: 0,
    avg_perf: 6.5, perf_games: 80, best_perf: 9.2,
  },
  heroes: [
    { hero_id: 14, hero_name: 'pudge', games: 20, wins: 12, avg_kills: 9, avg_deaths: 6, avg_assists: 14, avg_gpm: 480, avg_hero_damage: 19000 },
    { hero_id: 8, hero_name: 'juggernaut', games: 15, wins: 9, avg_kills: 10, avg_deaths: 4, avg_assists: 8, avg_gpm: 600, avg_hero_damage: 22000 },
  ],
  recentMatches: [
    { match_id: 101, hero_id: 14, hero_name: 'pudge', kills: 9, deaths: 4, assists: 12, gpm: 500, team: 'radiant', radiant_win: true, is_mvp: true },
  ],
};

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal()),
  // PlayerProfile imports
  getPlayer: vi.fn().mockResolvedValue(PLAYER),
  getPlayerPositions: vi.fn().mockResolvedValue({ positions: [
    { position: 1, games: 40, wins: 25, avg_kills: 9, avg_deaths: 5, avg_assists: 10, avg_gpm: 550, avg_hero_damage: 20000, avg_last_hits: 250, avg_hero_healing: 500 },
    { position: 2, games: 40, wins: 25, avg_kills: 8, avg_deaths: 5, avg_assists: 12, avg_gpm: 500, avg_hero_damage: 18000, avg_last_hits: 200, avg_hero_healing: 800 },
  ] }),
  getPlayerRatingHistory: vi.fn().mockResolvedValue({ history: [
    { mmr: 4800, recorded_at: '2025-01-01' },
    { mmr: 4900, recorded_at: '2025-01-02' },
    { mmr: 5000, recorded_at: '2025-01-03' },
  ] }),
  getPlayerV3ModifierHistory: vi.fn().mockResolvedValue({ history: [
    { modifier: 1.05, score: 6.5, won: true, has_stats: true, date: '2025-01-01' },
    { modifier: 0.95, score: 4.8, won: false, has_stats: true, date: '2025-01-02' },
    { modifier: 1.10, score: 7.2, won: true, has_stats: true, date: '2025-01-03' },
  ] }),
  getPlayerAchievements: vi.fn().mockResolvedValue({ achievements: [
    { key: 'first_blood', label: 'First Blood', desc: 'Got first blood', icon: '🩸', group: 'First Blood', earned: true, achieved_at: '2025-01-01' },
  ] }),
  getPlayerNemesis: vi.fn().mockResolvedValue([
    { killer_account_id: 999, killer_name: 'Rival', total_kills: 12, last_hero: 'pudge' },
  ]),
  getPlayerPredictionStats: vi.fn().mockResolvedValue({ stats: { total: 10, correct_count: 6 } }),
  getPlayerHeroCounters: vi.fn().mockResolvedValue({ counters: [
    { hero_id: 1, hero_name: 'antimage', games_against: 5, wins_against: 3, games_with: 2, wins_with: 1 },
  ] }),
  getPlayerStreak: vi.fn().mockResolvedValue({ streak: 3 }),
  getPlayerDurationStats: vi.fn().mockResolvedValue({ stats: [
    { bracket: '<30 min', games: 10, wins: 6, avg_kills: 8, avg_gpm: 500 },
  ] }),
  getPlayerCommunityRatings: vi.fn().mockResolvedValue({ ratings: { mvp_wins: 4, avg_attitude: 7.5 } }),
  getPositionAverages: vi.fn().mockResolvedValue({ averages: [
    { position: 1, avg_kills: 8, avg_deaths: 5, avg_assists: 10, avg_gpm: 520, avg_hero_damage: 19000, avg_last_hits: 240, avg_hero_healing: 600 },
    { position: 2, avg_kills: 7, avg_deaths: 5, avg_assists: 11, avg_gpm: 490, avg_hero_damage: 17500, avg_last_hits: 195, avg_hero_healing: 700 },
  ] }),
  getPlayerAlly: vi.fn().mockResolvedValue([
    { account_id: 222, display_name: 'Ally', games_together: 10, wins_together: 7 },
  ]),
  getPlayerWinRateHistory: vi.fn().mockResolvedValue({ history: [
    { won: 1 }, { won: 0 }, { won: 1 }, { won: 1 }, { won: 0 },
  ] }),
  getImpactScores: vi.fn().mockResolvedValue({ scores: { '1234': { score: 7.5 } } }),
  getPlayerRanks: vi.fn().mockResolvedValue([]),
  getPlayerMatchStatsHistory: vi.fn().mockResolvedValue({ history: [
    { match_id: 1, kills: 8, deaths: 5, assists: 12, gpm: 500, hero_damage: 18000 },
    { match_id: 2, kills: 9, deaths: 4, assists: 10, gpm: 520, hero_damage: 19000 },
    { match_id: 3, kills: 7, deaths: 6, assists: 14, gpm: 480, hero_damage: 17000 },
    { match_id: 4, kills: 10, deaths: 3, assists: 9, gpm: 540, hero_damage: 20000 },
    { match_id: 5, kills: 8, deaths: 5, assists: 11, gpm: 510, hero_damage: 18500 },
    { match_id: 6, kills: 9, deaths: 5, assists: 10, gpm: 505, hero_damage: 18800 },
  ] }),
  getPlayerHeroSuggestions: vi.fn().mockResolvedValue({
    suggestions: [
      { hero_id: 5, hero_name: 'Crystal Maiden', community_win_rate: 0.55, player_games: 1, position: 5, based_on_hero_name: null, correlation_score: null, similar_players_count: 0 },
    ],
    is_pro: false,
  }),
  createGiftProCheckout: vi.fn(),
  createGiftSeasonPassCheckout: vi.fn(),
  getScoutingReport: vi.fn(),
  getLeaderboard: vi.fn().mockResolvedValue([{ player_id: 'someone-else' }]),
  // Pulled by hooks/contexts we don't mock
  getProMembers: vi.fn().mockResolvedValue({ member_ids: [] }),
  getPlayerVerifiedBadges: vi.fn().mockResolvedValue({ badges: [] }),
}));

// ── Mock contexts ─────────────────────────────────────────────────────────
let currentSteamUser = null;
vi.mock('../../context/SteamAuthContext', () => ({
  useSteamAuth: () => ({ steamUser: currentSteamUser }),
}));
vi.mock('../../context/SuperuserContext', () => ({
  useSuperuser: () => ({ superuserKey: '' }),
}));
vi.mock('../../context/SeasonContext', () => ({
  useSeason: () => ({ seasonId: null }),
}));
vi.mock('../../context/FeatureFlagsContext', () => ({
  useFeatureFlag: () => true,
  useFeatureFlags: () => ({ flags: {}, loading: false, refresh: () => {} }),
}));

// ── Mock direct fetch() calls ─────────────────────────────────────────────
function fetchMock(url) {
  const json = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  if (url.includes('/profile-card')) return json({ customization: null });
  if (url.includes('/season-pass')) return json({
    has_season_pass: true,
    total_xp: 1234,
    tier: { tier_name: 'Silver', next_tier_name: 'Gold', xp_to_next: 500, progress_pct: 60 },
  });
  if (url.includes('/mvp-attitude-trends')) return json({
    mvp_count: 4, mvp_rate: 0.05, attitude_avg: 7.5, window_size: 10,
    points: [{ avg_attitude: 7.6 }],
  });
  if (url.includes('/invite-link')) return json({ inviteUrl: 'https://example.test/invite/abc', referralXp: 50 });
  if (url.includes('/referrals')) return json({ count: 0, totalXp: 0, referrals: [] });
  if (url.includes('/coaching/eligibility/me')) return json({ signed_in: true, eligible: true, has_coach_row: false });
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
}

// ── Helpers ───────────────────────────────────────────────────────────────
async function renderProfile() {
  const { default: PlayerProfile } = await import('../PlayerProfile.jsx');
  const utils = render(
    <MemoryRouter initialEntries={['/player/1234']}>
      <Routes>
        <Route path="/player/:accountId" element={<PlayerProfile />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(utils.container.querySelector('.section-title')).not.toBeNull();
  });
  return utils;
}

function sectionTitles(container) {
  return Array.from(container.querySelectorAll('.section-title')).map(
    (n) => n.textContent.replace(/\s+/g, ' ').trim(),
  );
}

// ── Test ──────────────────────────────────────────────────────────────────
describe('PlayerProfile owner/public parity (v5.91 audit)', () => {
  beforeEach(() => {
    global.fetch = vi.fn(fetchMock);
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  });

  it('renders the same section-title set for the owner and a public visitor', async () => {
    // Render 1: owner viewing their own profile (accountId === steamUser.accountId).
    currentSteamUser = { accountId: '1234' };
    const owner = await renderProfile();
    // Wait for the post-fetch owner-only chunks (eligibility + invite link).
    await owner.findByText('🎓 Apply to coach');
    await owner.findByText(/Your Invite Link/);
    const ownerTitles = sectionTitles(owner.container);
    const ownerHasEdit = !!owner.getByText('✏️ Edit Profile');
    const ownerHasCoachApply = !!owner.getByText('🎓 Apply to coach');
    const ownerHasGiftPro = owner.queryByText(/Gift Pro/);
    const ownerHasGiftSP = owner.queryByText(/Gift Season Pass/);
    const ownerHasInvite = owner.queryByText(/Your Invite Link/);
    cleanup();

    // Render 2: a different signed-in user looking at the same profile.
    currentSteamUser = { accountId: '9999' };
    const visitor = await renderProfile();
    const visitorTitles = sectionTitles(visitor.container);
    const visitorHasEdit = visitor.queryByText('✏️ Edit Profile');
    const visitorHasCoachApply = visitor.queryByText('🎓 Apply to coach');
    const visitorHasGiftPro = visitor.queryByText(/Gift Pro/);
    const visitorHasGiftSP = visitor.queryByText(/Gift Season Pass/);
    const visitorHasInvite = visitor.queryByText(/Your Invite Link/);

    // ── Parity assertion: every section visible to the owner must also be
    // visible to the public visitor. This is the regression guard — if
    // someone wraps a `<section>` in `{isOwnProfile && …}` again, the
    // visitor render will be missing that title and this fails.
    for (const title of ownerTitles) {
      expect(visitorTitles, `Section "${title}" was visible to the owner but not to the public visitor — did a new isOwnProfile gate slip in?`).toContain(title);
    }
    // And in the other direction: the public render must not gain
    // sections that the owner can't see. (Sanity check; the only allowed
    // visitor-extra UI is the gift buttons, which are not section-titles.)
    for (const title of visitorTitles) {
      expect(ownerTitles, `Section "${title}" appeared for the public visitor but not for the owner.`).toContain(title);
    }

    // ── Allowed diffs (the explicitly-owner / explicitly-visitor UI). ──
    // Owner-only:
    expect(ownerHasEdit).toBe(true);
    expect(ownerHasCoachApply).toBe(true);
    expect(ownerHasInvite).not.toBeNull();
    expect(visitorHasEdit).toBeNull();
    expect(visitorHasCoachApply).toBeNull();
    expect(visitorHasInvite).toBeNull();
    // Visitor-only (gift buttons only show when viewing someone else's profile):
    expect(ownerHasGiftPro).toBeNull();
    expect(ownerHasGiftSP).toBeNull();
    expect(visitorHasGiftPro).not.toBeNull();
    expect(visitorHasGiftSP).not.toBeNull();
  });
});
