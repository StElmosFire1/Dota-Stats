#!/usr/bin/env bash
# Dota Inhouse Bot — FULL-EDITION production deploy script
# Usage: bash deploy.sh
# Run from: ~/Dota-Stats-Full on the DO server (the full-edition checkout).
#
# This script is the FULL EDITION deploy. It builds web/ and restarts the
# full-edition PM2 process (oi-bot by default). It does NOT touch anything
# under community-edition/ — for that, run `bash community-edition/deploy.sh`
# from the community checkout (~/Dota-Stats). Keeping the two scripts as
# independent siblings means a mistaken invocation can never cross-deploy
# and swap a site to the wrong edition (Task #298).

set -e  # stop on any error

# Task #302: hard pre-restart gate, symmetric to the Task #300 startup
# warning in src/index.js. If this script (the FULL edition) is being run
# from a checkout whose directory basename looks like the community
# checkout, abort BEFORE we restart PM2 — a misconfigured PM2 process
# pointing the full-edition entrypoint at the community checkout would
# silently serve the wrong web/dist/ to users (this is exactly the
# Task #298 paywall bug). Heuristic mirrors logEditionBanner() in
# src/index.js exactly: basename contains "community" OR ends in
# "dota-stats" (the community prod basename). The full-edition prod
# basename "dota-stats-full" does not match, so a correctly-deployed
# host never sees a false-positive abort.
DEPLOY_CWD="$(pwd)"
DEPLOY_BASE="$(basename "${DEPLOY_CWD}" | tr '[:upper:]' '[:lower:]')"
case "${DEPLOY_BASE}" in
  *community*|*dota-stats)
    echo "ERROR: deploy.sh (full edition) refuses to run from '${DEPLOY_CWD}'." >&2
    echo "       Directory basename '${DEPLOY_BASE}' looks like a community-edition checkout." >&2
    echo "       The full-edition deploy script must run from ~/Dota-Stats-Full/ (basename 'dota-stats-full')." >&2
    echo "       If PM2 is misconfigured, see the \"One-time PM2 re-registration for community edition\"" >&2
    echo "       snippet in replit.md to re-register the inhouse-bot process against community-edition/src/index.js," >&2
    echo "       then run 'bash community-edition/deploy.sh' from ~/Dota-Stats/ instead." >&2
    exit 1
    ;;
esac

echo "==> Pulling latest code..."
# DEPLOY_REF (Task #895): normally we deploy origin/main, but for a rollback
# you can pin any ref/SHA — `DEPLOY_REF=<previous-good-sha> bash deploy.sh` —
# and every hard gate (tests, money paths, migrations, health checks) still
# runs on the way back. Without this, a manual `git reset --hard <sha>` would
# be immediately undone by the reset below.
git fetch origin
DEPLOY_REF="${DEPLOY_REF:-origin/main}"
echo "    Deploying ref: ${DEPLOY_REF}"
git reset --hard "${DEPLOY_REF}"

echo "==> Verifying committed replay parser jar is in sync with sources..."
# Hard gate: refuse to deploy if the jar checked into the repo is older
# than any Java/pom file. This runs BEFORE any local rebuild so a stale
# committed artifact cannot be silently self-healed by the deploy host.
bash scripts/build-parser.sh --check

echo "==> Verifying patch notes have unique versions (Task #418)..."
# Hard gate: refuse to deploy if src/data/patchNotes.js contains two
# entries with the same `version` string. Duplicates were previously only
# a runtime warning from db.seedPatchNotes() on every bot boot.
node scripts/check-patch-notes.js

echo "==> Verifying the website feature inventory is in sync with App.jsx routes (Task #718)..."
# Hard gate: refuse to deploy if any <Route path="…"> registered in
# web/src/App.jsx is not mentioned in docs/website-features.txt. Param names
# are normalised (:matchId vs :id) so only genuinely undocumented pages fail.
node scripts/check-feature-list.js

