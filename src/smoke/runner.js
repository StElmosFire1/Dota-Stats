// Task #426 — Browser smoke test runner.
//
// Programmatic Playwright + pixelmatch runner. Loads each journey in
// src/smoke/journeys.js against a configurable BASE_URL, asserts a key
// element rendered, screenshots the viewport, perceptual-diffs against
// tests/smoke/baselines/<key>.png if present, and records pass/fail per
// step to browser_smoke_steps. On any failure the bot owner is DMed with
// the failing screenshot attached.
//
// Three triggers wire into runSmoke():
//   1. weekly cron — src/index.js sets up node-cron Sunday 03:00 OCE.
//   2. admin button — POST /api/admin/smoke/run.
//   3. major patch — scripts/post-merge.sh POSTs after merging a note
//      whose front-matter carries `major: true`.
//
// Playwright + pixelmatch + pngjs are optional devDependencies. When they
// aren't installed (e.g. dev sandbox without the browser binaries), the
// runner records a single skipped step and exits cleanly rather than
// throwing — the admin UI surfaces this clearly so the operator knows to
// `npx playwright install chromium` on the prod host.

const path = require('path');
const fs = require('fs');
const db = require('../db');
const { JOURNEYS, DEFAULT_DIFF_THRESHOLD } = require('./journeys');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_DIR = path.join(REPO_ROOT, 'tests', 'smoke', 'baselines');
const SCREENSHOT_DIR = path.join(REPO_ROOT, 'tests', 'smoke', 'screenshots');

// Persisted Playwright storageState (cookies) for the synthetic Steam session,
// so consecutive runs can reuse the authenticated session instead of POSTing
// /auth/steam/test-login every time. The file holds a live session cookie, so
// it MUST stay out of git (tests/smoke/.auth/ is .gitignore-blocked). We treat
// it as stale once it's older than the cutoff — comfortably under the 7-day
// session cookie maxAge — and a reused cookie that no longer validates against
// /api/auth/me falls through to a fresh login that re-captures the state.
const AUTH_STATE_DIR = path.join(REPO_ROOT, 'tests', 'smoke', '.auth');
const AUTH_STATE_PATH = path.join(AUTH_STATE_DIR, 'storage-state.json');
const AUTH_STATE_MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000; // 6 days

function _ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function _tryRequire(name) {
  try { return require(name); } catch (_) { return null; }
}

let _runInFlight = false;
let _lastRunAt = 0;

