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

echo "==> Installing frontend dependencies..."
cd web
npm install --silent

echo "==> Building frontend..."
npm run build

cd ..

echo "==> Restarting bot..."
pm2 restart 2 --update-env

echo ""
echo "✓ Deploy complete."
pm2 status 2