echo "==> Verifying each admin tab has exactly one render guard (Task #758)..."
# Hard gate: refuse to deploy if any TAB_META tab id in web/src/pages/AdminPanel.jsx
# has zero or more-than-one {activeTab === 'x'} render guard, or if a guard
# references a tab id not defined in TAB_META. Prevents the fragmented-tab smell
# Task #751 consolidated (matches had 3 blocks, seasons had 4) from recurring.
node scripts/check-admin-tabs.js

echo "==> Verifying frontend accessibility (Task #164 — house rule gate)..."
# Hard gate: refuse to deploy if any non-interactive element (div/span/li/tr/td
# /th/etc.) has an onClick without the documented role+tabIndex+onKeyDown
# triad, or if a raw <th onClick> reappears (must use SortableTh).
node scripts/check-a11y.js

echo "==> Verifying money-path test coverage (Task #416)..."
# Hard gate: refuse to deploy if any of the money-path test files fail.
# Covers every Stripe webhook purpose x event-type combination, the three
# refund fail-closed routes (1:1 booking, group seat, VOD), and the inhouse
# server-provisioner single-flight race. A failure here aborts the deploy
# BEFORE PM2 is touched, so a Stripe / refund / race regression can never
# replace a working production process with a broken one.
npm run check:money-paths

echo "==> Verifying creds.json is not tracked by git (Task #856)..."
# Hard gate: creds.json (Google service-account key) must live only on the
# host filesystem, never in the repo. If it ever gets committed, abort the
# deploy — the key must be rotated and purged from history before shipping.
if git ls-files --error-unmatch creds.json >/dev/null 2>&1; then
  echo "ERROR: creds.json is tracked by git. Rotate the service-account key," >&2
  echo "       remove it from the repo/history, and keep it host-only." >&2
  exit 1
fi

echo "==> Installing backend (root) dependencies..."
# The bot process (src/index.js) runs from the repo root and needs the root
# package.json deps installed — e.g. `dotaconstants`, added for the daily
# mini-games suite (Task #451). This step previously only ran inside web/,
# so any new ROOT dependency shipped in a commit was never installed on prod,
# and the bot crashed at runtime with "Cannot find module 'dotaconstants/...'".
# Installing at the root here keeps the bot's deps in lockstep with the code.
# --include=dev (Task #904): the deploy host's shell exports NODE_ENV=production,
# which makes a bare `npm install` silently omit devDependencies — so build/test
# gates below (eslint, vitest, node-pg-migrate tooling, etc.) would be missing
# and the deploy dies before the new build ships. Dev deps are only used by the
# deploy-time gates; the app runtime is unaffected.
# Belt-and-braces (see community-edition/deploy.sh): --include=dev alone can be
# ignored by an old npm or an npmrc with production=true / omit=dev, so force
# it via env as well.
NODE_ENV=development npm_config_production=false npm_config_omit= \
  npm install --include=dev --silent

echo "==> Running the full test suite (Task #856)..."
# Hard gate: the entire tests/ directory must pass before we touch web/ or
# PM2. This subsumes the money-path subset above (kept as an early fast-fail)
# and means a broken build can never replace a working production process.
npm test

echo "==> Applying pending database migrations (Task #856)..."
# node-pg-migrate is a pinned root dependency; migrations/ holds numbered SQL
# files. DATABASE_URL is read from the environment (or .env via dotenv).
# BACKUP FIRST on risky changes: see migrations/README.md for the pg_dump
# backup + rollback procedure. A failed migration aborts the deploy before
# PM2 restarts, leaving the previous build live.
npm run migrate

echo "==> Installing frontend dependencies..."
cd web
# --include=dev (Task #904): NODE_ENV=production in the deploy shell would
# otherwise skip devDependencies, and the frontend build tooling (vite, eslint)
# lives there — `npm run build` then fails with "not found" and leaves the
# stale bundle live. Build gates need dev tooling; runtime is unaffected.
NODE_ENV=development npm_config_production=false npm_config_omit= \
  npm install --include=dev --silent
if [ ! -e node_modules/.bin/vite ]; then
  echo "ERROR: devDependencies were NOT installed (node_modules/.bin/vite missing)." >&2
  echo "       npm version on this host: $(npm -v 2>/dev/null || echo unknown) — check for an" >&2
  echo "       ~/.npmrc or /usr/etc/npmrc with production=true / omit=dev, or upgrade npm." >&2
  exit 1
