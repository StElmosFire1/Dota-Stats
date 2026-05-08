#!/bin/bash
set -e

echo "[post-merge] Installing root dependencies..."
npm install --no-audit --no-fund

if [ -f scripts/build-parser.sh ]; then
  # Auto-rebuild path: post-merge runs in our automation environment (which
  # has Maven + a JDK), so when parser sources change we regenerate the jar
  # here and the refreshed jar is pushed to origin/main alongside the merge.
  # This is the mechanism that satisfies "auto-rebuild when source changes".
  echo "[post-merge] Rebuilding Java replay parser jar if sources changed..."
  bash scripts/build-parser.sh

  # Hard verification gate: after the rebuild attempt, the jar must be
  # newer than every source file. If --check fails here, post-merge aborts
  # BEFORE the git push step, so a stale parser jar can never reach
  # origin/main even if the rebuild silently no-op'd.
  echo "[post-merge] Verifying replay parser jar is in sync with sources..."
  bash scripts/build-parser.sh --check
fi

echo "[post-merge] Verifying frontend accessibility (Task #164 — house rule gate)..."
# Hard gate: refuse to push if any non-interactive element (div/span/li/tr/td
# /th/etc.) has an onClick without the documented role+tabIndex+onKeyDown
# triad, or if a raw <th onClick> reappears (must use SortableTh). Runs
# BEFORE the frontend build so a regression fails fast.
node scripts/check-a11y.js

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
