# Frontend a11y gates — evolution history

`scripts/check-a11y.js` runs as a hard pre-build gate in both `deploy.sh` and `scripts/post-merge.sh`. The current rule set is summarised in `replit.md` ("Frontend accessibility house rule"). This file preserves the per-pass history — what each pass flags, why it was added, and which task tightened it — so future contributors can see the full design intent without bloating the top-level README.

Synthetic test coverage for every pass lives in `tests/checkA11y.test.js`.

## Pass 1 — Generic clickable-element gate (Task #164)
Statically scans both `web/src/` and `community-edition/web/src/` for `<div>/<span>/<li>/<tr>/<td>/<th>/<section>/<article>/<header>/<footer>/<nav>/<aside>/<main>/<ul>/<ol>/<p>/<figure>/<figcaption>/<img>` opening tags that have an `onClick` but are missing the `role`+`tabIndex`+`onKeyDown` triad. `<th onClick>` is always flagged with a hint to use the shared `SortableTh` component.

Allowed non-actionable container roles: `role="presentation"`, `role="none"`, and `role="dialog"` (modal backdrops and modal content surfaces that exist only to `e.stopPropagation()`).

## Pass 2 — Custom toggle/switch/radio gate (Task #169)
Flags any `<div>` or `<span>` whose `className` contains a token that strongly implies it *is* a custom switch/toggle/radio control (exact tokens `switch`/`toggle`/`radio`, or any class ending in `-switch`/`-toggle`/`-radio`, e.g. `dark-mode-toggle`, `theme-switch`, `my-radio`) **and** that carries an interactive handler (`onClick`/`onChange`/`onKeyDown`) but is missing the matching ARIA shape: `role="switch"`+`aria-checked` for switch/toggle, or `role="radio"`+`aria-checked` for radio (with `role="radiogroup"` accepted on the container).

Wrapper-style class tokens (`toggle-row`, `switch-group`, `radio-list`) and decorative elements without a handler are intentionally not flagged.

## Pass 3 — Hover-reveal CSS gate (Task #170)
Scans every `.css` file under `web/src/` and `community-edition/web/src/` for `:hover` rules that REVEAL content without a matching `:focus`/`:focus-within`/`:focus-visible` rule on the same base selector.

