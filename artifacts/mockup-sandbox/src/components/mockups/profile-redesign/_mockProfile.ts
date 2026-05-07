// Realistic placeholder personas for the PlayerProfile redesign mockups.
// Mirror of the real shapes from web/src/profileCosmetics.js + the
// /api/player/:id/* responses consumed by web/src/pages/PlayerProfile.jsx,
// so what the variants render lines up with what the live page already has.

export type Persona = "free" | "pro" | "ogpro";

export interface MockPlayer {
  persona: Persona;
  steam_id: string;
  display_name: string;
  signed_in: boolean;
  is_pro: boolean;
  is_og_pro: boolean;          // founder / animated frame eligibility
  member_since: string;        // ISO date
  primary_pos: 1 | 2 | 3 | 4 | 5;
  rank: { tier: string; division: number; mmr: number; peak: number };
  impact: { score: number; rank_pct: number };  // 0..10
  perf_avg: number;            // last 30 games
  customization: {
    bio: string;
    custom_title: string;       // free or premium title
    theme_accent: string;       // hex
    profile_frame: "none" | "silver" | "gold" | "neon-blue" | "cosmic" | "fire";
    pinned_hero_id: number;
    pinned_hero_caption: string;
    extras: {
      pinned_hero_border: string | null;
      pinned_achievement_id: string | null;
      flair_unlocked: boolean;
      flair_override: string | null;
      show_top_heroes: boolean;
      show_streak: boolean;
      frame_animated: boolean;
      bg_pattern: boolean;
      social_twitch: string | null;
      social_youtube: string | null;
      social_steam: string | null;
    };
  };
  pinnedHero: { hero_id: number; name: string; games: number; wins: number; kda: number; caption: string; borderColor: string | null };
  pinnedMatch: { match_id: number; hero_id: number; hero: string; kills: number; deaths: number; assists: number; player_won: boolean; duration: number; start_time: number; radiantScore: number; direScore: number };
  pinnedAchievement: { emoji: string; label: string; sub: string };
  topHeroes: Array<{ hero_id: number; name: string; games: number; wins: number; kda: number }>;
  streak: number;
  flairAuto: string;
  recent: { wins: number; losses: number; kda: number; gpm: number; xpm: number; lh: number };
  achievements: Array<{ emoji: string; label: string; sub: string; rarity: "common" | "rare" | "epic" | "legendary" }>;
  mmrHistory: number[];        // last ~30 entries
  scouting: { strengths: string[]; weaknesses: string[]; tldr: string };
  socials: { twitch?: string; youtube?: string; steam?: string };
}

const FREE: MockPlayer = {
  persona: "free",
  steam_id: "76561198073811934",
  display_name: "ShadowCarry",
  signed_in: true,
  is_pro: false,
  is_og_pro: false,
  member_since: "2023-08-12",
  primary_pos: 1,
  rank: { tier: "Diamond", division: 3, mmr: 4820, peak: 5012 },
  impact: { score: 6.4, rank_pct: 38 },
  perf_avg: 5.8,
  customization: {
    bio: "Pos 1 main. Antimage / Spectre enthusiast. Will farm in lane until something explodes.",
    custom_title: "Pos 1 Enjoyer",
    theme_accent: "#3b82f6",
    profile_frame: "silver",
    pinned_hero_id: 1, // Anti-Mage
    pinned_hero_caption: "If we hit 25 minutes, we win.",
    extras: {
      pinned_hero_border: null,
      pinned_achievement_id: "first_blood_streak",
      flair_unlocked: false,
      flair_override: null,
      show_top_heroes: true,
      show_streak: true,
      frame_animated: false,
      bg_pattern: false,
      social_twitch: null,
      social_youtube: null,
      social_steam: null,
    },
  },
  pinnedHero: { hero_id: 1, name: "Anti-Mage", games: 47, wins: 28, kda: 3.8, caption: "If we hit 25 minutes, we win.", borderColor: null },
  pinnedMatch: { match_id: 7842931, hero_id: 1, hero: "Anti-Mage", kills: 14, deaths: 2, assists: 6, player_won: true, duration: 2310, start_time: 1746421200, radiantScore: 38, direScore: 17 },
  pinnedAchievement: { emoji: "🩸", label: "First Blood Streak", sub: "5 games in a row" },
  topHeroes: [
    { hero_id: 1, name: "Anti-Mage", games: 47, wins: 28, kda: 3.8 },
    { hero_id: 7, name: "Earthshaker", games: 22, wins: 14, kda: 4.1 },
    { hero_id: 11, name: "Shadow Fiend", games: 19, wins: 9, kda: 2.6 },
    { hero_id: 20, name: "Vengeful Spirit", games: 17, wins: 11, kda: 3.4 },
    { hero_id: 35, name: "Sniper", games: 12, wins: 5, kda: 2.0 },
  ],
  streak: 3,
  flairAuto: "Hard Carry",
  recent: { wins: 18, losses: 12, kda: 3.4, gpm: 612, xpm: 698, lh: 287 },
  achievements: [
    { emoji: "🩸", label: "First Blood Streak", sub: "5 in a row", rarity: "rare" },
    { emoji: "⚔️", label: "Rampage", sub: "1 lifetime", rarity: "epic" },
    { emoji: "💰", label: "GPM 800+", sub: "12 games", rarity: "common" },
    { emoji: "🎯", label: "Comeback Kid", sub: "Won from -25k", rarity: "rare" },
  ],
  mmrHistory: [4400, 4380, 4420, 4470, 4510, 4480, 4530, 4570, 4540, 4600, 4640, 4680, 4720, 4690, 4730, 4770, 4810, 4830, 4870, 4850, 4820, 4790, 4830, 4870, 4900, 4880, 4860, 4790, 4810, 4820],
  scouting: {
    strengths: ["Lane farm", "Survivability", "Late-game scaling"],
    weaknesses: ["Pre-15 fights", "Vision", "Drafting flex picks"],
    tldr: "Locks in a single carry archetype. Rewarded for farm-heavy drafts; punished when forced into early teamfights.",
  },
  socials: {},
};

