# Deployment guide

How to put the management platform and website online, keep it running, update it and back it up.
Written for one Linux server (a small VPS) plus a managed PostgreSQL database. Allow about two hours the first time.

## 1. What you need

| Item | Recommendation | Notes |
| --- | --- | --- |
| Server | Ubuntu 24.04 LTS VPS, 2 vCPU / 4 GB RAM, 40 GB disk, in Mumbai or Bangalore | DigitalOcean (BLR1), AWS Lightsail (Mumbai), Hetzner… |
| Database | Managed PostgreSQL 16 or 17 with daily backups + point-in-time recovery | Neon, Supabase, AWS RDS, DigitalOcean Managed Postgres. Self-hosting Postgres on the same VPS also works (section 9) |
| Domain | e.g. `adits.in` for the website, `app.adits.in` optional | One domain is enough: the website, the staff panel (`/admin`), the student portal (`/portal`) and certificate verification (`/verify`) are the same app |
| Email (SMTP) | Zoho Mail, Google Workspace, or a transactional service (Amazon SES, Brevo) | For staff alert emails, student portal invites and "forgot password" |
| File storage | Local disk (simplest) or Cloudflare R2 / AWS S3 | Logos, photos, documents, bills, imports |

## 2. Prepare the server

```bash
# as root, once
adduser --disabled-password --gecos "" app
apt update && apt upgrade -y
apt install -y git curl ufw postgresql-client
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
timedatectl set-timezone Asia/Kolkata
```

Install Caddy (web server with automatic HTTPS): follow https://caddyserver.com/docs/install#debian-ubuntu-raspbian.

## 3. Get the code and configure it

```bash
sudo -iu app
git clone https://github.com/ajithanil0727/AditsSite.git mgmt
cd mgmt
cp .env.example .env
nano .env
```

Set these in `.env` (never commit this file):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The connection string from your database provider (with `?sslmode=require` if it asks for SSL) |
| `DATABASE_POOL_MAX` | `10` (lower it if your database plan allows few connections) |
| `BETTER_AUTH_SECRET` | 32+ random characters: `openssl rand -base64 48` |
| `DATA_ENCRYPTION_KEY` | Another 32+ random characters. **Never change it later**: device unlock codes become unreadable. Keep a copy in a password manager |
| `BETTER_AUTH_URL`, `APP_URL` | `https://adits.in` (your real address, https) |
| `STORAGE_DRIVER` | `local` (files in `STORAGE_LOCAL_DIR`, default `./storage`) or `s3` (section 7) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | From your email provider (section 6) |
| `CRON_SECRET` | 32+ random characters: `openssl rand -hex 32` |
| `NODE_ENV` | `production` |

Remove `SEED_DEFAULT_PASSWORD` and the Mailpit values (`SMTP_HOST="localhost"`, port 1025) from the server's `.env`.

## 4. First install

```bash
npm ci
npm run db:deploy            # creates all tables (prisma migrate deploy)
SEED_MODE=production SEED_ADMIN_EMAIL="you@example.com" SEED_ADMIN_PASSWORD="a-long-password-1" npm run db:seed
npm run build
```

`SEED_MODE=production` sets up the real business only: the organisation and ADITS brand content, the PKD and MKM branches,
number series, roles and permissions, master data (payment modes, GST rates, job statuses…), the three courses and the website
pages. It creates **one super admin** (the email and password above) and **no demo data** (no demo staff, students, job cards
or money entries). Run it once; running it again later is safe (it never overwrites edits) but isn't needed.

Then sign in at `https://<your-domain>/login` as the super admin and:

1. **Settings → Company**: legal name, address, phone, logo. **GST registrations**: check the GSTIN.
2. **Settings → Branches**: addresses, phones, map links; **Number series**: check the prefixes and starting numbers.
3. **Settings → Users**: add the owners (Owner / Partner role) and staff, with their branches.
4. **Accounts → Partners**: shares per branch, if you want profit distribution.
5. **Courses**: fee plans (the "3 instalments" plan is an example), syllabus, GST mode once the CA confirms.
6. **Website → Site settings**: contact details, WhatsApp, social links. Turn on **Placement figures** only once real placements are recorded.
7. **Settings → Communications**: send yourself a test email.
8. Existing students, staff and parts: **Imports** (download the template, fill it, upload).

## 5. Run it as a service

`/etc/systemd/system/mgmt.service` (as root):

```ini
[Unit]
Description=Management platform
After=network.target

[Service]
User=app
WorkingDirectory=/home/app/mgmt
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now mgmt
journalctl -u mgmt -f      # logs
```

`/etc/caddy/Caddyfile` (replace the domain):

```
adits.in, www.adits.in {
  encode zstd gzip
  request_body {
    max_size 10MB
  }
  reverse_proxy 127.0.0.1:3000
}
```

```bash
systemctl reload caddy
```

Point the domain's DNS A record (and `www`) to the server's IP. Caddy gets and renews the HTTPS certificate by itself.

## 6. Email

The app sends email only through SMTP. Staff choose **My account → Email me my alerts**; student portal invites and
"Forgot password?" emails always go out when SMTP is set. Without SMTP the app still works: invites show a link to copy and send on WhatsApp.

