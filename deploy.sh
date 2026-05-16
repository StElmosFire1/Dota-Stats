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

echo "==> Verifying frontend accessibility (Task #164 — house rule gate)..."
# Hard gate: refuse to deploy if any non-interactive element (div/span/li/tr/td
# /th/etc.) has an onClick without the documented role+tabIndex+onKeyDown
# triad, or if a raw <th onClick> reappears (must use SortableTh).
node scripts/check-a11y.js

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

pm2 restart "${PM2_APP}" --update-env

echo ""
echo "✓ Deploy complete."
pm2 status "${PM2_APP}"
