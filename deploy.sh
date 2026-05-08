#!/usr/bin/env bash
# Dota Inhouse Bot — production deploy script
# Usage: bash deploy.sh
# Run from: ~/Dota-Stats on the DO server

set -e  # stop on any error

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
pm2 restart "${PM2_APP}" --update-env

echo ""
echo "✓ Deploy complete."
pm2 status "${PM2_APP}"