A rule is treated as a reveal when EITHER:
- (a) its selector contains a combinator after `:hover` (e.g. `.card:hover .panel`, `.card:hover > .face`, `.card:hover + .tip`, `.card:hover ~ .x` — the canonical hover-only reveal shape, v3 magazine hero cards reference from Task #158), OR
- (b) its body sets one of the reveal-y properties `display`/`opacity`/`visibility`/`pointer-events`/`clip-path`/`max-height`/`height`.

Pure cosmetic tweaks (color, background, border, transform, filter, outline) are intentionally not flagged because the hovered element itself is already visible. To satisfy the gate, ship the same selector with `:hover` swapped for `:focus`, `:focus-within`, or `:focus-visible` — multi-line selector lists like `.x:hover, .x:focus-visible { … }` are the idiomatic shape. `@media` and `@supports` blocks are descended into; `@keyframes` / `@font-face` are skipped.

## Pass 4 — Icon-only button gate (Task #175, tightened in Task #183 and Task #194)
Flags `<button>` and `<a>` elements whose only visible content is a single non-letter, non-digit glyph (×, ✕, ✖, ⌄, →, …) **or** a single icon child (`<svg …/>`, `<svg>…</svg>`, or any PascalCase component whose tag name ends in `Icon`/`Svg`, e.g. `<CloseIcon/>`, `<ChevronIcon/>`) and that ship without either `aria-label` or `aria-labelledby`. Self-closing tags and elements containing visible text are intentionally not flagged. `title` is not accepted as a substitute because screen readers treat it inconsistently.

The pass also handles the `<button>{expr}</button>` shape (Task #183, extended in Task #194). Originally any `{…}` JSX expression caused the element to be skipped because `{label}` *might* be a visible text label; that left a hole where `<button onClick={x}>{icon}</button>` (an icon component reference) silently passed. The classifier now distinguishes:
- **Skip (treated as a visible label):** string/template literals (`{"Save"}`, `` {`Hi ${n}`} ``), ternaries with at least one string branch (`{open ? "Hide" : "Show"}`), i18n-style calls with a string-literal first argument (`{t('save')}`, `{i18n.t('save')}`), and ambiguous bare identifiers/member access without an icon-y suffix (`{label}`, `{props.label}` — kept lenient to avoid false positives).
- **Flag (treated as an icon reference):** inline JSX whose tag is `svg` or ends in `Icon`/`Svg` wrapped in braces (`{<CloseIcon/>}`, `{<svg/>}`), bare identifiers ending in `Icon`/`Svg` (`{CloseIcon}`, `{closeSvg}`), and member-access references whose trailing segment ends in `Icon`/`Svg` (`{Icons.closeIcon}`, `{props.dismissSvg}`).
- **Flag (Task #194 — wrapper-button shapes):** `React.cloneElement(arg, …)` and bare `cloneElement(arg, …)` where the first argument itself classifies as an icon (e.g. `{React.cloneElement(<CloseIcon/>, { size: 12 })}`, `{cloneElement(props.dismissSvg)}`); and single-element array literals whose sole element classifies as an icon (`{[<CloseIcon/>]}`, `{[CloseIcon]}`). Multi-element arrays stay skipped (they typically carry visible content), and ambiguous first arguments to `cloneElement` (`{cloneElement(icon)}`, `{cloneElement(child)}`) stay lenient — same rule as the bare-identifier case. Bare `{children}` is intentionally NOT flagged: the file-level context required to tell "icon-only wrapper" from "text-button wrapper" reliably is too noisy to detect statically without false positives.

## Pass 5 — Hand-rolled-modal gate (Task #182)
Flags any JSX in `web/src/` or `community-edition/web/src/` containing the literal attribute `role="dialog"` outside of the canonical `Dialog` primitives themselves (`web/src/components/Dialog.jsx` and `community-edition/web/src/components/Dialog.jsx` are the only allow-listed files). Modals MUST go through the shared `<Dialog>` primitive — copy-pasting the old `<div role="dialog" aria-modal="true">` + ad-hoc `onKeyDown` shape is forbidden, since it bypasses the primitive's focus trap, focus restore, body-scroll lock, and Escape-to-close.

Expression-form `role={…}` is intentionally not matched (nothing useful to inspect statically). To intentionally allow a new file to ship its own `role="dialog"`, add it to `DIALOG_ALLOWLIST` in `scripts/check-a11y.js` and document the exception below.

### Dialog allow-list exceptions
None today beyond the two `Dialog.jsx` primitives.

## Pass 6 — Mouse-handler focus-parity gate (Task #185)
Flags any JSX opening tag (native element OR PascalCase component) carrying `onMouseEnter`/`onMouseLeave`/`onMouseOver`/`onMouseOut` that drives a state change but is missing the matching `onFocus`/`onBlur`. Pairing is `onMouseEnter`/`onMouseOver` ↔ `onFocus` and `onMouseLeave`/`onMouseOut` ↔ `onBlur`.

The "drives a state change" heuristic only flags inline arrow/function bodies that invoke a `set...(...)` call (matches `\bset[A-Z]\w*\s*\(` — e.g. `setShow(true)`, `setHovered(idx)`, `setOpen(false)`). Cosmetic-only handlers (e.g. inline `e.currentTarget.style.background = …`) and reference-form handlers (`onMouseEnter={handleEnter}`, where the body lives elsewhere and can't be inspected statically) are intentionally not flagged.

This closes the gap left by Task #176 (which hand-fixed every keyboard-invisible tooltip/popover but left no automated guard) — without this gate, a future PR could re-introduce a `<div onMouseEnter={() => setShowTip(true)}>` reveal with no `onFocus` parity and the existing gates would stay green.
