"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDefaultOrganizationId } from "@/modules/settings/settings.service";
import { looksLikeBot, RateLimiter } from "./lead-logic";
import { courseEnquirySchema, repairBookingSchema } from "./leads.schemas";
import { receiveLead } from "./leads.service";

/**
 * Public website forms (no sign-in). They create a lead in the CRM.
 * Spam protection: honeypot + minimum fill time + per-IP and per-phone limits.
 * Bots get the same "thank you" as people so they can't learn what was blocked.
 */

export type PublicFormResult =
  { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const perIp = new RateLimiter(5, 10 * 60_000);
const perPhone = new RateLimiter(3, 60 * 60_000);

async function meta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local",
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

async function websiteSource(orgId: string) {
  return (
    (await db.leadSource.findFirst({ where: { organizationId: orgId, isSystem: true } })) ??
    (await db.leadSource.create({ data: { organizationId: orgId, name: "Website", isSystem: true } }))
  );
}

/** A branch shown on the website that runs courses (enquiries) or a service centre (bookings). */
async function publicBranch(orgId: string, branchId: string, kinds: ("INSTITUTE" | "SERVICE" | "BOTH")[]) {
  return db.branch.findFirst({
    where: {
      id: branchId,
      organizationId: orgId,
      deletedAt: null,
      isActive: true,
      showOnWebsite: true,
      kind: { in: kinds },
    },
    select: { id: true, kind: true },
  });
}

async function submit<S extends z.ZodType>(
  schema: S,
  raw: unknown,
  build: (data: z.output<S>, orgId: string) => Promise<Parameters<typeof receiveLead>[2] | string>,
): Promise<PublicFormResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data as z.output<S> & { website?: string | null; startedAt: number; phone: string };
  if (looksLikeBot({ honeypot: data.website, startedAt: data.startedAt, now: Date.now() })) return { ok: true };

  const { ip, userAgent } = await meta();
  if (perIp.hit(ip)) return { ok: false, error: "Too many requests. Please try again in a few minutes." };
  if (perPhone.hit(data.phone)) return { ok: true }; // already have it; don't flood the team

  try {
    const orgId = await getDefaultOrganizationId();
    if (!orgId) return { ok: false, error: "Sorry, we can't take enquiries right now." };
    const lead = await build(data, orgId);
    if (typeof lead === "string") return { ok: false, error: lead };
    await db.$transaction((tx) =>
      receiveLead(tx, { organizationId: orgId, userId: null, ipAddress: ip, userAgent }, lead, {
        createdByUserId: null,
        channel: "website",
      }),
    );
    return { ok: true };
  } catch (e) {
    console.error("[public enquiry]", e);
    return { ok: false, error: "Something went wrong. Please call us or try again." };
  }
}

export async function submitCourseEnquiry(raw: unknown): Promise<PublicFormResult> {
  return submit(courseEnquirySchema, raw, async (d, orgId) => {
    const branch = await publicBranch(orgId, d.branchId, ["INSTITUTE", "BOTH"]);
    if (!branch) return "Choose a branch from the list.";
    const course = d.courseId
      ? await db.course.findFirst({
          where: { id: d.courseId, organizationId: orgId, deletedAt: null, isActive: true, showOnWebsite: true },
          select: { id: true },
        })
      : null;
    return {
      type: "COURSE",
      branchId: branch.id,
      sourceId: (await websiteSource(orgId)).id,
      name: d.name,
      phone: d.phone,
      email: d.email,
      city: d.city,
      courseId: course?.id ?? null,
      message: d.message,
    };
  });
}

export async function submitRepairBooking(raw: unknown): Promise<PublicFormResult> {
  return submit(repairBookingSchema, raw, async (d, orgId) => {
    const branch = await publicBranch(orgId, d.branchId, ["SERVICE", "BOTH"]);
    if (!branch) return "Choose a branch from the list.";
    const deviceType = d.deviceTypeId
      ? await db.deviceType.findFirst({ where: { id: d.deviceTypeId, organizationId: orgId }, select: { id: true } })
      : null;
    return {
      type: "SERVICE",
      branchId: branch.id,
      sourceId: (await websiteSource(orgId)).id,
      name: d.name,
      phone: d.phone,
      email: d.email,
      deviceTypeId: deviceType?.id ?? null,
      deviceText: d.deviceText,
      problemText: d.problemText,
    };
  });
}
