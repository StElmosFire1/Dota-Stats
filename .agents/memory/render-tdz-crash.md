---
name: Render-time TDZ crash
description: How a temporal-dead-zone ReferenceError can blank an entire React page for every visitor, and how to spot/fix it.
---

# Render-time temporal-dead-zone (TDZ) crash

A `let`/`const` is in the temporal dead zone until its declaration line executes.
If anything that runs *during render* — a `useEffect`/`useMemo`/`useCallback`
dependency array, a `useMemo` factory, a custom hook argument, or a derived
`const` — references a `const` declared **lower** in the component body, it throws
`ReferenceError: Cannot access 'X' before initialization` on **every render**.

**Why it's nasty:** the error boundary catches it and renders blank/nothing, so the
symptom is "the whole page is blank" — not an obvious null deref. It hits *all*
visitors (not just signed-out), and React's reported component-stack line is the
component definition line, **not** the throw site, so the line number misleads you.

**How it happened here:** `/inhouse` (`web/src/pages/Inhouse.jsx`) had a `useEffect`
near the top whose dep array was `[myAccountId]`, but `const myAccountId = ...` was
declared ~40 lines below. Fix: hoist the derived `const` declaration above every
hook/effect that reads it.

**How to apply:**
- When a page renders blank with an error boundary catch and an unhelpful line
  number, suspect a TDZ ref before chasing null derefs.
- Declare derived values (especially anything used in hook deps) at the top of the
  component, before the effects/hooks/callbacks that consume them.
- An early `return <SignInPrompt/>` guard does **not** fix this — hooks above it
  still run, and the throwing reference is evaluated before the guard.
