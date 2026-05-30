import React from "react";

// -----------------------------------------------------------------------------
// Inhouse Medieval tier ladder (mirrors web/src/pages/Leaderboard.jsx MMR_TIERS)
// Badge artwork copied into the sandbox at /__mockup/images/badges/.
// -----------------------------------------------------------------------------

export type TierLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const TIERS: Record<TierLevel, { name: string; img: string }> = {
  8: { name: "King", img: "/__mockup/images/badges/tier-8-king.png" },
  7: { name: "Warlord", img: "/__mockup/images/badges/tier-7-warlord.png" },
  6: { name: "Paladin", img: "/__mockup/images/badges/tier-6-paladin.png" },
  5: { name: "Templar", img: "/__mockup/images/badges/tier-5-templar.png" },
  4: { name: "Knight", img: "/__mockup/images/badges/tier-4-knight.png" },
  3: { name: "Footman", img: "/__mockup/images/badges/tier-3-footman.png" },
  2: { name: "Squire", img: "/__mockup/images/badges/tier-2-squire.png" },
  1: { name: "Apprentice", img: "/__mockup/images/badges/tier-1-apprentice.png" },
};

// -----------------------------------------------------------------------------
// Cosmetic profile frames (mirrors web/src/profileCosmetics.js FRAMES).
// `accent` is the frame's signature colour, used to tint the rank number.
// -----------------------------------------------------------------------------

export type FrameSlug = "silver" | "gold" | "neon-blue" | "cosmic" | "fire" | "founder";

export const COSMETIC_FRAMES: Record<
  FrameSlug,
  { label: string; accent: string; style: React.CSSProperties }
> = {
  silver: {
    label: "Silver",
    accent: "#cdd3dc",
    style: { outline: "2px solid #c0c0c0", outlineOffset: "2px" },
  },
  gold: {
    label: "Gold",
    accent: "#f5c969",
    style: {
      outline: "2px solid #f59e0b",
      outlineOffset: "2px",
      boxShadow: "0 0 8px rgba(245,158,11,0.5)",
    },
  },
  "neon-blue": {
    label: "Neon Blue",
    accent: "#67e8f9",
    style: {
      outline: "2px solid #06b6d4",
      outlineOffset: "2px",
      boxShadow: "0 0 12px rgba(6,182,212,0.6)",
    },
  },
  cosmic: {
    label: "Cosmic",
    accent: "#d8b4fe",
    style: {
      outline: "2px solid #a855f7",
      outlineOffset: "2px",
      boxShadow: "0 0 12px rgba(168,85,247,0.55)",
    },
  },
  fire: {
    label: "Fire",
    accent: "#fca5a5",
    style: {
      outline: "2px solid #ef4444",
      outlineOffset: "2px",
      boxShadow: "0 0 10px rgba(239,68,68,0.5)",
    },
  },
  founder: {
    label: "Founder",
    accent: "#e1c79a",
    style: {
      outline: "3px double #c5a975",
      outlineOffset: "2px",
      boxShadow: "0 0 14px rgba(197,169,117,0.7), inset 0 0 8px rgba(245,158,11,0.35)",
    },
  },
};

// -----------------------------------------------------------------------------
// TierEmblem — the heraldic rank badge artwork.
// -----------------------------------------------------------------------------

export function TierEmblem({
  tier,
  size = 40,
  className = "",
}: {
  tier: TierLevel;
  size?: number;
  className?: string;
}) {
  const t = TIERS[tier];
  return (
    <img
      src={t.img}
      alt={`${t.name} tier`}
      title={t.name}
      width={size}
      height={size}
      className={`object-contain flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// -----------------------------------------------------------------------------
// FramedRank — the player's leaderboard position wrapped in their cosmetic
// frame. The number is tinted with the frame accent; #1 gets the richest
// treatment (a warm glow behind the digit).
// -----------------------------------------------------------------------------

export function FramedRank({
  rank,
  frame,
  size = 44,
}: {
  rank: number;
  frame: FrameSlug;
  size?: number;
}) {
  const f = COSMETIC_FRAMES[frame];
  const isTop = rank === 1;
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 relative"
      style={{
        width: size,
        height: size,
        background: isTop
          ? "radial-gradient(circle at 50% 30%, rgba(245,158,11,0.28), var(--pb-elevated) 70%)"
          : "var(--pb-elevated)",
        ...f.style,
      }}
    >
      <span
        className="pb-serif font-bold leading-none"
        style={{ color: f.accent, fontSize: Math.round(size * 0.42) }}
      >
        {rank}
      </span>
    </div>
  );
}
