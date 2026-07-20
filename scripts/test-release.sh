#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

if [[ ! -d node_modules ]]; then
  npm ci
fi

node --check company-content.js
node --check company-core.js
node --check game-core.js
node --check game.js
node --check server/server.mjs
python3 -m py_compile server/server.py
npm test
npm run smoke:migration
npm run build

if [[ "${FITOUT_SKIP_AUDIT:-0}" != "1" ]]; then
  npm audit --audit-level=high
fi

api_data="$(mktemp -d)"
api_port="$((44000 + $$ % 1000))"
FITOUT_DATA_DIR="$api_data" FITOUT_PORT="$api_port" python3 server/server.py >"$api_data/server.log" 2>&1 &
api_pid=$!
cleanup(){
  kill "$api_pid" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
  rm -rf "$api_data"
}
trap cleanup EXIT

api_ready=0
for _ in {1..30}; do
  if curl --fail --silent "http://127.0.0.1:$api_port/health" | grep -Fq '"ok":true'; then
    api_ready=1
    break
  fi
  sleep .1
done

if [[ "$api_ready" != "1" ]]; then
  cat "$api_data/server.log" >&2
  exit 1
fi

cookie_jar="$api_data/cookies.txt"
test_user="release_$$_$api_port"
curl --fail --silent --show-error -c "$cookie_jar" -H 'content-type: application/json' -d "{\"username\":\"$test_user\",\"password\":\"release-check-123\"}" "http://127.0.0.1:$api_port/register" | grep -Fq '"ok":true'
curl --fail --silent --show-error -b "$cookie_jar" -H 'content-type: application/json' -d '{"state":{"schemaVersion":2,"company":{"cash":10},"portfolio":{"projects":[]},"staff":{"employees":[]},"contractorNetwork":[]}}' "http://127.0.0.1:$api_port/save" | grep -Fq '"ok":true'
curl --fail --silent --show-error -H 'content-type: application/json' -d "{\"username\":\"$test_user\",\"password\":\"release-check-123\"}" "http://127.0.0.1:$api_port/login" | grep -Fq '"schemaVersion":2'
printf 'release checks ok · v0.1.0 · api %s · save v2\n' "$api_port"
