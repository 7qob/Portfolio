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
sudo rsync -a --delete \
  --exclude 'project-template.html' \
  --exclude 'README.md' \
  --exclude 'CLAUDE.md' --exclude 'claude.md' \
  --exclude 'classic.html' --exclude 'classic.css' \
  --exclude 'deploy/' \
  --exclude '.claude/' --exclude '.git/' \
  --exclude '*.zip' \
  --exclude 'vault/files/' \
  "$UPLOAD"/ "$WEBROOT"/

echo "==> Ensuring the vault document directory exists"
sudo mkdir -p "$WEBROOT/vault/files"

sudo chown -R www-data:www-data "$WEBROOT"
sudo find "$WEBROOT" -type d -exec chmod 755 {} \;
sudo find "$WEBROOT" -type f -exec chmod 644 {} \;

echo "==> Checking the vault password file"
# nginx returns 500 for /vault/ when this is missing — fail-closed, but the
# error is opaque, so say so here instead of leaving you to read error.log.
if [ ! -f /etc/nginx/.htpasswd-vault ]; then
  echo "    MISSING: /etc/nginx/.htpasswd-vault"
  echo "    /vault/ will answer 500 until you create it:"
  echo "        sudo htpasswd -B -c /etc/nginx/.htpasswd-vault <username>"
  echo "        sudo chown root:www-data /etc/nginx/.htpasswd-vault"
  echo "        sudo chmod 640 /etc/nginx/.htpasswd-vault"
else
  echo "    OK"
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
echo "==> The vault must NOT be readable without credentials:"
# Both paths, because the whole point of the ^~ prefix in the server block is
# that the .html regex must not be allowed to serve the page unauthenticated.
# A 200 on either line means the gate is open — fix it before uploading a CV.
for p in /vault/ /vault/index.html; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost$p" || echo ERR)
  printf '    %-22s %s   %s\n' "$p" "$code" \
    "$([ "$code" = "401" ] && echo '(locked)' || echo '<-- EXPECTED 401')"
done

IP=$(hostname -I | awk '{print $1}')
echo
echo "Done. On your LAN the site is now at:  http://$IP/"
echo "Next: the Cloudflare Tunnel — see deploy/README.md"
