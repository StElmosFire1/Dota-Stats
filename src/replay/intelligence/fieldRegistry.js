// src/replay/intelligence/fieldRegistry.js
//
// Full-edition replay telemetry field registry.
//
// Every field that is currently parsed, derivable, or could be added with a
// parser extension is catalogued here with machine-readable metadata so that
// the match-intelligence pipeline can self-document what data is available,
// what needs to be derived, and what is restricted from public output.
//
// Field metadata shape:
//   {
//     key         : string   — stable identifier
//     label       : string   — human-readable name
//     category    : string   — grouping bucket
//     status      : 'available' | 'derivable' | 'parser_extension' | 'patch_limited' | 'unavailable'
//     source      : string   — where the value comes from
//     units       : string   — measurement unit or encoding (null if unitless/flag)
//     confidence  : 'high' | 'medium' | 'low'
//     retention   : 'public' | 'participant' | 'admin' | 'private'
//     privacy     : 'none' | 'position' | 'chat' | 'coaching' | 'path'
//     visibility  : 'always' | 'feature_flag' | 'admin_only' | 'opt_in'
//     notes       : string?  — optional extra context
//   }
//
// STATUS DEFINITIONS
//   available         — Data is produced by the current parser pipeline and
//                       persisted (or can be taken straight from persisted JSON).
//   derivable         — Can be computed from existing persisted columns without
//                       touching the parser (pure function over stored data).
//   parser_extension  — Requires a parser code change to surface the raw event.
//   patch_limited     — Data exists in some demo files but not others; accuracy
//                       depends on the replay patch version.
//   unavailable       — Not currently possible to extract from Dota 2 replays.
//
// RETENTION / PRIVACY CLASSES
//   public      — Safe to expose on the public match API.
//   participant — Only shown to the player whose data this is, their coach,
//                 or an admin.
//   admin       — Only shown to site admins.
//   private     — Never exposed via API; only used internally for derivations.
//
// PRIVACY TAGS
//   none      — No special privacy concern.
//   position  — Exact position trails; must be bounded/aggregated before exposure.
//   chat      — Player-generated text content; opt-in or admin-only.
//   coaching  — Coaching-session artifacts; participant + coach only.
//   path      — File-system paths or internal server paths.

'use strict';

// ---------------------------------------------------------------------------
// Registry data
// ---------------------------------------------------------------------------

