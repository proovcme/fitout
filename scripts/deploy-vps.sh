#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

remote="${FITOUT_SSH:-root@185.185.71.196}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="/var/www/fitout/releases/$stamp"
previous_release="$(ssh -o BatchMode=yes "$remote" 'readlink -f /var/www/fitout/current 2>/dev/null || true')"
server_backup="/opt/fitout-save/server.py.rollback-$stamp"
deployed=0

rollback(){
  if [[ "$deployed" == "1" ]]; then
    printf 'deploy failed; rolling back %s\n' "$remote" >&2
    if [[ -n "$previous_release" ]]; then
      ssh "$remote" "ln -sfn '$previous_release' /var/www/fitout/current.rollback && mv -Tf /var/www/fitout/current.rollback /var/www/fitout/current"
    fi
    ssh "$remote" "if test -f '$server_backup'; then cp '$server_backup' /opt/fitout-save/server.py; systemctl restart fitout-save.service; fi" || true
  fi
}
trap rollback ERR

bash scripts/test-release.sh

ssh "$remote" "install -d -m 755 '$release_dir' /var/backups/fitout/$stamp; if test -f /var/lib/fitout/players.json; then cp --preserve=mode,timestamps /var/lib/fitout/players.json /var/backups/fitout/$stamp/players.json; fi; cp /opt/fitout-save/server.py '$server_backup'"
rsync -az --delete dist/ "$remote:$release_dir/"
scp server/server.py "$remote:/opt/fitout-save/server.py.new"
scp deploy/fitout-save.service "$remote:/etc/systemd/system/fitout-save.service.new"

deployed=1
ssh "$remote" "set -e; python3 -m py_compile /opt/fitout-save/server.py.new; install -m 755 /opt/fitout-save/server.py.new /opt/fitout-save/server.py; install -m 644 /etc/systemd/system/fitout-save.service.new /etc/systemd/system/fitout-save.service; rm -f /opt/fitout-save/server.py.new /etc/systemd/system/fitout-save.service.new; systemctl daemon-reload; systemctl restart fitout-save.service; api_ok=0; for attempt in {1..30}; do if curl --fail --silent http://127.0.0.1:4188/health | grep -Fq '\"ok\":true'; then api_ok=1; break; fi; sleep .2; done; test \"\$api_ok\" = 1; ln -sfn '$release_dir' /var/www/fitout/current.next; mv -Tf /var/www/fitout/current.next /var/www/fitout/current"

FITOUT_EXPECTED_VERSION=v0.1.0 bash scripts/public-smoke.sh https://fitout.ovc.me
ssh "$remote" "test \"\$(readlink -f /var/www/fitout/current)\" = '$release_dir' && systemctl is-active --quiet fitout-save.service"
deployed=0
trap - ERR
printf 'deployed v0.1.0 · %s · backup /var/backups/fitout/%s/players.json\n' "$release_dir" "$stamp"
