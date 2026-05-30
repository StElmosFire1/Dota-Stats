import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Dialog from './Dialog';
import { getAllPlayers, getMatches } from '../api';
import { ALL_HEROES, getHeroImageUrl } from '../heroNames';

// Task #586 — global search + ⌘K / Ctrl-K command palette (full edition).
//
// One feature, two surfaces:
//   - a search field in the top header (collapses to an icon on mobile)
//   - a command-palette overlay opened by the header field OR the global
//     ⌘K / Ctrl-K shortcut from anywhere on the site.
//
// Results are grouped Players / Heroes / Pages / Matches and reuse the same
// data the per-page lists already query (getAllPlayers, getMatches, the static
// hero registry, and a curated route table) — no new server-side search.
//
// Accessibility: the overlay is built on the shared <Dialog> primitive
// (focus trap / restore, Escape-to-close, backdrop, body-scroll lock). The
// input is a combobox driving a listbox via aria-activedescendant so arrow
// keys move the highlight while DOM focus stays in the field; a polite live
// region announces the result count.

// Curated page/route registry. `keywords` widen substring matching beyond the
// visible label (all lowercase). Icons are decorative.
const PAGES = [
  { label: 'Home', path: '/', icon: '🏠', keywords: 'dashboard front start' },
  { label: 'Leaderboard', path: '/leaderboard', icon: '🏆', keywords: 'ladder ranking rank mmr trueskill' },
  { label: 'Player Stats', path: '/stats', icon: '📊', keywords: 'overall statistics' },
  { label: 'Positions', path: '/positions', icon: '🧭', keywords: 'roles position lane' },
  { label: 'Heroes', path: '/heroes', icon: '🦸', keywords: 'hero meta winrate tier' },
  { label: 'Synergy', path: '/synergy', icon: '🔗', keywords: 'pairs combos duo synergies' },
  { label: 'Matches', path: '/matches', icon: '⚔️', keywords: 'games history replays' },
  { label: 'This Week', path: '/this-week', icon: '📅', keywords: 'weekly recap' },
  { label: 'Players', path: '/players', icon: '👥', keywords: 'roster directory live now' },
  { label: 'Records', path: '/records', icon: '📜', keywords: 'hall of fame multikills records' },
  { label: 'Predictions', path: '/predictions', icon: '🔮', keywords: 'pickem forecast' },
  { label: "Pick'em", path: '/pickem', icon: '✅', keywords: 'predictions vote' },
  { label: 'Patch Notes', path: '/patch-notes', icon: '🗒️', keywords: 'changelog updates version' },
  { label: 'Draft & Assistant', path: '/draft', icon: '🎯', keywords: 'drafting counter pick assistant' },
  { label: 'Upload Replay', path: '/upload', icon: '⬆️', keywords: 'parse demo replay' },
  { label: 'Inhouse Lobby', path: '/inhouse', icon: '🎮', keywords: 'faceit lobby queue captain draft' },
  { label: 'Tournaments', path: '/tournaments', icon: '🏅', keywords: 'cup bracket buyin' },
  { label: 'Leagues', path: '/leagues', icon: '🛡️', keywords: 'division' },
  { label: 'Teams', path: '/teams', icon: '🤝', keywords: 'team roster' },
  { label: 'Coaching Marketplace', path: '/coaches', icon: '🎓', keywords: 'coach lessons mentor booking' },
  { label: 'Daily Mini-Games', path: '/games', icon: '🕹️', keywords: 'dotadle wordle puzzle heroguessr' },
  { label: 'Game Schedule', path: '/schedule', icon: '🗓️', keywords: 'calendar fixtures' },
  { label: 'Pudge Hook Stats', path: '/pudge-stats', icon: '🪝', keywords: 'hooks pudge' },
  { label: 'Sponsor a Slot', path: '/sponsorships', icon: '💼', keywords: 'sponsorship ads' },
  { label: 'Cosmetics Shop', path: '/shop', icon: '🛍️', keywords: 'coins frames cosmetics buy spend' },
  { label: 'Season Pass', path: '/season-pass', icon: '🎟️', keywords: 'battle pass rewards' },
  { label: 'Pro Membership', path: '/pro', icon: '★', keywords: 'upgrade premium subscription analytics' },
  { label: 'Hall of Fame', path: '/hall-of-fame', icon: '🌟', keywords: 'legends plaques' },
  { label: 'Join the League', path: '/join', icon: '✍️', keywords: 'sign up register' },
  { label: 'Settings', path: '/settings', icon: '⚙️', keywords: 'preferences account profile' },
  { label: 'Notifications', path: '/settings/notifications', icon: '🔔', keywords: 'alerts push' },
  { label: 'Billing', path: '/settings/billing', icon: '💳', keywords: 'payment subscription invoice' },
];

