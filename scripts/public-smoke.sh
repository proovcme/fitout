#!/usr/bin/env bash
set -euo pipefail

public_url="${1:-https://fitout.ovc.me}"
expected_version="${FITOUT_EXPECTED_VERSION:-v0.1.0}"
page_file="$(mktemp)"
chapter_file="$(mktemp)"
trap 'rm -f "$page_file" "$chapter_file"' EXIT

curl --fail --silent --show-error --location --max-time 20 "$public_url/" > "$page_file"
grep -Fq "$expected_version" "$page_file"
grep -Fq 'data-fitout-entry' "$page_file"
grep -Fq 'fitout-chapter-one.html?mode=design' "$page_file"
curl --fail --silent --show-error --max-time 15 "$public_url/fg-api/health" | grep -Fq '"ok":true'
asset_path="$(grep -Eo 'src="\./assets/[^"]+\.js"' "$page_file" | head -1 | cut -d'"' -f2 | sed 's#^\./##')"
test -n "$asset_path"
curl --fail --silent --show-error --head --max-time 15 "$public_url/$asset_path" >/dev/null
curl --fail --silent --show-error --location --max-time 20 "$public_url/prototypes/fitout-chapter-one.html?mode=design" > "$chapter_file"
grep -Fq 'id="officeDesign"' "$chapter_file"
grep -Fq 'СПРОЕКТИРОВАТЬ ОФИС' "$chapter_file"
chapter_asset="$(grep -Eo 'src="\.\./assets/[^"]+\.js"' "$chapter_file" | head -1 | cut -d'"' -f2 | sed 's#^\.\./##')"
test -n "$chapter_asset"
curl --fail --silent --show-error --head --max-time 15 "$public_url/$chapter_asset" >/dev/null
printf 'public smoke ok · %s · menu:%s · chapter:%s\n' "$expected_version" "$asset_path" "$chapter_asset"
