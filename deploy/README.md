# Deploying kira1q.dev to the Raspberry Pi

Two halves. **Part 1 is reversible** — it only sets up the Pi, and your live
site keeps running on GitHub Pages the whole time. **Part 2 moves the domain**
and takes it away from Pages.

Do Part 1, check the site on your LAN, and only then do Part 2.

---

## Part 1 — Serve the site on the Pi (safe)

Files are already at `/home/ubuntu/Portfolio/` from WinSCP. Upload this
`deploy/` folder alongside them, then over SSH:

```bash
cd ~/Portfolio/deploy && chmod +x setup-pi.sh && ./setup-pi.sh ~/Portfolio
```

That installs nginx, copies the site to `/var/www/kira1q.dev` (skipping the
dev-only files), installs the server block and prints a check. When it
finishes, open `http://192.168.0.56/` from your desktop.

**Nothing about kira1q.dev has changed yet.** Take your time here.

### Updating the site later

Re-upload via WinSCP into `~/Portfolio`, then:

```bash
cd ~/Portfolio/deploy && ./setup-pi.sh ~/Portfolio
```

Or skip the script and sync straight into the webroot:

```bash
sudo rsync -a --delete --exclude 'project-template.html' --exclude 'README.md' --exclude 'deploy/' ~/Portfolio/ /var/www/kira1q.dev/
```

---

## Part 2 — Cloudflare Tunnel (this moves the domain)

A Tunnel makes the Pi reachable from the internet **without** port forwarding
and without exposing your home IP: `cloudflared` dials *out* to Cloudflare and
holds the connection open. This is the same mechanism Ignite automates.

### 2.1 Install cloudflared

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
```

### 2.2 Log in

```bash
cloudflared tunnel login
```

Prints a URL. Open it **on your desktop**, pick `kira1q.dev`, authorise. This
is yours to do — it's an account login and I can't and shouldn't do it for you.

### 2.3 Create the tunnel

```bash
cloudflared tunnel create kira1q
```

Note the tunnel UUID it prints; credentials land in
`/home/ubuntu/.cloudflared/<UUID>.json`.

### 2.4 Configure it

Create `/home/ubuntu/.cloudflared/config.yml` — replace `<UUID>`:

```yaml
tunnel: <UUID>
credentials-file: /home/ubuntu/.cloudflared/<UUID>.json

ingress:
  - hostname: kira1q.dev
    service: http://localhost:80
  - hostname: www.kira1q.dev
    service: http://localhost:80
  - service: http_status:404
```

### 2.5 Point DNS at the tunnel — ⚠️ the irreversible step

```bash
cloudflared tunnel route dns kira1q kira1q.dev
cloudflared tunnel route dns kira1q www.kira1q.dev
```

**This overwrites the DNS records that currently send kira1q.dev to GitHub
Pages.** Your Devportal stops being served at that domain the moment it
propagates.

Before running it, in the Cloudflare dashboard (DNS → Records) **screenshot or
copy the existing records for `kira1q.dev` and `www`.** That is your only way
back. Reverting means re-entering those records by hand.

The Devportal repo itself is untouched — it stays at
`kiraa1q.github.io/Devportal` and you can always re-point DNS to it.

### 2.6 Run it as a service

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
systemctl status cloudflared --no-pager
```

### 2.7 Verify

```bash
curl -I https://kira1q.dev
```

You want `HTTP/2 200` **without** the `x-github-request-id` header — that
header's absence is how you know you're hitting the Pi and not Pages.

---

## Part 3 — The Vault (private documents)

`/vault/` is protected by nginx HTTP Basic Auth. The gate is on the Pi, so it
only exists once the site is served from the Pi — over `file://` or on GitHub
Pages the page is just a page, with nothing behind it. **Don't put real
documents anywhere until Part 1 is done and you've verified the 401 below.**

### 3.1 Create the password — you do this, not a script

