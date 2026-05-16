#!/usr/bin/env bash
# Dota Inhouse Bot — COMMUNITY-EDITION production deploy script
# Usage:  bash community-edition/deploy.sh
# Run from: ~/Dota-Stats on the DO server (the community checkout).
#
# This script is scoped strictly to the community edition. It must NOT touch
# the top-level web/ build or the oi-bot PM2 process — those belong to the
# full edition (see top-level deploy.sh). Keeping the two scripts as
# independent siblings means a mistaken invocation can never cross-deploy
# and swap a site to the wrong edition (Task #298).

set -e  # stop on any error

# Resolve the repo root so this script works whether you invoke it as
# `bash community-edition/deploy.sh` from the repo root or
# `bash deploy.sh` from inside community-edition/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "==> [community] Pulling latest code..."
git fetch origin
git reset --hard origin/main

echo "==> [community] Verifying committed replay parser jar is in sync with sources..."
# Hard gate: refuse to deploy if the jar checked into the repo is older
# than any Java/pom file. Same gate the full-edition deploy uses; the jar
# is shared by both editions.
bash scripts/build-parser.sh --check

echo "==> [community] Verifying frontend accessibility (Task #164 — house rule gate)..."
# Hard gate: refuse to deploy if any non-interactive element has an onClick
# without the documented role+tabIndex+onKeyDown triad. The top-level
# scripts/check-a11y.js scans BOTH web/src/ and community-edition/web/src/,
# so it is the right gate to run for either edition.
node scripts/check-a11y.js

echo "==> [community] Verifying no Pro-paywall imports in community web source (Task #301)..."
# Fast-feedback gate: resolve-aware source scan over community-edition/web/src/.
# Prints line-numbered errors and is aware of the local no-op useProStatus
# stub (anything resolving to community-edition/web/src/hooks/useProStatus is
# allowed; anything resolving to the full-edition web/src/hooks/useProStatus
# is not). Runs in milliseconds so a regression aborts the deploy before
# we pay for an npm install + Vite build.
node scripts/check-community-paywall-source.js

echo "==> [community] Verifying no Pro-paywall code in community source (Task #303)..."
# Hard gate (source-scan pass): refuse to deploy if any community source
# file in community-edition/src/ or community-edition/web/src/ contains a
# forbidden Pro/paywall token. Runs BEFORE the build so a regression
# fails fast without paying for an install + build first. The same script
# also runs a dist-scan pass after the build below; the source pass alone
# is enough to catch the cases this task was created to prevent
# (server-side 402 paywall, unused Pro hooks, dead frontend branches).
bash scripts/check-community-paywall.sh

echo "==> [community] Installing community frontend dependencies..."
cd community-edition/web
npm install --silent

echo "==> [community] Building community frontend..."
npm run build

cd "${REPO_ROOT}"

echo "==> [community] Verifying no Pro-paywall code leaked into community bundle (Task #299)..."
# Hard gate (dist-scan pass): backstop for the source-scan above.
# Catches anything that survives minification/bundling — e.g. a third-party
# dep that snuck in a paywall string. Same script, runs both passes
# whenever the dist directory exists.
bash scripts/check-community-paywall.sh

echo "==> [community] Restarting bot..."
# Target by PM2 process name so the deploy isn't fragile to id renumbering.
# Default is the community-edition process; override at call-site with:
#   PM2_APP=other-name bash community-edition/deploy.sh
# IMPORTANT: this script must NEVER default to oi-bot — that's the full
# edition's PM2 process and restarting it from here would be a cross-deploy.
PM2_APP="${PM2_APP:-inhouse-bot}"

# Safety check: refuse to run if someone tries to point this script at the
# full-edition PM2 process. If they really need a different community-named
# process they can override; oi-bot is the one name we hard-block.
if [ "${PM2_APP}" = "oi-bot" ]; then
  echo "ERROR: community-edition/deploy.sh refuses to target PM2 process 'oi-bot'." >&2
  echo "       oi-bot is the FULL-edition process; use top-level deploy.sh for that." >&2
  exit 1
fi

pm2 restart "${PM2_APP}" --update-env

echo ""
echo "✓ Community deploy complete."
pm2 status "${PM2_APP}"
