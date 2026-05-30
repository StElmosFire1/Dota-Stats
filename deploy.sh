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
git fetch origin
git reset --hard origin/main

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

echo "==> Installing backend (root) dependencies..."
# The bot process (src/index.js) runs from the repo root and needs the root
# package.json deps installed — e.g. `dotaconstants`, added for the daily
# mini-games suite (Task #451). This step previously only ran inside web/,
# so any new ROOT dependency shipped in a commit was never installed on prod,
# and the bot crashed at runtime with "Cannot find module 'dotaconstants/...'".
# Installing at the root here keeps the bot's deps in lockstep with the code.
npm install --silent

echo "==> Installing frontend dependencies..."
cd web
npm install --silent

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

echo ""
echo "✓ Deploy complete."
pm2 status "${PM2_APP}"