```bash
sudo htpasswd -B -c /etc/nginx/.htpasswd-vault kira
sudo chown root:www-data /etc/nginx/.htpasswd-vault
sudo chmod 640 /etc/nginx/.htpasswd-vault
sudo systemctl reload nginx
```

`-B` is bcrypt — without it `htpasswd` writes an MD5 hash, which is not a
password hash. `-c` **creates** the file: leave it off when adding a second
user, or you will silently replace the first one.

Pick the password in a password manager. It is one shared secret for everyone
you give it to, so treat it as disposable and change it when a search ends.

### 3.2 Verify the gate before trusting it

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/vault/index.html
```

You want **401**. Check this exact path, not just `/vault/` — nginx picks
regex locations over ordinary prefix ones, and the `~* \.html$` caching block
would have served this page unauthenticated if the vault block weren't
declared `^~`. `./setup-pi.sh` checks both paths for you on every run.

Then with credentials:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -u kira http://localhost/vault/index.html
```

That should be 200.

### 3.3 Upload the documents

Via WinSCP, straight into the webroot — **not** into `~/Portfolio`, and never
into the git repo:

```
/var/www/kira1q.dev/vault/files/cv.pdf
/var/www/kira1q.dev/vault/files/zeugnisse.pdf
```

```bash
sudo chown -R www-data:www-data /var/www/kira1q.dev/vault/files
sudo chmod 644 /var/www/kira1q.dev/vault/files/*
```

The filenames must match the `href`s in `vault/index.html`. Any row whose file
is absent renders as "Not uploaded" instead of a broken download, so the page
is safe to deploy before the PDFs exist — and that state is also how you tell
a failed upload from a successful one.

`setup-pi.sh` excludes `vault/files/` from its `rsync --delete`, so redeploying
the site does not wipe them. If you ever sync by hand, use the same exclusion:

```bash
sudo rsync -a --delete --exclude 'vault/files/' --exclude 'deploy/' ~/Portfolio/ /var/www/kira1q.dev/
```

### What this protects against, and what it doesn't

| | |
|---|---|
| Search engines, scrapers, someone guessing the URL | Yes — 401 before a byte of the file is sent. |
| Cloudflare's edge cache leaking a PDF | Handled: the vault block sends `Cache-Control: no-store, private`. `.pdf` is cached by extension by default, so this line is doing real work. |
| Someone you gave the password to keeping it | No. There is one shared password and no way to revoke it for one person. Rotate it when a search ends. |
| Reading the password off the wire | Fine over the tunnel (HTTPS to Cloudflare's edge). **Not** fine over plain `http://192.168.0.56/` on your LAN — Basic Auth is base64, not encryption. Test with `curl` on the Pi, don't type the password into a LAN browser session. |
| Brute force | Nothing rate-limits it. Not a real risk with a long password, but don't pick a short one. |

If you later want per-person access, revocation and a log of who opened your
grades, that's Cloudflare Access on this same tunnel — free to 50 users, and it
would replace this block rather than sit next to it.

---

## Cloudflare dashboard settings worth setting

- **SSL/TLS → Overview → Full.** Not "Flexible" (breaks nothing here but is bad
  practice) and not "Full (strict)" (the Pi has no cert — the Tunnel is already
  encrypted end to end, so Full is correct).
- **Speed → Auto Minify:** leave off. The site is 50 KB and minification has
  bitten this project already via caching.
- **Caching → Configure → Browser Cache TTL:** "Respect Existing Headers", so
  the nginx `Cache-Control` rules actually apply.

---

## Trade-offs you're accepting

| | |
|---|---|
| Uptime | Your Pi and your home internet. Router reboot = site down. |
| Speed | Cloudflare caches at the edge, so visitors mostly won't notice. |
| Maintenance | `apt upgrade` on the Pi is now your job. |
| Upside | You run the infrastructure your own project (Ignite) automates. |

If it ever becomes a hassle, pointing DNS back at GitHub Pages is a five-minute
change in the Cloudflare dashboard.