const PRO: MockPlayer = {
  persona: "pro",
  steam_id: "76561198029811233",
  display_name: "BrassKnuckles",
  signed_in: true,
  is_pro: true,
  is_og_pro: false,
  member_since: "2022-03-04",
  primary_pos: 2,
  rank: { tier: "Immortal", division: 0, mmr: 5860, peak: 5912 },
  impact: { score: 7.9, rank_pct: 8 },
  perf_avg: 7.6,
  customization: {
    bio: "Mid lane. Spell-slinger. I draft what wins, not what's comfortable.",
    custom_title: "Hook Wizard",
    theme_accent: "#f59e0b",
    profile_frame: "gold",
    pinned_hero_id: 14, // Pudge
    pinned_hero_caption: "Six hooks, six gg's. Don't ward for me, ward for the rest.",
    extras: {
      pinned_hero_border: "#c5a975",
      pinned_achievement_id: "rampage",
      flair_unlocked: true,
      flair_override: "MVP Magnet",
      show_top_heroes: true,
      show_streak: true,
      frame_animated: false,
      bg_pattern: true,
      social_twitch: "https://twitch.tv/brassknuckles",
      social_youtube: "https://youtube.com/@brassknuckles",
      social_steam: "https://steamcommunity.com/id/brassknuckles",
    },
  },
  pinnedHero: { hero_id: 14, name: "Pudge", games: 86, wins: 59, kda: 5.2, caption: "Six hooks, six gg's. Don't ward for me, ward for the rest.", borderColor: "#c5a975" },
  pinnedMatch: { match_id: 7896412, hero_id: 14, hero: "Pudge", kills: 22, deaths: 4, assists: 18, player_won: true, duration: 2890, start_time: 1746334800, radiantScore: 51, direScore: 28 },
  pinnedAchievement: { emoji: "👑", label: "Rampage", sub: "Pudge — vs Radiant carry stack" },
  topHeroes: [
    { hero_id: 14, name: "Pudge", games: 86, wins: 59, kda: 5.2 },
    { hero_id: 8, name: "Juggernaut", games: 42, wins: 26, kda: 4.6 },
    { hero_id: 11, name: "Shadow Fiend", games: 38, wins: 24, kda: 4.0 },
    { hero_id: 64, name: "Jakiro", games: 31, wins: 21, kda: 3.8 },
    { hero_id: 26, name: "Lion", games: 28, wins: 17, kda: 4.2 },
  ],
  streak: 6,
  flairAuto: "Mid Lord",
  recent: { wins: 24, losses: 9, kda: 4.7, gpm: 658, xpm: 742, lh: 254 },
  achievements: [
    { emoji: "👑", label: "Rampage", sub: "3 lifetime", rarity: "legendary" },
    { emoji: "🏆", label: "MVP Magnet", sub: "12 in 30d", rarity: "epic" },
    { emoji: "🔥", label: "10-game streak", sub: "May 2026", rarity: "epic" },
    { emoji: "🪝", label: "100 Hooks", sub: "Career", rarity: "rare" },
    { emoji: "💀", label: "First Blood King", sub: "32 lifetime", rarity: "rare" },
    { emoji: "💎", label: "Immortal", sub: "Reached this season", rarity: "epic" },
  ],
  mmrHistory: [5500, 5520, 5540, 5510, 5560, 5590, 5570, 5610, 5640, 5670, 5650, 5690, 5720, 5700, 5740, 5770, 5750, 5800, 5830, 5860, 5840, 5870, 5910, 5890, 5860, 5870, 5900, 5870, 5840, 5860],
  scouting: {
    strengths: ["Rotations", "Picks & playmaking", "Drafting", "Late-game cool head"],
    weaknesses: ["Lane CS vs immortal mids", "Item timings on supports"],
    tldr: "Win-condition for the team. Plays the map, not the lane — drafts smother-comp Pudge / Jakiro stacks and accelerates them with vision and rotations.",
  },
  socials: { twitch: "https://twitch.tv/brassknuckles", youtube: "https://youtube.com/@brassknuckles", steam: "https://steamcommunity.com/id/brassknuckles" },
};

