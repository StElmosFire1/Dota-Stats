import React, { useState } from 'react';
import {
  Trophy,
  Clock,
  Calendar,
  Activity,
  Shield,
  Swords,
  Ban,
  Crown
} from 'lucide-react';
import "./_group.css";
import { PressBoxNav } from "./_shared/PressBoxNav";

// -----------------------------------------------------------------------------
// Asset helpers (Dota 2 official CDN)
// -----------------------------------------------------------------------------
const HERO_IMG = (slug: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;
const ITEM_IMG = (slug: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${slug}.png`;

// -----------------------------------------------------------------------------
// Mock Data
// -----------------------------------------------------------------------------
type Player = {
  id: number; handle: string; hero: string; heroSlug: string;
  lvl: number; k: number; d: number; a: number; lh: number; dn: number;
  nw: string; gpm: number; xpm: number; heroDmg: string; heal: string; bldg: string;
  items: string[]; mvp: boolean;
};

const radiantPlayers: Player[] = [
  { id: 1, handle: "Slick", hero: "Anti-Mage", heroSlug: "antimage", lvl: 30, k: 14, d: 2, a: 8, lh: 612, dn: 24, nw: "28.5k", gpm: 750, xpm: 810, heroDmg: "34.2k", heal: "0", bldg: "12.1k", items: ["power_treads", "manta", "black_king_bar", "butterfly", "abyssal_blade", "satanic"], mvp: true },
  { id: 2, handle: "Ducky", hero: "Puck", heroSlug: "puck", lvl: 27, k: 8, d: 4, a: 12, lh: 341, dn: 12, nw: "19.2k", gpm: 580, xpm: 620, heroDmg: "28.7k", heal: "0", bldg: "4.4k", items: ["travel_boots", "blink", "kaya_and_sange", "aghanims_shard", "octarine_core", "shivas_guard"], mvp: false },
  { id: 3, handle: "ChopChop", hero: "Axe", heroSlug: "axe", lvl: 25, k: 6, d: 5, a: 15, lh: 188, dn: 6, nw: "14.1k", gpm: 420, xpm: 510, heroDmg: "16.9k", heal: "0", bldg: "2.1k", items: ["phase_boots", "blade_mail", "blink", "crimson_guard", "shivas_guard", "assault"], mvp: false },
  { id: 4, handle: "Vortex", hero: "Rubick", heroSlug: "rubick", lvl: 22, k: 4, d: 8, a: 22, lh: 96, dn: 2, nw: "11.5k", gpm: 340, xpm: 480, heroDmg: "14.2k", heal: "0", bldg: "0.8k", items: ["arcane_boots", "force_staff", "glimmer_cape", "aether_lens", "blink", "ghost"], mvp: false },
  { id: 5, handle: "Oasis", hero: "Crystal Maiden", heroSlug: "crystal_maiden", lvl: 20, k: 2, d: 9, a: 28, lh: 54, dn: 1, nw: "8.2k", gpm: 250, xpm: 390, heroDmg: "11.8k", heal: "0", bldg: "0.3k", items: ["tranquil_boots", "glimmer_cape", "force_staff", "aether_lens", "wind_waker", "aeon_disk"], mvp: false },
];

const direPlayers: Player[] = [
  { id: 6, handle: "Killa", hero: "Phantom Assassin", heroSlug: "phantom_assassin", lvl: 26, k: 9, d: 6, a: 4, lh: 488, dn: 18, nw: "21.3k", gpm: 620, xpm: 680, heroDmg: "26.1k", heal: "0", bldg: "6.7k", items: ["power_treads", "battle_fury", "black_king_bar", "desolator", "basher", "satanic"], mvp: false },
  { id: 7, handle: "ShadowStep", hero: "Invoker", heroSlug: "invoker", lvl: 25, k: 7, d: 8, a: 11, lh: 372, dn: 14, nw: "16.8k", gpm: 490, xpm: 550, heroDmg: "30.4k", heal: "0", bldg: "3.2k", items: ["travel_boots", "hand_of_midas", "black_king_bar", "aghanims_scepter", "octarine_core", "refresher"], mvp: false },
  { id: 8, handle: "Brute", hero: "Centaur", heroSlug: "centaur", lvl: 23, k: 5, d: 7, a: 14, lh: 162, dn: 5, nw: "12.4k", gpm: 380, xpm: 460, heroDmg: "13.5k", heal: "0", bldg: "1.4k", items: ["phase_boots", "blink", "blade_mail", "crimson_guard", "heart", "assault"], mvp: false },
  { id: 9, handle: "Silent", hero: "Lion", heroSlug: "lion", lvl: 19, k: 3, d: 11, a: 9, lh: 71, dn: 2, nw: "9.1k", gpm: 280, xpm: 350, heroDmg: "12.9k", heal: "0", bldg: "0.4k", items: ["tranquil_boots", "blink", "aether_lens", "force_staff", "ghost", "aghanims_shard"], mvp: false },
  { id: 10, handle: "Grim", hero: "Warlock", heroSlug: "warlock", lvl: 20, k: 4, d: 12, a: 12, lh: 88, dn: 3, nw: "8.5k", gpm: 260, xpm: 340, heroDmg: "10.2k", heal: "8.4k", bldg: "0.5k", items: ["arcane_boots", "glimmer_cape", "aghanims_shard", "force_staff", "refresher", "aeon_disk"], mvp: false },
];

// Draft order (pick phase) + bans
const RADIANT_PICKS = radiantPlayers.map(p => ({ slug: p.heroSlug, hero: p.hero }));
const DIRE_PICKS = direPlayers.map(p => ({ slug: p.heroSlug, hero: p.hero }));
const RADIANT_BANS = ["sniper", "pudge", "faceless_void", "spectre"];
const DIRE_BANS = ["juggernaut", "lina", "tinker", "doom_bringer"];

// Lane outcomes
const LANES = [
  { lane: "Safelane", radiant: "Anti-Mage", dire: "Lion / Warlock", winner: "Radiant", verdict: "Won +1.2k @10" },
  { lane: "Midlane", radiant: "Puck", dire: "Invoker", winner: "Even", verdict: "Even @10" },
  { lane: "Offlane", radiant: "Axe / Rubick", dire: "Phantom Assassin", winner: "Dire", verdict: "Lost -0.6k @10" },
];

// Item swimlane — notable purchase timings (seconds into a 38:42 game)
const TOTAL_SEC = 38 * 60 + 42;
const SWIMLANE: { team: 'Radiant' | 'Dire'; t: number; label: string; item: string; who: string }[] = [
  { team: 'Radiant', t: 360, label: "6:00", item: "power_treads", who: "Slick" },
  { team: 'Radiant', t: 1100, label: "18:20", item: "manta", who: "Slick" },
  { team: 'Radiant', t: 1450, label: "24:10", item: "black_king_bar", who: "Slick" },
  { team: 'Radiant', t: 1980, label: "33:00", item: "butterfly", who: "Slick" },
  { team: 'Dire', t: 480, label: "8:00", item: "battle_fury", who: "Killa" },
  { team: 'Dire', t: 1320, label: "22:00", item: "black_king_bar", who: "Killa" },
  { team: 'Dire', t: 1700, label: "28:20", item: "aghanims_scepter", who: "ShadowStep" },
];

// -----------------------------------------------------------------------------
// Item row (real icons + 6 slots)
// -----------------------------------------------------------------------------
function ItemsRow({ items }: { items: string[] }) {
  return (
    <div className="flex items-center gap-1 justify-end">
      {Array.from({ length: 6 }).map((_, i) => {
        const slug = items[i];
        return (
          <div
            key={i}
            className="w-8 h-6 rounded-[3px] overflow-hidden border pb-hairline flex-shrink-0"
            style={{ backgroundColor: 'var(--pb-surface-2)' }}
            title={slug ? slug.replace(/_/g, ' ') : 'empty'}
          >
            {slug && (
              <img src={ITEM_IMG(slug)} alt={slug} className="w-full h-full object-cover" loading="lazy" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Scoreboard (dense, full-width)
// -----------------------------------------------------------------------------
function ScoreboardTable({ team, players, isWinner }: { team: string; players: Player[]; isWinner: boolean }) {
  const teamColor = team === 'Radiant' ? 'var(--pb-radiant)' : 'var(--pb-dire)';

  return (
    <div className="pb-card overflow-hidden">
      <div className="px-6 py-4 border-b pb-hairline flex items-center justify-between" style={{ backgroundColor: 'var(--pb-bg-2)' }}>
        <div className="flex items-center gap-3">
          <Shield size={18} style={{ color: teamColor }} />
          <h3 className="pb-cond text-lg tracking-widest uppercase" style={{ color: teamColor }}>{team}</h3>
          {isWinner && (
            <span className="text-[10px] pb-cond uppercase tracking-widest px-2 py-0.5 rounded-sm" style={{ backgroundColor: 'rgba(52, 211, 153, 0.1)', color: 'var(--pb-radiant)', border: '1px solid rgba(52, 211, 153, 0.2)' }}>Winner</span>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden md:block">
            <span className="text-sm pb-serif" style={{ color: 'var(--pb-brass)' }}>{players.reduce((a, p) => a + p.k, 0)}</span>
            <span className="text-[10px] pb-cond tracking-widest ml-1.5" style={{ color: 'var(--pb-faint)' }}>KILLS</span>
          </div>
          <div className="text-right">
            <span className="text-sm pb-serif" style={{ color: 'var(--pb-brass)' }}>
              {(players.reduce((a, p) => a + parseFloat(p.nw), 0)).toFixed(1)}k
            </span>
            <span className="text-[10px] pb-cond tracking-widest ml-1.5" style={{ color: 'var(--pb-faint)' }}>NET</span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead>
            <tr className="border-b pb-hairline" style={{ color: 'var(--pb-muted)' }}>
              <th className="px-4 py-3 pb-cond tracking-widest font-normal text-[11px] uppercase">Player</th>
              <th className="px-2 py-3 pb-cond tracking-widest font-normal text-[11px] uppercase text-center">Lvl</th>
              <th className="px-3 py-3 pb-cond tracking-widest font-normal text-[11px] uppercase text-center">K/D/A</th>
              <th className="px-3 py-3 pb-cond tracking-widest font-normal text-[11px] uppercase text-center">LH/DN</th>
              <th className="px-3 py-3 pb-cond tracking-widest font-normal text-[11px] uppercase text-right">Net</th>
              <th className="px-3 py-3 pb-cond tracking-widest font-normal text-[11px] uppercase text-right">GPM/XPM</th>
              <th className="px-3 py-3 pb-cond tracking-widest font-normal text-[11px] uppercase text-right">Hero Dmg</th>
              <th className="px-3 py-3 pb-cond tracking-widest font-normal text-[11px] uppercase text-right">Bldg</th>
              <th className="px-4 py-3 pb-cond tracking-widest font-normal text-[11px] uppercase text-right">Items</th>
            </tr>
          </thead>
          <tbody className="divide-y pb-hairline">
            {players.map((p) => (
              <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-7 rounded-[3px] overflow-hidden border pb-hairline flex-shrink-0" style={{ backgroundColor: 'var(--pb-elevated)' }}>
                      <img src={HERO_IMG(p.heroSlug)} alt={p.hero} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-[14px]" style={{ color: 'var(--pb-text)' }}>{p.handle}</span>
                        {p.mvp && <Crown size={12} style={{ color: 'var(--pb-amber)' }} />}
                      </div>
                      <div className="text-[10px] pb-cond tracking-wider uppercase" style={{ color: 'var(--pb-faint)' }}>{p.hero}</div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] pb-cond" style={{ backgroundColor: 'var(--pb-elevated)', color: 'var(--pb-brass-bright)' }}>{p.lvl}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="font-semibold" style={{ color: 'var(--pb-text)' }}>{p.k}</span>
                  <span style={{ color: 'var(--pb-faint)' }}>/</span>
                  <span className="font-semibold" style={{ color: 'var(--pb-dire)' }}>{p.d}</span>
                  <span style={{ color: 'var(--pb-faint)' }}>/</span>
                  <span className="font-semibold" style={{ color: 'var(--pb-muted)' }}>{p.a}</span>
                </td>
                <td className="px-3 py-2.5 text-center text-[13px]">
                  <span style={{ color: 'var(--pb-text)' }}>{p.lh}</span>
                  <span className="mx-0.5" style={{ color: 'var(--pb-faint)' }}>/</span>
                  <span style={{ color: 'var(--pb-faint)' }}>{p.dn}</span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className="font-medium" style={{ color: 'var(--pb-brass)' }}>{p.nw}</span>
                </td>
                <td className="px-3 py-2.5 text-right text-[13px]">
                  <span style={{ color: 'var(--pb-text)' }}>{p.gpm}</span>
                  <span className="mx-0.5" style={{ color: 'var(--pb-faint)' }}>/</span>
                  <span style={{ color: 'var(--pb-muted)' }}>{p.xpm}</span>
                </td>
                <td className="px-3 py-2.5 text-right text-[13px]" style={{ color: 'var(--pb-text)' }}>{p.heroDmg}</td>
                <td className="px-3 py-2.5 text-right text-[13px]" style={{ color: 'var(--pb-muted)' }}>{p.bldg}</td>
                <td className="px-4 py-2.5">
                  <ItemsRow items={p.items} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Draft & Bans
// -----------------------------------------------------------------------------
function DraftPanel() {
  const Row = ({ label, picks, bans, color }: { label: string; picks: { slug: string; hero: string }[]; bans: string[]; color: string }) => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="pb-cond text-sm tracking-widest uppercase" style={{ color }}>{label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {picks.map((p, i) => (
          <div key={p.slug} className="relative">
            <div className="w-16 h-9 rounded overflow-hidden border pb-hairline" style={{ backgroundColor: 'var(--pb-elevated)' }} title={p.hero}>
              <img src={HERO_IMG(p.slug)} alt={p.hero} className="w-full h-full object-cover" loading="lazy" />
            </div>
            <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] pb-cond" style={{ backgroundColor: 'var(--pb-surface)', color: 'var(--pb-brass-bright)', border: '1px solid var(--pb-line)' }}>{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Ban size={12} style={{ color: 'var(--pb-faint)' }} />
        <div className="flex flex-wrap items-center gap-1.5">
          {bans.map((b) => (
            <div key={b} className="w-10 h-6 rounded overflow-hidden border pb-hairline relative opacity-50 grayscale" style={{ backgroundColor: 'var(--pb-elevated)' }} title={`Banned: ${b.replace(/_/g, ' ')}`}>
              <img src={HERO_IMG(b)} alt={b} className="w-full h-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="pb-card overflow-hidden">
      <div className="px-6 py-4 border-b pb-hairline flex items-center gap-3" style={{ backgroundColor: 'var(--pb-bg-2)' }}>
        <Swords size={18} style={{ color: 'var(--pb-brass)' }} />
        <h3 className="pb-cond text-lg tracking-widest uppercase" style={{ color: 'var(--pb-text)' }}>Draft &amp; Bans</h3>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        <Row label="Radiant" picks={RADIANT_PICKS} bans={RADIANT_BANS} color="var(--pb-radiant)" />
        <Row label="Dire" picks={DIRE_PICKS} bans={DIRE_BANS} color="var(--pb-dire)" />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Lane Outcomes
// -----------------------------------------------------------------------------
function LaneOutcomes() {
  const tone = (w: string) => w === 'Radiant' ? 'var(--pb-radiant)' : w === 'Dire' ? 'var(--pb-dire)' : 'var(--pb-muted)';
  return (
    <div className="pb-card overflow-hidden">
      <div className="px-6 py-4 border-b pb-hairline flex items-center gap-3" style={{ backgroundColor: 'var(--pb-bg-2)' }}>
        <Activity size={18} style={{ color: 'var(--pb-brass)' }} />
        <h3 className="pb-cond text-lg tracking-widest uppercase" style={{ color: 'var(--pb-text)' }}>Lane Outcomes</h3>
        <span className="pb-eyebrow text-[var(--pb-faint)] ml-auto">@ 10:00</span>
      </div>
      <div className="p-6 flex flex-col gap-4">
        {LANES.map((l) => (
          <div key={l.lane} className="flex items-center gap-4">
            <div className="w-20 pb-cond text-xs tracking-widest uppercase" style={{ color: 'var(--pb-faint)' }}>{l.lane}</div>
            <div className="flex-1 text-sm text-right" style={{ color: 'var(--pb-radiant)' }}>{l.radiant}</div>
            <div className="px-3 py-1 rounded-full text-[10px] pb-cond tracking-widest uppercase flex-shrink-0" style={{ color: tone(l.winner), border: `1px solid ${tone(l.winner)}`, backgroundColor: 'var(--pb-surface)' }}>
              {l.winner === 'Even' ? 'Even' : `${l.winner} won`}
            </div>
            <div className="flex-1 text-sm" style={{ color: 'var(--pb-dire)' }}>{l.dire}</div>
            <div className="w-28 text-right text-[11px] pb-cond tracking-wider" style={{ color: 'var(--pb-muted)' }}>{l.verdict}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Item Swimlane (purchase timeline)
// -----------------------------------------------------------------------------
function ItemSwimlane() {
  const Lane = ({ team, color }: { team: 'Radiant' | 'Dire'; color: string }) => (
    <div className="relative h-16">
      <div className="absolute left-0 top-1/2 w-full h-px" style={{ backgroundColor: 'var(--pb-line)' }} />
      <div className="absolute left-0 top-0 pb-cond text-[10px] tracking-widest uppercase" style={{ color }}>{team}</div>
      {SWIMLANE.filter(s => s.team === team).map((s, i) => {
        const left = (s.t / TOTAL_SEC) * 100;
        return (
          <div key={i} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${left}%`, top: '50%', transform: 'translate(-50%, -50%)' }}>
            <div className="w-9 h-7 rounded overflow-hidden border pb-hairline" style={{ backgroundColor: 'var(--pb-elevated)', boxShadow: `0 0 0 2px var(--pb-bg)` }} title={`${s.who} • ${s.item.replace(/_/g, ' ')} • ${s.label}`}>
              <img src={ITEM_IMG(s.item)} alt={s.item} className="w-full h-full object-cover" loading="lazy" />
            </div>
            <span className="text-[9px] pb-cond mt-1" style={{ color: 'var(--pb-faint)' }}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="pb-card overflow-hidden">
      <div className="px-6 py-4 border-b pb-hairline flex items-center gap-3" style={{ backgroundColor: 'var(--pb-bg-2)' }}>
        <Clock size={18} style={{ color: 'var(--pb-brass)' }} />
        <h3 className="pb-cond text-lg tracking-widest uppercase" style={{ color: 'var(--pb-text)' }}>Key Item Timings</h3>
      </div>
      <div className="p-6 flex flex-col gap-3">
        <Lane team="Radiant" color="var(--pb-radiant)" />
        <Lane team="Dire" color="var(--pb-dire)" />
        <div className="flex justify-between items-center mt-1 px-1 text-[10px] pb-cond tracking-wider" style={{ color: 'var(--pb-faint)' }}>
          <span>0:00</span><span>10:00</span><span>20:00</span><span>30:00</span><span>38:42</span>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Match Analysis (net-worth swing chart)
