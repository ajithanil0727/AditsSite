// No "server-only" here: the seed script (plain Node) reuses this.
import { hash, verify } from "@node-rs/argon2";

// argon2id with OWASP-recommended parameters (19 MiB, 2 iterations, 1 lane).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string) {
  return hash(password, OPTIONS);
}

export async function verifyPassword({ hash: digest, password }: { hash: string; password: string }) {
  try {
    return await verify(digest, password);
  } catch {
    return false;
  }
}
