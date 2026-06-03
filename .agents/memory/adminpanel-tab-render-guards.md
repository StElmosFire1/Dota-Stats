---
name: AdminPanel tab render guards
description: How AdminPanel.jsx tab sections are gated, and why same-tab fragments can be safely consolidated.
---

AdminPanel.jsx (full edition, `web/src/pages/`) is one giant component (~10k lines). Each
visible section is gated ONLY by a `{activeTab === 'x' && (<>...</>)}` fragment. There is no
router/switch — the tab a section belongs to is literally just its guard key.

**Consolidating duplicate guards is behavior-safe.** Historically the same tab had several
separate `{activeTab === 'x'}` blocks scattered through the file (e.g. matches had 3, seasons
had 4). Merging them into one block is safe as long as you **concatenate the fragments in file
order** into the surviving block: non-active guard blocks never render, so the only thing that
determines on-screen order is the source order of JSX within the active tab. Preserve that and
nothing moves.

**Why:** reorganizing tabs means reassigning guard keys; if you don't keep one-guard-per-tab
you get the fragmented-tab smell back and search/nav drift.

**How to apply:**
- `TAB_META` (module scope) is the single source of truth for icon/label/desc; `ADMIN_NAV_GROUPS`
  drives the sidebar; `<TabHeader id="x" />` renders the per-tab header. Add new tabs there.
- `activeTab` init must reject stale `localStorage['admin_active_tab']` values (a renamed tab id
  left in storage otherwise blanks the whole panel).
- Every `SEARCH_INDEX` anchor must correspond to a real DOM `id=` in the rendered section, and its
  `tab:` must be a current TAB_META id.
- After any guard reshuffle, verify exactly one guard per tab:
  `rg -o "activeTab === '\w+'" web/src/pages/AdminPanel.jsx | sort | uniq -c`.
