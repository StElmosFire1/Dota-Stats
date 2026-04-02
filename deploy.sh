#!/usr/bin/env bash
# Dota Inhouse Bot — production deploy script
# Usage: bash deploy.sh
# Run from: ~/Dota-Stats on the DO server

set -e  # stop on any error

echo "==> Pulling latest code..."
git stash
git pull

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
