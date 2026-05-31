import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Dialog from './Dialog';
import { globalSearch } from '../api';
import { ALL_HEROES, getHeroImageUrl } from '../heroNames';
import { scoreText, scoreItem, rankAndCap } from './commandPaletteRanking';

// Task #586 / #588 — global search + ⌘K / Ctrl-K command palette (full edition).
//
// One feature, two surfaces:
//   - a search field in the top header (collapses to an icon on mobile)
//   - a command-palette overlay opened by the header field OR the global
//     ⌘K / Ctrl-K shortcut from anywhere on the site.
//
// Results are grouped Players / Coaches / Teams / Tournaments / Heroes. The
// first four come from one bounded, debounced server lookup (GET /api/search)
// so the palette never pulls whole lists client-side; heroes are matched
// in-process against the static registry (heroNames.js) for instant feedback.
//
// Accessibility: the overlay is built on the shared <Dialog> primitive
// (focus trap / restore, Escape-to-close, backdrop, body-scroll lock). The
// input is a combobox driving a listbox via aria-activedescendant so arrow
// keys move the highlight while DOM focus stays in the field; a polite live
// region announces the result count.

// Empty-state quick links — the five searchable section landing pages.
const QUICK_LINKS = [
  { label: 'Players', path: '/players', icon: '👥' },
  { label: 'Coaches', path: '/coaches', icon: '🎓' },
  { label: 'Teams', path: '/teams', icon: '🤝' },
  { label: 'Tournaments', path: '/tournaments', icon: '🏅' },
  { label: 'Heroes', path: '/heroes', icon: '🦸' },
];

const EMPTY_RESULTS = { players: [], coaches: [], teams: [], tournaments: [] };

// Ranking/scoring helpers (scoreText / scoreItem / rankAndCap) and the per-group
// cap live in ./commandPaletteRanking so they can be unit-tested in isolation.

function formatRate(cents, currency) {
  if (cents == null) return '';
  const amount = Math.round(cents / 100);
  return `$${amount} ${(currency || 'aud').toUpperCase()}/hr`;
}

