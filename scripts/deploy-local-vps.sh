#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

commit="${1:-$(git rev-parse HEAD)}"
public_url="${FITOUT_PUBLIC_URL:-https://locia.work/game}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="/var/www/fitout/releases/$stamp"
previous_release="$(readlink -f /var/www/fitout/current 2>/dev/null || true)"
server_backup="/opt/fitout-save/server.py.rollback-$stamp"
deployed=0

rollback(){
  if [[ "$deployed" == "1" ]]; then
    printf 'local deploy failed; rolling back %s\n' "$previous_release" >&2
    if [[ -n "$previous_release" ]]; then
      ln -sfn "$previous_release" /var/www/fitout/current.rollback
      mv -Tf /var/www/fitout/current.rollback /var/www/fitout/current
    fi
    if [[ -f "$server_backup" ]]; then
      cp "$server_backup" /opt/fitout-save/server.py
      systemctl restart fitout-save.service
    fi
  fi
}
trap rollback ERR

bash scripts/test-release.sh

install -d -m 755 "$release_dir" "/var/backups/fitout/$stamp"
if [[ -n "$previous_release" && -d "$previous_release" ]]; then
  cp -al "$previous_release/." "$release_dir/"
fi
if [[ -f /var/lib/fitout/players.json ]]; then
  cp --preserve=mode,timestamps /var/lib/fitout/players.json "/var/backups/fitout/$stamp/players.json"
fi
cp /opt/fitout-save/server.py "$server_backup"
rsync -a --delete dist/ "$release_dir/"
install -m 755 server/server.py /opt/fitout-save/server.py
install -m 644 deploy/fitout-save.service /etc/systemd/system/fitout-save.service

deployed=1
python3 -m py_compile /opt/fitout-save/server.py
systemctl daemon-reload
systemctl restart fitout-save.service
api_ok=0
for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:4188/health | grep -Fq '"ok":true'; then
    api_ok=1
    break
  fi
  sleep .2
done
test "$api_ok" = 1
ln -sfn "$release_dir" /var/www/fitout/current.next
mv -Tf /var/www/fitout/current.next /var/www/fitout/current

FITOUT_EXPECTED_VERSION=v0.1.0 bash scripts/public-smoke.sh "$public_url"
test "$(readlink -f /var/www/fitout/current)" = "$release_dir"
systemctl is-active --quiet fitout-save.service
printf '%s\n' "$commit" > "$release_dir/DEPLOYED_COMMIT"
printf '%s\n' "$commit" > /var/www/fitout/deployed-commit.next
mv -Tf /var/www/fitout/deployed-commit.next /var/www/fitout/deployed-commit
deployed=0
trap - ERR
printf 'deployed %s · %s · %s · backup /var/backups/fitout/%s/players.json\n' "$commit" "$release_dir" "$public_url" "$stamp"