const FIELD_REGISTRY = [

  // ── Draft ─────────────────────────────────────────────────────────────────

  {
    key: 'draft.pick_ban_order',
    label: 'Complete Pick/Ban Order',
    category: 'draft',
    status: 'available',
    source: 'parser → matches.draft JSONB',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'draft.team_per_action',
    label: 'Team for Each Pick/Ban',
    category: 'draft',
    status: 'available',
    source: 'parser → matches.draft JSONB',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'draft.phase',
    label: 'Pick/Ban Phase Index',
    category: 'draft',
    status: 'available',
    source: 'parser → matches.draft JSONB',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'draft.hero_order',
    label: 'Hero Draft Order',
    category: 'draft',
    status: 'available',
    source: 'parser → matches.draft JSONB',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'draft.timing',
    label: 'Draft Action Timestamps',
    category: 'draft',
    status: 'available',
    source: 'parser → matches.draft JSONB',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
    notes: 'Not all demo files include draft timing; null when absent.',
  },

  // ── Chat and communication ────────────────────────────────────────────────

  {
    key: 'chat.chat_wheel',
    label: 'Chat-Wheel Lines',
    category: 'chat',
    status: 'available',
    source: 'parser → matches.chat_log JSONB (type: chat_wheel)',
    units: null,
    confidence: 'high',
    retention: 'admin',
    privacy: 'chat',
    visibility: 'admin_only',
    notes: 'Opt-in or admin-only; personal player content.',
  },
  {
    key: 'chat.system_messages',
    label: 'Pause/Unpause and System Messages',
    category: 'chat',
    status: 'available',
    source: 'parser → matches.chat_log JSONB (type: pause|unpause|system)',
    units: null,
    confidence: 'medium',
    retention: 'admin',
    privacy: 'chat',
    visibility: 'admin_only',
  },

  // ── Position data ─────────────────────────────────────────────────────────

  {
    key: 'position.one_second_samples',
    label: 'One-Second Player Positions',
    category: 'position',
    status: 'parser_extension',
    source: 'parser (positional interval events) → game_timeline.players[].positions',
    units: 'dota world units',
    confidence: 'high',
    retention: 'participant',
    privacy: 'position',
    visibility: 'feature_flag',
    notes: 'Currently sampled every 10s. Full 1s resolution needs parser change.',
  },
  {
    key: 'position.trails',
    label: 'Full Position Trails',
    category: 'position',
    status: 'parser_extension',
    source: 'parser → positional events',
    units: 'dota world units',
    confidence: 'high',
    retention: 'participant',
    privacy: 'path',
    visibility: 'opt_in',
    notes: 'Exact paths; must be bounded before exposure. Requires dense 1s sampling.',
  },
  {
    key: 'position.lane_routes',
    label: 'Lane Routes',
    category: 'position',
    status: 'derivable',
    source: 'Derived from position samples + lane polygon map',
    units: null,
    confidence: 'medium',
    retention: 'participant',
    privacy: 'position',
    visibility: 'feature_flag',
  },
  {
    key: 'position.rotation_paths',
    label: 'Rotation Paths',
    category: 'position',
    status: 'derivable',
    source: 'Derived from position samples',
    units: null,
    confidence: 'medium',
    retention: 'participant',
    privacy: 'position',
    visibility: 'feature_flag',
  },
  {
    key: 'position.jungle_pathing',
    label: 'Jungle Pathing',
    category: 'position',
    status: 'derivable',
    source: 'Derived from position samples + jungle region polygons',
    units: null,
    confidence: 'medium',
    retention: 'participant',
    privacy: 'position',
    visibility: 'feature_flag',
  },
  {
    key: 'position.heatmaps',
    label: 'Position Heatmaps',
    category: 'position',
    status: 'derivable',
    source: 'Binned from position samples into grid',
    units: 'grid cells',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
    notes: 'Aggregated/binned; OK for public. Raw trails are private.',
  },
  {
    key: 'position.death_locations',
    label: 'Death Locations',
    category: 'position',
    status: 'available',
    source: 'parser → game_timeline.events (type: kill, victimSlot)',
    units: 'dota world units',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'position.fight_locations',
    label: 'Fight Locations',
    category: 'position',
    status: 'derivable',
    source: 'Derived from fight detector + kill event coordinates',
    units: 'dota world units',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'position.ward_coverage_maps',
    label: 'Ward Coverage Maps',
    category: 'position',
    status: 'parser_extension',
    source: 'Requires ward-placement coordinates from parser',
    units: 'dota world units',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },

  // ── Teamfights ────────────────────────────────────────────────────────────

  {
    key: 'fights.structured_blocks',
    label: 'Structured Teamfight Blocks',
    category: 'fights',
    status: 'available',
    source: 'fightDetector → matches.game_timeline.fights + match_fights table',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'fights.start_end_time',
    label: 'Fight Start/End Time',
    category: 'fights',
    status: 'available',
    source: 'fightDetector → start_s, end_s',
    units: 'seconds',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'fights.location',
    label: 'Fight Location',
    category: 'fights',
    status: 'derivable',
    source: 'Derived from kill event coordinates within fight window',
    units: 'dota world units',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'fights.players_involved',
    label: 'Players Involved in Fight',
    category: 'fights',
    status: 'available',
    source: 'fightDetector → heroes[]',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'fights.kills_deaths',
    label: 'Kills and Deaths per Fight',
    category: 'fights',
    status: 'available',
    source: 'fightDetector → radiant_deaths, dire_deaths',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'fights.damage_healing',
    label: 'Damage and Healing During Fight',
    category: 'fights',
    status: 'parser_extension',
    source: 'Requires per-event damage/heal log from parser',
    units: 'HP',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'fights.net_worth_swing',
    label: 'Net-Worth Swing per Fight',
    category: 'fights',
    status: 'derivable',
    source: 'Derived from game_timeline NW samples bracketing fight window',
    units: 'gold',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'fights.buybacks_used',
    label: 'Buybacks Used in Fight',
    category: 'fights',
    status: 'derivable',
    source: 'Derived from game_timeline.players[].buybackEvents within fight window',
    units: null,
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'fights.ultimate_usage',
    label: 'Ultimate Usage in Fight',
    category: 'fights',
    status: 'parser_extension',
    source: 'Requires ability cast log from parser',
    units: null,
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'fights.winner',
    label: 'Fight Winner',
    category: 'fights',
    status: 'available',
    source: 'fightDetector → winner field',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'fights.participation_detail',
    label: 'Fight Participation Detail',
    category: 'fights',
    status: 'derivable',
    source: 'Derived from game_timeline NW deltas within fight window',
    units: null,
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },

  // ── Buybacks ──────────────────────────────────────────────────────────────

  {
    key: 'buyback.full_timeline',
    label: 'Full Buyback Timeline',
    category: 'economy',
    status: 'available',
    source: 'parser → game_timeline.players[].buybackEvents',
    units: 'seconds',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'buyback.timing',
    label: 'Buyback Timing',
    category: 'economy',
    status: 'available',
    source: 'parser → buybackEvents[].t',
    units: 'seconds',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'buyback.death_to_bb_delay',
    label: 'Death-to-Buyback Delay',
    category: 'economy',
    status: 'derivable',
    source: 'Derived from death event time + buybackEvents[].t',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'buyback.likely_cost',
    label: 'Buyback Likely Cost',
    category: 'economy',
    status: 'derivable',
    source: 'Derived from player NW at time of buyback (formula: 200 + NW/13)',
    units: 'gold',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'buyback.outcome',
    label: 'Buyback Outcome (dieback flag)',
    category: 'economy',
    status: 'available',
    source: 'parser → buybackEvents[].dieback',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },

  // ── Runes ─────────────────────────────────────────────────────────────────

  {
    key: 'runes.type_breakdown',
    label: 'Rune Type Breakdown',
    category: 'economy',
    status: 'available',
    source: 'parser → game_timeline.runePickups[].type',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },

  // ── Teleport scrolls ──────────────────────────────────────────────────────

  {
    key: 'tp.exact_timings',
    label: 'Exact TP Timings',
    category: 'movement',
    status: 'parser_extension',
    source: 'Requires TP cast events from parser',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },

  // ── Wards ─────────────────────────────────────────────────────────────────

  {
    key: 'wards.placement_timeline',
    label: 'Full Ward Placement/Death Timeline',
    category: 'vision',
    status: 'available',
    source: 'parser → game_timeline.wardDeaths + player ward_placements',
    units: 'seconds',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'wards.placement_coords',
    label: 'Ward Placement Coordinates',
    category: 'vision',
    status: 'parser_extension',
    source: 'Requires coordinate capture in ward-place event',
    units: 'dota world units',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'wards.coverage_area',
    label: 'Ward Coverage Area',
    category: 'vision',
    status: 'parser_extension',
    source: 'Derived from placement coords + ward vision radius tables',
    units: 'grid cells',
    confidence: 'low',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },

  // ── Smoke ─────────────────────────────────────────────────────────────────

  {
    key: 'smoke.timeline',
    label: 'Better Smoke Timeline and Affected Players',
    category: 'vision',
    status: 'available',
    source: 'parser → game_timeline.players[].smokeTimes + smokeSuccesses',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },

  // ── Skills and talents ────────────────────────────────────────────────────

  {
    key: 'abilities.talent_choices',
    label: 'Talent Choices',
    category: 'abilities',
    status: 'available',
    source: 'parser → game_timeline.players[].abilityLog (talents)',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'abilities.talent_timing',
    label: 'Talent Timing',
    category: 'abilities',
    status: 'available',
    source: 'parser → abilityLog[].time',
    units: 'seconds',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'abilities.skill_build',
    label: 'Full Skill Build Timeline',
    category: 'abilities',
    status: 'available',
    source: 'parser → game_timeline.players[].abilityLog',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'abilities.level_progression',
    label: 'Ability-Level Progression',
    category: 'abilities',
    status: 'available',
    source: 'parser → abilityLog (heroLevel, abilityLevel, time)',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'abilities.cast_log',
    label: 'Ability Cast Log (target, hit/miss, location)',
    category: 'abilities',
    status: 'parser_extension',
    source: 'Requires ability_cast events from parser',
    units: null,
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'abilities.facet_innate',
    label: 'Facet/Innate Data',
    category: 'abilities',
    status: 'patch_limited',
    source: 'Demo schema field; only in patches that expose it',
    units: null,
    confidence: 'low',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
    notes: 'Availability depends on Dota 2 patch version in replay.',
  },

  // ── Item timeline ─────────────────────────────────────────────────────────

  {
    key: 'items.purchase_timeline',
    label: 'Item Purchase Timeline',
    category: 'economy',
    status: 'available',
    source: 'parser → game_timeline.players[].purchaseLog',
    units: 'seconds',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'items.purchase_time',
    label: 'Item Purchase Time',
    category: 'economy',
    status: 'available',
    source: 'parser → purchaseLog[].time',
    units: 'seconds',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'items.sale_time',
    label: 'Item Sale Time',
    category: 'economy',
    status: 'parser_extension',
    source: 'Requires item_sell events from parser',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'items.swaps_transfers',
    label: 'Item Swaps and Inventory Transfers',
    category: 'economy',
    status: 'parser_extension',
    source: 'Requires inventory_transfer events from parser',
    units: null,
    confidence: 'low',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'items.neutral_discovery',
    label: 'Neutral Item Discovery, Choice, Transfer, Timing',
    category: 'economy',
    status: 'parser_extension',
    source: 'Requires neutral-item events from parser',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'items.roshan_items',
    label: 'Aegis/Cheese/Refresher Shard/Banner History',
    category: 'economy',
    status: 'derivable',
    source: 'Derived from roshan + aegis events in game_timeline.events',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'items.consumable_use',
    label: 'Consumable Use (Smoke, Dust, Clarities, Mangos, etc.)',
    category: 'economy',
    status: 'parser_extension',
    source: 'Requires consumable_use events from parser',
    units: null,
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'items.courier_deliveries',
    label: 'Courier Deliveries and Deaths',
    category: 'economy',
    status: 'parser_extension',
    source: 'Requires courier events from parser',
    units: null,
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },

  // ── Combat detail ─────────────────────────────────────────────────────────

  {
    key: 'combat.damage_by_ability',
    label: 'Damage Dealt by Ability',
    category: 'combat',
    status: 'parser_extension',
    source: 'Requires damage_dealt events keyed by ability from parser',
    units: 'HP',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'combat.damage_by_item',
    label: 'Damage Dealt by Item',
    category: 'combat',
    status: 'parser_extension',
    source: 'Requires damage_dealt events keyed by item from parser',
    units: 'HP',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'combat.damage_by_type',
    label: 'Physical / Magical / Pure Damage Breakdown',
    category: 'combat',
    status: 'parser_extension',
    source: 'Requires damage type field on damage events',
    units: 'HP',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'combat.damage_received',
    label: 'Damage Received by Source',
    category: 'combat',
    status: 'parser_extension',
    source: 'Requires damage_received events from parser',
    units: 'HP',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'combat.healing_breakdown',
    label: 'Healing by Hero/Ability/Item/Ally',
    category: 'combat',
    status: 'parser_extension',
    source: 'Requires heal events from parser',
    units: 'HP',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'combat.shielding',
    label: 'Shielding / Damage Prevented',
    category: 'combat',
    status: 'parser_extension',
    source: 'Requires shield events where exposed by replay',
    units: 'HP',
    confidence: 'low',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'combat.burst_damage_windows',
    label: 'Burst Damage Windows (3/5/10s)',
    category: 'combat',
    status: 'parser_extension',
    source: 'Derived from damage event stream',
    units: 'HP per window',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'combat.disable_chain',
    label: 'Disable-Chain Duration',
    category: 'combat',
    status: 'parser_extension',
    source: 'Requires stun/root/hex events from parser',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'combat.cc_uptime',
    label: 'Silence/Root/Stun/Hex/Slow/Break Uptime',
    category: 'combat',
    status: 'parser_extension',
    source: 'Requires modifier events from parser',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'combat.mana_efficiency',
    label: 'Mana Spent and Mana Efficiency',
    category: 'combat',
    status: 'parser_extension',
    source: 'Requires mana spend log from parser',
    units: 'mana',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },

  // ── Economy ───────────────────────────────────────────────────────────────

  {
    key: 'economy.gold_xp_timeline',
    label: 'Exact Gold and XP Gain Timeline',
    category: 'economy',
    status: 'available',
    source: 'parser → game_timeline.players[].samples (nw, xp)',
    units: 'gold / XP',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'economy.gold_lost_on_death',
    label: 'Gold Lost on Death',
    category: 'economy',
    status: 'parser_extension',
    source: 'Requires gold_loss events from parser',
    units: 'gold',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'economy.gold_spent_by_category',
    label: 'Gold Spent by Item Category',
    category: 'economy',
    status: 'derivable',
    source: 'Derived from purchaseLog + item cost table',
    units: 'gold',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },

  // ── Laning ────────────────────────────────────────────────────────────────

  {
    key: 'laning.lane_assignment',
    label: 'Exact Lane Assignment by Time',
    category: 'laning',
    status: 'derivable',
    source: 'Derived from position samples + lane polygons',
    units: null,
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'laning.cs_deny_differential',
    label: 'CS/Deny Differential by Minute',
    category: 'laning',
    status: 'available',
    source: 'parser → player_stats laning_nw, laneOutcomesSummary',
    units: 'last hits / denies',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'laning.gold_xp_differential',
    label: 'Gold/XP Differential by Minute',
    category: 'laning',
    status: 'derivable',
    source: 'Derived from game_timeline NW/XP samples per lane pair',
    units: 'gold / XP',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'laning.lane_outcomes_summary',
    label: 'Lane Outcomes Summary',
    category: 'laning',
    status: 'available',
    source: 'parser → game_timeline.laneOutcomesSummary',
    units: null,
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'laning.support_rotation_timing',
    label: 'Support Rotation Timing',
    category: 'laning',
    status: 'parser_extension',
    source: 'Derived from position samples + kill events near non-own-lane',
    units: 'seconds',
    confidence: 'low',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },

  // ── Vision ────────────────────────────────────────────────────────────────

  {
    key: 'vision.vision_uptime',
    label: 'Vision Uptime',
    category: 'vision',
    status: 'parser_extension',
    source: 'Requires vision-state events from parser',
    units: 'seconds',
    confidence: 'low',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'vision.wards_dewarded',
    label: 'Wards Dewarded and Likely Source',
    category: 'vision',
    status: 'available',
    source: 'parser → game_timeline.wardDeaths',
    units: null,
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'vision.gem_ownership',
    label: 'Gem Ownership and Duration',
    category: 'vision',
    status: 'parser_extension',
    source: 'Requires gem pickup/drop events from parser',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'vision.smoke_breaks',
    label: 'Smoke Breaks',
    category: 'vision',
    status: 'available',
    source: 'parser → smokeSuccesses per player',
    units: null,
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },

  // ── Objectives ────────────────────────────────────────────────────────────

  {
    key: 'objectives.tower_timing',
    label: 'Tower Destruction Timing and Contributors',
    category: 'objectives',
    status: 'available',
    source: 'parser → game_timeline.events (type: building_kill)',
    units: 'seconds',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'objectives.roshan_timing',
    label: 'Roshan Kill Timing',
    category: 'objectives',
    status: 'available',
    source: 'parser → game_timeline.events (type: roshan)',
    units: 'seconds',
    confidence: 'high',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'objectives.aegis_expiry',
    label: 'Aegis Expiration vs Consumption',
    category: 'objectives',
    status: 'available',
    source: 'parser → game_timeline.events (type: aegis)',
    units: null,
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'always',
  },
  {
    key: 'objectives.tormentor_timing',
    label: 'Tormentor Timing',
    category: 'objectives',
    status: 'patch_limited',
    source: 'parser → game_timeline.events; only in patches with Tormentors',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
    notes: 'Tormentors introduced in patch 7.33.',
  },
  {
    key: 'objectives.glyph_usage',
    label: 'Glyph Use Relative to Tower Pressure',
    category: 'objectives',
    status: 'parser_extension',
    source: 'Requires glyph_cast events from parser',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'objectives.objective_conversion',
    label: 'Objective Conversion (fight → tower/Roshan)',
    category: 'objectives',
    status: 'derivable',
    source: 'Derived from fight timeline + subsequent objective events',
    units: null,
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },

  // ── Movement / map behaviour ──────────────────────────────────────────────

  {
    key: 'movement.distance_travelled',
    label: 'Distance Travelled',
    category: 'movement',
    status: 'derivable',
    source: 'Derived from position sample deltas',
    units: 'dota world units',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'movement.time_per_region',
    label: 'Time in Each Map Region',
    category: 'movement',
    status: 'derivable',
    source: 'Derived from position samples + region polygon map',
    units: 'seconds',
    confidence: 'medium',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },
  {
    key: 'movement.isolation_time',
    label: 'Isolation Time (away from all teammates)',
    category: 'movement',
    status: 'derivable',
    source: 'Derived from position samples comparing hero vs team positions',
    units: 'seconds',
    confidence: 'low',
    retention: 'public',
    privacy: 'none',
    visibility: 'feature_flag',
  },

  // ── Derived coaching metrics ──────────────────────────────────────────────

  {
    key: 'coaching.deaths_before_objectives',
    label: 'Deaths Before Key Objectives',
    category: 'coaching',
    status: 'derivable',
    source: 'Derived from death timeline + objective event timeline',
    units: null,
    confidence: 'medium',
    retention: 'participant',
    privacy: 'coaching',
    visibility: 'opt_in',
  },
  {
    key: 'coaching.died_with_buyback',
    label: '"Died with Buyback Available"',
    category: 'coaching',
    status: 'derivable',
    source: 'Derived from death events + player gold at time of death',
    units: null,
    confidence: 'medium',
    retention: 'participant',
    privacy: 'coaching',
    visibility: 'opt_in',
  },
  {
    key: 'coaching.buyback_no_fight',
    label: '"Used Buyback but Did Not Rejoin Meaningful Fight"',
    category: 'coaching',
    status: 'derivable',
    source: 'Derived from buybackEvents.dieback + fight window proximity',
    units: null,
    confidence: 'medium',
    retention: 'participant',
    privacy: 'coaching',
    visibility: 'opt_in',
    notes: 'dieback=false and no subsequent fight within 120s is a proxy.',
  },
  {
    key: 'coaching.farm_efficiency',
    label: 'Farm Efficiency by Minute',
    category: 'coaching',
    status: 'derivable',
    source: 'Derived from NW samples vs theoretical maximum farm',
    units: 'gold/min relative',
    confidence: 'low',
    retention: 'participant',
    privacy: 'coaching',
    visibility: 'opt_in',
  },
  {
    key: 'coaching.fight_attendance_rate',
    label: 'Fight Attendance Rate',
    category: 'coaching',
    status: 'derivable',
    source: 'Derived from fight participation / total fights',
    units: 'percent',
    confidence: 'high',
    retention: 'participant',
    privacy: 'coaching',
    visibility: 'opt_in',
  },
  {
    key: 'coaching.objective_attendance_rate',
    label: 'Objective Attendance Rate',
    category: 'coaching',
    status: 'derivable',
    source: 'Derived from presence-at-objective events / total objectives',
    units: 'percent',
    confidence: 'medium',
    retention: 'participant',
    privacy: 'coaching',
    visibility: 'opt_in',
  },
  {
    key: 'coaching.throw_comeback_detection',
    label: 'Throw/Comeback Detection',
    category: 'coaching',
    status: 'derivable',
    source: 'Derived from NW lead → loss pattern in timeline',
    units: null,
    confidence: 'medium',
    retention: 'participant',
    privacy: 'coaching',
    visibility: 'opt_in',
  },
  {
    key: 'coaching.win_probability_swing',
    label: 'Win-Probability Swing Approximation',
    category: 'coaching',
    status: 'derivable',
    source: 'Derived from NW differential + kills + objectives over time',
    units: 'percent delta',
    confidence: 'low',
    retention: 'participant',
    privacy: 'coaching',
    visibility: 'opt_in',
  },
  {
    key: 'coaching.item_timing_vs_benchmark',
    label: 'Item Timing vs Bracket/Hero Benchmarks',
    category: 'coaching',
    status: 'derivable',
    source: 'Derived from purchaseLog + supplied cohort distributions',
    units: 'seconds delta',
    confidence: 'medium',
    retention: 'participant',
    privacy: 'coaching',
    visibility: 'opt_in',
  },
  {
    key: 'coaching.net_worth_lead_conversion',
    label: 'Net-Worth Lead Conversion Rate',
    category: 'coaching',
    status: 'derivable',
    source: 'Derived from NW lead windows vs subsequent objective conversions',
    units: 'percent',
    confidence: 'medium',
    retention: 'participant',
    privacy: 'coaching',
    visibility: 'opt_in',
  },
  {
    key: 'coaching.clutch_metrics',
    label: 'Clutch Metrics (saves, steals, base defences, comeback fights)',
    category: 'coaching',
    status: 'derivable',
    source: 'Derived from fight + objective data when trailing',
    units: null,
    confidence: 'low',
    retention: 'participant',
    privacy: 'coaching',
    visibility: 'opt_in',
  },

  // ── Internal / never-exposed ──────────────────────────────────────────────

  {
    key: 'internal.replay_path',
    label: 'Replay File Path',
    category: 'internal',
    status: 'available',
    source: 'matches.replay_path DB column',
    units: null,
    confidence: 'high',
    retention: 'private',
    privacy: 'path',
    visibility: 'admin_only',
    notes: 'Never exposed via public or participant API.',
  },
  {
    key: 'internal.chat_text',
    label: 'Player Chat Text',
    category: 'internal',
    status: 'available',
    source: 'matches.chat_log JSONB (type: text)',
    units: null,
    confidence: 'high',
    retention: 'private',
    privacy: 'chat',
    visibility: 'admin_only',
    notes: 'Never exposed publicly. Admin access only with opt-in.',
  },
];

