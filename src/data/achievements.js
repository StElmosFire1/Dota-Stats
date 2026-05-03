'use strict';

/**
 * Achievement catalogue — single source of truth.
 *
 * Each entry defines a static achievement used across the system.
 * The `check(stats)` function receives an aggregate stats object produced by
 * `_getPlayerAggregateStats()` in db/index.js and returns true if the player
 * has earned this achievement.
 *
 * Profile pages derive earned/unlock dates from the persisted `achievements`
 * table rows; the check functions are only invoked by the grant engine
 * (checkAndGrantAchievements).
 */

const ACHIEVEMENTS_CATALOGUE = [
  // ── Milestones ──────────────────────────────────────────────────────────────
  { key: 'veteran_10',       label: 'Rookie',               desc: '10 games played',                              icon: '🎮',  group: 'Milestones',    secret: false, check: s => s.games >= 10 },
  { key: 'veteran_25',       label: 'Veteran',              desc: '25 games played',                              icon: '🎖️',  group: 'Milestones',    secret: false, check: s => s.games >= 25 },
  { key: 'veteran_50',       label: 'Battle-Hardened',      desc: '50 games played',                              icon: '⚔️',  group: 'Milestones',    secret: false, check: s => s.games >= 50 },
  { key: 'veteran_100',      label: 'Centurion',            desc: '100 games played',                             icon: '🏆',  group: 'Milestones',    secret: false, check: s => s.games >= 100 },
  { key: 'veteran_200',      label: 'Elder',                desc: '200 games played',                             icon: '🌟',  group: 'Milestones',    secret: false, check: s => s.games >= 200 },
  { key: 'veteran_300',      label: 'Legend',               desc: '300 games played',                             icon: '💎',  group: 'Milestones',    secret: false, check: s => s.games >= 300 },
  { key: 'veteran_500',      label: 'Immortal',             desc: '500 games played',                             icon: '👁️',  group: 'Milestones',    secret: false, check: s => s.games >= 500 },
  { key: 'wins_50',          label: 'Half Century',         desc: '50 career wins',                               icon: '🥇',  group: 'Milestones',    secret: false, check: s => s.totalWins >= 50 },

  // ── Win Rate ────────────────────────────────────────────────────────────────
  { key: 'wr_55',            label: 'Above Average',        desc: '55%+ win rate (20+ games)',                    icon: '📈',  group: 'Win Rate',      secret: false, check: s => s.games >= 20 && s.winRate >= 0.55 },
  { key: 'wr_60',            label: 'Dominant',             desc: '60%+ win rate (20+ games)',                    icon: '🔝',  group: 'Win Rate',      secret: false, check: s => s.games >= 20 && s.winRate >= 0.60 },
  { key: 'wr_65',            label: 'Unstoppable Force',    desc: '65%+ win rate (20+ games)',                    icon: '👑',  group: 'Win Rate',      secret: false, check: s => s.games >= 20 && s.winRate >= 0.65 },

  // ── Streaks ──────────────────────────────────────────────────────────────────
  { key: 'streak_3',         label: 'Hot',                  desc: '3-game win streak',                            icon: '🌶️',  group: 'Streaks',       secret: false, check: s => s.maxWinStreak >= 3 },
  { key: 'streak_5',         label: 'On Fire',              desc: '5-game win streak',                            icon: '🔥',  group: 'Streaks',       secret: false, check: s => s.maxWinStreak >= 5 },
  { key: 'streak_7',         label: 'Dominant Streak',      desc: '7-game win streak',                            icon: '🎖️',  group: 'Streaks',       secret: false, check: s => s.maxWinStreak >= 7 },
  { key: 'streak_10',        label: 'Unstoppable',          desc: '10-game win streak',                           icon: '💥',  group: 'Streaks',       secret: false, check: s => s.maxWinStreak >= 10 },
  { key: 'loss_streak_5',    label: 'Tilted',               desc: 'Suffered a 5-game loss streak and survived',   icon: '😤',  group: 'Streaks',       secret: false, check: s => s.maxLossStreak >= 5 },

  // ── Survivability ────────────────────────────────────────────────────────────
  { key: 'deathless',        label: 'Untouchable',          desc: 'Won a game with 0 deaths',                     icon: '🛡️',  group: 'Survivability', secret: false, check: s => s.deathlessWins >= 1 },
  { key: 'deathless_5',      label: 'Ghost',                desc: '5+ deathless game wins',                       icon: '👻',  group: 'Survivability', secret: false, check: s => s.deathlessWins >= 5 },
  { key: 'deathless_10',     label: 'Phantom',              desc: '10+ deathless game wins',                      icon: '💀',  group: 'Survivability', secret: false, check: s => s.deathlessWins >= 10 },

  // ── Roles ────────────────────────────────────────────────────────────────────
  { key: 'captain_5',        label: 'Born Leader',          desc: 'Captained 5+ matches',                         icon: '👑',  group: 'Roles',         secret: false, check: s => s.captainGames >= 5 },
  { key: 'captain_15',       label: 'Commander',            desc: 'Captained 15+ matches',                        icon: '⚜️',  group: 'Roles',         secret: false, check: s => s.captainGames >= 15 },
  { key: 'all_positions',    label: 'Versatile',            desc: 'Played all 5 positions',                       icon: '🎭',  group: 'Roles',         secret: false, check: s => s.positionsPlayed >= 5 },
  { key: 'carry_king',       label: 'Carry King',           desc: '20+ games as Safe Lane (Pos 1)',               icon: '🗡️',  group: 'Roles',         secret: false, check: s => s.carryGames >= 20 },
  { key: 'support_master',   label: 'Support Master',       desc: '20+ games as Support (Pos 4/5)',               icon: '🩺',  group: 'Roles',         secret: false, check: s => s.supportGames >= 20 },

  // ── Hero Pool ────────────────────────────────────────────────────────────────
  { key: 'hero_5',           label: 'Experimenter',         desc: '5+ different heroes played',                   icon: '🎲',  group: 'Hero Pool',     secret: false, check: s => s.uniqueHeroes >= 5 },
  { key: 'hero_diversity',   label: 'Jack of All Trades',   desc: '15+ different heroes played',                  icon: '🃏',  group: 'Hero Pool',     secret: false, check: s => s.uniqueHeroes >= 15 },
  { key: 'hero_diversity_25',label: 'Hero Collector',       desc: '25+ different heroes played',                  icon: '📚',  group: 'Hero Pool',     secret: false, check: s => s.uniqueHeroes >= 25 },
  { key: 'specialist',       label: 'Specialist',           desc: '10+ games on one hero',                        icon: '🎯',  group: 'Hero Pool',     secret: false, check: s => s.maxOnOneHero >= 10 },
  { key: 'specialist_20',    label: 'One-Trick',            desc: '20+ games on one hero',                        icon: '🔒',  group: 'Hero Pool',     secret: false, check: s => s.maxOnOneHero >= 20 },
  { key: 'specialist_50',    label: 'True Main',            desc: '50+ games on one hero',                        icon: '💫',  group: 'Hero Pool',     secret: false, check: s => s.maxOnOneHero >= 50 },

  // ── Hero Mastery ─────────────────────────────────────────────────────────────
  { key: 'hero_mastery_wr50',label: 'Hero Specialist',      desc: '50%+ win rate on 10+ games with one hero',     icon: '🎯',  group: 'Hero Mastery',  secret: false, check: s => s.bestHeroWr >= 0.50 },
  { key: 'hero_mastery_wr60',label: 'Hero Expert',          desc: '60%+ win rate on 10+ games with one hero',     icon: '⭐',  group: 'Hero Mastery',  secret: false, check: s => s.bestHeroWr >= 0.60 },
  { key: 'hero_mastery_wr70',label: 'Hero Master',          desc: '70%+ win rate on 10+ games with one hero',     icon: '🌟',  group: 'Hero Mastery',  secret: false, check: s => s.bestHeroWr >= 0.70 },
  { key: 'hero_mastery_win10',label: 'Hero Victor',         desc: '10+ wins on a single hero',                    icon: '🏅',  group: 'Hero Mastery',  secret: false, check: s => s.maxHeroWins >= 10 },

  // ── Multi-kills ───────────────────────────────────────────────────────────────
  { key: 'rampage',          label: 'RAMPAGE',              desc: 'Achieved at least one rampage',                icon: '☠️',  group: 'Multi-kills',   secret: false, check: s => s.rampages >= 1 },
  { key: 'rampage_3',        label: 'Slaughterer',          desc: '3+ rampages total',                            icon: '🩸',  group: 'Multi-kills',   secret: false, check: s => s.rampages >= 3 },
  { key: 'ultra_kill',       label: 'Ultra Kill',           desc: 'Got an Ultra Kill',                            icon: '⚡',  group: 'Multi-kills',   secret: false, check: s => s.ultraKills >= 1 },
  { key: 'multikill_10',     label: 'Kill Artist',          desc: '10+ multi-kills (combined)',                   icon: '🔪',  group: 'Multi-kills',   secret: false, check: s => (s.doubleKills + s.tripleKills + s.ultraKills + s.rampages) >= 10 },
  { key: 'massacre',         label: 'Massacre',             desc: '20+ kills in a single game',                   icon: '💣',  group: 'Multi-kills',   secret: false, check: s => s.maxKills >= 20 },

  // ── First Blood ───────────────────────────────────────────────────────────────
  { key: 'first_blood',      label: 'First Blood',          desc: 'Claimed first blood',                          icon: '💉',  group: 'First Blood',   secret: false, check: s => s.firstBloods >= 1 },
  { key: 'bloodthirsty',     label: 'Bloodthirsty',         desc: '10+ first bloods',                             icon: '🩸',  group: 'First Blood',   secret: false, check: s => s.firstBloods >= 10 },
  { key: 'serial_killer',    label: 'Serial Killer',        desc: '25+ first bloods',                             icon: '🎯',  group: 'First Blood',   secret: false, check: s => s.firstBloods >= 25 },

  // ── Totals ────────────────────────────────────────────────────────────────────
  { key: 'kills_100',        label: 'Centurion Killer',     desc: '100 total kills',                              icon: '⚔️',  group: 'Totals',        secret: false, check: s => s.totalKills >= 100 },
  { key: 'kills_500',        label: 'Warlord',              desc: '500 total kills',                              icon: '⚔️',  group: 'Totals',        secret: false, check: s => s.totalKills >= 500 },
  { key: 'assists_250',      label: 'Team Player',          desc: '250 total assists',                            icon: '🤝',  group: 'Totals',        secret: false, check: s => s.totalAssists >= 250 },
  { key: 'lh_5000',          label: 'Farmer',               desc: '5,000 total last hits',                        icon: '🌾',  group: 'Totals',        secret: false, check: s => s.totalLh >= 5000 },
  { key: 'lh_20000',         label: 'Harvest King',         desc: '20,000 total last hits',                       icon: '🌾',  group: 'Totals',        secret: false, check: s => s.totalLh >= 20000 },
  { key: 'chicken_killer',   label: 'Chicken Killer',       desc: '20+ total courier kills',                      icon: '🐔',  group: 'Totals',        secret: false, check: s => s.totalCourierKills >= 20 },
  { key: 'chicken_slayer',   label: 'Courier Slayer',       desc: '50+ total courier kills',                      icon: '🍗',  group: 'Totals',        secret: false, check: s => s.totalCourierKills >= 50 },

  // ── Economy ───────────────────────────────────────────────────────────────────
  { key: 'efficient',        label: 'Gold Factory',         desc: '600+ GPM in a single game',                    icon: '💰',  group: 'Economy',       secret: false, check: s => s.maxGpm >= 600 },
  { key: 'gpm_700',          label: 'Mint',                 desc: '700+ GPM in a single game',                    icon: '💸',  group: 'Economy',       secret: false, check: s => s.maxGpm >= 700 },
  { key: 'lh_record',        label: 'CS Monster',           desc: '300+ last hits in a single game',              icon: '🧲',  group: 'Economy',       secret: false, check: s => s.maxLastHits >= 300 },

  // ── Damage ────────────────────────────────────────────────────────────────────
  { key: 'big_damage',       label: 'Demolisher',           desc: '30,000+ hero damage in one game',              icon: '💥',  group: 'Damage',        secret: false, check: s => s.maxDamage >= 30000 },
  { key: 'big_damage_50k',   label: 'Nuke',                 desc: '50,000+ hero damage in one game',              icon: '☢️',  group: 'Damage',        secret: false, check: s => s.maxDamage >= 50000 },
  { key: 'tower_destroyer',  label: 'Tower Buster',         desc: '5,000+ tower damage in one game',              icon: '🏯',  group: 'Damage',        secret: false, check: s => s.maxTowerDamage >= 5000 },
  { key: 'tower_5_total',    label: 'Siege Master',         desc: '50,000+ total tower damage',                   icon: '🏰',  group: 'Damage',        secret: false, check: s => s.totalTowerDamage >= 50000 },

  // ── Healing ───────────────────────────────────────────────────────────────────
  { key: 'healer',           label: 'Field Medic',          desc: '5,000+ healing in one game',                   icon: '💚',  group: 'Healing',       secret: false, check: s => s.maxHealing >= 5000 },
  { key: 'great_healer',     label: 'Lifesaver',            desc: '15,000+ healing in one game',                  icon: '❤️',  group: 'Healing',       secret: false, check: s => s.maxHealing >= 15000 },
  { key: 'total_healer',     label: 'Angel',                desc: '100,000+ total healing',                       icon: '🕊️',  group: 'Healing',       secret: false, check: s => s.totalHealing >= 100000 },

  // ── Vision ────────────────────────────────────────────────────────────────────
  { key: 'ward_lord',        label: 'Ward Lord',            desc: '200+ wards placed',                            icon: '👁️',  group: 'Vision',        secret: false, check: s => s.wardsPlaced >= 200 },
  { key: 'ward_500',         label: 'All-Seeing Eye',       desc: '500+ wards placed',                            icon: '🔭',  group: 'Vision',        secret: false, check: s => s.wardsPlaced >= 500 },
  { key: 'ward_breaker',     label: 'Ward Breaker',         desc: '50+ enemy wards killed',                       icon: '🔍',  group: 'Vision',        secret: false, check: s => s.wardsKilled >= 50 },
  { key: 'ward_breaker_150', label: 'Dewarder',             desc: '150+ enemy wards killed',                      icon: '🚫',  group: 'Vision',        secret: false, check: s => s.wardsKilled >= 150 },

  // ── KDA ───────────────────────────────────────────────────────────────────────
  { key: 'kda_3',            label: 'Efficient',            desc: '3.0+ average KDA (10+ games)',                 icon: '📊',  group: 'KDA',           secret: false, check: s => s.games >= 10 && s.avgKda >= 3.0 },
  { key: 'kda_5',            label: 'Flawless',             desc: '5.0+ average KDA (10+ games)',                 icon: '✨',  group: 'KDA',           secret: false, check: s => s.games >= 10 && s.avgKda >= 5.0 },

  // ── Community ─────────────────────────────────────────────────────────────────
  { key: 'mvp_first',        label: 'Most Valuable',        desc: 'Win your first MVP vote',                      icon: '⭐',  group: 'Community',     secret: false, check: s => s.mvpWins >= 1 },
  { key: 'mvp_10',           label: 'Fan Favourite',        desc: 'Win 10 MVP votes',                             icon: '🌟',  group: 'Community',     secret: false, check: s => s.mvpWins >= 10 },
  { key: 'mvp_25',           label: 'Legend',               desc: 'Win 25 MVP votes',                             icon: '🏆',  group: 'Community',     secret: false, check: s => s.mvpWins >= 25 },
  { key: 'voter_1',          label: 'Good Sport',           desc: 'Cast your first MVP vote',                     icon: '🗳️',  group: 'Community',     secret: false, check: s => s.votesSent >= 1 },
  { key: 'voter_20',         label: 'Engaged',              desc: 'Cast 20 MVP votes',                            icon: '👍',  group: 'Community',     secret: false, check: s => s.votesSent >= 20 },
  { key: 'well_rated',       label: 'Beloved',              desc: '9.0+ average attitude rating (10+ ratings)',   icon: '💖',  group: 'Community',     secret: false, check: s => s.attitudeCount >= 10 && s.avgAttitude >= 9.0 },

  // ── Referrals ─────────────────────────────────────────────────────────────────
  { key: 'referral_1',   label: 'Recruiter',      desc: 'Refer 1 player to the league',     icon: '📨',  group: 'Community',     secret: false, check: s => s.referrals >= 1 },
  { key: 'referral_3',   label: 'Talent Scout',   desc: 'Refer 3 players to the league',    icon: '🎯',  group: 'Community',     secret: false, check: s => s.referrals >= 3 },
  { key: 'referral_5',   label: 'League Builder', desc: 'Refer 5+ players to the league',   icon: '🏗️',  group: 'Community',     secret: false, check: s => s.referrals >= 5 },

  // ── Secret (label/desc hidden until earned) ───────────────────────────────────
  { key: 'secret_hat_trick',       label: 'Hat Trick',       desc: 'First blood in 3 consecutive games',          icon: '🎩',  group: 'Secret',        secret: true,  check: s => s.maxConsecFb >= 3 },
  { key: 'secret_perfect_support', label: 'Selfless',        desc: '0 kills, 0 deaths, 10+ assists in a winning game', icon: '🕊️', group: 'Secret',   secret: true,  check: s => s.hasPerfectSupport },
  { key: 'secret_early_bird',      label: 'Rise and Grind',  desc: 'Win a game in under 25 minutes',              icon: '⏰',  group: 'Secret',        secret: true,  check: s => s.hasEarlyBird },
  { key: 'secret_marathon',        label: 'The Long Game',   desc: 'Win a game lasting over 70 minutes',          icon: '🦉',  group: 'Secret',        secret: true,  check: s => s.hasMarathon },
  { key: 'secret_ghost_rampage',   label: 'Ghost',           desc: '20+ kills with 0 deaths in one game',         icon: '⚡',  group: 'Secret',        secret: true,  check: s => s.hasGhostRampage },
  { key: 'secret_support_carry',   label: 'Role Reversal',   desc: 'Play Pos 4/5 with 5+ kills and more kills than deaths', icon: '🎭', group: 'Secret', secret: true, check: s => s.hasSupportCarry },
];

/** Lookup map: key → catalogue entry */
const ACHIEVEMENTS_BY_KEY = Object.fromEntries(ACHIEVEMENTS_CATALOGUE.map(a => [a.key, a]));

const ACHIEVEMENT_CATEGORY_ORDER = [
  'Milestones', 'Win Rate', 'Streaks', 'Survivability', 'Roles',
  'Hero Pool', 'Hero Mastery', 'Multi-kills', 'First Blood',
  'Totals', 'Economy', 'Damage', 'Healing', 'Vision', 'KDA',
  'Community', 'Secret',
];

module.exports = { ACHIEVEMENTS_CATALOGUE, ACHIEVEMENTS_BY_KEY, ACHIEVEMENT_CATEGORY_ORDER };