async function runSmoke({ trigger = 'manual', baseUrl = null, diffThreshold = DEFAULT_DIFF_THRESHOLD, _existingRunId = null } = {}) {
  if (_runInFlight) {
    return { skipped: true, reason: 'smoke run already in flight' };
  }
  _runInFlight = true;
  _lastRunAt = Date.now();

  // The HTTP routes pre-create the row so they can return runId
  // synchronously; the cron path doesn't, so we make one here.
  const run = _existingRunId ? await db.getBrowserSmokeRun(_existingRunId) : await db.createBrowserSmokeRun({ trigger });
  const runId = run.id;
  let passed = 0, failed = 0;
  const failureSummaries = [];
  const failingScreenshots = [];

  try {
    const playwright = _tryRequire('playwright');
    const pixelmatch = _tryRequire('pixelmatch');
    const { PNG } = _tryRequire('pngjs') || {};

    if (!playwright || !pixelmatch || !PNG) {
      await db.recordBrowserSmokeStep({
        runId,
        stepKey: '_bootstrap',
        label: 'Playwright + pixelmatch + pngjs available',
        status: 'skipped',
        reason: 'one or more optional deps missing — run `npm i -D playwright pixelmatch pngjs && npx playwright install chromium`',
      });
      await db.finishBrowserSmokeRun(runId, {
        status: 'skipped', totalSteps: 1, passedSteps: 0, failedSteps: 0,
        notes: 'Playwright tooling not installed on this host.',
      });
      return { runId, skipped: true };
    }

    _ensureDir(SCREENSHOT_DIR);
    _ensureDir(BASELINE_DIR);
    const runDir = path.join(SCREENSHOT_DIR, String(runId));
    _ensureDir(runDir);

    const url = baseUrl || process.env.SMOKE_BASE_URL || process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}`;

    const browser = await playwright.chromium.launch({ headless: true });

    // Task #561 — bypass the full-edition lockdown gate.
    //
    // The lockdown middleware (src/web/server.js) blocks every request unless
    // the caller is a superuser session OR carries a matching `x-superuser-key`
    // header. Our synthetic test-login only mints a *normal user* session, which
    // does NOT bypass the gate — so whenever the site is locked down (emergency
    // lock, pre-deploy, or the AdminPanel toggle left on) every journey would
    // just screenshot the inline "Sign in" gate page and /api/health would 401,
    // poisoning baselines. We send the superuser key on the whole Playwright
    // context (document navigations, subresources, the page's own XHR/fetch
    // calls, and the asJson probes all carry it) so the runner sees real content
    // regardless of lockdown state. This only bypasses the gate and elevates
    // preview-state feature flags; it does NOT flip the session into superuser
    // (the frontend reads /admin/session-status, which is session-only), so the
    // pages still render as the normal signed-in user.
    const superuserKey = process.env.SUPERUSER_PASSWORD || null;

    // Reuse a previously-captured synthetic session when it's still fresh, so
    // we skip the /auth/steam/test-login round-trip every run. A stale (too
    // old) or invalid (no longer authenticates) state file is ignored — the
    // login block below re-captures a fresh one.
    const authConfigured = Boolean(process.env.SMOKE_TEST_LOGIN_TOKEN && process.env.SMOKE_TEST_ACCOUNT_IDS);
    let reuseStoredState = false;
    if (authConfigured && fs.existsSync(AUTH_STATE_PATH)) {
      try {
        const ageMs = Date.now() - fs.statSync(AUTH_STATE_PATH).mtimeMs;
        if (ageMs < AUTH_STATE_MAX_AGE_MS) reuseStoredState = true;
      } catch (_) { /* unreadable — treat as no stored state */ }
    }

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      ...(superuserKey ? { extraHTTPHeaders: { 'x-superuser-key': superuserKey } } : {}),
      ...(reuseStoredState ? { storageState: AUTH_STATE_PATH } : {}),
    });

    // If we have no superuser credential to present, the lockdown gate (when
    // on) would block every request and we'd silently screenshot the sign-in
    // wall. Detect that up front with a probe and bail with a clear skipped
    // step instead of capturing — and poisoning baselines with — gate pages.
    // A 401 on a non-allowlisted, non-document request is the gate's signature;
    // a healthy unlocked site returns 200. Any other outcome (server down,
    // network error) falls through so the journeys report the real failure.
    if (!superuserKey) {
      let lockedOut = false;
      try {
        const probe = await context.request.get(url + '/api/health', { timeout: 10_000 });
        if (probe.status() === 401) lockedOut = true;
      } catch (_) { /* probe failed — let the journeys run and surface the real error */ }
      if (lockedOut) {
        await db.recordBrowserSmokeStep({
          runId,
          stepKey: '_lockdown',
          label: 'Site lockdown bypass credential available',
          status: 'skipped',
          reason: 'site is in lockdown and SUPERUSER_PASSWORD is unset — every journey would screenshot the sign-in gate. Set SUPERUSER_PASSWORD so the runner can send x-superuser-key.',
        });
        await db.finishBrowserSmokeRun(runId, {
          status: 'skipped', totalSteps: 1, passedSteps: 0, failedSteps: 0,
          notes: 'Skipped — site locked down and no SUPERUSER_PASSWORD to bypass the gate.',
        });
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
        return { runId, skipped: true };
      }
    }

    // Suppress site-wide modals that would otherwise overlay every screenshot.
    // The runner starts from a fresh context (no prior "dismissed" flags), so
    // the WelcomeModal ("what's new") and the onboarding nudge pop on every
    // page. The WelcomeModal's dismiss key is version-stamped
    // (`welcome_modal_dismissed_v<n>`) and that version is fetched at runtime,
    // so rather than guess it we intercept getItem to report any such key as
    // already-dismissed. Runs before any page script on every navigation.
    await context.addInitScript(() => {
      try {
        const orig = window.localStorage.getItem.bind(window.localStorage);
        window.localStorage.getItem = (key) =>
          (typeof key === 'string' && key.indexOf('welcome_modal_dismissed_v') === 0) ? '1' : orig(key);
        window.localStorage.setItem('onboarding_modal_seen', '1');
      } catch (_) { /* storage unavailable — nothing to suppress */ }
    });

    // Synthetic Steam login for authenticated journeys. POSTs the shared
    // bearer + an allow-listed accountId to /auth/steam/test-login, which
    // sets the session cookie on the Playwright context. When either env
    // var is missing the login is skipped — auth: true journeys then
    // record as 'skipped' with a clear reason rather than crashing the
    // whole run.
    const { authReady, authSkipReason } = await _resolveAuthReadiness({
      context, url, authConfigured, reuseStoredState,
      loginToken: process.env.SMOKE_TEST_LOGIN_TOKEN,
      // Best-effort: capture the authenticated storageState after a fresh login
      // so the next run can reuse it instead of logging in again.
      onCaptureState: async () => {
        _ensureDir(AUTH_STATE_DIR);
        await context.storageState({ path: AUTH_STATE_PATH });
      },
    });

    try {
      for (const j of JOURNEYS) {
        if (j.auth && !authReady) {
          await db.recordBrowserSmokeStep({
            runId, stepKey: j.key, label: j.label, status: 'skipped',
            reason: `auth journey skipped — ${authSkipReason}`,
          });
          continue;
        }
        const stepStart = Date.now();
        let status = 'ok', reason = null;
        let screenshotPath = null, baselinePath = null, diffPath = null;
        let diffPixels = null, diffRatio = null;

        try {
          if (j.asJson) {
            // JSON probe — fetch the URL and confirm 2xx + parseable.
            const probe = await _probeJsonJourney({ context, fullUrl: url + j.path });
            if (!probe.ok) throw new Error(probe.reason);
          } else {
            const page = await context.newPage();
            const load = await _checkPageLoad({ page, fullUrl: url + j.path, expect: j.expect });
            if (!load.ok) throw new Error(load.reason);
            // Screenshot the viewport only (not full page) — full page
            // screenshots make diffs noisy on infinite-scroll pages.
            screenshotPath = path.join(runDir, `${j.key}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            await page.close();

            // Perceptual diff vs baseline if present.
            const baseline = path.join(BASELINE_DIR, `${j.key}.png`);
            const cmp = _diffAgainstBaseline({
              screenshotPath, baselinePath: baseline, diffThreshold,
              pixelmatch, PNG, writeDiffTo: path.join(runDir, `${j.key}.diff.png`),
            });
            baselinePath = cmp.baselinePath;
            diffPath = cmp.diffPath;
            diffPixels = cmp.diffPixels;
            diffRatio = cmp.diffRatio;
            if (cmp.status === 'failed') {
              status = 'failed';
              reason = cmp.reason;
            }
          }
        } catch (err) {
          status = 'failed';
          reason = err.message || String(err);
        }

        await db.recordBrowserSmokeStep({
          runId, stepKey: j.key, label: j.label, status, reason,
          durationMs: Date.now() - stepStart,
          screenshotPath: screenshotPath ? path.relative(REPO_ROOT, screenshotPath) : null,
          baselinePath:   baselinePath   ? path.relative(REPO_ROOT, baselinePath)   : null,
          diffPath:       diffPath       ? path.relative(REPO_ROOT, diffPath)       : null,
          diffPixels, diffRatio,
        });
        if (status === 'ok') passed++;
        else {
          failed++;
          failureSummaries.push(`• ${j.label}: ${reason}`);
          // Prefer the diff image (visualises what broke), fall back to the
          // current screenshot. The DM caps at 4 attachments.
          if (diffPath) failingScreenshots.push(diffPath);
          else if (screenshotPath) failingScreenshots.push(screenshotPath);
        }
      }
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }

    const status = failed === 0 ? 'ok' : 'failed';
    await db.finishBrowserSmokeRun(runId, {
      status, totalSteps: JOURNEYS.length, passedSteps: passed, failedSteps: failed,
      notes: failed === 0 ? null : `Failures:\n${failureSummaries.join('\n')}`,
    });
    if (failed > 0) await _alertOwner(runId, failed, failureSummaries, failingScreenshots);
    return { runId, status, passed, failed };
  } catch (err) {
    await db.finishBrowserSmokeRun(runId, {
      status: 'error', totalSteps: 0, passedSteps: 0, failedSteps: 0,
      notes: `runner crashed: ${err.message}`,
    });
    await _alertOwner(runId, 0, [`runner crashed: ${err.message}`]).catch(() => {});
    throw err;
  } finally {
    _runInFlight = false;
  }
}

