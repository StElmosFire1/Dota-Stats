# Browser smoke suite (Task #426)

Real-browser smoke check that runs the top user journeys against production
and perceptual-diffs each page against a stored baseline. Catches visual /
route / interaction regressions that the feature-health probe layer can't
see.

## Triggers
1. **Weekly cron** — Sunday 03:00 OCE, scheduled from `src/index.js`.
2. **Admin button** — superuser → `/admin/feature-health` → *Smoke runs*
   tab → ▶ Run smoke now.
3. **Major patch tag** — the post-merge hook fires the suite whenever the
   most-recently-merged patch-note entry in `src/data/patchNotes.js`
   carries `major: true`.

## Programmatic runner
`src/smoke/runner.js` is the production entry point. It uses the
`playwright` package directly, screenshots each journey, perceptual-diffs
via `pixelmatch`, writes results to `browser_smoke_runs` /
`browser_smoke_steps`, and DMs the owner on failure.

## Baselines
Stored under `tests/smoke/baselines/<key>.png`. Promote a fresh run's
screenshot to the baseline via the admin UI's *Approve new baseline*
button (it overwrites the file in-place and ships with the next deploy).

## Ad-hoc Playwright invocation
```
npm i -D @playwright/test pixelmatch pngjs
npx playwright install chromium
npx playwright test tests/smoke
```

The Playwright spec (`smoke.spec.js`) iterates the same `JOURNEYS` array
that the programmatic runner reads, so both code paths stay in lockstep.