const OGPRO: MockPlayer = {
  persona: "ogpro",
  steam_id: "76561198001234567",
  display_name: "OldManOffLane",
  signed_in: true,
  is_pro: true,
  is_og_pro: true,
  member_since: "2021-06-28",
  primary_pos: 3,
  rank: { tier: "Divine", division: 4, mmr: 5410, peak: 5611 },
  impact: { score: 7.2, rank_pct: 14 },
  perf_avg: 7.1,
  customization: {
    bio: "Pos 3 lifer. Centaur, Tide, Mars. I make space; you take it.",
    custom_title: "Pro Tier Founder",
    theme_accent: "#c5a975",
    profile_frame: "fire",
    pinned_hero_id: 96, // Centaur Warrunner
    pinned_hero_caption: "Stomp. Roar. Survive everything.",
    extras: {
      pinned_hero_border: "#f59e0b",
      pinned_achievement_id: "founder",
      flair_unlocked: true,
      flair_override: "GOAT",
      show_top_heroes: true,
      show_streak: true,
      frame_animated: true,
      bg_pattern: true,
      social_twitch: "https://twitch.tv/oldmanofflane",
      social_youtube: null,
      social_steam: "https://steamcommunity.com/id/oldmanofflane",
    },
  },
  pinnedHero: { hero_id: 96, name: "Centaur Warrunner", games: 119, wins: 73, kda: 4.4, caption: "Stomp. Roar. Survive everything.", borderColor: "#f59e0b" },
  pinnedMatch: { match_id: 7901234, hero_id: 96, hero: "Centaur Warrunner", kills: 9, deaths: 3, assists: 24, player_won: true, duration: 3140, start_time: 1746248400, radiantScore: 42, direScore: 38 },
  pinnedAchievement: { emoji: "🏛️", label: "Founder", sub: "Pro Tier — Day One" },
  topHeroes: [
    { hero_id: 96, name: "Centaur Warrunner", games: 119, wins: 73, kda: 4.4 },
    { hero_id: 47, name: "Tidehunter", games: 88, wins: 54, kda: 3.9 },
    { hero_id: 129, name: "Mars", games: 64, wins: 39, kda: 3.6 },
    { hero_id: 71, name: "Spirit Breaker", games: 41, wins: 24, kda: 4.1 },
    { hero_id: 28, name: "Slardar", games: 33, wins: 21, kda: 4.0 },
  ],
  streak: 4,
  flairAuto: "Off-Lane Bruiser",
  recent: { wins: 21, losses: 11, kda: 3.8, gpm: 521, xpm: 624, lh: 198 },
  achievements: [
    { emoji: "🏛️", label: "Founder", sub: "Pro Tier — Day One", rarity: "legendary" },
    { emoji: "🐎", label: "100 Centaur Wins", sub: "Career", rarity: "epic" },
    { emoji: "🌊", label: "Anchor Smash", sub: "30 stuns/game avg", rarity: "rare" },
    { emoji: "⛰️", label: "Initiator", sub: "Top 5% engagement", rarity: "epic" },
    { emoji: "🛡️", label: "Tank", sub: "Highest hero damage taken", rarity: "rare" },
    { emoji: "🏆", label: "Captain", sub: "60% W/R as captain", rarity: "rare" },
    { emoji: "🔥", label: "5-game streak", sub: "May 2026", rarity: "common" },
  ],
  mmrHistory: [5200, 5230, 5260, 5240, 5280, 5310, 5290, 5340, 5370, 5350, 5390, 5420, 5400, 5440, 5470, 5450, 5490, 5510, 5480, 5510, 5470, 5440, 5410, 5380, 5410, 5430, 5400, 5380, 5410, 5410],
  scouting: {
    strengths: ["Map control", "Initiation", "Tankiness", "Veteran calls", "Captaincy"],
    weaknesses: ["Solo-kill pressure post-30min", "Limited hero pool outside meta bruisers"],
    tldr: "Anchor of the off-lane. Drafting around him means the team gets initiation and durability for free; he just needs damage cores around him to convert it.",
  },
  socials: { twitch: "https://twitch.tv/oldmanofflane", steam: "https://steamcommunity.com/id/oldmanofflane" },
};

