/**
 * Integration test (real database) for the enquiry rules: round-robin assignment, repeat enquiries
 * merged into the open lead, and automatic conversion when the phone is admitted.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { receiveLead } from "@/modules/leads/leads.service";
import { buildAccess } from "@/modules/rbac/access";
import type { ActionContext } from "@/modules/rbac/action";
import { admit } from "@/modules/students/students.service";

const hasDb = !!process.env.DATABASE_URL;
const phone = `6${String(Date.now()).slice(-9)}`;
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

async function ctxFor(email: string): Promise<ActionContext> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      branches: true,
    },
  });
  const access = buildAccess({
    userId: u.id,
    organizationId: u.organizationId,
    assignedBranchIds: u.branches.map((b) => b.branchId),
    roles: u.roles.map((r) => ({
      scope: r.scope,
      permissions: r.role.permissions.map((p) => p.permission.key),
      discountLimitPercent: Number(r.role.discountLimitPercent),
      discountLimitAmount: Number(r.role.discountLimitAmount),
    })),
  });
  return {
    user: { id: u.id, name: u.name, email: u.email, image: null, organizationId: u.organizationId, access },
    activeBranchId: null,
    actor: { organizationId: u.organizationId, userId: u.id },
  };
}

describe.skipIf(!hasDb)("enquiries", () => {
  let owner: ActionContext;
  let counsellorId: string;
  let ids: { org: string; pkd: string; website: string; course: string };
  let courseLeadId = "";
  let serviceLeadId = "";
  let studentId = "";

  beforeAll(async () => {
    owner = await ctxFor("arun@demo.test");
    counsellorId = (await db.user.findUniqueOrThrow({ where: { email: "frontdesk.pkd@demo.test" } })).id;
    const pkd = await db.branch.findFirstOrThrow({ where: { code: "PKD" } });
    const website = await db.leadSource.findFirstOrThrow({
      where: { organizationId: pkd.organizationId, isSystem: true },
    });
    const course = await db.course.findFirstOrThrow({ where: { code: "SPE" } });
    ids = { org: pkd.organizationId, pkd: pkd.id, website: website.id, course: course.id };
  });

  afterAll(async () => {
    const leads = await db.lead.findMany({ where: { phone }, select: { id: true } });
    await db.notification.deleteMany({ where: { link: { in: leads.map((l) => `/admin/leads/${l.id}`) } } });
    await db.lead.deleteMany({ where: { phone } });
    if (studentId) {
      await db.feeInstallment.deleteMany({ where: { enrollment: { studentId } } });
      await db.enrollment.deleteMany({ where: { studentId } });
      await db.student.delete({ where: { id: studentId } });
    }
    await db.$disconnect();
  });

  const website = (type: "COURSE" | "SERVICE", extra: Record<string, unknown> = {}) =>
    db.$transaction((tx) =>
      receiveLead(
        tx,
        { organizationId: ids.org, userId: null },
        { type, branchId: ids.pkd, sourceId: ids.website, name: "Lead Test", phone, ...extra },
        { createdByUserId: null, channel: "website" },
      ),
    );

  it("assigns a new website lead to the branch counsellor and notifies them", async () => {
    const r = await website("COURSE", { courseId: ids.course });
    expect(r.merged).toBe(false);
    courseLeadId = r.id;
    const lead = await db.lead.findUniqueOrThrow({ where: { id: r.id }, include: { status: true } });
    // Palakkad's only user with "Receive new leads" at branch level (the manager and owners aren't in the rotation).
    expect(lead.assignedToId).toBe(counsellorId);
    expect(lead.status.isDefault).toBe(true);
    expect(await db.notification.count({ where: { userId: counsellorId, link: `/admin/leads/${r.id}` } })).toBe(1);
  });

  it("adds a repeat enquiry to the open lead instead of creating a new one", async () => {
    const r = await website("COURSE", { message: "Asking again" });
    expect(r).toEqual({ id: courseLeadId, merged: true });
    const lead = await db.lead.findUniqueOrThrow({ where: { id: courseLeadId }, include: { activities: true } });
    expect(lead.enquiryCount).toBe(2);
    expect(lead.activities.some((a) => a.kind === "ENQUIRY" && a.note?.includes("Asking again"))).toBe(true);
  });

  it("keeps course and repair enquiries apart", async () => {
    const r = await website("SERVICE", { deviceText: "Redmi 12", problemText: "No power" });
    expect(r.merged).toBe(false);
    serviceLeadId = r.id;
  });

  it("marks the course lead won when that phone is admitted", async () => {
    const r = await admit(owner, {
      branchId: ids.pkd,
      studentId: null,
      leadId: null,
      student: {
        name: "Lead Test",
        phone,
        altPhone: null,
        email: null,
        dob: null,
        gender: null,
        guardianName: null,
        guardianPhone: null,
        address: null,
        city: null,
        state: null,
        pincode: null,
        qualification: null,
      },
      courseId: ids.course,
      batchId: null,
      enrolledAt: today,
      discountAmount: null,
      discountReason: null,
      schedule: [{ label: "Full fee", amount: 90000, dueDate: today }],
      payment: { amount: null, paymentModeId: null, moneyAccountId: null, reference: null },
    });
    studentId = r.studentId;
    const lead = await db.lead.findUniqueOrThrow({
      where: { id: courseLeadId },
      include: { status: true, activities: true },
    });
    expect(lead.status.isWon).toBe(true);
    expect(lead.enrollmentId).toBe(r.enrollmentId);
    expect(lead.nextFollowUpAt).toBeNull();
    expect(lead.activities.some((a) => a.kind === "CONVERSION")).toBe(true);
    expect((await db.student.findUniqueOrThrow({ where: { id: studentId } })).leadId).toBe(courseLeadId);

    const service = await db.lead.findUniqueOrThrow({ where: { id: serviceLeadId }, include: { status: true } });
    expect(service.status.isWon).toBe(false);
  });

  it("starts a new lead once the old one is closed", async () => {
    const r = await website("COURSE");
    expect(r.merged).toBe(false);
    expect(r.id).not.toBe(courseLeadId);
  });
});
