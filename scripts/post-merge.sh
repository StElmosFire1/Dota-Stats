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

echo "[post-merge] Pushing latest commit to GitHub (origin main)..."
if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN}" ]; then
  echo "[post-merge] GITHUB_PERSONAL_ACCESS_TOKEN is not set; skipping git push." >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "[post-merge] git remote 'origin' is not configured; skipping git push." >&2
  exit 1
fi

if git -c credential.helper='!f() { echo "username=StElmosFire1"; echo "password=${GITHUB_PERSONAL_ACCESS_TOKEN}"; }; f' \
     push origin HEAD:main; then
  echo "[post-merge] git push to origin/main succeeded."
else
  push_status=$?
  echo "[post-merge] git push to origin/main FAILED (exit $push_status)." >&2
  exit $push_status
fi

echo "[post-merge] Done."
