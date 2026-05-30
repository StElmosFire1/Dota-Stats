import React from "react";
import {
  Trophy, ArrowUpRight, Users, ArrowRight, ShieldHalf, Swords,
  BarChart3, Calendar, Zap, Coins,
} from "lucide-react";
import "./_group.css";
import { PressBoxNav } from "./_shared/PressBoxNav";
import { TierEmblem, FramedRank, TIERS, type TierLevel, type FrameSlug } from "./_shared/PressBoxRank";

function SteamIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.5 2 2 6.4 2 11.9c0 4.5 3 8.3 7.1 9.6l-1.4-2.1a3.3 3.3 0 0 1-1.9-3 3.3 3.3 0 0 1 3.3-3.3l.4.02 2.9-4.2v-.06a3.7 3.7 0 1 1 3.7 3.7h-.08l-4.1 2.9.01.3a3.3 3.3 0 0 1-6.1 1.7l-2.9-1.2A10 10 0 1 0 12 2Zm5.1 5.2a2.45 2.45 0 1 1-4.9 0 2.45 2.45 0 0 1 4.9 0Zm-3.7 0a1.23 1.23 0 1 0 2.46 0 1.23 1.23 0 0 0-2.46 0ZM7.6 16.8a2.5 2.5 0 0 0 4.6-1l-1.5-.6a1.27 1.27 0 0 1-1.7.7l-1.4.9Z" />
    </svg>
  );
}

