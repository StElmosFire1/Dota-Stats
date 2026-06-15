import React from "react";
import { Clock, Ban } from "lucide-react";
import "./_group.css";
import "./Hub.css";

const HEROES = {
  juggernaut: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/juggernaut.png",
  crystal_maiden: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/crystal_maiden.png",
  pudge: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/pudge.png",
  invoker: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/invoker.png",
  lina: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/lina.png",
  lion: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/lion.png",
  axe: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/axe.png",
  antimage: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/antimage.png",
  earthshaker: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/earthshaker.png",
  sven: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/sven.png",
};

export function Hub() {
  return (
    <div className="cm-root min-h-[100dvh] w-full text-[var(--text-primary)] ambient-bg overflow-x-hidden font-sans">
      {/* Top Nav */}
      <nav className="border-b border-[var(--line)] bg-[var(--bg-primary)]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="pb-eyebrow tracking-widest text-[var(--parchment)]">OCE INHOUSE</span>
            <div className="hidden md:block h-4 w-px bg-[var(--line)]"></div>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
              <span className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer transition-colors">Matches</span>
              <span className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer transition-colors">Leaderboard</span>
              <span className="text-[var(--amber)] border-b-2 border-[var(--amber)] h-16 flex items-center">Captain's Mode</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-[var(--bg-card)] border border-[var(--line)] overflow-hidden">
              <img src={HEROES.invoker} alt="avatar" className="hero-portrait" />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-[1280px] mx-auto px-6 py-20 lg:py-32">
        {/* HERO */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          {/* LEFT: PITCH */}
          <div className="lg:col-span-5 flex flex-col items-start">
            <span className="pb-eyebrow text-[var(--brass)] mb-6">Captain's Mode · OCE</span>
            
            <h1 className="pb-serif text-6xl lg:text-7xl leading-[1.1] mb-6">
              Draft.<br/>
              <span className="text-[var(--amber)]">Simulate.</span><br/>
              Climb.
            </h1>
            
            <p className="text-lg text-[var(--text-secondary)] mb-10 leading-relaxed max-w-md">
              Draft a full Captain's Mode game against an AI captain, then watch our sim — powered by OpenDota's full match dataset — play it out.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
              <button className="btn-amber w-full sm:w-auto">START A DRAFT</button>
              <button className="btn-ghost w-full sm:w-auto">Try the demo</button>
            </div>
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Browser · no install.</span>
          </div>

          {/* RIGHT: BOARD */}
          <div className="lg:col-span-7">
            <div className="pb-card overflow-hidden relative shadow-2xl shadow-[var(--amber)]/5 border-[var(--line)]">
              {/* Header */}
              <div className="px-6 py-4 border-b border-[var(--line)] flex justify-between items-center bg-[var(--bg-elevated)]">
                <span className="pb-eyebrow text-[var(--parchment)]">Captain's Mode</span>
                <div className="flex items-center gap-2 text-[var(--amber)]">
                  <Clock className="w-4 h-4" />
                  <span className="pb-num font-medium text-lg">RESERVE 28s</span>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full h-1 bg-[var(--line)]">
                <div className="h-full bg-[var(--amber)] animate-timer-bar shadow-[0_0_8px_var(--amber)]"></div>
              </div>

              {/* Draft Area */}
              <div className="p-6 sm:p-10 flex flex-col gap-10">
                {/* Radiant (Top) */}
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-end">
                    <span className="text-[var(--radiant)] font-semibold tracking-wide text-sm flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[var(--radiant)] shadow-[0_0_8px_var(--radiant)]"></div>
                      RADIANT
                    </span>
                    <span className="pb-num text-xl text-[var(--text-muted)]">55% Win</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 sm:gap-3">
                    <div className="aspect-[16/9] bg-black border border-[var(--radiant)] rounded overflow-hidden opacity-90 hover:opacity-100 transition-opacity">
                      <img src={HEROES.juggernaut} className="hero-portrait" loading="lazy" />
                    </div>
                    <div className="aspect-[16/9] bg-black border border-[var(--radiant)] rounded overflow-hidden opacity-90 hover:opacity-100 transition-opacity">
                      <img src={HEROES.crystal_maiden} className="hero-portrait" loading="lazy" />
                    </div>
                    {/* Animated Slots */}
                    <div className="aspect-[16/9] slot-placeholder rounded overflow-hidden relative">
                      <img src={HEROES.earthshaker} className="hero-portrait absolute inset-0 opacity-0 slot-anim-1" loading="lazy" />
                    </div>
                    <div className="aspect-[16/9] slot-placeholder rounded overflow-hidden relative">
                      <img src={HEROES.lina} className="hero-portrait absolute inset-0 opacity-0 slot-anim-2" loading="lazy" />
                    </div>
                    <div className="aspect-[16/9] slot-placeholder rounded"></div>
                  </div>
                </div>

                {/* Dire (Bottom) */}
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-end">
                    <span className="text-[var(--dire)] font-semibold tracking-wide text-sm flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[var(--dire)] shadow-[0_0_8px_var(--dire)]"></div>
                      DIRE
                    </span>
                    <span className="pb-num text-xl text-[var(--text-muted)]">45% Win</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 sm:gap-3">
                    <div className="aspect-[16/9] bg-black border border-[var(--dire)] rounded overflow-hidden opacity-90 hover:opacity-100 transition-opacity">
                      <img src={HEROES.axe} className="hero-portrait" loading="lazy" />
                    </div>
                    <div className="aspect-[16/9] bg-black border border-[var(--dire)] rounded overflow-hidden opacity-90 hover:opacity-100 transition-opacity">
                      <img src={HEROES.lion} className="hero-portrait" loading="lazy" />
                    </div>
                    {/* Animated Slots */}
                    <div className="aspect-[16/9] slot-placeholder rounded overflow-hidden relative">
                      <img src={HEROES.sven} className="hero-portrait absolute inset-0 opacity-0 slot-anim-3" loading="lazy" />
                    </div>
                    <div className="aspect-[16/9] slot-placeholder rounded overflow-hidden relative">
                      <img src={HEROES.antimage} className="hero-portrait absolute inset-0 opacity-0 slot-anim-4" loading="lazy" />
                    </div>
                    <div className="aspect-[16/9] slot-placeholder rounded"></div>
                  </div>
                </div>
              </div>

              {/* Bans */}
              <div className="bg-[var(--bg-primary)] px-6 py-4 border-t border-[var(--line)] flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Ban className="w-4 h-4 text-[var(--text-muted)]" />
                  <span className="pb-eyebrow text-[var(--text-muted)]">Banned</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-7 bg-black overflow-hidden strike-through rounded">
                    <img src={HEROES.pudge} className="hero-portrait grayscale opacity-50" />
                  </div>
                  <div className="w-12 h-7 bg-black overflow-hidden strike-through rounded">
                    <img src={HEROES.invoker} className="hero-portrait grayscale opacity-50" />
                  </div>
                </div>
              </div>
            </div>

            {/* Bullets */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-8 justify-between text-sm text-[var(--text-secondary)]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--brass)] shadow-[0_0_4px_var(--brass)]"></div>
                Full CM flow — bans, picks, reserves, live timers
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--brass)] shadow-[0_0_4px_var(--brass)]"></div>
                AI captains with real OCE drafting styles
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--brass)] shadow-[0_0_4px_var(--brass)]"></div>
                Solo runs earn captain rating
              </div>
            </div>
          </div>
        </div>

        <div className="w-full h-px bg-[var(--line)] my-20"></div>

        {/* STAT STRIP */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-4 divide-x divide-transparent md:divide-[var(--line)] mb-24">
          <div className="flex flex-col items-center text-center px-4">
            <span className="pb-num text-4xl md:text-5xl text-[var(--parchment)] mb-3">127</span>
            <span className="pb-eyebrow text-[var(--text-muted)]">Draftable heroes</span>
          </div>
          <div className="flex flex-col items-center text-center px-4">
            <span className="pb-num text-4xl md:text-5xl text-[var(--parchment)] mb-3">24</span>
            <span className="pb-eyebrow text-[var(--text-muted)]">Draft steps</span>
          </div>
          <div className="flex flex-col items-center text-center px-4">
            <span className="pb-num text-4xl md:text-5xl text-[var(--parchment)] mb-3">OpenDota</span>
            <span className="pb-eyebrow text-[var(--text-muted)]">Live winrate dataset</span>
          </div>
          <div className="flex flex-col items-center text-center px-4">
            <span className="pb-num text-4xl md:text-5xl text-[var(--parchment)] mb-3">Global</span>
            <span className="pb-eyebrow text-[var(--text-muted)]">Captain ladder</span>
          </div>
        </div>

        {/* DRAFT LIKE A REAL CAPTAIN */}
        <div className="mb-24">
          <div className="mb-12 text-center">
            <span className="pb-eyebrow">ONE SESSION, FULL CM</span>
            <h2 className="pb-serif text-4xl mt-4">Draft like a real captain</h2>
          </div>

          <div className="carousel-container">
            {/* Card 1 */}
            <div className="pb-card carousel-card flex flex-col overflow-hidden hover:border-[var(--brass)] transition-colors duration-300">
              <div className="h-56 bg-[var(--bg-primary)] border-b border-[var(--line)] relative flex items-center justify-center p-6 bg-gradient-to-t from-[var(--bg-elevated)] to-transparent">
                {/* Illustration: Draft Board Mini */}
                <div className="w-full max-w-[200px] flex flex-col gap-4">
                  <div className="flex justify-between items-center w-full">
                    <div className="h-8 w-12 bg-[var(--radiant)] rounded opacity-50 shadow-[0_0_12px_var(--radiant)]"></div>
                    <div className="h-8 w-12 bg-[var(--dire)] rounded opacity-50 shadow-[0_0_12px_var(--dire)]"></div>
                  </div>
                  <div className="w-full h-2 bg-[var(--bg-card)] border border-[var(--line)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--amber)] w-1/3 shadow-[0_0_8px_var(--amber)]"></div>
                  </div>
                </div>
              </div>
              <div className="p-8">
                <h3 className="pb-serif text-2xl mb-3 text-[var(--parchment)]">Draft board</h3>
                <p className="text-[var(--text-secondary)] leading-relaxed">Navigate the complete Captain's Mode phase against an adaptive AI that counters your picks.</p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="pb-card carousel-card flex flex-col overflow-hidden hover:border-[var(--brass)] transition-colors duration-300">
              <div className="h-56 bg-[var(--bg-primary)] border-b border-[var(--line)] relative flex items-center justify-center p-6 bg-gradient-to-t from-[var(--bg-elevated)] to-transparent">
                {/* Illustration: Strategy Grid */}
                <div className="grid grid-cols-3 gap-3 w-full max-w-[180px]">
                  <div className="aspect-square border border-[var(--line)] rounded flex items-center justify-center text-[var(--amber)] bg-[var(--bg-card)]"><Ban className="w-5 h-5"/></div>
                  <div className="aspect-square bg-[var(--bg-elevated)] rounded border border-[var(--line)]"></div>
                  <div className="aspect-square bg-[var(--bg-elevated)] rounded border border-[var(--line)]"></div>
                  <div className="aspect-square bg-[var(--bg-elevated)] rounded border border-[var(--line)]"></div>
                  <div className="aspect-square bg-[var(--bg-elevated)] rounded border border-[var(--amber)] shadow-[0_0_12px_rgba(245,158,11,0.2)]"></div>
                  <div className="aspect-square bg-[var(--bg-elevated)] rounded border border-[var(--line)]"></div>
                </div>
              </div>
              <div className="p-8">
                <h3 className="pb-serif text-2xl mb-3 text-[var(--parchment)]">Strategy</h3>
                <p className="text-[var(--text-secondary)] leading-relaxed">Examine live matchup winrates, flex-pick probabilities, and real-time suggested counters.</p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="pb-card carousel-card flex flex-col overflow-hidden hover:border-[var(--brass)] transition-colors duration-300">
              <div className="h-56 bg-[var(--bg-primary)] border-b border-[var(--line)] relative flex items-center justify-center p-6 bg-gradient-to-t from-[var(--bg-elevated)] to-transparent">
                {/* Illustration: Simulator */}
                <div className="flex items-center gap-6 w-full max-w-[240px]">
                  <div className="flex-1 flex flex-col items-center gap-3">
                    <span className="pb-num text-3xl text-[var(--radiant)] drop-shadow-[0_0_8px_var(--radiant)]">52%</span>
                    <div className="w-full h-1.5 bg-[var(--radiant)] rounded-full"></div>
                  </div>
                  <span className="pb-eyebrow text-[var(--text-muted)] mt-1">VS</span>
                  <div className="flex-1 flex flex-col items-center gap-3">
                    <span className="pb-num text-3xl text-[var(--dire)] drop-shadow-[0_0_8px_var(--dire)]">48%</span>
                    <div className="w-full h-1.5 bg-[var(--dire)] rounded-full"></div>
                  </div>
                </div>
              </div>
              <div className="p-8">
                <h3 className="pb-serif text-2xl mb-3 text-[var(--parchment)]">Simulator</h3>
                <p className="text-[var(--text-secondary)] leading-relaxed">Run your finished draft through our 1M+ match dataset to see the projected outcome.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-[var(--line)] bg-[var(--bg-elevated)]">
        <div className="max-w-[1280px] mx-auto px-6 py-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-[var(--text-muted)]">
          <span>&copy; {new Date().getFullYear()} OCE Inhouse. All rights reserved.</span>
          <div className="flex gap-6">
            <span className="hover:text-[var(--text-primary)] cursor-pointer transition-colors">Discord</span>
            <span className="hover:text-[var(--text-primary)] cursor-pointer transition-colors">Leaderboard</span>
            <span className="hover:text-[var(--text-primary)] cursor-pointer transition-colors">Rules</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
