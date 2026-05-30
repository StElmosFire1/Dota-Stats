---
name: Dialog focus-trap and listbox options
description: Why combobox/listbox option elements inside the shared <Dialog> must not be <button>
---

The shared `<Dialog>` primitive (`web/src/components/Dialog.jsx`) builds its
Tab focus-trap from this selector: `a[href], button:not([disabled]), input...,
[tabindex]:not([tabindex="-1"])`.

**The rule:** any enabled `<button>` is matched **regardless of `tabIndex={-1}`**
(the `:not([tabindex="-1"])` clause only applies to the bare `[tabindex]` arm,
not to `button`). So a combobox/listbox built inside a Dialog must NOT render its
options as `<button tabIndex={-1}>` — they get pulled into the trap's
first/last bookkeeping, and because they're not actually keyboard-tabbable the
browser skips them, letting Tab escape the dialog entirely.

**How to apply:** render listbox options as `<div role="option" tabIndex={-1}
onClick onKeyDown>` instead. A `div[tabindex="-1"]` is excluded by the selector,
so the input stays the sole focusable and Tab/Shift+Tab wrap correctly. This
also keeps the a11y gate happy (role="option" is an actionable role, and
tabIndex + onKeyDown satisfy the `<div onClick>` triad). The combobox input
owns arrow/Enter/Home/End nav via `aria-activedescendant`; the per-option
onKeyDown is only a defensive Enter/Space activator. Used by the ⌘K command
palette (`web/src/components/CommandPalette.jsx`).
