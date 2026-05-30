import React from "react";

const LINKS = ["Home", "Leaderboard", "Matches", "Heroes", "Inhouse"];

export function PressBoxNav({
  active = "",
  user = "stardust",
  signedOut = false,
}: {
  active?: string;
  user?: string;
  signedOut?: boolean;
}) {
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

        {signedOut ? (
          <button
            type="button"
            className="flex items-center gap-2.5 rounded px-4 py-2 pb-cond text-[12px] uppercase tracking-[0.18em] font-semibold transition-colors"
            style={{ backgroundColor: "var(--pb-amber)", color: "#000" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "#d97706")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--pb-amber)")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.5 2 2 6.4 2 11.9c0 4.5 3 8.3 7.1 9.6l-1.4-2.1a3.3 3.3 0 0 1-1.9-3 3.3 3.3 0 0 1 3.3-3.3l.4.02 2.9-4.2v-.06a3.7 3.7 0 1 1 3.7 3.7h-.08l-4.1 2.9.01.3a3.3 3.3 0 0 1-6.1 1.7l-2.9-1.2A10 10 0 1 0 12 2Zm5.1 5.2a2.45 2.45 0 1 1-4.9 0 2.45 2.45 0 0 1 4.9 0Zm-3.7 0a1.23 1.23 0 1 0 2.46 0 1.23 1.23 0 0 0-2.46 0ZM7.6 16.8a2.5 2.5 0 0 0 4.6-1l-1.5-.6a1.27 1.27 0 0 1-1.7.7l-1.4.9Z" />
            </svg>
            Sign in with Steam
          </button>
        ) : (
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
        )}
      </div>
    </header>
  );
}