| Provider | SMTP_HOST | Port / secure | User / password |
| --- | --- | --- | --- |
| Zoho Mail (India) | `smtp.zoho.in` | 465 / `true` | full address / app-specific password |
| Google Workspace / Gmail | `smtp.gmail.com` | 465 / `true` | full address / 16-character app password (2-step verification required) |
| Amazon SES (Mumbai) | `email-smtp.ap-south-1.amazonaws.com` | 587 / `false` | SES SMTP credentials |

Set `MAIL_FROM="ADITS <no-reply@adits.in>"` using an address your provider allows. Add the provider's SPF and DKIM DNS records so mail doesn't land in spam.

Emails go out right after the action that caused them. A scheduler retries anything left over (failed connection, server restart):

```bash
# crontab -e   (as app)
*/5 * * * * curl -fsS -H "Authorization: Bearer $(grep ^CRON_SECRET= /home/app/mgmt/.env | cut -d= -f2- | tr -d '"')" https://adits.in/api/cron/messages > /dev/null
```

**Settings → Communications** shows whether email is set up and the last 50 messages with any errors.

## 7. File storage on Cloudflare R2 (optional)

Local storage keeps files in `/home/app/mgmt/storage` (back it up, section 8). To use R2 instead:

1. Cloudflare → R2 → create a bucket (e.g. `adits-files`), keep it **private**. Turn on object versioning if offered.
2. Create an R2 API token with read/write on that bucket.
3. In `.env`: `STORAGE_DRIVER="s3"`, `S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"`, `S3_REGION="auto"`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
4. Copy existing files across before switching (keys are the same paths):
   `rclone copy /home/app/mgmt/storage r2:adits-files` (configure an rclone "r2" remote first).

Files are always served through the app (`/api/files/…`), which checks who may see private files.

## 8. Backups

See `docs/BACKUP.md` for the full plan (targets, restore steps, restore drill). In short:

- **Database**: managed backups + point-in-time recovery, **plus** a nightly dump copied off the server:
  ```bash
  # crontab -e   (as app)
  30 2 * * * cd /home/app && pg_dump --format=custom --no-owner --dbname "$(grep ^DATABASE_URL= mgmt/.env | cut -d= -f2- | tr -d '"')" --file "backups/mgmt-$(date +\%F).dump" && find backups -name 'mgmt-*.dump' -mtime +14 -delete
  ```
  Then copy `~/backups` to another place (rclone to a different bucket/account, encrypted).
- **Files**: with local storage, include `/home/app/mgmt/storage` in the same off-server copy. With R2, versioning covers it.
- **Secrets**: keep `.env` (especially `DATA_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET`) in a password manager. Without `DATA_ENCRYPTION_KEY` a restored database can't show unlock codes.
- Test a restore every three months on a spare database.

## 9. Database on the same server (if not managed)

```bash
apt install -y postgresql
sudo -u postgres createuser --pwprompt mgmt
sudo -u postgres createdb -O mgmt mgmt
# DATABASE_URL="postgresql://mgmt:<password>@localhost:5432/mgmt"
```

Keep PostgreSQL listening on localhost only (the default) and make the nightly dump in section 8 mandatory.

## 10. Updating to a new version

```bash
sudo -iu app && cd mgmt
git pull
npm ci
npm run db:deploy      # applies new migrations, if any
SEED_MODE=production npm run db:seed   # adds new permissions to the default roles; never overwrites edits
npm run build
exit
sudo systemctl restart mgmt
```

Take a database dump before updates that include migrations. If something goes wrong: `git checkout <previous tag>`, `npm ci && npm run build`, restart, and restore the dump if a migration ran.

On the server always seed with `SEED_MODE=production` (the seed refuses to create demo data when `NODE_ENV=production`).
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` are only needed the first time; later runs create no users.

## 11. Security checklist

- [ ] `NODE_ENV=production`, HTTPS only (Caddy), `APP_URL`/`BETTER_AUTH_URL` use `https://`.
- [ ] Long random `BETTER_AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET`; `.env` readable only by the `app` user (`chmod 600 .env`).
- [ ] No demo users on production (seeded with `SEED_MODE=production`). The super admin password is long and stored in a password manager.
- [ ] Owners and staff each have their own login; remove access for people who leave (Settings → Users → deactivate).
- [ ] Database not reachable from the internet (managed DB: restrict to the server's IP; self-hosted: localhost only).
- [ ] SSH with keys only (`PasswordAuthentication no`), automatic security updates (`apt install unattended-upgrades`).
- [ ] Backups copied off the server and a restore tested.
- [ ] The audit log (Settings → Audit log) is reviewed now and then: logins, exports, deletions, unlock code reveals.

## 12. Troubleshooting

| Symptom | Check |
| --- | --- |
| Site down / 502 | `systemctl status mgmt`, `journalctl -u mgmt -n 100` |
| "Server has closed the connection" | Database connection limit: lower `DATABASE_POOL_MAX` or upgrade the plan |
| Emails not arriving | Settings → Communications (error column); SMTP values; spam folder; SPF/DKIM records |
| Uploaded images missing after a move | `STORAGE_LOCAL_DIR` points at the old folder, or files weren't copied to R2 |
| Login says "Too many attempts" | 5 tries per minute per IP; wait a minute |
| Certificate QR opens the wrong address | `APP_URL` must be the public https address when the certificate is printed |