export const PERSONAS: Record<Persona, MockPlayer> = { free: FREE, pro: PRO, ogpro: OGPRO };

export const HERO_NAMES: Record<number, string> = {
  1: "Anti-Mage", 7: "Earthshaker", 8: "Juggernaut", 11: "Shadow Fiend",
  14: "Pudge", 17: "Storm Spirit", 20: "Vengeful Spirit", 26: "Lion",
  28: "Slardar", 31: "Lich", 35: "Sniper", 47: "Tidehunter",
  64: "Jakiro", 71: "Spirit Breaker", 96: "Centaur Warrunner", 129: "Mars",
};

// OpenDota CDN gives stable hero portraits. Avoid 404s by gating on known IDs.
export function heroImg(heroId: number): string {
  const slug = (HERO_NAMES[heroId] || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!slug) return "";
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;
}

export function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// v2 extras: deeper stats consumed by MagazineSpreadV2.tsx.
// Kept in a separate EXTRAS map so v1 personas stay unchanged.
// ---------------------------------------------------------------------------

export interface RecentMatch {
  match_id: number;
  hero_id: number;
  hero: string;
  won: boolean;
  k: number; d: number; a: number;
  duration: number;
  start_time: number;
  mmr_delta: number;
}

export interface AllyRow {
  steam_id: string;
  name: string;
  games: number;
  wins: number;
}

export interface HeroMatchup {
  hero_id: number;
  name: string;
  with_games: number;
  with_wr: number;
  vs_games: number;
  vs_wr: number;
}

export interface PerfStat {
  label: string;
  delta: number; // +/- vs role baseline, percent
}

export interface MockExtras {
  positions: Array<{ pos: 1 | 2 | 3 | 4 | 5; games: number; wins: number }>;
  statAvg: {
    lh: number; dn: number;
    heroDmg: number; towerDmg: number;
    healing: number; stuns: number;
    wards: number; campsStacked: number; runes: number;
  };
  multiKills: { double: number; triple: number; ultra: number; rampage: number };
  rollingWR: number[];               // 30 values 0..100
  recentMatches: RecentMatch[];      // last 10
  bestAllies: AllyRow[];
  worstAllies: AllyRow[];
  heroMatchups: HeroMatchup[];
  // 7 weekdays (Mon..Sun) × 4 buckets (00-06, 06-12, 12-18, 18-24); -1 = no games
  heatmap: number[][];
  perfHelped: PerfStat[];
  perfHurt: PerfStat[];
  buildTrends: { items: Array<{ name: string; pct: number }>; skillOrder: string[] };
}

const NOW = 1746421200; // matches FREE.pinnedMatch.start_time
const D = 86400;

