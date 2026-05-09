// Task #203 — Magazine v3 stat panels for /player/:id (full edition only).
// Mounted inside the `.magazine-v3` wrapper above the rest of the profile.
// All four panels are free for everyone. Empty-state copy is rendered when
// the player has no eligible data so the section never collapses to nothing.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getHeroName, getHeroImageUrl } from '../heroNames';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function PanelShell({ eyebrow, title, children }) {
  return (
    <section className="mag-story v3-panel">
      {eyebrow && <div className="mag-eyebrow v3-panel-eyebrow">{eyebrow}</div>}
      <h2 className="mag-title v3-panel-title">{title}</h2>
      {children}
    </section>
  );
}

export function TimeOfDayPanel({ data }) {
  if (!data) return null;
  const { grid, totalGames } = data;
  if (!grid || totalGames === 0) {
    return (
      <PanelShell eyebrow="When you play" title="Time-of-day heatmap">
        <div className="v3-panel-empty">No timed matches yet — your heatmap will appear here once your first game is recorded.</div>
      </PanelShell>
    );
  }
  // Find max games in any cell for opacity scaling.
  let maxGames = 1;
  for (const row of grid) for (const c of row) if (c.games > maxGames) maxGames = c.games;
  return (
    <PanelShell eyebrow="When you play" title="Time-of-day heatmap">
      <div className="v3-panel-sub">All times in Australia/Sydney. Opacity = games played, hue = win rate.</div>
      <div className="v3-tod-wrap">
        <div className="v3-tod-grid" role="img" aria-label={`Match heatmap across day-of-week and hour-of-day, ${totalGames} games total`}>
          <div className="v3-tod-corner" aria-hidden="true"></div>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={`h${h}`} className="v3-tod-hour-label" aria-hidden="true">{h % 6 === 0 ? `${h}h` : ''}</div>
          ))}
          {grid.map((row, di) => (
            <React.Fragment key={`r${di}`}>
              <div className="v3-tod-day-label" aria-hidden="true">{DAY_LABELS[di]}</div>
              {row.map((cell, hi) => {
                const games = cell.games;
                const wins = cell.wins;
                const wr = games > 0 ? wins / games : 0;
                const opacity = games > 0 ? 0.18 + 0.82 * (games / maxGames) : 0;
                const hue = games > 0 ? (wr >= 0.5 ? 'var(--accent-green, #4ade80)' : 'var(--accent-red, #f87171)') : 'transparent';
                const titleStr = games > 0
                  ? `${DAY_LABELS[di]} ${hi}:00 — ${games} games, ${wins}W/${games - wins}L (${Math.round(wr * 100)}% WR)`
                  : `${DAY_LABELS[di]} ${hi}:00 — no games`;
                return (
                  <div
                    key={`c${di}-${hi}`}
                    className="v3-tod-cell"
                    style={games > 0 ? { background: hue, opacity } : undefined}
                    title={titleStr}
                    aria-label={titleStr}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

export function HeroItemsPanel({ data }) {
  // Hover/focus parity is mandatory (Task #185 a11y gate). The selected hero
  // can be driven by either pointer hover OR keyboard focus on the same button.
  const heroes = data?.heroes || [];
  const [hoveredIdx, setHoveredIdx] = useState(0);

  if (!heroes.length) {
    return (
      <PanelShell eyebrow="What you build" title="Hero builds">
        <div className="v3-panel-empty">No hero data yet — pick a hero in your next game to see your typical build here.</div>
      </PanelShell>
    );
  }
  const active = heroes[hoveredIdx] || heroes[0];
  return (
    <PanelShell eyebrow="What you build" title="Hero builds">
      <div className="v3-panel-sub">Your most-played heroes and the items you typically buy on them. Hover or tab to switch.</div>
      <div className="v3-hero-items-row">
        <div className="v3-hero-items-portraits" role="tablist" aria-label="Pick a hero to view items">
          {heroes.map((h, idx) => {
            const wr = h.games > 0 ? Math.round((h.wins / h.games) * 100) : 0;
            const name = h.hero_name || getHeroName(h.hero_id);
            const isActive = idx === hoveredIdx;
            return (
              <button
                key={h.hero_id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`v3-hero-items-btn${isActive ? ' is-active' : ''}`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onFocus={() => setHoveredIdx(idx)}
                onClick={() => setHoveredIdx(idx)}
                title={`${name} — ${h.games}g · ${wr}% WR`}
                aria-label={`${name}, ${h.games} games, ${wr} percent win rate`}
              >
                <img
                  src={getHeroImageUrl(h.hero_id, h.hero_name)}
                  alt=""
                  loading="lazy"
                  className="v3-hero-items-portrait"
                />
                <span className="v3-hero-items-meta">
                  <span className="v3-hero-items-name">{name}</span>
                  <span className="v3-hero-items-stat">{h.games}g · {wr}%</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="v3-hero-items-detail" aria-live="polite">
          <div className="v3-hero-items-detail-name">{active.hero_name || getHeroName(active.hero_id)}</div>
          {active.items && active.items.length > 0 ? (
            <ul className="v3-hero-items-list">
              {active.items.map(it => (
                <li key={it.name} className="v3-hero-items-item">
                  <span className="v3-hero-items-itemname">{it.name.replace(/_/g, ' ')}</span>
                  <span className="v3-hero-items-itemcount">×{it.uses}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="v3-panel-empty">No item data on this hero yet.</div>
          )}
        </div>
      </div>
    </PanelShell>
  );
}

export function SeasonWrappedPanel({ data }) {
  if (!data || !data.season) {
    return (
      <PanelShell eyebrow="Season recap" title="Season Wrapped">
        <div className="v3-panel-empty">No completed season yet — your wrapped recap will appear here once a season is archived.</div>
      </PanelShell>
    );
  }
  const items = data.items || [];
  if (!items.length) {
    return (
      <PanelShell eyebrow={`Season recap · ${data.season.name}`} title="Season Wrapped">
        <div className="v3-panel-empty">You didn't play this season — recap will appear next time.</div>
      </PanelShell>
    );
  }
  return (
    <PanelShell eyebrow={`Season recap · ${data.season.name}`} title="Season Wrapped">
      <div className="v3-wrapped-grid">
        {items.map(it => (
          <div key={it.label} className="v3-wrapped-item">
            <div className="v3-wrapped-label">{it.label}</div>
            <div className="v3-wrapped-value">{it.value}</div>
            {it.sub && <div className="v3-wrapped-sub">{it.sub}</div>}
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

export function HallOfFamePlaquesPanel({ data }) {
  const plaques = data?.plaques || [];
  // Task #203 acceptance: graceful absence (render nothing) when the player
  // has no top-1% / record plaques — never an empty card.
  if (!plaques.length) return null;
  return (
    <PanelShell eyebrow="Hall of Fame" title="Plaques">
      <div className="v3-hof-plaques">
        {plaques.map(p => {
          const inner = (
            <>
              <div className="v3-hof-plaque-title">{p.title}</div>
              <div className="v3-hof-plaque-value">{p.value}</div>
              {p.sub && <div className="v3-hof-plaque-sub">{p.sub}</div>}
            </>
          );
          if (p.match_id) {
            return (
              <Link
                key={`${p.kind}:${p.key}`}
                to={`/match/${p.match_id}`}
                className="v3-hof-plaque-card v3-hof-plaque-link"
              >
                {inner}
              </Link>
            );
          }
          return (
            <div key={`${p.kind}:${p.key}`} className="v3-hof-plaque-card">
              {inner}
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

export default function ProfileV3Panels({ tod, heroItems, seasonWrapped, hofPlaques }) {
  return (
    <div className="v3-panels">
      <TimeOfDayPanel data={tod} />
      <HeroItemsPanel data={heroItems} />
      <SeasonWrappedPanel data={seasonWrapped} />
      <HallOfFamePlaquesPanel data={hofPlaques} />
    </div>
  );
}
