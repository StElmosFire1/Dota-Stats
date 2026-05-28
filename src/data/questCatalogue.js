// Task #440 — Daily / Weekly quest catalogue (full edition only).
//
// Each quest is a self-contained predicate evaluated server-side against a
// per-player match summary (see `evalQuestProgress` in src/db/index.js).
// Quests are deliberately stateless and additive — the only persistence is
// the `player_quests` ledger row which accumulates `progress` until it
// reaches `target`, at which point Season Pass XP is awarded.
//
// `metric(player, match)` returns the integer progress delta this match
// contributes (0 if the quest doesn't apply / shouldn't tick). Keep the
// metric pure — no DB / network — so it stays trivially testable.

function team(p) { return p.team === 'radiant' || Number(p.team) === 0 ? 'radiant' : 'dire'; }
function won(p, match) { return (team(p) === 'radiant') === !!match.radiantWin; }
function position(p) { return Number(p.position || 0); } // 1..5 (Dota convention)

const DAILY_QUESTS = [
  {
    id: 'd_play_1',
    period: 'daily',
    title: 'Show up',
    description: 'Play 1 inhouse match today.',
    xp: 50,
    target: 1,
    metric: (_p, _m) => 1,
  },
  {
    id: 'd_win_1',
    period: 'daily',
    title: 'First blood of the day',
    description: 'Win 1 inhouse match today.',
    xp: 75,
    target: 1,
    metric: (p, m) => (won(p, m) ? 1 : 0),
  },
  {
    id: 'd_kills_15',
    period: 'daily',
    title: 'On a tear',
    description: 'Land 15 kills total across today\'s matches.',
    xp: 60,
    target: 15,
    metric: (p, _m) => Number(p.kills) || 0,
  },
  {
    id: 'd_assists_20',
    period: 'daily',
    title: 'Team player',
    description: 'Rack up 20 assists today.',
    xp: 60,
    target: 20,
    metric: (p, _m) => Number(p.assists) || 0,
  },
  {
    id: 'd_lh_300',
    period: 'daily',
    title: 'Farm patrol',
    description: 'Last-hit 300 creeps today.',
    xp: 60,
    target: 300,
    metric: (p, _m) => Number(p.last_hits) || 0,
  },
  {
    id: 'd_wards_5',
    period: 'daily',
    title: 'Light up the map',
    description: 'Place 5 observer wards today.',
    xp: 70,
    target: 5,
    metric: (p, _m) => Number(p.obs_placed) || 0,
  },
  {
    id: 'd_support_win',
    period: 'daily',
    title: 'Carry the carries',
    description: 'Win 1 match as position 4 or 5.',
    xp: 90,
    target: 1,
    metric: (p, m) => (won(p, m) && [4, 5].includes(position(p)) ? 1 : 0),
  },
  {
    id: 'd_denies_20',
    period: 'daily',
    title: 'Lane bully',
    description: 'Deny 20 creeps today.',
    xp: 60,
    target: 20,
    metric: (p, _m) => Number(p.denies) || 0,
  },
];

const WEEKLY_QUESTS = [
  {
    id: 'w_wins_4',
    period: 'weekly',
    title: 'Winning week',
    description: 'Win 4 inhouse matches this week.',
    xp: 250,
    target: 4,
    metric: (p, m) => (won(p, m) ? 1 : 0),
  },
  {
    id: 'w_play_8',
    period: 'weekly',
    title: 'Iron commitment',
    description: 'Play 8 inhouse matches this week.',
    xp: 200,
    target: 8,
    metric: (_p, _m) => 1,
  },
  {
    id: 'w_kills_60',
    period: 'weekly',
    title: 'Bloodbath',
    description: 'Land 60 total kills this week.',
    xp: 250,
    target: 60,
    metric: (p, _m) => Number(p.kills) || 0,
  },
  {
    id: 'w_hero_damage_200k',
    period: 'weekly',
    title: 'Damage dealer',
    description: 'Deal 200,000 hero damage this week.',
    xp: 250,
    target: 200000,
    metric: (p, _m) => Number(p.hero_damage) || 0,
  },
  {
    id: 'w_unique_heroes_3',
    period: 'weekly',
    title: 'Hero hopper',
    description: 'Win on 3 different heroes this week.',
    xp: 300,
    target: 3,
    // Special-cased — see evalQuestProgress (unique heroes are deduped at apply time).
    uniqueOn: 'hero_id',
    metric: (p, m) => (won(p, m) ? 1 : 0),
  },
  {
    id: 'w_support_games_5',
    period: 'weekly',
    title: 'Backbone',
    description: 'Play 5 games as a support (position 4 or 5).',
    xp: 220,
    target: 5,
    metric: (p, _m) => ([4, 5].includes(position(p)) ? 1 : 0),
  },
  {
    id: 'w_mvp_2',
    period: 'weekly',
    title: 'Most Valuable',
    description: 'Win 2 MVP votes this week.',
    xp: 350,
    target: 2,
    // mvp votes are evaluated separately in markMvpForQuests (see db/index.js)
    metric: (_p, _m) => 0,
    onMvp: true,
  },
];

const ALL_QUESTS = [...DAILY_QUESTS, ...WEEKLY_QUESTS];
const QUESTS_BY_ID = Object.fromEntries(ALL_QUESTS.map(q => [q.id, q]));

function pickDailyQuests(seed) {
  return _shuffle(DAILY_QUESTS, seed).slice(0, 3);
}
function pickWeeklyQuests(seed) {
  return _shuffle(WEEKLY_QUESTS, seed).slice(0, 2);
}

// Deterministic shuffle (xorshift-ish) so the same (account, period) always
// gets the same quest assignment — important for the cron-free refresh.
function _shuffle(arr, seed) {
  const out = arr.slice();
  let s = (Number(seed) >>> 0) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

module.exports = {
  DAILY_QUESTS,
  WEEKLY_QUESTS,
  ALL_QUESTS,
  QUESTS_BY_ID,
  pickDailyQuests,
  pickWeeklyQuests,
};
