# Backup & restore plan

What must survive: the **PostgreSQL database** (all records) and **uploaded files** (logos, documents, photos, bills).
Everything else (code, build) can be recreated from git.

## Targets

|                           | Target                                                                 |
| ------------------------- | ---------------------------------------------------------------------- |
| Data loss we accept (RPO) | at most 24 hours (at most 5 minutes once point-in-time recovery is on) |
| Time to restore (RTO)     | under 2 hours                                                          |
| Retention                 | 7 daily, 4 weekly, 12 monthly                                          |

## Database

**Preferred (managed Postgres, e.g. Neon / Supabase / AWS RDS):** turn on automated daily backups plus point-in-time recovery (PITR) with at least 7 days of retention.

**Also, every night (works anywhere):** a logical dump, copied off the server.

```bash
pg_dump --format=custom --no-owner --dbname "$DATABASE_URL" --file "mgmt-$(date +%F).dump"
```

- Upload the dump to a **separate** bucket/account from production (e.g. a different R2/S3 bucket with object lock or versioning enabled).
- Encrypt it (bucket-side encryption, or `age`/`gpg` before upload). It contains personal data and phone numbers.
- Delete dumps older than the retention policy (bucket lifecycle rules).

## Uploaded files

- Production storage is S3-compatible (Cloudflare R2 / AWS S3) with **versioning on**, so deleted or overwritten files can be recovered.
- Copy nightly to the backup bucket (`rclone sync` or the provider's replication).
- In development, files live in `./storage` (git-ignored).

## Restore

1. Create an empty database.
2. Restore the dump:

   ```bash
   pg_restore --no-owner --dbname "$NEW_DATABASE_URL" mgmt-YYYY-MM-DD.dump
   ```

3. Point `DATABASE_URL` at it and run `npm run db:deploy` (applies any newer migrations).
4. Restore files to the storage bucket if needed.
5. Smoke test: sign in, open the audit log, open a recent record.

## Test it

Every quarter, restore the latest backup into a staging database and do the smoke test. Write the date and result here.

| Date | Restored backup from | Result | By  |
| ---- | -------------------- | ------ | --- |
|      |                      |        |     |
