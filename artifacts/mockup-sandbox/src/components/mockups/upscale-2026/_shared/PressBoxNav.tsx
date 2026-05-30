import React from "react";

const LINKS = ["Home", "Leaderboard", "Matches", "Heroes", "Inhouse"];

export function PressBoxNav({ active = "", user = "stardust" }: { active?: string; user?: string }) {
  return (
    <header
      className="sticky top-0 z-50 w-full border-b backdrop-blur"
      style={{
        borderColor: "var(--pb-line)",
        backgroundColor: "rgba(10, 16, 30, 0.82)",
      }}
    >
      <div className="max-w-[1400px] mx-auto px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-[6px] flex items-center justify-center pb-serif text-sm font-bold"
              style={{
                background: "linear-gradient(160deg, var(--pb-brass-bright), var(--pb-brass))",
                color: "var(--pb-bg)",
              }}
            >
              O
            </div>
            <span
              className="pb-serif text-lg tracking-wide font-semibold leading-none"
              style={{ color: "var(--pb-brass-bright)" }}
            >
              OCE Inhouse
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-7 pb-cond text-[13px] tracking-[0.18em] uppercase">
            {LINKS.map((label) => {
              const isActive = label.toLowerCase() === active.toLowerCase();
              return (
                <a
                  key={label}
                  href="#"
                  className="transition-colors relative"
                  style={{ color: isActive ? "var(--pb-brass-bright)" : "var(--pb-muted)" }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--pb-text)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--pb-muted)";
                  }}
                >
                  {label}
                  {isActive && (
                    <span
                      className="absolute -bottom-[22px] left-0 right-0 h-[2px]"
                      style={{ backgroundColor: "var(--pb-brass)" }}
                    />
                  )}
                </a>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block leading-tight">
            <div className="text-[10px] pb-cond uppercase tracking-[0.2em]" style={{ color: "var(--pb-faint)" }}>
              Signed in
            </div>
            <div className="text-sm font-medium" style={{ color: "var(--pb-text)" }}>
              {user}
            </div>
          </div>
          <div
            className="w-9 h-9 rounded-full border flex items-center justify-center pb-serif text-sm"
            style={{
              borderColor: "var(--pb-line)",
              backgroundColor: "var(--pb-elevated)",
              color: "var(--pb-brass-bright)",
            }}
          >
            {user.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