const FREE_X: MockExtras = {
  positions: [
    { pos: 1, games: 24, wins: 15 },
    { pos: 2, games: 4, wins: 2 },
    { pos: 3, games: 2, wins: 1 },
    { pos: 4, games: 0, wins: 0 },
    { pos: 5, games: 0, wins: 0 },
  ],
  statAvg: { lh: 287, dn: 12, heroDmg: 22400, towerDmg: 4200, healing: 210, stuns: 4.2, wards: 1, campsStacked: 2.4, runes: 8 },
  multiKills: { double: 18, triple: 4, ultra: 1, rampage: 1 },
  rollingWR: [50, 52, 55, 53, 58, 60, 57, 62, 65, 60, 58, 56, 60, 62, 64, 60, 57, 55, 58, 60, 63, 60, 58, 56, 58, 60, 62, 60, 58, 60],
  recentMatches: [
    { match_id: 7842931, hero_id: 1,  hero: "Anti-Mage",       won: true,  k: 14, d: 2, a: 6,  duration: 2310, start_time: NOW,         mmr_delta: +24 },
    { match_id: 7842220, hero_id: 11, hero: "Shadow Fiend",    won: false, k: 6,  d: 9, a: 4,  duration: 2680, start_time: NOW - 1*D,   mmr_delta: -23 },
    { match_id: 7841119, hero_id: 7,  hero: "Earthshaker",     won: true,  k: 4,  d: 3, a: 18, duration: 2890, start_time: NOW - 2*D,   mmr_delta: +20 },
    { match_id: 7840002, hero_id: 1,  hero: "Anti-Mage",       won: true,  k: 11, d: 4, a: 5,  duration: 2440, start_time: NOW - 3*D,   mmr_delta: +22 },
    { match_id: 7838991, hero_id: 35, hero: "Sniper",          won: false, k: 5,  d: 7, a: 7,  duration: 2110, start_time: NOW - 4*D,   mmr_delta: -25 },
    { match_id: 7837800, hero_id: 1,  hero: "Anti-Mage",       won: true,  k: 9,  d: 1, a: 4,  duration: 2530, start_time: NOW - 5*D,   mmr_delta: +21 },
    { match_id: 7836711, hero_id: 20, hero: "Vengeful Spirit", won: true,  k: 3,  d: 4, a: 21, duration: 3020, start_time: NOW - 6*D,   mmr_delta: +19 },
    { match_id: 7835600, hero_id: 1,  hero: "Anti-Mage",       won: false, k: 8,  d: 6, a: 3,  duration: 2200, start_time: NOW - 7*D,   mmr_delta: -22 },
    { match_id: 7834505, hero_id: 8,  hero: "Juggernaut",      won: true,  k: 13, d: 3, a: 7,  duration: 2620, start_time: NOW - 8*D,   mmr_delta: +24 },
    { match_id: 7833491, hero_id: 1,  hero: "Anti-Mage",       won: true,  k: 16, d: 2, a: 4,  duration: 2380, start_time: NOW - 9*D,   mmr_delta: +25 },
  ],
  bestAllies: [
    { steam_id: "76561198029811233", name: "BrassKnuckles",  games: 18, wins: 14 },
    { steam_id: "76561198001234567", name: "OldManOffLane",  games: 12, wins: 9 },
    { steam_id: "76561198100200300", name: "WardSlut",       games: 9,  wins: 7 },
    { steam_id: "76561198400500600", name: "WhipDelivery",   games: 8,  wins: 6 },
    { steam_id: "76561198700800900", name: "PingMachine",    games: 6,  wins: 4 },
  ],
  worstAllies: [
    { steam_id: "76561198111222333", name: "AfkSimulator",   games: 11, wins: 2 },
    { steam_id: "76561198444555666", name: "CourierFeeder",  games: 9,  wins: 2 },
    { steam_id: "76561198777888999", name: "MidGriefer",     games: 8,  wins: 2 },
    { steam_id: "76561198000111222", name: "TiltMaster",     games: 7,  wins: 2 },
    { steam_id: "76561198333444555", name: "SmokeOnCD",      games: 6,  wins: 2 },
  ],
  heroMatchups: [
    { hero_id: 14, name: "Pudge",          with_games: 9,  with_wr: 67, vs_games: 6, vs_wr: 33 },
    { hero_id: 11, name: "Shadow Fiend",   with_games: 8,  with_wr: 50, vs_games: 7, vs_wr: 43 },
    { hero_id: 7,  name: "Earthshaker",    with_games: 12, with_wr: 75, vs_games: 4, vs_wr: 50 },
    { hero_id: 8,  name: "Juggernaut",     with_games: 5,  with_wr: 40, vs_games: 9, vs_wr: 56 },
    { hero_id: 96, name: "Centaur",        with_games: 6,  with_wr: 67, vs_games: 5, vs_wr: 40 },
    { hero_id: 47, name: "Tidehunter",     with_games: 5,  with_wr: 60, vs_games: 8, vs_wr: 25 },
  ],
  heatmap: [
    [-1,-1, 50, 60],
    [-1,-1, 45, 65],
    [-1,-1, 55, 70],
    [-1,-1, 50, 55],
    [-1,-1, 60, 75],
    [-1, 50, 55, 80],
    [-1, 40, 60, 65],
  ],
  perfHelped: [
    { label: "Last hits / min",  delta: +18 },
    { label: "Hero damage",      delta: +12 },
    { label: "Survivability",    delta: +9 },
  ],
  perfHurt: [
    { label: "Stuns landed",     delta: -22 },
    { label: "Wards placed",     delta: -14 },
    { label: "Early kills",      delta: -8 },
  ],
  buildTrends: {
    items: [
      { name: "Battle Fury",    pct: 92 },
      { name: "Manta Style",    pct: 78 },
      { name: "Abyssal Blade",  pct: 64 },
      { name: "Butterfly",      pct: 51 },
      { name: "Monkey King Bar",pct: 38 },
    ],
    skillOrder: ["Q","Q","W","Q","Q","R","Q","W","W","W","R","W","E","E","E","E","R"],
  },
};

