# Management Platform

One web app for our chip-level repair **training institutes** and **electronics service centres**: a public website and an admin panel.
Multi-branch, permission-based (RBAC), India-first (INR, GST, DD/MM/YYYY).

- Design: [`docs/PHASE_0_DESIGN.md`](docs/PHASE_0_DESIGN.md)
- Conventions & decisions: [`CLAUDE.md`](CLAUDE.md)
- Backup plan: [`docs/BACKUP.md`](docs/BACKUP.md)

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Prisma 7 + PostgreSQL · Better Auth · Tailwind 4 + shadcn/ui · TanStack Table · React Hook Form + Zod · Vitest · Playwright

## Getting started

Requirements: Node 22+ and PostgreSQL 15+. You can run PostgreSQL in Docker, or use Prisma's built-in local database if you don't have Docker.

```bash
npm install
```

```bash
cp .env.example .env
```

Start a database (pick one):

```bash
docker compose up -d
```

```bash
npx prisma dev -d --name mgmt
```

With `prisma dev`, copy the TCP URLs it prints into `DATABASE_URL` / `SHADOW_DATABASE_URL` in `.env` and set `DATABASE_POOL_MAX="3"` (see _Troubleshooting_).

Create the tables and the demo data, then run the app:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000/login. Every demo account uses the password from `SEED_DEFAULT_PASSWORD` (default `Demo@12345`):

| Email                                             | Role                           | Branches  |
| ------------------------------------------------- | ------------------------------ | --------- |
| arun@demo.test, bindu@demo.test, faisal@demo.test | Owner / Partner                | all       |
| admin@demo.test                                   | Admin                          | all       |
| manager.koc@demo.test / manager.tvm@demo.test     | Branch Manager                 | KOC / TVM |
| accounts@demo.test                                | Accountant                     | all       |
| hr@demo.test                                      | HR                             | all       |
| frontdesk.koc@demo.test                           | Counsellor / Front Office      | KOC       |
| trainer.koc@demo.test                             | Trainer (own records)          | KOC       |
| placement@demo.test                               | Placement Officer              | KOC, TVM  |
| service.koc@demo.test                             | Service Manager                | KOC       |
| engineer.koc@demo.test / engineer.clt@demo.test   | Service Engineer (own records) | KOC / CLT |
| store.koc@demo.test                               | Store Keeper                   | KOC       |

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (server, HTTPS, email, storage, production seed, updates, backups).

## Commands

| Command                                           | What it does                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`                                     | Dev server on :3000                                                           |
| `npm run build` / `npm start`                     | Production build / serve (the build reads the DB for cached public pages)     |
| `npm run typecheck` · `npm run lint` · `npm test` | Type-check · ESLint · Vitest (unit + DB integration)                          |
| `npm run check`                                   | All three of the above                                                        |
| `npm run test:e2e`                                | Playwright (needs a seeded DB; uses installed Edge, or `PW_CHANNEL=chromium`) |
| `npm run db:migrate`                              | Create/apply migrations in development                                        |
| `npm run db:deploy`                               | Apply migrations in production                                                |
| `npm run db:seed`                                 | Demo data (safe to re-run)                                                    |
| `npm run db:studio`                               | Browse the database                                                           |

## Project layout

```
prisma/            schema, migrations, seed
src/app/           routes: (public site), (auth)/login, admin/*, api/*
src/modules/<x>/   business logic per domain: *.service.ts, *.actions.ts, *.queries.ts, *.schemas.ts
src/components/    ui (shadcn), data-table, forms, layout, theme
src/lib/           db, auth, env, permissions catalogue, formatting, storage
tests/             integration + e2e
```

## Troubleshooting

- **`prisma dev` stops accepting connections** ("Connection terminated unexpectedly"): the local Prisma database allows 10 connections in total and doesn't free closed ones. Keep `DATABASE_POOL_MAX` at 2–3, and restart it with `npx prisma dev stop mgmt` then `npx prisma dev -d --name mgmt`. This doesn't happen with Docker or a real Postgres.
- **"Too many attempts" on login**: login is rate-limited to 5 attempts per minute per IP. Wait a minute.
