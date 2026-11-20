import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * File storage behind one small interface.
 * "local" writes to STORAGE_LOCAL_DIR (development, or a single server with backups).
 * "s3" uses any S3-compatible bucket (Cloudflare R2 / AWS S3); callers don't change.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

const localDriver: StorageDriver = {
  async put(key, data) {
    const file = safePath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  },
  async get(key) {
    try {
      return await readFile(safePath(key));
    } catch {
      return null;
    }
  },
};

function safePath(key: string) {
  const root = path.resolve(env.STORAGE_LOCAL_DIR);
  const file = path.resolve(root, key);
  if (!file.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return file;
}

let s3Driver: StorageDriver | null = null;

function makeS3Driver(): StorageDriver {
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
    throw new Error("STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: !!env.S3_ENDPOINT,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  return {
    async put(key, data, contentType) {
      await client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: data, ContentType: contentType }));
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        if (!res.Body) return null;
        return Buffer.from(await res.Body.transformToByteArray());
      } catch (e) {
        if (e instanceof NoSuchKey || (e as { name?: string }).name === "NoSuchKey") return null;
        throw e;
      }
    },
  };
}

export function storage(): StorageDriver {
  if (env.STORAGE_DRIVER === "s3") return (s3Driver ??= makeS3Driver());
  return localDriver;
}
