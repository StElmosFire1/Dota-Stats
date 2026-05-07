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