fi

echo "==> Building frontend..."
npm run build

cd ..

echo "==> Restarting bot..."
# Target by PM2 process name so the deploy isn't fragile to id renumbering.
# Override at call-site with: PM2_APP=other-name bash deploy.sh
PM2_APP="${PM2_APP:-oi-bot}"

# Safety check (symmetric to community-edition/deploy.sh's oi-bot block):
# refuse to run if someone tries to point this script at the community
# edition's PM2 process. This script only ever builds web/ (full-edition
# frontend), so restarting inhouse-bot from here would be a cross-deploy
# and resurrect exactly the bug Task #298 fixed.
if [ "${PM2_APP}" = "inhouse-bot" ]; then
  echo "ERROR: deploy.sh (full edition) refuses to target PM2 process 'inhouse-bot'." >&2
  echo "       inhouse-bot is the COMMUNITY-edition process; use community-edition/deploy.sh for that." >&2
  exit 1
fi

# Task #307: belt-and-braces backstop for the Task #302 directory-name gate.
# The directory-name heuristic above catches the common shape of the
# Task #298 mistake, but the authoritative source of truth for what PM2
# will actually exec is `pm2 describe <name>` — specifically the
# `pm_exec_path` (script path) and `pm_cwd` fields. Refuse to restart
# if PM2 is registered against any entrypoint or cwd other than this
# checkout's full-edition entrypoint. If the PM2 process doesn't exist
# yet (first-time deploy), no-op — `pm2 restart` below will create it
# from whatever the user runs next, and there's nothing to verify.
EXPECTED_PM2_SCRIPT="${DEPLOY_CWD}/src/index.js"
EXPECTED_PM2_CWD="${DEPLOY_CWD}"
PM2_INFO="$(pm2 jlist 2>/dev/null | node -e '
let raw = "";
process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  let arr;
  try { arr = JSON.parse(raw); } catch { process.exit(0); }
  if (!Array.isArray(arr)) process.exit(0);
  const p = arr.find(x => x && x.name === process.argv[1]);
  if (!p) process.exit(0);
  const env = p.pm2_env || {};
  console.log(env.pm_exec_path || "");
  console.log(env.pm_cwd || "");
});
' "${PM2_APP}" 2>/dev/null || true)"
if [ -n "${PM2_INFO}" ]; then
  PM2_SCRIPT="$(printf '%s\n' "${PM2_INFO}" | sed -n '1p')"
  PM2_CWD="$(printf '%s\n' "${PM2_INFO}" | sed -n '2p')"
  if [ "${PM2_SCRIPT}" != "${EXPECTED_PM2_SCRIPT}" ] || [ "${PM2_CWD}" != "${EXPECTED_PM2_CWD}" ]; then
    echo "ERROR: deploy.sh (full edition) refuses to restart PM2 process '${PM2_APP}'." >&2
    echo "       PM2 is registered against the wrong entrypoint or cwd for this checkout:" >&2
    echo "         pm2 script path : ${PM2_SCRIPT}" >&2
    echo "         pm2 cwd         : ${PM2_CWD}" >&2
    echo "         expected script : ${EXPECTED_PM2_SCRIPT}" >&2
    echo "         expected cwd    : ${EXPECTED_PM2_CWD}" >&2
    echo "       Restarting now would build web/ from this checkout but exec the wrong" >&2
    echo "       entrypoint or run it from the wrong cwd — exactly the Task #298 bug class." >&2
    echo "       See the \"One-time PM2 re-registration for community edition\" snippet in" >&2
    echo "       replit.md for the re-registration recipe; apply the equivalent for this" >&2
    echo "       full-edition process before retrying the deploy." >&2
    exit 1
  fi
fi

pm2 restart "${PM2_APP}" --update-env

