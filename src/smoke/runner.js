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
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });

    // Synthetic Steam login for authenticated journeys. POSTs the shared
    // bearer + an allow-listed accountId to /auth/steam/test-login, which
    // sets the session cookie on the Playwright context. When either env
    // var is missing the login is skipped — auth: true journeys then
    // record as 'skipped' with a clear reason rather than crashing the
    // whole run.
    let authReady = false, authSkipReason = null;
    if (process.env.SMOKE_TEST_LOGIN_TOKEN && process.env.SMOKE_TEST_ACCOUNT_IDS) {
      try {
        const loginRes = await context.request.post(url + '/auth/steam/test-login', {
          headers: {
            'Authorization': `Bearer ${process.env.SMOKE_TEST_LOGIN_TOKEN}`,
            'Content-Type': 'application/json',
          },
          data: {},
          timeout: 10_000,
        });
        if (loginRes.ok()) authReady = true;
        else authSkipReason = `test-login returned HTTP ${loginRes.status()}`;
      } catch (e) {
        authSkipReason = `test-login request failed: ${e.message}`;
      }
    } else {
      authSkipReason = 'SMOKE_TEST_LOGIN_TOKEN / SMOKE_TEST_ACCOUNT_IDS not configured';
    }

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
            const res = await context.request.get(url + j.path);
            if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
            await res.json();
          } else {
            const page = await context.newPage();
            const navResp = await page.goto(url + j.path, { waitUntil: 'domcontentloaded', timeout: 20_000 });
            if (!navResp || navResp.status() >= 400) {
              throw new Error(`navigation returned HTTP ${navResp ? navResp.status() : 'no-response'}`);
            }
            if (j.expect) {
              // Wait up to 5s for any of the comma-separated selectors.
              const selectors = j.expect.split(',').map(s => s.trim()).filter(Boolean);
              let matched = false;
              for (const sel of selectors) {
                const found = await page.locator(sel).first().count().catch(() => 0);
                if (found > 0) { matched = true; break; }
              }
              if (!matched) {
                try { await page.waitForSelector(selectors[0], { timeout: 5_000 }); matched = true; }
                catch (_) {}
              }
              if (!matched) throw new Error(`expected selector not found: "${j.expect}"`);
            }
            // Screenshot the viewport only (not full page) — full page
            // screenshots make diffs noisy on infinite-scroll pages.
            screenshotPath = path.join(runDir, `${j.key}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            await page.close();

            // Perceptual diff vs baseline if present.
            const baseline = path.join(BASELINE_DIR, `${j.key}.png`);
            if (fs.existsSync(baseline)) {
              baselinePath = baseline;
              try {
                const cur = PNG.sync.read(fs.readFileSync(screenshotPath));
                const base = PNG.sync.read(fs.readFileSync(baseline));
                if (cur.width === base.width && cur.height === base.height) {
                  const diff = new PNG({ width: cur.width, height: cur.height });
                  const px = pixelmatch(cur.data, base.data, diff.data, cur.width, cur.height, { threshold: 0.2 });
                  diffPixels = px;
                  diffRatio = px / (cur.width * cur.height);
                  diffPath = path.join(runDir, `${j.key}.diff.png`);
                  fs.writeFileSync(diffPath, PNG.sync.write(diff));
                  if (diffRatio > diffThreshold) {
                    status = 'failed';
                    reason = `visual diff ${(diffRatio * 100).toFixed(2)}% exceeds ${(diffThreshold * 100).toFixed(2)}% threshold`;
                  }
                } else {
                  // Size mismatch — treat as a soft warn (baseline came from a
                  // different viewport). Operator can re-approve.
                  status = 'failed';
                  reason = `viewport mismatch vs baseline (${cur.width}x${cur.height} vs ${base.width}x${base.height})`;
                }
              } catch (diffErr) {
                status = 'failed';
                reason = `pixelmatch error: ${diffErr.message}`;
              }
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

module.exports = { runSmoke, isLatestPatchNoteMajor, JOURNEYS };