export function HomeSignedOut() {
  return (
    <div className="pressbox min-h-screen pb-16">
      <PressBoxNav active="Home" signedOut />

      {/* Hero Section */}
      <div className="relative">
        <div className="absolute inset-0 z-0">
          <img
            src="/__mockup/images/pressbox-hero.png"
            alt="Arena"
            className="w-full h-full object-cover opacity-30 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--pb-bg)]/20 via-[var(--pb-bg)]/80 to-[var(--pb-bg)]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-20">
          <div className="max-w-3xl">
            <div className="pb-eyebrow mb-4 flex items-center gap-3">
              <span className="inline-block w-8 h-px bg-[var(--pb-brass)]"></span>
              Oceanic Dota 2 • Est. 2021
            </div>
            <h1 className="pb-serif text-5xl md:text-7xl mb-6 leading-[1.05]">
              The Premier <br />
              <span className="text-[var(--pb-brass-bright)] italic">Oceanic Pro</span> League.
            </h1>
            <p className="text-[var(--pb-muted)] text-lg mb-10 max-w-xl leading-relaxed">
              Competitive inhouse Dota for Oceania — captain drafts, dedicated servers,
              TrueSkill rankings and nightly prize-pool lobbies. Sign in with Steam to
              claim your rating and join the queue.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-8">
              <button
                type="button"
                className="bg-[var(--pb-amber)] hover:bg-[#d97706] text-black font-semibold px-8 py-3.5 rounded pb-cond tracking-[0.15em] uppercase text-sm transition-colors flex items-center gap-2.5"
              >
                <SteamIcon className="w-4 h-4" />
                Sign in with Steam
              </button>
              <button
                type="button"
                className="border border-[var(--pb-line)] hover:border-[var(--pb-brass)] text-[var(--pb-text)] px-8 py-3.5 rounded pb-cond tracking-[0.15em] uppercase text-sm transition-colors flex items-center gap-2"
              >
                Explore the League
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--pb-faint)]">
              <ShieldHalf className="w-3.5 h-3.5 text-[var(--pb-brass)]" />
              Free to join. No account needed beyond Steam — we never see your password.
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6">

        {/* Live League Pulse — public stats bar */}
        <div className="pb-card border-[var(--pb-brass)]/40 -mt-4 mb-16 grid grid-cols-2 md:grid-cols-4 divide-x divide-[var(--pb-line)]/60 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-full bg-[var(--pb-brass)]/5 blur-[80px] rounded-full pointer-events-none" />
          <PulseStat icon={<Users className="w-4 h-4" />} value="1,840" label="Registered Players" />
          <PulseStat icon={<Zap className="w-4 h-4" />} value="62" label="Online Now" accent />
          <PulseStat icon={<Swords className="w-4 h-4" />} value="12,409" label="Matches Played" />
          <PulseStat icon={<Coins className="w-4 h-4" />} value="$3,200" label="Season Prize Pool" />
        </div>

        {/* Active lobby — public CTA (no personal data) */}
        <div className="pb-card border-[var(--pb-amber)]/40 mb-16 flex flex-col md:flex-row items-center justify-between p-6 gap-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-full bg-[var(--pb-amber)]/5 blur-[80px] rounded-full pointer-events-none" />
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-full border border-[var(--pb-amber)] flex items-center justify-center relative">
              <div className="absolute inset-0 rounded-full border border-[var(--pb-amber)] animate-ping opacity-20" />
              <Users className="w-6 h-6 text-[var(--pb-amber)]" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="pb-serif text-2xl">A lobby is filling now</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-[var(--pb-elevated)] border border-[var(--pb-line)] text-[var(--pb-radiant)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--pb-radiant)] animate-pulse" />
                  Queueing
                </span>
              </div>
              <p className="text-[var(--pb-muted)] text-sm">Div 1 &amp; 2 • Captains Mode • Sign in to claim a spot</p>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="text-3xl pb-serif text-[var(--pb-text)]">7<span className="text-[var(--pb-faint)]">/10</span></div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--pb-muted)]">Players</div>
            </div>
            <button
              type="button"
              className="bg-[var(--pb-amber)] hover:bg-[#d97706] text-black font-semibold px-7 py-3 rounded pb-cond tracking-[0.15em] uppercase text-sm transition-colors flex items-center gap-2"
            >
              <SteamIcon className="w-4 h-4" />
              Sign in to Join
            </button>
          </div>
        </div>

        {/* Two-column: Top of the ladder + How it works */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">

          {/* Top players preview */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="pb-serif text-2xl flex items-center gap-3">
                Top of the Ladder
                <span className="h-px w-12 bg-[var(--pb-line)] inline-block" />
              </h2>
              <button type="button" className="text-[var(--pb-brass)] hover:text-[var(--pb-brass-bright)] text-sm pb-cond uppercase tracking-widest flex items-center gap-1 transition-colors">
                Full Leaderboard <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <LadderRow rank={1} name="razorlight" tierLevel={8} frame="founder" rating="7,140" wr="61%" />
              <LadderRow rank={2} name="quietstorm" tierLevel={7} frame="cosmic" rating="6,985" wr="58%" />
              <LadderRow rank={3} name="ember.oce" tierLevel={7} frame="gold" rating="6,720" wr="57%" />
              <LadderRow rank={4} name="nightfall" tierLevel={6} frame="neon-blue" rating="6,544" wr="55%" />
              <LadderRow rank={5} name="lotus" tierLevel={6} frame="fire" rating="6,488" wr="54%" />
            </div>
          </div>

          {/* How it works */}
          <div>
            <h2 className="pb-serif text-2xl mb-6 flex items-center gap-3">
              How It Works
              <span className="h-px w-12 bg-[var(--pb-line)] inline-block" />
            </h2>
            <div className="space-y-4">
              <StepCard n="01" icon={<SteamIcon className="w-4 h-4" />} title="Sign in with Steam" body="One click. We link your Dota account — no password shared." />
              <StepCard n="02" icon={<Users className="w-4 h-4" />} title="Queue & get drafted" body="Register a role, accept the pop, captains draft the teams." />
              <StepCard n="03" icon={<BarChart3 className="w-4 h-4" />} title="Climb the ranks" body="Every game adjusts your TrueSkill rating across 8 tiers." />
            </div>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="pb-serif text-2xl flex items-center gap-3">
              Why Play Here
              <span className="h-px w-12 bg-[var(--pb-line)] inline-block" />
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FeatureCard icon={<ShieldHalf className="w-5 h-5" />} title="Dedicated Servers" body="Auto-provisioned OCE servers on the 10th pick — no host-shopping, low ping." />
            <FeatureCard icon={<BarChart3 className="w-5 h-5" />} title="Deep Stats" body="Replay-parsed performance scores, hero meta, draft assistant and match history." />
            <FeatureCard icon={<Trophy className="w-5 h-5" />} title="Prize Tournaments" body="Seasonal prize pools, buy-in cups, and a coaching marketplace to level up." />
          </div>
        </div>

        {/* Upcoming games rail */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="pb-serif text-2xl flex items-center gap-3">
              Upcoming Scheduled Games
              <span className="h-px w-12 bg-[var(--pb-line)] inline-block" />
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ScheduledGame date="Today, 8:00 PM AEST" title="Div 1 Showdown" teams="Team Alpha vs Team Beta" />
            <ScheduledGame date="Tomorrow, 7:30 PM AEST" title="Div 2 Qualifier" teams="Omega vs Delta" />
            <ScheduledGame date="Friday, 9:00 PM AEST" title="All-Star Lobby" teams="Captains Draft" />
          </div>
        </div>
      </div>

      {/* Bottom sign-in banner */}
      <div className="max-w-7xl mx-auto px-6 mt-16">
        <div className="pb-card border-[var(--pb-brass)]/40 p-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[var(--pb-brass)]/5 blur-[100px] rounded-full pointer-events-none" />
          <div className="relative">
            <div className="pb-eyebrow mb-3 justify-center flex items-center gap-3">
              <span className="inline-block w-8 h-px bg-[var(--pb-brass)]"></span>
              Ready when you are
              <span className="inline-block w-8 h-px bg-[var(--pb-brass)]"></span>
            </div>
            <h2 className="pb-serif text-3xl md:text-4xl mb-4">Claim your rating tonight.</h2>
            <p className="text-[var(--pb-muted)] mb-8 max-w-md mx-auto">
              Join 1,800+ Oceanic players. Your first inhouse is one Steam click away.
            </p>
            <button
              type="button"
              className="bg-[var(--pb-amber)] hover:bg-[#d97706] text-black font-semibold px-8 py-3.5 rounded pb-cond tracking-[0.15em] uppercase text-sm transition-colors inline-flex items-center gap-2.5"
            >
              <SteamIcon className="w-4 h-4" />
              Sign in with Steam
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-20 border-t border-[var(--pb-line)] bg-[var(--pb-bg-2)] py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-[var(--pb-brass)] opacity-50" />
            <span className="pb-serif text-lg text-[var(--pb-faint)]">OCE Inhouse</span>
          </div>
          <div className="flex gap-6 pb-cond text-sm tracking-widest uppercase text-[var(--pb-faint)]">
            <a href="#" className="hover:text-[var(--pb-brass)] transition-colors">Rules</a>
            <a href="#" className="hover:text-[var(--pb-brass)] transition-colors">Discord</a>
            <a href="#" className="hover:text-[var(--pb-brass)] transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Sub-components

function PulseStat({ icon, value, label, accent = false }: { icon: React.ReactNode; value: string; label: string; accent?: boolean }) {
  return (
    <div className="p-6 flex flex-col gap-2 relative">
      <div className="flex items-center gap-2" style={{ color: accent ? "var(--pb-radiant)" : "var(--pb-brass)" }}>
        {icon}
        {accent && <span className="w-1.5 h-1.5 rounded-full bg-[var(--pb-radiant)] animate-pulse" />}
      </div>
      <div className="pb-serif text-3xl text-[var(--pb-text)] leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--pb-faint)]">{label}</div>
    </div>
  );
}

function LadderRow({ rank, name, tierLevel, frame, rating, wr }: { rank: number; name: string; tierLevel: TierLevel; frame: FrameSlug; rating: string; wr: string }) {
  return (
    <div className="pb-card p-4 flex items-center justify-between hover:border-[var(--pb-brass)]/50 transition-colors group">
      <div className="flex items-center gap-5">
        <TierEmblem tier={tierLevel} size={40} />
        <FramedRank rank={rank} frame={frame} size={44} />
        <div>
          <div className="text-[var(--pb-text)] font-medium mb-0.5">{name}</div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--pb-faint)]">{TIERS[tierLevel].name}</div>
        </div>
      </div>
      <div className="flex items-center gap-8 text-right">
        <div className="hidden sm:block">
          <div className="text-[var(--pb-text)] text-sm mb-1">{wr}</div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--pb-faint)]">Win Rate</div>
        </div>
        <div className="w-20">
          <div className="pb-serif text-lg text-[var(--pb-brass-bright)]">{rating}</div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--pb-faint)]">Rating</div>
        </div>
      </div>
    </div>
  );
}

