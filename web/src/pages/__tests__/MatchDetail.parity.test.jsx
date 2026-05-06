// MatchDetail participant/neutral parity test (Task #101)
//
// Mirrors the PlayerProfile.parity.test.jsx contract from Task #92, but for
// the Match Detail page. Past regressions have hidden post-match content from
// non-participants who should have seen it (scoreboard, expanded stats,
// timeline-driven panels). This test renders <MatchDetail /> twice for the
// same match — once with the signed-in viewer being one of the match's
// participants, once with a neutral viewer who isn't — and asserts that
// every section heading (`<h2>` / `<h3>`) present in the participant render
// is also present in the neutral-viewer render.
//
// Allowed diffs are explicit: any future participant-only UI (e.g. an MVP
// vote button or attitude rating widget) must be added to the
// PARTICIPANT_ONLY_HEADINGS allow-list below, with a comment explaining why
// it is gated. If a future PR wraps an entire `<h3>` block in a viewer-is-
// participant guard without updating the allow-list, the parity assertion
// here will fail loudly.

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Stub recharts ─────────────────────────────────────────────────────────
// Same approach as PlayerProfile.parity.test.jsx — we only care that the
// containing <section>/<h3> renders, not what the chart looks like.
vi.mock('recharts', () => {
  const Passthrough = ({ children }) => <div>{children}</div>;
  const Empty = () => null;
  return {
    ResponsiveContainer: Passthrough,
    LineChart: Passthrough,
    AreaChart: Passthrough,
    Area: Empty,
    Line: Empty,
    XAxis: Empty,
    YAxis: Empty,
    CartesianGrid: Empty,
    Tooltip: Empty,
    Legend: Empty,
    ReferenceLine: Empty,
    ReferenceArea: Empty,
  };
});

// ── Match payload ─────────────────────────────────────────────────────────
// Rich enough to make the headline panels (scoreboard, perf, expanded
// stats, damage breakdown, kill feed, kill heatmap, ward map, support
// report, death timing, comeback metric, teamfights, NW swings, power
// spikes, smoke, pudge hooks, draft, building deaths) all render their
// `<h3>` titles, so the parity assertion has real coverage.
const PARTICIPANT_ACCOUNT_ID = '1234';

function makeTimelineEvent(time, type, attacker, victim, x, y) {
  return { time, type, attacker, victim, x, y };
}

function makeKillEvents() {
  // KillFeedPanel needs killEvents.length > 0; KillHeatmapPanel needs
  // killEvents.length >= 3 with x/y coords; DeathTimingPanel needs >= 1.
  return [
    makeTimelineEvent(120, 'CHAT_MESSAGE_HERO_KILL', 0, 5, 80, 80),
    makeTimelineEvent(240, 'CHAT_MESSAGE_HERO_KILL', 1, 6, 100, 100),
    makeTimelineEvent(360, 'CHAT_MESSAGE_HERO_KILL', 2, 7, 120, 120),
    makeTimelineEvent(480, 'CHAT_MESSAGE_HERO_KILL', 3, 8, 140, 140),
    makeTimelineEvent(600, 'CHAT_MESSAGE_HERO_KILL', 4, 9, 160, 160),
  ];
}

function makePlayer(slot, accountId, team, opts = {}) {
  return {
    slot,
    account_id: accountId,
    team,
    hero_id: 14,
    hero_name: 'pudge',
    kills: 8, deaths: 5, assists: 12,
    gpm: 500, xpm: 600,
    level: 25,
    last_hits: 200, denies: 10,
    net_worth: 18000,
    hero_damage: 18000,
    tower_damage: 2500,
    hero_healing: 1500,
    obs_placed: 6, sen_placed: 4, wards_killed: 2,
    camps_stacked: 2,
    stun_duration: 30,
    items: [1, 2, 3, 4, 5, 6],
    abilities: [
      { ability: 'pudge_meat_hook', level: 1, time: 60 },
    ],
    ...opts,
  };
}

const MATCH = {
  match_id: 12345,
  radiant_win: true,
  duration: 2400,
  date: '2025-01-01T00:00:00Z',
  parse_method: 'replay',
  patch: '7.38',
  season_id: null,
  mvp_account_id: null,
  mvp_vote_count: 0,
  draft: [
    { is_pick: true,  team: 'radiant', hero_id: 14, order: 0 },
    { is_pick: false, team: 'radiant', hero_id: 1,  order: 1 },
    { is_pick: true,  team: 'dire',    hero_id: 8,  order: 2 },
    { is_pick: false, team: 'dire',    hero_id: 2,  order: 3 },
  ],
  players: [
    makePlayer(0, 1234, 'radiant'),
    makePlayer(1, 1235, 'radiant'),
    makePlayer(2, 1236, 'radiant'),
    makePlayer(3, 1237, 'radiant'),
    makePlayer(4, 1238, 'radiant'),
    makePlayer(5, 1239, 'dire'),
    makePlayer(6, 1240, 'dire'),
    makePlayer(7, 1241, 'dire'),
    makePlayer(8, 1242, 'dire'),
    makePlayer(9, 1243, 'dire'),
  ],
  game_timeline: {
    events: [
      ...makeKillEvents(),
      // Building deaths
      { time: 800, type: 'building_kill', key: 'npc_dota_badguys_tower1_top' },
      { time: 1200, type: 'building_kill', key: 'npc_dota_badguys_tower2_top' },
      // Aegis pickup
      { time: 1500, type: 'aegis', player_slot: 0 },
    ],
    players: Array.from({ length: 10 }, (_, i) => ({
      slot: i,
      networth: [
        { time: 0, value: 600 },
        { time: 300, value: 3000 },
        { time: 600, value: 6000 },
        { time: 900, value: 10000 + i * 100 },
        { time: 1200, value: 15000 + i * 200 },
        { time: 1500, value: 18000 + i * 300 },
      ],
    })),
  },
  team_abilities: null,
  v3_modifiers: { modifiers: [] },
};

