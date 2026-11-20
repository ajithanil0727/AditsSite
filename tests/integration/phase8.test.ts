/**
 * Integration test (real database) for Phase 8: alert emails queued for opted-in staff, student portal invite +
 * one-time set-password links + forgotten password, reports, global search, dashboard and Excel imports.
 * Creates its own records (tagged ZZTEST8) and removes them afterwards.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { dashboardData } from "@/modules/dashboard/dashboard.queries";
import { checkImport, runImport } from "@/modules/imports/imports.service";
import { notify } from "@/modules/notifications/notifications.service";
import { inviteStudent, requestPasswordReset, setPasswordWithToken } from "@/modules/portal/portal-auth.service";
import { REPORTS, runReport } from "@/modules/reports/reports";
import { globalSearch } from "@/modules/search/search.queries";
import { buildAccess } from "@/modules/rbac/access";
import type { ActionContext } from "@/modules/rbac/action";

const hasDb = !!process.env.DATABASE_URL;
const TAG = "ZZTEST8";
const EMAIL = "zztest8.student@example.com";

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
    roles: u.roles.map((r) => ({ scope: r.scope, permissions: r.role.permissions.map((p) => p.permission.key) })),
  });
  return {
    user: { id: u.id, name: u.name, email: u.email, image: null, organizationId: u.organizationId, access },
    activeBranchId: null,
    actor: { organizationId: u.organizationId, userId: u.id },
  };
}

async function xlsx(headers: string[], rows: (string | number | null)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return buf instanceof ArrayBuffer ? buf : new Uint8Array(buf as unknown as ArrayBuffer).buffer;
}

async function cleanup() {
  const portalUser = await db.user.findUnique({ where: { email: EMAIL } });
  await db.student.deleteMany({ where: { OR: [{ studentCode: { startsWith: TAG } }, { name: { startsWith: TAG } }] } });
  if (portalUser) await db.user.delete({ where: { id: portalUser.id } });
  const parts = await db.part.findMany({ where: { sku: { startsWith: TAG } }, select: { id: true } });
  await db.stockMovement.deleteMany({ where: { partId: { in: parts.map((p) => p.id) } } });
  await db.stock.deleteMany({ where: { partId: { in: parts.map((p) => p.id) } } });
  await db.part.deleteMany({ where: { id: { in: parts.map((p) => p.id) } } });
  await db.employee.deleteMany({ where: { name: { startsWith: TAG } } });
  await db.importJob.deleteMany({ where: { file: { originalName: { startsWith: TAG } } } });
  await db.fileAsset.deleteMany({ where: { storageKey: { startsWith: TAG } } });
  await db.messageLog.deleteMany({
    where: {
      OR: [{ subject: { startsWith: TAG } }, { to: EMAIL }, { to: "admin@demo.test", templateKey: "password_reset" }],
    },
  });
  await db.notification.deleteMany({ where: { title: { startsWith: TAG } } });
}

describe.skipIf(!hasDb)("phase 8: alerts, portal, reports, search, dashboard, imports", () => {
  let owner: ActionContext;
  let engineer: ActionContext;
  let pkd: { id: string; organizationId: string };

  beforeAll(async () => {
    await cleanup();
    owner = await ctxFor("arun@demo.test");
    engineer = await ctxFor("engineer.pkd@demo.test");
    pkd = await db.branch.findFirstOrThrow({ where: { code: "PKD" }, select: { id: true, organizationId: true } });
  });
  afterAll(async () => {
    await db.user.update({ where: { email: "arun@demo.test" }, data: { emailAlerts: false } });
    await cleanup();
  });

  it("queues alert emails only for people who turned them on", async () => {
    await db.user.update({ where: { email: "arun@demo.test" }, data: { emailAlerts: true } });
    await db.user.update({ where: { email: "engineer.pkd@demo.test" }, data: { emailAlerts: false } });
    await notify(db, [owner.user.id, engineer.user.id], {
      title: `${TAG} alert`,
      body: "Something to look at",
      link: "/admin/fees/approvals",
    });
    const queued = await db.messageLog.findMany({ where: { subject: `${TAG} alert` } });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ to: "arun@demo.test", channel: "EMAIL", status: "QUEUED" });
    expect(queued[0].body).toContain("/admin/fees/approvals");
    expect(await db.notification.count({ where: { title: `${TAG} alert` } })).toBe(2);
  });

  it("invites a student; the link sets a password once; forgot-password never reveals accounts", async () => {
    const s = await db.student.create({
      data: {
        organizationId: pkd.organizationId,
        branchId: pkd.id,
        studentCode: `${TAG}S1`,
        name: `${TAG} Portal Student`,
        phone: "9000000881",
      },
    });
    await expect(inviteStudent(owner, s.id)).rejects.toThrow(/Add the student's email/);
    await db.student.update({ where: { id: s.id }, data: { email: EMAIL } });
    const { link } = await inviteStudent(owner, s.id);
    const token = new URL(link).searchParams.get("token")!;
    const user = await db.user.findUniqueOrThrow({ where: { email: EMAIL }, include: { roles: true } });
    expect(user.roles).toHaveLength(0); // no staff permissions
    expect((await db.student.findUniqueOrThrow({ where: { id: s.id } })).userId).toBe(user.id);
    expect(await db.messageLog.count({ where: { to: EMAIL, templateKey: "portal_invite" } })).toBe(1);

    expect(await setPasswordWithToken(token, "Student123")).toBe(EMAIL);
    expect(await db.account.count({ where: { userId: user.id, providerId: "credential" } })).toBe(1);
    await expect(setPasswordWithToken(token, "Student456")).rejects.toThrow(/expired or was already used/);

    // A new invite makes the old (unused) link stop working.
    const first = new URL((await inviteStudent(owner, s.id)).link).searchParams.get("token")!;
    await inviteStudent(owner, s.id);
    await expect(setPasswordWithToken(first, "Student789")).rejects.toThrow(/expired/);

    await requestPasswordReset("nobody-here@example.com");
    await requestPasswordReset("admin@demo.test");
    expect(await db.messageLog.count({ where: { to: "nobody-here@example.com" } })).toBe(0);
    expect(await db.messageLog.count({ where: { to: "admin@demo.test", templateKey: "password_reset" } })).toBe(1);
  });

  it("runs every report and totals match the rows", async () => {
    for (const r of REPORTS) {
      const res = await runReport(owner.user, r, { from: "2020-01-01", to: "2030-12-31", branchId: null });
      expect(res, r.key).not.toBeNull();
      for (const c of r.columns.filter((x) => x.total)) {
        const sum = res!.rows.reduce((a, row) => a + (typeof row[c.key] === "number" ? (row[c.key] as number) : 0), 0);
        expect(res!.totals[c.key]).toBeCloseTo(sum, 2);
      }
    }
    // An engineer can't run fee reports for a branch they can't see.
    const mkm = await db.branch.findFirstOrThrow({ where: { code: "MKM" } });
    expect(
      await runReport(
        engineer.user,
        REPORTS.find((r) => r.key === "job-cards")!,
        { from: "2020-01-01", to: "2030-12-31", branchId: mkm.id },
      ),
    ).toBeNull();
  });

  it("searches by phone and number within permissions", async () => {
    const hits = await globalSearch(owner.user, "9000000881");
    expect(hits.find((g) => g.key === "students")?.hits.some((h) => h.title === `${TAG} Portal Student`)).toBe(true);
    const engHits = await globalSearch(engineer.user, "9000000881");
    expect(engHits.find((g) => g.key === "students")).toBeUndefined(); // engineers can't see students
  });

  it("shows each role only its own dashboard figures", async () => {
    const own = await dashboardData(owner.user, null);
    expect(own.tiles.map((t) => t.key)).toEqual(
      expect.arrayContaining(["admissions", "fees-today", "dues", "jobs-open", "stock", "placements"]),
    );
    const eng = await dashboardData(engineer.user, null);
    expect(eng.tiles.map((t) => t.key)).not.toContain("fees-today");
    expect(eng.tiles.map((t) => t.key)).toContain("jobs-open");
  });

  it("imports students and parts all-or-nothing", async () => {
    const file = await db.fileAsset.create({
      data: {
        organizationId: pkd.organizationId,
        storageKey: `${TAG}/x.xlsx`,
        originalName: `${TAG}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 1,
        uploadedById: owner.user.id,
      },
    });
    const headers = ["Name", "Phone", "Email", "Branch code", "Date of birth"];
    const bad = await xlsx(headers, [
      [`${TAG} Import One`, "9000000882", "", "PKD", "01/01/2005"],
      [`${TAG} Import Two`, "9000000881", "", "ZZZ", "31/02/2005"], // phone taken, bad branch, bad date
    ]);
    const check = await checkImport(owner, "students", bad);
    expect(check.total).toBe(2);
    expect(check.valid).toBe(1);
    expect(check.errors.map((e) => e.row)).toEqual([3, 3, 3]);
    await expect(runImport(owner, "students", bad, file.id)).rejects.toThrow(/Fix the 3 problem/);
    expect(await db.student.count({ where: { name: `${TAG} Import One` } })).toBe(0);

    const good = await xlsx(headers, [
      [`${TAG} Import One`, "9000000882", "", "PKD", "01/01/2005"],
      [`${TAG} Import Two`, "9000000883", "two@example.com", "PKD", null],
    ]);
    expect(await runImport(owner, "students", good, file.id)).toEqual({ imported: 2 });
    const imported = await db.student.findMany({
      where: { name: { startsWith: `${TAG} Import` } },
      orderBy: { name: "asc" },
    });
    expect(imported.map((s) => s.studentCode.startsWith("PKD"))).toEqual([true, true]);
    expect(imported[0].dob?.toISOString().slice(0, 10)).toBe("2005-01-01");

    const unit = await db.unit.findFirstOrThrow({ where: { organizationId: pkd.organizationId } });
    const parts = await xlsx(
      ["SKU", "Name", "Unit", "GST %", "Opening stock branch", "Opening qty", "Opening unit cost (₹)"],
      [[`${TAG}-P1`, "Test part", unit.name, 18, "PKD", 4, 250]],
    );
    expect(await runImport(owner, "parts", parts, file.id)).toEqual({ imported: 1 });
    const stock = await db.stock.findFirstOrThrow({ where: { part: { sku: `${TAG}-P1` }, branchId: pkd.id } });
    expect(Number(stock.qty)).toBe(4);
    expect(Number(stock.avgCost)).toBe(250);
    // Same SKU again is refused.
    expect((await checkImport(owner, "parts", parts)).errors[0].message).toMatch(/already exists/);
    await db.importJob.deleteMany({ where: { fileId: file.id } });
    await db.fileAsset.delete({ where: { id: file.id } });
  });
});
