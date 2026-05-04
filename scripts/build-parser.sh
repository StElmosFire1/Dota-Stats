#!/bin/bash
set -e

JAR_PATH="odota-parser/target/stats-0.1.0.jar"
SRC_DIR="odota-parser/src/main/java"
POM_PATH="odota-parser/pom.xml"

needs_build() {
  if [ ! -f "$JAR_PATH" ]; then
    echo "[build-parser] $JAR_PATH missing — build required."
    return 0
  fi
  local newer
  newer=$(find "$SRC_DIR" "$POM_PATH" -type f -newer "$JAR_PATH" -print -quit 2>/dev/null || true)
  if [ -n "$newer" ]; then
    echo "[build-parser] Source newer than jar (e.g. $newer) — rebuild required."
    return 0
  fi
  return 1
}

if ! needs_build; then
  echo "[build-parser] $JAR_PATH is up to date — skipping rebuild."
  exit 0
fi

if ! command -v mvn >/dev/null 2>&1; then
  echo "[build-parser] ERROR: mvn not on PATH; cannot rebuild $JAR_PATH." >&2
  echo "[build-parser] Install Maven (and a JDK) or pre-build the jar before deploy." >&2
  exit 1
fi

echo "[build-parser] Rebuilding $JAR_PATH via 'mvn install -DskipTests'..."
( cd odota-parser && mvn -q install -DskipTests )
echo "[build-parser] Done. New jar:"
ls -la "$JAR_PATH"