// JSON-probe decision, factored out of runSmoke so the non-2xx branch is
// unit-testable without a real browser. `context.request.get` is the only
// dependency, so a test can pass a fake context whose request.get returns the
// status it wants to exercise. Returns { ok: true } on a parseable 2xx, or
// { ok: false, reason } when the response is non-2xx.
async function _probeJsonJourney({ context, fullUrl }) {
  const res = await context.request.get(fullUrl);
  if (!res.ok()) return { ok: false, reason: `HTTP ${res.status()}` };
  await res.json();
  return { ok: true };
}

// Expected-selector match, factored out so the "wait for any of N selectors"
// logic is testable with a fake page. Tries a fast count() pass first, then
// falls back to waitForSelector (up to selectorTimeoutMs) for any of the
// comma-separated selectors so SPA hydration / selector order can't turn a
// slow render into a false failure. Returns true when any selector is present.
async function _matchExpectedSelectors(page, expect, selectorTimeoutMs = 5_000) {
  const selectors = expect.split(',').map(s => s.trim()).filter(Boolean);
  let matched = false;
  for (const sel of selectors) {
    const found = await page.locator(sel).first().count().catch(() => 0);
    if (found > 0) { matched = true; break; }
  }
  if (!matched) {
    try {
      await Promise.any(selectors.map(sel => page.waitForSelector(sel, { timeout: selectorTimeoutMs })));
      matched = true;
    } catch (_) { /* AggregateError — none appeared in time */ }
  }
  return matched;
}