function StepCard({ n, icon, title, body }: { n: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="pb-card p-5 flex gap-4 hover:border-[var(--pb-brass)]/40 transition-colors">
      <div className="pb-serif text-2xl text-[var(--pb-brass)]/40 leading-none pt-0.5">{n}</div>
      <div>
        <div className="flex items-center gap-2 mb-1.5 text-[var(--pb-brass)]">{icon}
          <span className="text-[var(--pb-text)] font-medium">{title}</span>
        </div>
        <p className="text-sm text-[var(--pb-muted)] leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="pb-card p-6 hover:border-[var(--pb-brass)]/40 transition-colors group">
      <div className="w-11 h-11 rounded border border-[var(--pb-line)] bg-[var(--pb-elevated)] flex items-center justify-center text-[var(--pb-brass)] mb-4 group-hover:border-[var(--pb-brass)]/50 transition-colors">
        {icon}
      </div>
      <div className="pb-serif text-lg text-[var(--pb-text)] mb-2">{title}</div>
      <p className="text-sm text-[var(--pb-muted)] leading-relaxed">{body}</p>
    </div>
  );
}

function ScheduledGame({ date, title, teams }: { date: string; title: string; teams: string }) {
  return (
    <div className="pb-card p-5 hover:border-[var(--pb-brass)]/40 transition-colors group">
      <div className="flex items-center gap-2 text-[var(--pb-amber)] text-xs font-semibold uppercase tracking-wider mb-3">
        <Calendar className="w-3.5 h-3.5" />
        {date}
      </div>
      <div className="pb-serif text-lg text-[var(--pb-text)] mb-1 group-hover:text-[var(--pb-brass-bright)] transition-colors">{title}</div>
      <div className="text-sm text-[var(--pb-muted)]">{teams}</div>
    </div>
  );
}
