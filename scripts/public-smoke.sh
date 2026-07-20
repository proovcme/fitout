#!/usr/bin/env bash
set -euo pipefail

public_url="${1:-https://fitout.ovc.me}"
expected_version="${FITOUT_EXPECTED_VERSION:-v0.1.0}"
page_file="$(mktemp)"
trap 'rm -f "$page_file"' EXIT

curl --fail --silent --show-error --location --max-time 20 "$public_url/" > "$page_file"
grep -Fq "$expected_version" "$page_file"
curl --fail --silent --show-error --max-time 15 "$public_url/fg-api/health" | grep -Fq '"ok":true'
asset_path="$(grep -Eo 'src="\./assets/[^"]+\.js"' "$page_file" | head -1 | cut -d'"' -f2 | sed 's#^\./##')"
test -n "$asset_path"
curl --fail --silent --show-error --head --max-time 15 "$public_url/$asset_path" >/dev/null
printf 'public smoke ok · %s · %s\n' "$expected_version" "$asset_path"
