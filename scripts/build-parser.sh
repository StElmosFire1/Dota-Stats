#!/bin/bash
set -e

JAR_PATH="odota-parser/target/stats-0.1.0.jar"
SRC_DIR="odota-parser/src"
POM_PATH="odota-parser/pom.xml"

MODE="build"
if [ "${1:-}" = "--check" ]; then
  MODE="check"
fi

stale_reason() {
  if [ ! -f "$JAR_PATH" ]; then
    echo "missing: $JAR_PATH"
    return 0
  fi
  local newer
  newer=$(find "$SRC_DIR" "$POM_PATH" -type f -newer "$JAR_PATH" -print -quit 2>/dev/null || true)
  if [ -n "$newer" ]; then
    echo "stale (e.g. $newer is newer than $JAR_PATH)"
    return 0
  fi
  return 1
}

reason=""
if reason=$(stale_reason); then
  is_stale=1
else
  is_stale=0
fi

if [ "$MODE" = "check" ]; then
  if [ "$is_stale" -eq 1 ]; then
    echo "[build-parser] FAIL: replay parser jar is out of date — $reason" >&2
    echo "[build-parser] Run 'npm run build:parser' (requires Maven + JDK) and commit the refreshed jar before deploying." >&2
    exit 1
  fi
  echo "[build-parser] OK: $JAR_PATH is up to date with sources."
  exit 0
fi

if [ "$is_stale" -eq 0 ]; then
  echo "[build-parser] $JAR_PATH is up to date — skipping rebuild."
  exit 0
fi

echo "[build-parser] Rebuild required — $reason"

if ! command -v mvn >/dev/null 2>&1; then
  echo "[build-parser] ERROR: mvn not on PATH; cannot rebuild $JAR_PATH." >&2
  echo "[build-parser] Install Maven (and a JDK) or pre-build the jar before deploy." >&2
  exit 1
fi

echo "[build-parser] Rebuilding $JAR_PATH via 'mvn install -DskipTests'..."
( cd odota-parser && mvn -q install -DskipTests )

# Verify the rebuild actually produced a fresh jar.
if reason=$(stale_reason); then
  echo "[build-parser] ERROR: rebuild finished but jar still appears stale ($reason)." >&2
  exit 1
fi

echo "[build-parser] Done. New jar:"
ls -la "$JAR_PATH"