const PRO_X: MockExtras = {
  positions: [
    { pos: 1, games: 3,  wins: 1 },
    { pos: 2, games: 28, wins: 21 },
    { pos: 3, games: 0,  wins: 0 },
    { pos: 4, games: 0,  wins: 0 },
    { pos: 5, games: 2,  wins: 1 },
  ],
  statAvg: { lh: 254, dn: 18, heroDmg: 28600, towerDmg: 5800, healing: 180, stuns: 11.4, wards: 2, campsStacked: 4.1, runes: 14 },
  multiKills: { double: 42, triple: 11, ultra: 4, rampage: 3 },
  rollingWR: [60, 62, 64, 67, 70, 72, 68, 74, 76, 73, 70, 72, 75, 78, 80, 76, 73, 70, 72, 75, 77, 74, 72, 70, 72, 75, 73, 70, 72, 73],
  recentMatches: [
    { match_id: 7896412, hero_id: 14, hero: "Pudge",         won: true,  k: 22, d: 4, a: 18, duration: 2890, start_time: 1746334800,         mmr_delta: +24 },
    { match_id: 7896001, hero_id: 11, hero: "Shadow Fiend",  won: true,  k: 17, d: 3, a: 9,  duration: 2410, start_time: 1746334800 - 1*D,   mmr_delta: +22 },
    { match_id: 7895212, hero_id: 14, hero: "Pudge",         won: false, k: 9,  d: 7, a: 12, duration: 3110, start_time: 1746334800 - 2*D,   mmr_delta: -21 },
    { match_id: 7894100, hero_id: 8,  hero: "Juggernaut",    won: true,  k: 18, d: 5, a: 7,  duration: 2740, start_time: 1746334800 - 3*D,   mmr_delta: +23 },
    { match_id: 7893012, hero_id: 64, hero: "Jakiro",        won: true,  k: 6,  d: 4, a: 22, duration: 2610, start_time: 1746334800 - 4*D,   mmr_delta: +20 },
    { match_id: 7891901, hero_id: 14, hero: "Pudge",         won: true,  k: 19, d: 6, a: 14, duration: 3220, start_time: 1746334800 - 5*D,   mmr_delta: +21 },
    { match_id: 7890800, hero_id: 26, hero: "Lion",          won: false, k: 4,  d: 8, a: 11, duration: 2480, start_time: 1746334800 - 6*D,   mmr_delta: -22 },
    { match_id: 7889711, hero_id: 14, hero: "Pudge",         won: true,  k: 14, d: 4, a: 19, duration: 2820, start_time: 1746334800 - 7*D,   mmr_delta: +22 },
    { match_id: 7888600, hero_id: 11, hero: "Shadow Fiend",  won: true,  k: 21, d: 4, a: 8,  duration: 2310, start_time: 1746334800 - 8*D,   mmr_delta: +25 },
    { match_id: 7887500, hero_id: 14, hero: "Pudge",         won: false, k: 7,  d: 9, a: 13, duration: 3340, start_time: 1746334800 - 9*D,   mmr_delta: -20 },
  ],
  bestAllies: [
    { steam_id: "76561198001234567", name: "OldManOffLane",  games: 24, wins: 19 },
    { steam_id: "76561198073811934", name: "ShadowCarry",    games: 18, wins: 14 },
    { steam_id: "76561198100200300", name: "WardSlut",       games: 16, wins: 12 },
    { steam_id: "76561198400500600", name: "WhipDelivery",   games: 12, wins: 9  },
    { steam_id: "76561198700800900", name: "PingMachine",    games: 9,  wins: 7  },
  ],
  worstAllies: [
    { steam_id: "76561198111222333", name: "AfkSimulator",   games: 14, wins: 4 },
    { steam_id: "76561198444555666", name: "CourierFeeder",  games: 11, wins: 3 },
    { steam_id: "76561198777888999", name: "MidGriefer",     games: 10, wins: 3 },
    { steam_id: "76561198000111222", name: "TiltMaster",     games: 8,  wins: 2 },
    { steam_id: "76561198333444555", name: "SmokeOnCD",      games: 7,  wins: 2 },
  ],
  heroMatchups: [
    { hero_id: 14, name: "Pudge",         with_games: 24, with_wr: 79, vs_games: 9,  vs_wr: 33 },
    { hero_id: 11, name: "Shadow Fiend",  with_games: 18, with_wr: 72, vs_games: 14, vs_wr: 64 },
    { hero_id: 8,  name: "Juggernaut",    with_games: 12, with_wr: 67, vs_games: 11, vs_wr: 55 },
    { hero_id: 47, name: "Tidehunter",    with_games: 9,  with_wr: 78, vs_games: 13, vs_wr: 38 },
    { hero_id: 96, name: "Centaur",       with_games: 14, with_wr: 79, vs_games: 7,  vs_wr: 57 },
    { hero_id: 17, name: "Storm Spirit",  with_games: 6,  with_wr: 50, vs_games: 12, vs_wr: 42 },
    { hero_id: 1,  name: "Anti-Mage",     with_games: 8,  with_wr: 63, vs_games: 9,  vs_wr: 67 },
    { hero_id: 28, name: "Slardar",       with_games: 10, with_wr: 70, vs_games: 5,  vs_wr: 40 },
  ],
  heatmap: [
    [-1, 50, 65, 78],
    [-1, 55, 62, 80],
    [-1, 60, 70, 85],
    [-1, 50, 68, 75],
    [-1, 65, 72, 88],
    [40, 60, 70, 82],
    [35, 55, 65, 70],
  ],
  perfHelped: [
    { label: "Hero damage",      delta: +28 },
    { label: "Stuns landed",     delta: +21 },
    { label: "Kill participation", delta: +17 },
  ],
  perfHurt: [
    { label: "Last hits / min",  delta: -9 },
    { label: "Tower damage",     delta: -6 },
    { label: "Camps stacked",    delta: -4 },
  ],
  buildTrends: {
    items: [
      { name: "Tranquil Boots",  pct: 88 },
      { name: "Aether Lens",     pct: 74 },
      { name: "Aghanim's Scepter", pct: 69 },
      { name: "Glimmer Cape",    pct: 52 },
      { name: "Force Staff",     pct: 47 },
    ],
    skillOrder: ["Q","W","Q","E","Q","R","Q","W","W","W","R","E","E","E","E","R"],
  },
};