echo "==> Post-restart health check (Task #856)..."
# Poll the health endpoint until it reports ok:true. The bot needs time to
# connect Discord/DB, so we retry for up to HEALTH_TIMEOUT seconds (default
# 120). On failure we dump recent PM2 logs and exit non-zero so a broken
# build is never silently left live.
#
# Port resolution: the deploy shell often does NOT have the bot's PORT
# exported (PM2 carries it), so we read PORT from the PM2 process's own env —
# the authoritative source of what the bot actually binds. Fallbacks: the
# deploy shell's $PORT, then the app default 5000. Explicit override:
#   HEALTH_URL=http://127.0.0.1:3000/api/health bash deploy.sh
PM2_ENV_PORT="$(pm2 jlist 2>/dev/null | node -e '
let raw = "";
process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  try {
    const arr = JSON.parse(raw);
    const p = Array.isArray(arr) && arr.find(x => x && x.name === process.argv[1]);
    const port = p && p.pm2_env && p.pm2_env.env && p.pm2_env.env.PORT;
    if (port && /^\d+$/.test(String(port))) console.log(String(port));
  } catch {}
});
' "${PM2_APP}" 2>/dev/null || true)"
HEALTH_PORT="${PM2_ENV_PORT:-${PORT:-}}"
if [ -z "${HEALTH_URL:-}" ] && [ -z "${HEALTH_PORT}" ]; then
  # PM2 didn't expose PORT and the shell has none. Do NOT blindly assume a
  # default port — another legitimate app may answer /api/health there. The
  # community edition normally owns :5000 and returns {"status":"ok",...};
  # the full bot normally owns :3001 and returns a `services` object. Scan
  # candidates and select only the full bot's fingerprint. Never stop or
  # remove a non-matching responder: it may be the other edition.
  for cand in 3001 3000 5000; do
    if curl -fsS --max-time 3 "http://127.0.0.1:${cand}/api/health" 2>/dev/null | node -e '
let raw = "";
process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(raw);
    process.exit(j && typeof j.services === "object" && j.services !== null ? 0 : 1);
  } catch { process.exit(1); }
});
'; then
      HEALTH_PORT="${cand}"
      echo "    (PORT not in PM2 env — found our bot's health endpoint on :${cand})"
      break
    fi
  done
  HEALTH_PORT="${HEALTH_PORT:-5000}"
fi
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${HEALTH_PORT}/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
elapsed=0
until curl -fsS --max-time 5 "${HEALTH_URL}" | node -e '
let raw = "";
process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j.services !== "object" || j.services === null) {
      console.error("health responder is NOT the full bot (no services object) — another app/edition owns this port. Response:", JSON.stringify(j));
      console.error("hint: override with HEALTH_URL=http://127.0.0.1:<bot-port>/api/health bash deploy.sh");
      process.exit(1);
    }
    if (j.ok === true) process.exit(0);
    console.error("health responded but not ok:", JSON.stringify(j.services));
  } catch (e) { console.error("health response was not JSON"); }
  process.exit(1);
});
'; do
  elapsed=$((elapsed + 5))
  if [ "${elapsed}" -ge "${HEALTH_TIMEOUT}" ]; then
    echo "" >&2
    echo "██████████████████████████████████████████████████████████" >&2
    echo "ERROR: post-restart health check FAILED after ${HEALTH_TIMEOUT}s." >&2
    echo "       ${HEALTH_URL} never reported ok:true — the new build may be broken." >&2
    echo "       Recent PM2 logs follow; roll back with:" >&2
    echo "         git reset --hard <previous-good-sha> && bash deploy.sh" >&2
    echo "██████████████████████████████████████████████████████████" >&2
    pm2 logs "${PM2_APP}" --lines 60 --nostream >&2 || true
    exit 1
  fi
  echo "    ... waiting for ${HEALTH_URL} (${elapsed}s/${HEALTH_TIMEOUT}s)"
  sleep 5
done
echo "    Health check passed — ${HEALTH_URL} reports ok:true."

