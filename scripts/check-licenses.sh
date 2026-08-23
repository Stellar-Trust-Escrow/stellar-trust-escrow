#!/usr/bin/env bash
# check-licenses.sh
#
# Reads a CycloneDX SBOM, extracts all unique licenses, and fails (exit 1)
# if any license is in the deny-list. This is a separate, stricter gate
# from scripts/check-licenses.js (which is an allow-list used for the
# existing SBOM workflow); this one implements issue #1547's exact deny-list
# requirement and is meant to run as its own CI step so it fails
# independently of the CVE/OSV gate.
#
# Usage: scripts/check-licenses.sh <sbom.json> [sbom2.json ...]
set -euo pipefail

DENY_LIST=("GPL-3.0" "AGPL-3.0" "SSPL-1.0")

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <sbom.json> [sbom2.json ...]" >&2
  exit 1
fi

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

FOUND_DENIED=()

for sbom in "$@"; do
  if [ ! -f "$sbom" ]; then
    echo "Skipping missing SBOM: $sbom"
    continue
  fi

  # Extract every unique license id/name/expression present in this SBOM.
  licenses=$(jq -r '
    [.components[]?.licenses[]? |
      (.license.id // .license.name // .expression // empty)]
    | unique | .[]
  ' "$sbom")

  while IFS= read -r license; do
    [ -z "$license" ] && continue
    for denied in "${DENY_LIST[@]}"; do
      if [ "$license" = "$denied" ]; then
        FOUND_DENIED+=("$sbom: $license")
      fi
    done
  done <<< "$licenses"
done

if [ "${#FOUND_DENIED[@]}" -gt 0 ]; then
  echo "❌ Denied license(s) found:"
  printf '  %s\n' "${FOUND_DENIED[@]}"
  exit 1
fi

echo "✅ No denied licenses (${DENY_LIST[*]}) found."
