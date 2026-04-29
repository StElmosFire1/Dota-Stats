#!/bin/bash
set -e

echo "[post-merge] Installing root dependencies..."
npm install --no-audit --no-fund

if [ -f web/package.json ]; then
  echo "[post-merge] Installing web/ dependencies..."
  (cd web && npm install --no-audit --no-fund)

  echo "[post-merge] Building frontend..."
  (cd web && npm run build)
fi

echo "[post-merge] Done."
