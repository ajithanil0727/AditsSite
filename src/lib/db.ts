import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

function createClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    // Close idle connections quickly (helps small/serverless Postgres and the local `prisma dev` DB).
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

/** Shared Prisma client. Always filter soft-deleted rows explicitly with `deletedAt: null`. */
export const db = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Db = typeof db;
/** Transaction client type (what `db.$transaction(async (tx) => ...)` hands you). */
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