echo "==> Public-URL health check (Task #895)..."
# Local health passing proves the process is up, but not that the public site
# is reachable through DNS/proxy/TLS. Probe the public health endpoint on the
# canonical host when the app is a production deploy. Like the PORT resolution
# above, the deploy shell often does NOT carry NODE_ENV/CANONICAL_HOST — PM2
# does — so read them from the PM2 process env first, falling back to the
# shell. Override with PUBLIC_HEALTH_URL=<url>, or PUBLIC_HEALTH_URL=skip to
# bypass (lab hosts). Uses the same ok:true contract as the local check.
PM2_ENV_META="$(pm2 jlist 2>/dev/null | node -e '
let raw = "";
process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  try {
    const arr = JSON.parse(raw);
    const p = Array.isArray(arr) && arr.find(x => x && x.name === process.argv[1]);
    const env = (p && p.pm2_env && p.pm2_env.env) || {};
    console.log(env.NODE_ENV || "");
    console.log(env.CANONICAL_HOST || "");
  } catch {}
});
' "${PM2_APP}" 2>/dev/null || true)"
PM2_NODE_ENV="$(printf '%s\n' "${PM2_ENV_META}" | sed -n '1p')"
PM2_CANONICAL_HOST="$(printf '%s\n' "${PM2_ENV_META}" | sed -n '2p')"
EFFECTIVE_NODE_ENV="${PM2_NODE_ENV:-${NODE_ENV:-}}"
EFFECTIVE_CANONICAL_HOST="${PM2_CANONICAL_HOST:-${CANONICAL_HOST:-oceinhouse.gg}}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-}"
if [ -z "${PUBLIC_HEALTH_URL}" ] && [ "${EFFECTIVE_NODE_ENV}" = "production" ]; then
  PUBLIC_HEALTH_URL="https://${EFFECTIVE_CANONICAL_HOST}/api/health"
fi
if [ -n "${PUBLIC_HEALTH_URL}" ] && [ "${PUBLIC_HEALTH_URL}" != "skip" ]; then
  PUBLIC_HEALTH_TIMEOUT="${PUBLIC_HEALTH_TIMEOUT:-60}"
  # Wall-clock timeout (each curl attempt can itself block up to 10s, so
  # counting fixed increments would drift badly). No pipe: capture curl's
  # body first so a curl failure can never be masked by a partial response.
  public_probe_start=${SECONDS}
  public_probe_ok() {
    local body
    body="$(curl -fsS --max-time 10 "${PUBLIC_HEALTH_URL}")" || return 1
    printf '%s' "${body}" | node -e '
let raw = "";
process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(raw);
    if (j && j.ok === true) process.exit(0);
    console.error("public health responded but not ok:", JSON.stringify(j && j.services || j));
  } catch (e) { console.error("public health response was not JSON"); }
  process.exit(1);
});
'
  }
  until public_probe_ok; do
    elapsed=$((SECONDS - public_probe_start))
    if [ "${elapsed}" -ge "${PUBLIC_HEALTH_TIMEOUT}" ]; then
      echo "" >&2
      echo "██████████████████████████████████████████████████████████" >&2
      echo "ERROR: PUBLIC health check FAILED after ${PUBLIC_HEALTH_TIMEOUT}s." >&2
      echo "       Local health is OK but ${PUBLIC_HEALTH_URL} is not reachable/ok —" >&2
      echo "       the site may be down for real users (DNS, proxy, TLS, or firewall)." >&2
      echo "       The process itself is healthy, so do NOT blindly roll back the code;" >&2
      echo "       check the reverse proxy / DNS / certificate first." >&2
      echo "       Override: PUBLIC_HEALTH_URL=skip bash deploy.sh (records nothing, use sparingly)." >&2
      echo "██████████████████████████████████████████████████████████" >&2
      exit 1
    fi
    echo "    ... waiting for ${PUBLIC_HEALTH_URL} (${elapsed}s/${PUBLIC_HEALTH_TIMEOUT}s)"
    sleep 5
  done
  echo "    Public health check passed — ${PUBLIC_HEALTH_URL} reports ok:true."
else
  echo "    Skipped (not production and PUBLIC_HEALTH_URL unset)."
fi

echo ""
echo "✓ Deploy complete."
pm2 status "${PM2_APP}"