const OGPRO_X: MockExtras = {
  positions: [
    { pos: 1, games: 0,  wins: 0 },
    { pos: 2, games: 0,  wins: 0 },
    { pos: 3, games: 27, wins: 18 },
    { pos: 4, games: 3,  wins: 2 },
    { pos: 5, games: 2,  wins: 1 },
  ],
  statAvg: { lh: 198, dn: 24, heroDmg: 18400, towerDmg: 3100, healing: 320, stuns: 42.6, wards: 3, campsStacked: 8.2, runes: 11 },
  multiKills: { double: 29, triple: 7, ultra: 2, rampage: 1 },
  rollingWR: [55, 58, 60, 62, 65, 63, 60, 64, 67, 65, 63, 60, 62, 65, 68, 65, 62, 60, 63, 65, 68, 65, 63, 60, 62, 65, 63, 60, 65, 65],
  recentMatches: [
    { match_id: 7901234, hero_id: 96,  hero: "Centaur",      won: true,  k: 9,  d: 3, a: 24, duration: 3140, start_time: 1746248400,         mmr_delta: +21 },
    { match_id: 7900111, hero_id: 47,  hero: "Tidehunter",   won: true,  k: 5,  d: 4, a: 22, duration: 2980, start_time: 1746248400 - 1*D,   mmr_delta: +20 },
    { match_id: 7899002, hero_id: 129, hero: "Mars",         won: false, k: 4,  d: 7, a: 11, duration: 2710, start_time: 1746248400 - 2*D,   mmr_delta: -22 },
    { match_id: 7897900, hero_id: 96,  hero: "Centaur",      won: true,  k: 7,  d: 2, a: 19, duration: 2890, start_time: 1746248400 - 3*D,   mmr_delta: +22 },
    { match_id: 7896800, hero_id: 28,  hero: "Slardar",      won: true,  k: 11, d: 3, a: 14, duration: 2540, start_time: 1746248400 - 4*D,   mmr_delta: +23 },
    { match_id: 7895700, hero_id: 47,  hero: "Tidehunter",   won: false, k: 3,  d: 8, a: 9,  duration: 3210, start_time: 1746248400 - 5*D,   mmr_delta: -19 },
    { match_id: 7894600, hero_id: 96,  hero: "Centaur",      won: true,  k: 6,  d: 4, a: 21, duration: 3050, start_time: 1746248400 - 6*D,   mmr_delta: +21 },
    { match_id: 7893500, hero_id: 71,  hero: "Spirit Breaker",won: true, k: 13, d: 5, a: 12, duration: 2620, start_time: 1746248400 - 7*D,   mmr_delta: +20 },
    { match_id: 7892400, hero_id: 96,  hero: "Centaur",      won: false, k: 4,  d: 9, a: 12, duration: 3340, start_time: 1746248400 - 8*D,   mmr_delta: -23 },
    { match_id: 7891300, hero_id: 47,  hero: "Tidehunter",   won: true,  k: 7,  d: 3, a: 26, duration: 2880, start_time: 1746248400 - 9*D,   mmr_delta: +22 },
  ],
  bestAllies: [
    { steam_id: "76561198029811233", name: "BrassKnuckles",  games: 24, wins: 19 },
    { steam_id: "76561198073811934", name: "ShadowCarry",    games: 12, wins: 9  },
    { steam_id: "76561198100200300", name: "WardSlut",       games: 21, wins: 15 },
    { steam_id: "76561198400500600", name: "WhipDelivery",   games: 18, wins: 13 },
    { steam_id: "76561198700800900", name: "PingMachine",    games: 14, wins: 10 },
  ],
  worstAllies: [
    { steam_id: "76561198111222333", name: "AfkSimulator",   games: 16, wins: 5 },
    { steam_id: "76561198444555666", name: "CourierFeeder",  games: 13, wins: 4 },
    { steam_id: "76561198777888999", name: "MidGriefer",     games: 11, wins: 3 },
    { steam_id: "76561198000111222", name: "TiltMaster",     games: 9,  wins: 3 },
    { steam_id: "76561198333444555", name: "SmokeOnCD",      games: 7,  wins: 2 },
  ],
  heroMatchups: [
    { hero_id: 96,  name: "Centaur",       with_games: 28, with_wr: 71, vs_games: 6,  vs_wr: 50 },
    { hero_id: 47,  name: "Tidehunter",    with_games: 22, with_wr: 73, vs_games: 8,  vs_wr: 38 },
    { hero_id: 129, name: "Mars",          with_games: 16, with_wr: 56, vs_games: 11, vs_wr: 45 },
    { hero_id: 14,  name: "Pudge",         with_games: 19, with_wr: 79, vs_games: 9,  vs_wr: 33 },
    { hero_id: 11,  name: "Shadow Fiend",  with_games: 12, with_wr: 67, vs_games: 14, vs_wr: 50 },
    { hero_id: 1,   name: "Anti-Mage",     with_games: 10, with_wr: 60, vs_games: 12, vs_wr: 42 },
  ],
  heatmap: [
    [-1, 60, 70, 75],
    [-1, 55, 65, 72],
    [-1, 60, 68, 78],
    [-1, 55, 62, 70],
    [-1, 65, 70, 80],
    [50, 60, 65, 72],
    [45, 55, 60, 65],
  ],
  perfHelped: [
    { label: "Stuns landed",     delta: +34 },
    { label: "Hero damage taken",delta: +27 },
    { label: "Kill participation",delta: +18 },
  ],
  perfHurt: [
    { label: "Hero damage",      delta: -12 },
    { label: "Last hits / min",  delta: -10 },
    { label: "Tower damage",     delta: -7 },
  ],
  buildTrends: {
    items: [
      { name: "Blink Dagger",      pct: 96 },
      { name: "Crimson Guard",     pct: 81 },
      { name: "Pipe of Insight",   pct: 67 },
      { name: "Shiva's Guard",     pct: 54 },
      { name: "Heart of Tarrasque",pct: 41 },
    ],
    skillOrder: ["Q","W","Q","E","Q","R","Q","W","W","W","R","E","E","E","E","R"],
  },
};

export const EXTRAS: Record<Persona, MockExtras> = { free: FREE_X, pro: PRO_X, ogpro: OGPRO_X };