// ── Mock api.js ───────────────────────────────────────────────────────────
vi.mock('../../api', () => ({
  getMatch: vi.fn().mockResolvedValue(MATCH),
  deleteMatch: vi.fn(),
  updatePlayerPosition: vi.fn(),
  updateMatchMeta: vi.fn(),
  clearMatchFileHash: vi.fn(),
  triggerMissingDMs: vi.fn(),
}));

// ── Mock contexts & hooks ─────────────────────────────────────────────────
let currentSteamUser = null;
vi.mock('../../context/SteamAuthContext', () => ({
  useSteamAuth: () => ({ steamUser: currentSteamUser }),
}));
vi.mock('../../context/SeasonContext', () => ({
  useSeason: () => ({ seasons: [], seasonId: null }),
}));
vi.mock('../../context/AdminContext', () => ({
  useAdmin: () => ({ isAdmin: false, adminKey: '', setShowModal: () => {} }),
}));
vi.mock('../../context/SuperuserContext', () => ({
  useSuperuser: () => ({ isSuperuser: false, superuserKey: '' }),
}));
vi.mock('../../context/FeatureFlagsContext', () => ({
  useFeatureFlag: () => true,
  useFeatureFlags: () => ({ flags: {}, loading: false, refresh: () => {} }),
}));
vi.mock('../../hooks/useProStatus', () => ({
  default: () => ({ isPro: false, loading: false }),
}));

// ── Mock direct fetch() calls ─────────────────────────────────────────────
function fetchMock(url) {
  const json = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  if (typeof url === 'string' && url.includes('/notes')) return json({ notes: [] });
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
}

// ── Helpers ───────────────────────────────────────────────────────────────
async function renderMatch() {
  const { default: MatchDetail } = await import('../MatchDetail.jsx');
  const utils = render(
    <MemoryRouter initialEntries={[`/match/${MATCH.match_id}`]}>
      <Routes>
        <Route path="/match/:matchId" element={<MatchDetail />} />
      </Routes>
    </MemoryRouter>,
  );
  // Wait for the post-fetch render: the match header H1 only appears once
  // getMatch() resolves and the inner component renders.
  await waitFor(() => {
    expect(utils.container.querySelector('h1')).not.toBeNull();
  });
  return utils;
}

function headings(container) {
  return Array.from(container.querySelectorAll('h2, h3')).map(
    (n) => n.textContent.replace(/\s+/g, ' ').trim(),
  );
}

// Explicit allow-list of headings that are intentionally only shown to the
// participant (or, conversely, only to the neutral viewer). Currently
// EMPTY: as of this test's introduction, no MatchDetail section is gated by
// viewer participation. Any future participant-only block (e.g. an MVP
// vote heading or attitude rating widget heading) must be added here with
// a one-line comment explaining the intentional gate.
const PARTICIPANT_ONLY_HEADINGS = new Set([
  // (none yet)
]);
const NEUTRAL_ONLY_HEADINGS = new Set([
  // (none yet)
]);

// ── Test ──────────────────────────────────────────────────────────────────
describe('MatchDetail participant/neutral-viewer parity (Task #101)', () => {
  beforeEach(() => {
    global.fetch = vi.fn(fetchMock);
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    // jsdom doesn't implement canvas; stub getContext so WardMapPanel's
    // useEffect doesn't throw if it ends up rendering.
    if (!HTMLCanvasElement.prototype.getContext) {
      HTMLCanvasElement.prototype.getContext = () => ({
        clearRect() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {},
        stroke() {}, moveTo() {}, lineTo() {}, closePath() {},
        drawImage() {}, save() {}, restore() {}, translate() {}, scale() {},
        setTransform() {}, fillText() {}, measureText: () => ({ width: 0 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
      });
    }
  });

  it('renders the same section headings for a participant and a neutral viewer', async () => {
    // Render 1: signed-in viewer is one of the match's participants.
    currentSteamUser = { accountId: PARTICIPANT_ACCOUNT_ID };
    const participant = await renderMatch();
    const participantHeadings = headings(participant.container);
    cleanup();

    // Render 2: signed-in viewer is NOT in the match.
    currentSteamUser = { accountId: '9999' };
    const neutral = await renderMatch();
    const neutralHeadings = headings(neutral.container);

    // Sanity: both renders must actually produce some panel headings —
    // otherwise the parity assertion below is vacuously true.
    expect(participantHeadings.length).toBeGreaterThan(0);
    expect(neutralHeadings.length).toBeGreaterThan(0);

    // ── Parity assertion ─────────────────────────────────────────────
    // Every heading visible to a participant must also be visible to a
    // neutral viewer, unless explicitly allow-listed. This is the
    // regression guard: if someone wraps an `<h3>` block in
    // `{viewerIsParticipant && …}` again, the neutral render will be
    // missing that heading and this fails.
    for (const title of participantHeadings) {
      if (PARTICIPANT_ONLY_HEADINGS.has(title)) continue;
      expect(
        neutralHeadings,
        `Heading "${title}" was visible to a participant but not to a neutral viewer — did a new viewer-is-participant gate slip in? If intentional, add it to PARTICIPANT_ONLY_HEADINGS.`,
      ).toContain(title);
    }
    // And the inverse: the neutral render must not gain headings the
    // participant can't see (sanity check).
    for (const title of neutralHeadings) {
      if (NEUTRAL_ONLY_HEADINGS.has(title)) continue;
      expect(
        participantHeadings,
        `Heading "${title}" appeared for the neutral viewer but not for a participant.`,
      ).toContain(title);
    }
  });
});
