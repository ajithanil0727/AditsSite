import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  DATA_ENCRYPTION_KEY: z.string().min(32, "DATA_ENCRYPTION_KEY must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  // S3-compatible storage (Cloudflare R2 / AWS S3) when STORAGE_DRIVER=s3.
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Email (SMTP: Gmail / Zoho / any provider). Without SMTP_HOST, emails are logged (dev) or marked failed (production).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  // Protects /api/cron/* (send queued emails). Set it and call the URL from a scheduler.
  CRON_SECRET: z.string().optional(),
});

export const env = schema.parse(process.env);
