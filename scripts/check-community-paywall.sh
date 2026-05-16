#!/usr/bin/env bash
# Task #299 / #303 — Pro-paywall regression gate for the community edition.
#
# The community site (dota.stats.corvidaeinc.com) must never ship Pro-tier
# paywall code in EITHER the source tree or the built bundle.
#   - Task #298 fixed the deploy-infrastructure bug where the community site
#     was serving the full-edition bundle (which shows a Pro paywall on
#     /synergy).
#   - Task #299 added the dist/-scanning belt-and-braces backstop.
#   - Task #303 removed every remaining source-level paywall reference
#     (server route, unused hooks, dead frontend branch) and extended this
#     gate to scan source too — so a server-side paywall reappearing in
#     community-edition/src/ would now fail the deploy/push as well, even
#     though it never reaches the frontend bundle.
#
# Usage:
#   bash scripts/check-community-paywall.sh
#
# The script always runs the source-scan pass. The dist-scan pass runs only
# when community-edition/web/dist/ exists (it is the post-build backstop;
# callers may invoke this gate before or after the build).
#
# Exits non-zero on any match.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${REPO_ROOT}/community-edition/web/dist"
SRC_DIRS=(
  "${REPO_ROOT}/community-edition/src"
  "${REPO_ROOT}/community-edition/web/src"
)

fail=0

# -----------------------------------------------------------------------------
# Pass 1: source-tree scan (Task #303).
# -----------------------------------------------------------------------------
# Forbidden tokens in the community SOURCE tree. These include both
# full-edition-only identifiers (would only appear if someone copy-pasted
# from web/src/) AND the server-response shape strings that a re-added
# server paywall would emit. We use fixed-string matches so the patterns
# do not need shell-quoting gymnastics.
#
#   - PaywallCard                full-edition paywall component name
#   - useProStatus               full-edition Pro-status hook (community used
#                                to ship a no-op stub by the same name;
#                                Task #303 deleted it)
#   - useProMembers              ditto
#   - isProMember                DB helper that gates a route by Pro membership
#   - feature: 'replay_download' the `feature` field of the old community
#                                replay-download paywall response (Task #303
#                                removed this exact return)
#   - Pro membership             user-facing error message string
#   - requires Pro               user-facing error message string
#   - Pro Tier                   full-edition product label
#   - Inhouse Stats Pro          full-edition product name
SRC_FORBIDDEN=(
  "PaywallCard"
  "useProStatus"
  "useProMembers"
  "isProMember"
  "feature: 'replay_download'"
  "Pro membership"
  "requires Pro"
  "Pro Tier"
  "Inhouse Stats Pro"
)

# Regex pass (broader, catches any `paywall:` key shape regardless of value).
# Matches a `paywall` field in an object literal or JSON response, e.g.:
#   paywall: true
#   "paywall": false
#   'paywall': someExpr
# We use grep -E with the regex below. Bare word `paywall` (in comments,
# variable names) is intentionally NOT flagged — the doc-allowlist already
# covers the prose-mention case, and the key-shape regex is what reliably
# distinguishes a real server response from incidental wording.
SRC_FORBIDDEN_REGEX="(['\"]?)paywall\\1[[:space:]]*:"

# Documentation/history paths are intentionally excluded — we still want
# to be able to *describe* historical paywalls in SETUP.md and the patch
# notes log. Anywhere a forbidden token legitimately appears as prose,
# add the path here.
SRC_EXCLUDE_REGEX='/(community-edition/(SETUP\.md|README\.md|src/data/patchNotes\.js)|node_modules|dist)/?'

for src_dir in "${SRC_DIRS[@]}"; do
  if [ ! -d "${src_dir}" ]; then continue; fi
  # Fixed-string pass.
  for token in "${SRC_FORBIDDEN[@]}"; do
    # -F fixed string, -r recurse, -l list-files-with-match, -I skip binary.
    matches="$(grep -RFlI -- "${token}" "${src_dir}" 2>/dev/null || true)"
    if [ -z "${matches}" ]; then continue; fi
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      if [[ "$f" =~ $SRC_EXCLUDE_REGEX ]]; then continue; fi
      if [ "$fail" -eq 0 ]; then
        echo "ERROR: forbidden paywall token(s) found in community source tree:" >&2
      fi
      echo "       [${token}] in ${f#${REPO_ROOT}/}" >&2
      fail=1
    done <<< "${matches}"
  done
  # Regex pass — catches any `paywall:` key shape (bare, quoted, JSON).
  matches="$(grep -RElI -- "${SRC_FORBIDDEN_REGEX}" "${src_dir}" 2>/dev/null || true)"
  if [ -n "${matches}" ]; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      if [[ "$f" =~ $SRC_EXCLUDE_REGEX ]]; then continue; fi
      if [ "$fail" -eq 0 ]; then
        echo "ERROR: forbidden paywall token(s) found in community source tree:" >&2
      fi
      echo "       [paywall:<value> shape] in ${f#${REPO_ROOT}/}" >&2
      fail=1
    done <<< "${matches}"
  fi
done

# -----------------------------------------------------------------------------
# Pass 2: built-bundle scan (Task #299, original gate).
# -----------------------------------------------------------------------------
if [ -d "${DIST_DIR}" ]; then
  DIST_FORBIDDEN=("PaywallCard" "useProStatus" "Pro Tier" "Inhouse Stats Pro")
  for token in "${DIST_FORBIDDEN[@]}"; do
    matches="$(grep -RFlI -- "${token}" "${DIST_DIR}" 2>/dev/null || true)"
    if [ -z "${matches}" ]; then continue; fi
    if [ "$fail" -eq 0 ]; then
      echo "ERROR: forbidden full-edition token(s) found in built community bundle:" >&2
    fi
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      echo "       [${token}] in ${f#${REPO_ROOT}/}" >&2
    done <<< "${matches}"
    fail=1
  done
fi

if [ "${fail}" -ne 0 ]; then
  echo "" >&2
  echo "Community edition must not ship Pro-paywall code. Remove the offending" >&2
  echo "reference from community-edition/src/ or community-edition/web/src/" >&2
  echo "(see community-edition/SETUP.md — \"Pro tier / paid memberships — removed\")." >&2
  exit 1
fi

if [ -d "${DIST_DIR}" ]; then
  echo "[check-community-paywall] OK — source tree clean and no forbidden tokens in community-edition/web/dist/."
else
  echo "[check-community-paywall] OK — community source tree clean (dist/ not built yet, skipped bundle scan)."
fi
