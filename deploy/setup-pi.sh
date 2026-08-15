#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# kira1q.dev — Raspberry Pi setup (nginx + webroot)
#
# Run ON THE PI, once:
#     chmod +x setup-pi.sh
#     ./setup-pi.sh
#
# It installs nginx, creates the webroot, moves the uploaded site into place
# and installs the server block. It does NOT touch DNS or Cloudflare — that is
# the second half, in deploy/README.md, and it is the step that takes the
# domain away from GitHub Pages.
#
# Safe to re-run: every step is idempotent.
# ---------------------------------------------------------------------------
set -euo pipefail

WEBROOT=/var/www/kira1q.dev
UPLOAD="${1:-$HOME/Portfolio}"          # where WinSCP put the files
CONF_SRC="$(dirname "$0")/nginx-kira1q.dev.conf"

echo "==> Source : $UPLOAD"
echo "==> Webroot: $WEBROOT"

if [ ! -f "$UPLOAD/index.html" ]; then
  echo "!! No index.html in $UPLOAD — pass the upload path as an argument:" >&2
  echo "   ./setup-pi.sh /home/ubuntu/Portfolio" >&2
  exit 1
fi

echo "==> Installing nginx"
sudo apt-get update -qq
sudo apt-get install -y -qq nginx

echo "==> Creating webroot"
sudo mkdir -p "$WEBROOT"

echo "==> Copying site (dev-only files excluded)"
# --exclude 'vault/files/' is a safety line, not a tidiness one. Your CV and
# Zeugnisse are uploaded straight to the Pi and are deliberately NOT in the
# repo, so without this exclusion `--delete` would see them as files that no
# longer exist in the source and wipe them on every single deploy.
#
# server/, docs/ and docker-compose.yml are excluded for the same reason as
# deploy/: they are how the site is built and run, not part of what it serves.
# The API is reached through the /api/ proxy, never as files under the root.
sudo rsync -a --delete \
  --exclude 'project-template.html' \
  --exclude 'README.md' \
  --exclude 'CLAUDE.md' --exclude 'claude.md' \
  --exclude 'classic.html' --exclude 'classic.css' \
  --exclude 'deploy/' \
  --exclude 'server/' --exclude 'docs/' \
  --exclude 'docker-compose.yml' \
  --exclude '.claude/' --exclude '.git/' --exclude '.github/' \
  --exclude '*.zip' \
  --exclude 'vault/files/' \
  "$UPLOAD"/ "$WEBROOT"/

sudo chown -R www-data:www-data "$WEBROOT"
sudo find "$WEBROOT" -type d -exec chmod 755 {} \;
sudo find "$WEBROOT" -type f -exec chmod 644 {} \;

# Documents used to live under the web root. They are now served by the API
# from /var/lib/kira1q/vault-files/, which nginx cannot reach at all.
#
# This only warns. It does NOT delete anything and the rsync exclusion above
# is kept, because if the migration has not happened yet those files are the
# only copy — deleting them here to tidy up would destroy the CV.
if [ -d "$WEBROOT/vault/files" ] && [ -n "$(sudo ls -A "$WEBROOT/vault/files" 2>/dev/null)" ]; then
  echo
  echo "==> WARNING: old documents are still under the web root"
  echo "    $WEBROOT/vault/files"
  echo "    These are no longer used and nginx now returns 404 for them, but"
  echo "    they should not be sitting there. Copy them to the new location,"
  echo "    verify a download works, and only then remove the old directory:"
  echo "        sudo cp $WEBROOT/vault/files/* /var/lib/kira1q/vault-files/"
  echo "        sudo chown 1000:1000 /var/lib/kira1q/vault-files/*"
  echo "        sudo rm -rf $WEBROOT/vault/files"
  echo
fi

echo "==> Installing nginx server block"
sudo cp "$CONF_SRC" /etc/nginx/sites-available/kira1q.dev
sudo ln -sf /etc/nginx/sites-available/kira1q.dev /etc/nginx/sites-enabled/kira1q.dev
sudo rm -f /etc/nginx/sites-enabled/default

echo "==> Testing config"
sudo nginx -t

echo "==> Reloading nginx"
sudo systemctl enable --now nginx
sudo systemctl reload nginx

echo
echo "==> Local check"
for p in / /projects.html /project-kobui.html /style.css; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost$p" || echo "ERR")
  printf '    %-22s %s\n' "$p" "$code"
done
echo "    (these should all be 200)"

echo
echo "==> Dev-only files must be blocked:"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost/project-template.html" || echo ERR)
echo "    /project-template.html  $code   (should be 404)"

echo
echo "==> The API must refuse everything private without a session:"
# The vault PAGE is public now and that is correct — it is an empty shell.
# What must be locked is the data behind it. A 200 on any of these means
# something is open; fix it before uploading a CV.
check_code() {
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost$1" || echo ERR)
  printf '    %-28s %s   %s\n' "$1" "$code" \
    "$([ "$code" = "$2" ] && echo '(ok)' || echo "<-- EXPECTED $2")"
}

check_code /api/vault/items        401
check_code /api/vault/items/1/file 401
check_code /api/admin/overview     401
check_code /vault/files/cv.pdf     404

echo
echo "==> The vault page must not name a single document:"
# This is the property the old Basic Auth setup did NOT have: the list used to
# be hardcoded in the HTML, so viewing source told anyone what documents
# existed before they hit the password. It now arrives from the API after
# authentication. Re-run this after any change to vault/index.html.
hits=$(curl -s "http://localhost/vault/index.html" | grep -ci 'curriculum\|zeugnis\|\.pdf' || true)
printf '    %-28s %s   %s\n' "leaked document names" "$hits" \
  "$([ "$hits" = "0" ] && echo '(ok)' || echo '<-- EXPECTED 0')"

echo
echo "==> API container:"
api_code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost/api/health" || echo ERR)
if [ "$api_code" = "200" ]; then
  echo "    /api/health              200   (up)"
else
  echo "    /api/health              $api_code   <-- the API is not running."
  echo "    Start it with:  cd ~/Portfolio && docker compose up -d"
  echo "    Until it is up, the vault and admin pages will say so and the"
  echo "    static site will carry on working normally."
fi

IP=$(hostname -I | awk '{print $1}')
echo
echo "Done. On your LAN the site is now at:  http://$IP/"
echo "Next: the Cloudflare Tunnel — see deploy/README.md"
