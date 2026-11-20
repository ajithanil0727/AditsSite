import { env } from "@/lib/env";
import { flushOutbox } from "@/modules/messaging/outbox";

/** Sends queued emails. Call every few minutes from a scheduler: `Authorization: Bearer <CRON_SECRET>`. */
export async function GET(request: Request) {
  const secret = env.CRON_SECRET;
  if (!secret || secret.length < 16 || secret.startsWith("change-me")) {
    return Response.json({ error: "CRON_SECRET isn't set (at least 16 characters)." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await flushOutbox(100));
}
