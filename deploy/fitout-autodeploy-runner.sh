#!/usr/bin/env bash
set -euo pipefail

repo_dir="/opt/fitout-autodeploy/repo"
lock_file="/run/fitout-autodeploy.lock"

exec 9>"$lock_file"
flock -n 9 || exit 0

git -C "$repo_dir" fetch --quiet origin main
target_commit="$(git -C "$repo_dir" rev-parse origin/main)"
deployed_commit="$(cat /var/www/fitout/deployed-commit 2>/dev/null || true)"
if [[ "$target_commit" == "$deployed_commit" ]]; then
  exit 0
fi

git -C "$repo_dir" checkout --quiet --detach "$target_commit"
FITOUT_PUBLIC_URL=https://locia.work/game bash "$repo_dir/scripts/deploy-local-vps.sh" "$target_commit"
