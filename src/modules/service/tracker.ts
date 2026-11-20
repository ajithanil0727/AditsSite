"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizeIndianPhone } from "@/lib/format";
import { invoiceLink } from "./tracker-links";

/** Public repair tracker: job number + phone. Rate-limited per IP to stop guessing. */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>(); // in-memory; fine for one server, swap for Redis when scaling out

function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

const schema = z.object({ jobNo: z.string().trim().min(4).max(40), phone: z.string().trim().min(10).max(16) });

export type TrackResult =
  | { ok: false; error: string }
  | {
      ok: true;
      job: {
        jobNo: string;
        firstName: string;
        device: string;
        status: string;
        tone: string | null;
        stage: string;
        receivedAt: string;
        estimatedAt: string | null;
        deliveredAt: string | null;
        warrantyUntil: string | null;
        amountDue: number | null;
        timeline: { status: string; at: string }[];
        notes: { note: string; at: string }[];
        branch: { name: string; phone: string };
        /** Latest quotation sent to the customer (view only: decisions are recorded by staff). */
        quote: {
          version: number;
          status: string;
          total: number;
          validUntil: string | null;
          items: { description: string; qty: number; amount: number }[];
        } | null;
        invoice: { number: string; url: string } | null;
      };
    };

export async function trackRepair(input: { jobNo: string; phone: string }): Promise<TrackResult> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return { ok: false, error: "Too many lookups. Please wait a minute." };
  const parsed = schema.safeParse(input);
  const phone = parsed.success ? normalizeIndianPhone(parsed.data.phone) : null;
  const notFound = { ok: false as const, error: "No repair found for that job number and phone number." };
  if (!parsed.success || !phone) return notFound;

  const job = await db.jobCard.findFirst({
    where: { jobNo: { equals: parsed.data.jobNo, mode: "insensitive" }, deletedAt: null, customer: { phone } },
    include: {
      status: true,
      customer: { select: { name: true } },
      device: {
        select: {
          modelText: true,
          brand: { select: { name: true } },
          model: { select: { name: true } },
          deviceType: { select: { name: true } },
        },
      },
      branch: { select: { name: true, phone: true } },
      history: { include: { toStatus: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      notes: { where: { isInternal: false }, orderBy: { createdAt: "asc" } },
      invoices: {
        where: { status: "ISSUED", kind: { not: "CREDIT_NOTE" } },
        select: { id: true, invoiceNo: true, grandTotal: true, amountPaid: true },
      },
      quotations: {
        where: { status: { not: "DRAFT" } },
        orderBy: { version: "desc" },
        take: 1,
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!job) return notFound;
  const inv = job.invoices[0];
  return {
    ok: true,
    job: {
      jobNo: job.jobNo,
      firstName: job.customer.name.split(/\s+/)[0],
      device:
        [job.device.brand?.name, job.device.model?.name ?? job.device.modelText].filter(Boolean).join(" ") ||
        job.device.deviceType.name,
      status: job.status.name,
      tone: job.status.color,
      stage: job.status.systemKey,
      receivedAt: job.receivedAt.toISOString(),
      estimatedAt: job.estimatedAt?.toISOString() ?? null,
      deliveredAt: job.deliveredAt?.toISOString() ?? null,
      warrantyUntil: job.warrantyUntil?.toISOString() ?? null,
      amountDue: inv ? Math.max(0, Math.round((Number(inv.grandTotal) - Number(inv.amountPaid)) * 100) / 100) : null,
      timeline: job.history.map((h) => ({ status: h.toStatus.name, at: h.createdAt.toISOString() })),
      notes: job.notes.map((n) => ({ note: n.note, at: n.createdAt.toISOString() })),
      branch: job.branch,
      quote: job.quotations[0]
        ? {
            version: job.quotations[0].version,
            status: job.quotations[0].status,
            total: Number(job.quotations[0].total),
            validUntil: job.quotations[0].validUntil?.toISOString() ?? null,
            items: job.quotations[0].items.map((i) => ({ description: i.description, qty: Number(i.qty), amount: Number(i.amount) })),
          }
        : null,
      invoice: inv ? { number: inv.invoiceNo, url: invoiceLink(inv.id) } : null,
    },
  };
}