// Navigation + expected-selector decision, factored out of runSmoke so the
// HTTP >= 400 branch and the selector-not-found branch are unit-testable with a
// fake page (no real browser). Navigates `page` to fullUrl and, when `expect`
// is set, asserts one of the selectors rendered. Returns { ok: true } on a
// clean load, or { ok: false, reason } describing the first failure. Throwing
// is deliberately left to the caller so it can attach the reason to the step.
async function _checkPageLoad({ page, fullUrl, expect, navTimeoutMs = 20_000, selectorTimeoutMs = 5_000 }) {
  const navResp = await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });
  if (!navResp || navResp.status() >= 400) {
    return { ok: false, reason: `navigation returned HTTP ${navResp ? navResp.status() : 'no-response'}` };
  }
  if (expect) {
    const matched = await _matchExpectedSelectors(page, expect, selectorTimeoutMs);
    if (!matched) return { ok: false, reason: `expected selector not found: "${expect}"` };
  }
  return { ok: true };
}

// Auth-readiness decision, factored out of runSmoke so the reuse-stored-state,
// fresh-login success/failure, and "not configured" branches are testable
// without a real browser. `context.request` (get/post) and the env-derived
// `loginToken` are the only dependencies. Returns:
//   - not configured        → { authReady: false, authSkipReason: '<reason>' }
//   - stored state validates → { authReady: true } (no fresh login)
//   - fresh login ok         → { authReady: true } (onCaptureState invoked)
//   - fresh login non-2xx    → { authReady: false, authSkipReason: 'HTTP …' }
//   - fresh login throws     → { authReady: false, authSkipReason: '… failed' }
// onCaptureState is best-effort: a throw inside it does not unset authReady.
async function _resolveAuthReadiness({
  context, url, authConfigured, reuseStoredState, loginToken, onCaptureState = null,
}) {
  let authReady = false, authSkipReason = null;
  if (!authConfigured) {
    authSkipReason = 'SMOKE_TEST_LOGIN_TOKEN / SMOKE_TEST_ACCOUNT_IDS not configured';
    return { authReady, authSkipReason };
  }
  // If we loaded a stored session, confirm it still resolves to a logged-in
  // account before trusting it. /api/auth/me returns the user object when
  // authenticated and null otherwise — a stale cookie reads as null and we
  // fall through to a fresh login.
  if (reuseStoredState) {
    try {
      const meRes = await context.request.get(url + '/api/auth/me', { timeout: 10_000 });
      if (meRes.ok()) {
        const me = await meRes.json().catch(() => null);
        if (me && me.accountId) authReady = true;
      }
    } catch (_) { /* reuse failed — fresh login below */ }
  }
  // Fresh synthetic login when we couldn't reuse a valid session.
  if (!authReady) {
    try {
      const loginRes = await context.request.post(url + '/auth/steam/test-login', {
        headers: {
          'Authorization': `Bearer ${loginToken}`,
          'Content-Type': 'application/json',
        },
        data: {},
        timeout: 10_000,
      });
      if (loginRes.ok()) {
        authReady = true;
        if (onCaptureState) {
          try { await onCaptureState(); } catch (_) { /* state capture is best-effort — login still valid */ }
        }
      } else {
        authSkipReason = `test-login returned HTTP ${loginRes.status()}`;
      }
    } catch (e) {
      authSkipReason = `test-login request failed: ${e.message}`;
    }
  }
  return { authReady, authSkipReason };
}