function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);

  // Reset query + highlight + results each time the palette opens.
  useEffect(() => {
    if (open) { setQuery(''); setActiveIndex(0); setResults(EMPTY_RESULTS); setLoading(false); }
  }, [open]);

  // Reset highlight whenever the query changes.
  useEffect(() => { setActiveIndex(0); }, [query]);

  // Debounced server search. Queries shorter than 2 chars short-circuit to an
  // empty result set (matching the server's own min-length guard); a cancelled
  // flag drops stale responses so fast typing can't flash older results.
  useEffect(() => {
    if (!open) return;
    const raw = query.trim();
    if (raw.length < 2) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(() => {
      globalSearch(raw)
        .then(d => {
          if (cancelled) return;
          setResults({
            players: Array.isArray(d?.players) ? d.players : [],
            coaches: Array.isArray(d?.coaches) ? d.coaches : [],
            teams: Array.isArray(d?.teams) ? d.teams : [],
            tournaments: Array.isArray(d?.tournaments) ? d.tournaments : [],
          });
        })
        .catch(() => { if (!cancelled) setResults(EMPTY_RESULTS); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open]);

  const groups = useMemo(() => {
    const raw = query.trim();
    const q = raw.toLowerCase();

    if (!raw) {
      return [{
        key: 'quick',
        title: 'Jump to',
        items: QUICK_LINKS.map(pg => ({
          id: `quick-${pg.path}`, label: pg.label, sub: '',
          icon: pg.icon, kind: 'Page', path: pg.path,
        })),
      }];
    }

    const out = [];

    // Each group is scored against the query and re-ordered (exact > prefix >
    // word-start > substring > fuzzy) before the per-group cap. Server groups
    // keep every row the server returned — we only re-order them, scoring the
    // label plus any alias / tag so an alias-only hit still ranks. The hero
    // list is matched + fuzzy-filtered in-process, so misses are dropped.

    // Players — score label + persona alias.
    const playerItems = rankAndCap((results.players || []).map(p => {
      const path = p.account_id > 0
        ? `/player/${p.account_id}`
        : `/player/${encodeURIComponent(p.player_key || p.name || '')}`;
      const sub = p.persona_name && p.persona_name !== p.name
        ? p.persona_name
        : (p.games_played ? `${p.games_played} game${p.games_played === 1 ? '' : 's'}` : '');
      const item = { id: `p-${p.player_key || p.account_id || p.name}`, label: p.name, sub, img: p.avatar || undefined, icon: '👤', kind: 'Player', path };
      return { item, score: scoreItem(q, p.name, p.persona_name) };
    }));
    if (playerItems.length) out.push({ key: 'players', title: 'Players', items: playerItems });

    // Coaches
    const coachItems = rankAndCap((results.coaches || []).map(c => {
      const item = {
        id: `c-${c.id}`, label: c.name,
        sub: formatRate(c.hourly_rate_cents, c.currency) || (c.taught_roles || ''),
        img: c.avatar || undefined, icon: '🎓', kind: 'Coach', path: `/coaches/${c.id}`,
      };
      return { item, score: scoreItem(q, c.name) };
    }));
    if (coachItems.length) out.push({ key: 'coaches', title: 'Coaches', items: coachItems });

    // Teams — score name + tag.
    const teamItems = rankAndCap((results.teams || []).map(t => {
      const item = {
        id: `t-${t.id}`, label: t.name,
        sub: `[${t.tag}]${t.member_count ? ` · ${t.member_count} member${t.member_count === 1 ? '' : 's'}` : ''}`,
        icon: '🤝', kind: 'Team', path: `/teams/${t.id}`,
      };
      return { item, score: scoreItem(q, t.name, t.tag) };
    }));
    if (teamItems.length) out.push({ key: 'teams', title: 'Teams', items: teamItems });

    // Tournaments
    const tournamentItems = rankAndCap((results.tournaments || []).map(t => {
      const item = {
        id: `tn-${t.id}`, label: t.name,
        sub: [t.status, t.season_name].filter(Boolean).join(' · '),
        icon: '🏅', kind: 'Tournament', path: `/tournaments/${t.id}`,
      };
      return { item, score: scoreItem(q, t.name) };
    }));
    if (tournamentItems.length) out.push({ key: 'tournaments', title: 'Tournaments', items: tournamentItems });

    // Heroes — matched client-side against the static registry; misses (incl.
    // fuzzy non-matches) are dropped before ranking + capping.
    const heroItems = rankAndCap(
      ALL_HEROES.map(h => ({
        item: {
          id: `h-${h.id}`, label: h.name, sub: '',
          img: getHeroImageUrl(h.id, h.name), icon: '🦸', kind: 'Hero', path: `/heroes/${h.id}`,
        },
        score: scoreText(h.name, q),
      })),
      { dropMisses: true },
    );
    if (heroItems.length) out.push({ key: 'heroes', title: 'Heroes', items: heroItems });

    return out;
  }, [query, results]);

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

  // Empty-state copy depends on what the user has typed and whether a request
  // is in flight.
  let emptyMessage = 'Start typing to search…';
  if (hasQuery) {
    if (query.trim().length < 2) emptyMessage = 'Keep typing to search…';
    else if (loading) emptyMessage = 'Searching…';
    else emptyMessage = `No results for “${query.trim()}”`;
  }

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
          aria-label="Search players, coaches, teams, tournaments and heroes"
          aria-activedescendant={flat.length ? `cmdk-opt-${safeActive}` : undefined}
          placeholder="Search players, coaches, teams, tournaments, heroes…"
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
          <div className="cmdk-empty">{emptyMessage}</div>
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
        {hasQuery && !loading ? `${flat.length} result${flat.length === 1 ? '' : 's'} for ${query.trim()}` : ''}
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