// ---------------------------------------------------------------------------
// Registry lookup helpers
// ---------------------------------------------------------------------------

/** Return all registry entries. */
function getAllFields() {
  return FIELD_REGISTRY.slice();
}

/** Return entries filtered by status. */
function getFieldsByStatus(status) {
  if (!status) return [];
  return FIELD_REGISTRY.filter(f => f.status === status);
}

/** Return entries filtered by category. */
function getFieldsByCategory(category) {
  if (!category) return [];
  return FIELD_REGISTRY.filter(f => f.category === category);
}

/** Return entries safe for public exposure (retention: 'public'). */
function getPublicFields() {
  return FIELD_REGISTRY.filter(f => f.retention === 'public');
}

/** Return entries safe for participant exposure. */
function getParticipantFields() {
  return FIELD_REGISTRY.filter(
    f => f.retention === 'public' || f.retention === 'participant'
  );
}

/** Look up a single field by key. Returns undefined when not found. */
function getField(key) {
  return FIELD_REGISTRY.find(f => f.key === key);
}

/** Summarise the registry: counts by status and by category. */
function registrySummary() {
  const byStatus = {};
  const byCategory = {};
  const byRetention = {};
  for (const f of FIELD_REGISTRY) {
    byStatus[f.status] = (byStatus[f.status] || 0) + 1;
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    byRetention[f.retention] = (byRetention[f.retention] || 0) + 1;
  }
  return {
    total: FIELD_REGISTRY.length,
    byStatus,
    byCategory,
    byRetention,
  };
}

// ---------------------------------------------------------------------------
// Visibility filter — strips fields that should not appear in a given context.
// ---------------------------------------------------------------------------

/**
 * context: 'public' | 'participant' | 'admin'
 * Returns an array of field keys that are allowed for that context.
 */
function getAllowedFieldKeys(context) {
  return FIELD_REGISTRY
    .filter(f => {
      if (context === 'admin') return true;
      if (context === 'participant') {
        return f.retention === 'public' || f.retention === 'participant';
      }
      // public
      return f.retention === 'public';
    })
    .map(f => f.key);
}

module.exports = {
  FIELD_REGISTRY,
  getAllFields,
  getFieldsByStatus,
  getFieldsByCategory,
  getPublicFields,
  getParticipantFields,
  getField,
  registrySummary,
  getAllowedFieldKeys,
};