// Pure perceptual-diff decision, factored out of runSmoke so the threshold,
// viewport-mismatch, and pixelmatch-error branches are unit-testable without a
// real browser. Returns the per-step diff outcome:
//   - baseline absent          → { status: 'ok' } (nothing to compare)
//   - dimensions match         → diff ratio vs diffThreshold (over → failed)
//   - dimensions differ        → failed (viewport mismatch)
//   - read/compare throws       → failed (pixelmatch error)
// `fsImpl`, `pixelmatch`, and `PNG` are injectable so tests can drive each
// branch with fakes. When `writeDiffTo` is set the diff PNG is written there
// (only on a successful same-size comparison) and surfaced as `diffPath`.
function _diffAgainstBaseline({
  screenshotPath, baselinePath, diffThreshold,
  pixelmatch, PNG, writeDiffTo = null, fsImpl = fs,
}) {
  const out = {
    status: 'ok', reason: null,
    baselinePath: null, diffPath: null,
    diffPixels: null, diffRatio: null,
  };
  if (!fsImpl.existsSync(baselinePath)) return out; // no baseline → can't diff
  out.baselinePath = baselinePath;
  try {
    const cur = PNG.sync.read(fsImpl.readFileSync(screenshotPath));
    const base = PNG.sync.read(fsImpl.readFileSync(baselinePath));
    if (cur.width === base.width && cur.height === base.height) {
      const diff = new PNG({ width: cur.width, height: cur.height });
      const px = pixelmatch(cur.data, base.data, diff.data, cur.width, cur.height, { threshold: 0.2 });
      out.diffPixels = px;
      out.diffRatio = px / (cur.width * cur.height);
      if (writeDiffTo) {
        fsImpl.writeFileSync(writeDiffTo, PNG.sync.write(diff));
        out.diffPath = writeDiffTo;
      }
      if (out.diffRatio > diffThreshold) {
        out.status = 'failed';
        out.reason = `visual diff ${(out.diffRatio * 100).toFixed(2)}% exceeds ${(diffThreshold * 100).toFixed(2)}% threshold`;
      }
    } else {
      // Size mismatch — treat as a soft warn (baseline came from a
      // different viewport). Operator can re-approve.
      out.status = 'failed';
      out.reason = `viewport mismatch vs baseline (${cur.width}x${cur.height} vs ${base.width}x${base.height})`;
    }
  } catch (diffErr) {
    out.status = 'failed';
    out.reason = `pixelmatch error: ${diffErr.message}`;
  }
  return out;
}

async function _alertOwner(runId, failed, summaries, failingScreenshots = []) {
  try {
    const { getDiscordBot } = require('../discord/bot');
    const bot = getDiscordBot();
    if (!bot || typeof bot._dmOwner !== 'function') return;
    const msg =
      `🧪 **Browser smoke test alert** — run #${runId} reported ${failed} failing step(s):\n` +
      summaries.slice(0, 10).join('\n') +
      (summaries.length > 10 ? `\n…and ${summaries.length - 10} more.` : '') +
      `\n\nReview: ${process.env.PUBLIC_BASE_URL || ''}/admin/browser-smoke/${runId}`;
    // Attach up to 4 failing screenshots (Discord caps DMs at 10 files /
    // 25MB total — we keep well under that). Files must exist on disk.
    const files = failingScreenshots.filter(p => p && fs.existsSync(p)).slice(0, 4);
    await bot._dmOwner(msg, { files });
  } catch (_) { /* alerting must never break the runner */ }
}

function isLatestPatchNoteMajor() {
  try {
    delete require.cache[require.resolve('../data/patchNotes')];
    const notes = require('../data/patchNotes');
    if (!Array.isArray(notes) || !notes.length) return false;
    return Boolean(notes[0].major);
  } catch (_) { return false; }
}

module.exports = {
  runSmoke, isLatestPatchNoteMajor, JOURNEYS,
  _diffAgainstBaseline, _alertOwner,
  _probeJsonJourney, _matchExpectedSelectors, _checkPageLoad, _resolveAuthReadiness,
};