// -----------------------------------------------------------------------------
function MatchAnalysis() {
  const [metric, setMetric] = useState('networth');

  return (
    <div className="pb-card overflow-hidden">
      <div className="px-8 py-5 border-b pb-hairline flex flex-wrap items-center justify-between gap-4" style={{ backgroundColor: 'var(--pb-bg-2)' }}>
        <div className="flex items-center gap-3">
          <Activity size={18} style={{ color: 'var(--pb-brass)' }} />
          <h3 className="pb-cond text-lg tracking-widest uppercase" style={{ color: 'var(--pb-text)' }}>Match Analysis</h3>
        </div>
        <div className="flex items-center gap-2 p-1 rounded-full border pb-hairline" style={{ backgroundColor: 'var(--pb-surface-2)' }}>
          {[
            { id: 'networth', label: 'Net Worth' },
            { id: 'xp', label: 'Experience' },
            { id: 'gold', label: 'Gold Lead' }
          ].map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetric(m.id)}
              className="px-4 py-1.5 rounded-full text-xs pb-cond tracking-widest transition-all duration-300"
              style={{
                backgroundColor: metric === m.id ? 'var(--pb-elevated)' : 'transparent',
                color: metric === m.id ? 'var(--pb-brass-bright)' : 'var(--pb-faint)',
                boxShadow: metric === m.id ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-8 relative">
        <div className="flex justify-between items-center mb-6 px-4">
          <span className="pb-cond text-xs tracking-widest" style={{ color: 'var(--pb-radiant)' }}>RADIANT LEAD</span>
          <span className="pb-cond text-xs tracking-widest" style={{ color: 'var(--pb-dire)' }}>DIRE LEAD</span>
        </div>

        <div className="w-full h-64 relative">
          <div className="absolute top-1/2 left-0 w-full h-[1px] border-t border-dashed" style={{ borderColor: 'var(--pb-faint)', opacity: 0.5 }}></div>

          <svg viewBox="0 0 1000 200" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="radiantGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--pb-radiant)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--pb-radiant)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <path d="M0,100 L0,90 L100,105 L200,80 L300,50 L400,60 L500,40 L600,80 L700,30 L800,10 L900,20 L1000,0 L1000,100 Z" fill="url(#radiantGrad)" />
            <path d="M0,90 L100,105 L200,80 L300,50 L400,60 L500,40 L600,80 L700,30 L800,10 L900,20 L1000,0" fill="none" stroke="var(--pb-radiant)" strokeWidth="2" />

            <g transform="translate(150, 130)">
              <circle cx="0" cy="0" r="4" fill="var(--pb-dire)" />
              <text x="0" y="-15" fill="var(--pb-faint)" fontSize="12" textAnchor="middle" className="pb-cond">FIRST BLOOD</text>
            </g>
            <g transform="translate(550, 150)">
              <circle cx="0" cy="0" r="4" fill="var(--pb-dire)" />
              <text x="0" y="20" fill="var(--pb-faint)" fontSize="12" textAnchor="middle" className="pb-cond">ROSHAN (D)</text>
            </g>
            <g transform="translate(750, 50)">
              <circle cx="0" cy="0" r="4" fill="var(--pb-radiant)" />
              <text x="0" y="-15" fill="var(--pb-faint)" fontSize="12" textAnchor="middle" className="pb-cond">T3 RADIANT</text>
            </g>
          </svg>
        </div>

        <div className="flex justify-between items-center mt-4 px-2 text-xs pb-cond tracking-wider" style={{ color: 'var(--pb-faint)' }}>
          <span>0:00</span><span>10:00</span><span>20:00</span><span>30:00</span><span>38:42</span>
        </div>
      </div>
    </div>
  );
}

export function MatchDetail() {
  return (
    <div className="pressbox">
      <PressBoxNav active="Matches" user="Slick" />

      <main className="max-w-[1280px] mx-auto px-8 py-12">
        {/* Result Header */}
        <div className="flex flex-col items-center justify-center mb-16 text-center">
          <div className="pb-eyebrow mb-6 flex items-center gap-4">
            <span className="flex items-center gap-2"><Calendar size={12} /> OCT 24, 2026</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-30"></span>
            <span className="flex items-center gap-2"><Trophy size={12} /> SEASON 4 PLAYOFFS</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-30"></span>
            <span>MATCH ID: 749281190</span>
          </div>

          <div className="flex items-center justify-center gap-12 w-full max-w-4xl">
            <div className="flex-1 text-right">
              <h1 className="pb-serif text-5xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-br from-white to-white/70 mb-2">Radiant</h1>
              <div className="pb-cond text-sm tracking-[0.3em] uppercase" style={{ color: 'var(--pb-radiant)' }}>Winner</div>
            </div>

            <div className="flex flex-col items-center">
              <div className="flex items-center gap-6 pb-serif text-5xl md:text-7xl font-semibold tracking-tighter" style={{ color: 'var(--pb-brass-bright)' }}>
                <span>34</span>
                <span className="text-3xl" style={{ color: 'var(--pb-faint)' }}>-</span>
                <span>28</span>
              </div>
              <div className="mt-4 px-4 py-1.5 rounded-full border pb-hairline flex items-center gap-2 text-xs pb-cond tracking-widest" style={{ backgroundColor: 'var(--pb-surface)', color: 'var(--pb-muted)' }}>
                <Clock size={12} />
                38:42
              </div>
            </div>

            <div className="flex-1 text-left">
              <h1 className="pb-serif text-5xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-br from-white to-white/70 mb-2 opacity-60">Dire</h1>
              <div className="pb-cond text-sm tracking-[0.3em] uppercase" style={{ color: 'var(--pb-dire)' }}>Defeated</div>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <div className="h-[1px] w-12" style={{ backgroundColor: 'var(--pb-line)' }}></div>
          <span className="pb-eyebrow">POST-GAME BREAKDOWN</span>
          <div className="h-[1px] w-12" style={{ backgroundColor: 'var(--pb-line)' }}></div>
        </div>

        {/* Draft + Lanes */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
          <DraftPanel />
          <LaneOutcomes />
        </div>

        {/* Scoreboards (stacked, full-width for density) */}
        <div className="flex flex-col gap-8 mb-8">
          <ScoreboardTable team="Radiant" players={radiantPlayers} isWinner={true} />
          <ScoreboardTable team="Dire" players={direPlayers} isWinner={false} />
        </div>

        {/* Item swimlane */}
        <div className="mb-8">
          <ItemSwimlane />
        </div>

        {/* Net worth analysis */}
        <MatchAnalysis />

      </main>
    </div>
  );
}