// Empty-state quick links (subset of PAGES, by path).
const QUICK_LINK_PATHS = [
  '/leaderboard', '/heroes', '/matches', '/players',
  '/inhouse', '/this-week', '/shop', '/pro',
];
const QUICK_LINKS = QUICK_LINK_PATHS
  .map(p => PAGES.find(pg => pg.path === p))
  .filter(Boolean);

function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const loadedRef = useRef(false);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [players, setPlayers] = useState([]);
  const [recentMatches, setRecentMatches] = useState([]);

  // Lazy-load the searchable datasets the first time the palette opens.
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    getAllPlayers()
      .then(d => setPlayers(Array.isArray(d?.players) ? d.players : []))
      .catch(() => {});
    getMatches(50, 0)
      .then(d => setRecentMatches(Array.isArray(d?.matches) ? d.matches : []))
      .catch(() => {});
  }, [open]);

  // Reset query + highlight each time the palette opens.
  useEffect(() => {
    if (open) { setQuery(''); setActiveIndex(0); }
  }, [open]);

  // Reset highlight whenever the query changes.
  useEffect(() => { setActiveIndex(0); }, [query]);

  const groups = useMemo(() => {
    const raw = query.trim();
    const q = raw.toLowerCase();

    if (!raw) {
      return [{
        key: 'quick',
        title: 'Quick links',
        items: QUICK_LINKS.map(pg => ({
          id: `quick-${pg.path}`, label: pg.label, sub: pg.path,
          icon: pg.icon, kind: 'Page', path: pg.path,
        })),
      }];
    }

    const out = [];

    // Players — match across every name field, not just the first non-empty one.
    const playerItems = players
      .filter(p => `${p.nickname || ''} ${p.display_name || ''} ${p.persona_name || ''}`.toLowerCase().includes(q))
      .slice(0, 6)
      .map(p => {
        const name = p.nickname || p.display_name || p.persona_name || `Player ${p.account_id}`;
        const path = p.account_id > 0
          ? `/player/${p.account_id}`
          : `/player/${encodeURIComponent(p.player_key || p.persona_name || '')}`;
        const sub = p.persona_name && p.persona_name !== name ? p.persona_name : '';
        return { id: `p-${p.player_key || p.account_id || name}`, label: name, sub, icon: '👤', kind: 'Player', path };
      });
    if (playerItems.length) out.push({ key: 'players', title: 'Players', items: playerItems });

    // Heroes
    const heroItems = ALL_HEROES
      .filter(h => h.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map(h => ({
        id: `h-${h.id}`, label: h.name, sub: '',
        img: getHeroImageUrl(h.id, h.name), icon: '🦸', kind: 'Hero', path: '/heroes',
      }));
    if (heroItems.length) out.push({ key: 'heroes', title: 'Heroes', items: heroItems });

    // Pages
    const pageItems = PAGES
      .filter(pg => pg.label.toLowerCase().includes(q) || (pg.keywords || '').includes(q))
      .slice(0, 6)
      .map(pg => ({ id: `pg-${pg.path}`, label: pg.label, sub: pg.path, icon: pg.icon, kind: 'Page', path: pg.path }));
    if (pageItems.length) out.push({ key: 'pages', title: 'Pages', items: pageItems });

    // Matches — numeric direct-jump plus substring match against recent matches.
    const matchItems = [];
    const seen = new Set();
    if (/^\d{2,}$/.test(raw)) {
      matchItems.push({ id: `m-direct-${raw}`, label: `Match #${raw}`, sub: 'Open match detail', icon: '⚔️', kind: 'Match', path: `/match/${raw}` });
      seen.add(raw);
    }
    for (const m of recentMatches) {
      if (matchItems.length >= 6) break;
      const idStr = String(m.match_id);
      if (!idStr.includes(raw) || seen.has(idStr)) continue;
      seen.add(idStr);
      const sub = m.radiant_win != null ? (m.radiant_win ? 'Radiant Victory' : 'Dire Victory') : '';
      matchItems.push({ id: `m-${idStr}`, label: `Match #${idStr}`, sub, icon: '⚔️', kind: 'Match', path: `/match/${idStr}` });
    }
    if (matchItems.length) out.push({ key: 'matches', title: 'Matches', items: matchItems });

    return out;
  }, [query, players, recentMatches]);

  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const hasQuery = query.trim().length > 0;

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`cmdk-opt-${activeIndex}`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, flat.length]);

  const select = useCallback((item) => {
    if (!item) return;
    onClose();
    navigate(item.path);
  }, [navigate, onClose]);

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length) setActiveIndex(i => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActiveIndex(i => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(flat[activeIndex]);
    } else if (e.key === 'Home') {
      if (flat.length) { e.preventDefault(); setActiveIndex(0); }
    } else if (e.key === 'End') {
      if (flat.length) { e.preventDefault(); setActiveIndex(flat.length - 1); }
    }
  };

  const safeActive = Math.min(activeIndex, Math.max(flat.length - 1, 0));
  let counter = -1;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      label="Site search"
      initialFocusRef={inputRef}
      backdropClassName="cmdk-backdrop"
      contentClassName="cmdk-panel"
    >
      <div className="cmdk-input-row">
        <span className="cmdk-search-ico" aria-hidden="true">🔍</span>
        <input
          ref={inputRef}
          type="text"
          className="cmdk-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-list"
          aria-autocomplete="list"
          aria-label="Search players, heroes, pages and matches"
          aria-activedescendant={flat.length ? `cmdk-opt-${safeActive}` : undefined}
          placeholder="Search players, heroes, pages…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          autoComplete="off"
          spellCheck="false"
        />
        <span className="cmdk-esc-hint" aria-hidden="true">esc</span>
      </div>

      <div className="cmdk-list" id="cmdk-list" role="listbox" aria-label="Search results">
        {flat.length === 0 ? (
          <div className="cmdk-empty">
            {hasQuery ? `No results for “${query.trim()}”` : 'Start typing to search…'}
          </div>
        ) : (
          groups.map(group => (
            <div className="cmdk-group" role="group" aria-labelledby={`cmdk-grp-${group.key}`} key={group.key}>
              <div className="cmdk-group-title" id={`cmdk-grp-${group.key}`}>{group.title}</div>
              {group.items.map(item => {
                counter += 1;
                const idx = counter;
                const isActive = idx === safeActive;
                return (
                  // Rendered as a div (not a button) so the shared Dialog's
                  // focus-trap selector (`button:not([disabled])`) doesn't pick
                  // these non-tabbable options up — leaving the input the sole
                  // focusable so Tab/Shift+Tab wrap correctly. The combobox owns
                  // keyboard nav; onKeyDown here is a defensive Enter/Space
                  // activator should an option ever receive focus.
                  <div
                    key={item.id}
                    role="option"
                    id={`cmdk-opt-${idx}`}
                    aria-selected={isActive}
                    tabIndex={-1}
                    className={`cmdk-option${isActive ? ' is-active' : ''}`}
                    onClick={() => select(item)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(item); } }}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onFocus={() => setActiveIndex(idx)}
                  >
                    <span className="cmdk-opt-ico" aria-hidden="true">
                      {item.img
                        ? <img src={item.img} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
                        : item.icon}
                    </span>
                    <span className="cmdk-opt-main">
                      <span className="cmdk-opt-label">{item.label}</span>
                      {item.sub ? <span className="cmdk-opt-sub">{item.sub}</span> : null}
                    </span>
                    <span className="cmdk-opt-kind">{item.kind}</span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="cmdk-sr-only" role="status" aria-live="polite">
        {hasQuery ? `${flat.length} result${flat.length === 1 ? '' : 's'} for ${query.trim()}` : ''}
      </div>
    </Dialog>
  );
}

// Header trigger + global keyboard shortcut. Owns the open state and renders
// the palette. Drop a single <GlobalSearch /> into the navbar.
export default function GlobalSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        className="global-search-trigger"
        onClick={() => setOpen(true)}
        aria-label="Search (press Control K or Command K)"
        title="Search — ⌘K / Ctrl-K"
      >
        <span className="gs-trigger-ico" aria-hidden="true">🔍</span>
        <span className="gs-trigger-label">Search…</span>
        <span className="gs-trigger-kbd" aria-hidden="true">⌘K</span>
      </button>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}
