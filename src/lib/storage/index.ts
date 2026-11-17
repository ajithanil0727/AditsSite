import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * File storage behind one small interface.
 * "local" writes to STORAGE_LOCAL_DIR (development). "s3" (Cloudflare R2 / AWS S3) is added
 * before production deployment; callers don't change.
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

export function storage(): StorageDriver {
  if (env.STORAGE_DRIVER === "s3") throw new Error("S3 storage is configured in the deployment phase.");
  return localDriver;
}
