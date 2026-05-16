#!/usr/bin/env bash
# Task #299 — Pro-paywall regression gate for the community edition.
#
# The community site (dota.stats.corvidaeinc.com) must never ship Pro-tier
# paywall code. Task #298 fixed the deploy-infrastructure bug where the
# community site was serving the full-edition bundle (which shows a Pro
# paywall on /synergy). This script is the belt-and-braces check: it scans
# the BUILT community frontend bundle for known full-edition-only tokens.
# If any are found, the deploy / post-merge push aborts with the offending
# chunk(s) named.
#
# Usage:
#   bash scripts/check-community-paywall.sh
#
# Exits non-zero if community-edition/web/dist/ contains any forbidden
# string, or if the dist directory is missing (must run AFTER the build).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${REPO_ROOT}/community-edition/web/dist"

if [ ! -d "${DIST_DIR}" ]; then
  echo "ERROR: community-edition/web/dist/ not found — build the community frontend first." >&2
  exit 1
fi

# Forbidden tokens. These are full-edition-only — if any appears in the
# built community bundle it means full-edition Pro-paywall code leaked in.
#   - PaywallCard          full-edition paywall component (web/src/components/PaywallCard.jsx)
#   - useProStatus         full-edition Pro-status hook (community has a no-op stub by the same
#                          name, but it is minified out — its literal identifier must NOT survive
#                          into the built bundle)
#   - Pro Tier             user-visible label rendered by the full-edition paywall
#   - Inhouse Stats Pro    full-edition product name
FORBIDDEN=("PaywallCard" "useProStatus" "Pro Tier" "Inhouse Stats Pro")

fail=0
for token in "${FORBIDDEN[@]}"; do
  # -F fixed string, -l files-with-matches, recurse the built dist.
  matches="$(grep -RFl -- "${token}" "${DIST_DIR}" 2>/dev/null || true)"
  if [ -n "${matches}" ]; then
    echo "ERROR: forbidden full-edition token '${token}' found in built community bundle:" >&2
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      echo "       ${f#${REPO_ROOT}/}" >&2
    done <<< "${matches}"
    fail=1
  fi
done

if [ "${fail}" -ne 0 ]; then
  echo "" >&2
  echo "Community edition must not ship Pro-paywall code. Remove the offending" >&2
  echo "import/component from community-edition/web/src/ and rebuild." >&2
  exit 1
fi

echo "[check-community-paywall] OK — no forbidden Pro-paywall tokens in community-edition/web/dist/."
