import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint, can, canAccessBranch, type BranchConstraint } from "@/modules/rbac/access";
import type { PermissionKey } from "@/lib/permissions";
import { dateOnly } from "./hr.service";
import { isSunday, leaveYear, type AttendanceSummary } from "./payroll-logic";

const n = (v: Prisma.Decimal | number | null | undefined) => Math.round(Number(v ?? 0) * 100) / 100;
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const branchIn = (c: BranchConstraint) => (c.branchIds ? { branchId: { in: c.branchIds } } : {});

/** Branches the user may act on for a permission (for pickers). */
export async function branchOptions(user: CurrentUser, permission: PermissionKey) {
  const rows = await db.branch.findMany({
    where: { organizationId: user.organizationId, deletedAt: null, isActive: true },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows
    .filter((b) => canAccessBranch(user.access, permission, b.id))
    .map((b) => ({ value: b.id, label: b.name }));
}

export async function employeeFormOptions(user: CurrentUser) {
  const orgId = user.organizationId;
  const [branches, departments, designations, shifts, managers, users] = await Promise.all([
    branchOptions(user, "employees.create"),
    db.department.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { name: "asc" } }),
    db.designation.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { name: "asc" } }),
    db.shift.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
    db.employee.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { not: "EXITED" } },
      select: { id: true, name: true, employeeCode: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    branches,
    departments: departments.map((d) => ({ value: d.id, label: d.name })),
    designations: designations.map((d) => ({ value: d.id, label: d.name })),
    shifts: shifts.map((s) => ({ value: s.id, label: `${s.name} (${s.startTime}–${s.endTime})` })),
    managers: managers.map((m) => ({ value: m.id, label: `${m.name} (${m.employeeCode})` })),
    users: users.map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` })),
  };
}

export async function listEmployees(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const c = branchConstraint(user.access, "employees.view", activeBranchId);
  const f = p.filters;
  const where: Prisma.EmployeeWhereInput = {
    organizationId: user.organizationId,
    deletedAt: p.showDeleted ? { not: null } : null,
    ...branchIn(c),
    ...(f.status ? { status: f.status as never } : { status: { not: "EXITED" } }),
    ...(f.department ? { departmentId: f.department } : {}),
    ...(p.q
      ? {
          OR: [
            { name: { contains: p.q, mode: "insensitive" } },
            { employeeCode: { contains: p.q, mode: "insensitive" } },
            { phone: { contains: p.q } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: p.sort === "joinDate" ? { joinDate: p.dir } : { name: p.dir },
      ...paging(p),
      include: {
        branch: { select: { code: true } },
        department: { select: { name: true } },
        designation: { select: { name: true } },
        salaryStructures: { orderBy: { effectiveFrom: "desc" }, take: 1, select: { monthlyGross: true } },
      },
    }),
    db.employee.count({ where }),
  ]);
  const showPay = can(user.access, "payroll.view");
  return {
    total,
    rows: rows.map((e) => ({
      id: e.id,
      code: e.employeeCode,
      name: e.name,
      phone: e.phone,
      branchCode: e.branch.code,
      department: e.department?.name ?? null,
      designation: e.designation?.name ?? null,
      joinDate: ymd(e.joinDate)!,
      status: e.status,
      gross: showPay ? n(e.salaryStructures[0]?.monthlyGross) || null : null,
      deleted: !!e.deletedAt,
    })),
  };
}
export type EmployeeRow = Awaited<ReturnType<typeof listEmployees>>["rows"][number];

export async function getEmployee(user: CurrentUser, id: string) {
  const e = await db.employee.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      department: { select: { name: true } },
      designation: { select: { name: true } },
      manager: { select: { id: true, name: true } },
      shift: { select: { name: true, startTime: true, endTime: true } },
      user: { select: { email: true } },
      salaryStructures: { orderBy: { effectiveFrom: "desc" }, include: { items: { include: { component: true } } } },
      advances: { orderBy: { givenAt: "desc" } },
      payslips: {
        orderBy: [{ payrollRun: { year: "desc" } }, { payrollRun: { month: "desc" } }],
        take: 24,
        include: { payrollRun: { select: { year: true, month: true, status: true } } },
      },
      leaveRequests: { orderBy: { fromDate: "desc" }, take: 20, include: { leaveType: { select: { name: true } } } },
      incentives: { orderBy: [{ year: "desc" }, { month: "desc" }], take: 20 },
    },
  });
  if (!e || !canAccessBranch(user.access, "employees.view", e.branchId)) return null;
  const year = leaveYear(new Date());
  const [types, balances, docs] = await Promise.all([
    db.leaveType.findMany({ where: { organizationId: user.organizationId, isActive: true }, orderBy: { name: "asc" } }),
    db.leaveBalance.findMany({ where: { employeeId: e.id, year } }),
    db.attachment.findMany({
      where: { entityType: "Employee", entityId: e.id },
      include: { file: { select: { originalName: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const sensitive = can(user.access, "employees.view_sensitive");
  const showPay = can(user.access, "payroll.view");
  return {
    id: e.id,
    code: e.employeeCode,
    name: e.name,
    phone: e.phone,
    email: e.email,
    dob: ymd(e.dob),
    gender: e.gender,
    address: e.address,
    branch: e.branch,
    department: e.department?.name ?? null,
    designation: e.designation?.name ?? null,
    manager: e.manager,
    shift: e.shift ? `${e.shift.name} (${e.shift.startTime}–${e.shift.endTime})` : null,
    login: e.user?.email ?? null,
    joinDate: ymd(e.joinDate)!,
    exitDate: ymd(e.exitDate),
    status: e.status,
    deleted: !!e.deletedAt,
    sensitive: sensitive ? { pan: e.pan, bankName: e.bankName, bankAccountNo: e.bankAccountNo, ifsc: e.ifsc } : null,
    form: {
      id: e.id,
      branchId: e.branchId,
      name: e.name,
      phone: e.phone,
      email: e.email ?? "",
      dob: ymd(e.dob) ?? "",
      gender: e.gender,
      address: e.address ?? "",
      departmentId: e.departmentId,
      designationId: e.designationId,
      managerId: e.managerId,
      shiftId: e.shiftId,
      userId: e.userId,
      joinDate: ymd(e.joinDate)!,
      exitDate: ymd(e.exitDate) ?? "",
      status: e.status,
      pan: sensitive ? (e.pan ?? "") : "",
      bankName: sensitive ? (e.bankName ?? "") : "",
      bankAccountNo: sensitive ? (e.bankAccountNo ?? "") : "",
      ifsc: sensitive ? (e.ifsc ?? "") : "",
    },
    salaries: showPay
      ? e.salaryStructures.map((s) => ({
          id: s.id,
          from: ymd(s.effectiveFrom)!,
          gross: n(s.monthlyGross),
          notes: s.notes,
          items: s.items.map((i) => ({
            componentId: i.componentId,
            label: i.component.name,
            type: i.component.type,
            amount: n(i.amount),
          })),
        }))
      : null,
    leave: types.map((t) => {
      const b = balances.find((x) => x.leaveTypeId === t.id);
      const allotted = Number(b?.allotted ?? t.annualQuota);
      return {
        id: t.id,
        name: t.name,
        isPaid: t.isPaid,
        allotted,
        used: Number(b?.used ?? 0),
        left: allotted - Number(b?.used ?? 0),
      };
    }),
    leaveRequests: e.leaveRequests.map((r) => ({
      id: r.id,
      type: r.leaveType.name,
      from: ymd(r.fromDate)!,
      to: ymd(r.toDate)!,
      days: Number(r.days),
      status: r.status,
      reason: r.reason,
    })),
    advances: showPay
      ? e.advances.map((a) => ({
          id: a.id,
          givenAt: ymd(a.givenAt)!,
          amount: n(a.amount),
          monthlyRecovery: n(a.monthlyRecovery),
          recovered: n(a.recoveredAmount),
          status: a.status,
          note: a.note,
        }))
      : null,
    payslips: showPay
      ? e.payslips.map((s) => ({
          id: s.id,
          year: s.payrollRun.year,
          month: s.payrollRun.month,
          status: s.payrollRun.status,
          net: n(s.netPay),
          paidAt: ymd(s.paidAt),
        }))
      : null,
    incentives: e.incentives.map((i) => ({
      id: i.id,
      year: i.year,
      month: i.month,
      amount: n(i.amount),
      reason: i.reason,
      status: i.status,
    })),
    documents: docs.map((d) => ({
      id: d.id,
      fileId: d.fileId,
      label: d.label,
      name: d.file.originalName,
      at: d.createdAt.toISOString(),
    })),
  };
}
export type EmployeeDetail = NonNullable<Awaited<ReturnType<typeof getEmployee>>>;

// ------------------------------------------------------------------ attendance

export async function attendanceSheet(user: CurrentUser, branchId: string, date: string) {
  const d = dateOnly(date);
  const [staff, marks, holiday, run] = await Promise.all([
    db.employee.findMany({
      where: {
        organizationId: user.organizationId,
        branchId,
        deletedAt: null,
        joinDate: { lte: d },
        OR: [{ exitDate: null }, { exitDate: { gte: d } }],
      },
      select: { id: true, name: true, employeeCode: true, designation: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    db.employeeAttendance.findMany({
      where: { date: d, employee: { branchId } },
      include: { markedBy: { select: { name: true } } },
    }),
    db.holiday.findFirst({
      where: { organizationId: user.organizationId, date: d, OR: [{ branchId: null }, { branchId }] },
    }),
    db.payrollRun.findFirst({
      where: { branchId, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, status: { in: ["FINALIZED", "PAID"] } },
    }),
  ]);
  return {
    date,
    sunday: isSunday(d),
    holiday: holiday?.name ?? null,
    locked: !!run,
    staff: staff.map((s) => {
      const m = marks.find((x) => x.employeeId === s.id);
      return {
        id: s.id,
        name: s.name,
        code: s.employeeCode,
        designation: s.designation?.name ?? null,
        status: m?.status ?? null,
        note: m?.note ?? "",
        markedBy: m?.markedBy?.name ?? null,
      };
    }),
  };
}

// ------------------------------------------------------------------ leave

export async function listLeave(user: CurrentUser, opts: { status: string | null; activeBranchId: string | null }) {
  const c = branchConstraint(user.access, "leaves.approve", opts.activeBranchId);
  const approver = can(user.access, "leaves.approve");
  const own = await db.employee.findFirst({ where: { userId: user.id, deletedAt: null }, select: { id: true } });
  const where: Prisma.LeaveRequestWhereInput = approver
    ? { employee: { organizationId: user.organizationId, ...branchIn(c) } }
    : { employeeId: own?.id ?? "-" };
  const rows = await db.leaveRequest.findMany({
    where: { ...where, ...(opts.status ? { status: opts.status as never } : {}) },
    orderBy: [{ status: "asc" }, { fromDate: "desc" }],
    take: 300,
    include: {
      employee: {
        select: { id: true, name: true, employeeCode: true, userId: true, branch: { select: { code: true } } },
      },
      leaveType: { select: { name: true, isPaid: true } },
      decidedBy: { select: { name: true } },
    },
  });
  return {
    approver,
    ownEmployeeId: own?.id ?? null,
    rows: rows.map((r) => ({
      id: r.id,
      employeeId: r.employee.id,
      employee: r.employee.name,
      code: r.employee.employeeCode,
      branchCode: r.employee.branch.code,
      type: r.leaveType.name,
      paid: r.leaveType.isPaid,
      from: ymd(r.fromDate)!,
      to: ymd(r.toDate)!,
      days: Number(r.days),
      reason: r.reason,
      status: r.status,
      decidedBy: r.decidedBy?.name ?? null,
      mine: r.requestedById === user.id || r.employee.userId === user.id,
    })),
  };
}
export type LeaveRow = Awaited<ReturnType<typeof listLeave>>["rows"][number];

export async function leaveFormOptions(user: CurrentUser) {
  const orgId = user.organizationId;
  const approverBranches = (await branchOptions(user, "leaves.approve")).map((b) => b.value);
  const [types, staff] = await Promise.all([
    db.leaveType.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { name: "asc" } }),
    db.employee.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        status: { not: "EXITED" },
        OR: [{ userId: user.id }, { branchId: { in: approverBranches } }],
      },
      select: { id: true, name: true, employeeCode: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    types: types.map((t) => ({ value: t.id, label: `${t.name}${t.isPaid ? "" : " (unpaid)"}` })),
    staff: staff.map((s) => ({ value: s.id, label: `${s.name} (${s.employeeCode})` })),
  };
}

export async function listHolidays(orgId: string, year: number) {
  const rows = await db.holiday.findMany({
    where: {
      organizationId: orgId,
      date: { gte: new Date(Date.UTC(year, 3, 1)), lte: new Date(Date.UTC(year + 1, 2, 31)) },
    },
    include: { branch: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
  return rows.map((h) => ({
    id: h.id,
    date: ymd(h.date)!,
    name: h.name,
    branchId: h.branchId,
    branch: h.branch?.name ?? "All branches",
  }));
}

// ------------------------------------------------------------------ incentives & advances

export async function listIncentives(user: CurrentUser, activeBranchId: string | null) {
  const c = branchConstraint(user.access, "incentives.manage", activeBranchId);
  const c2 = branchConstraint(user.access, "incentives.approve", activeBranchId);
  const scope =
    c.branchIds === null || c2.branchIds === null
      ? null
      : [...new Set([...(c.branchIds ?? []), ...(c2.branchIds ?? [])])];
  const rows = await db.incentive.findMany({
    where: { employee: { organizationId: user.organizationId, ...(scope ? { branchId: { in: scope } } : {}) } },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      employee: { select: { name: true, employeeCode: true, userId: true, branch: { select: { code: true } } } },
      approvedBy: { select: { name: true } },
    },
  });
  return rows.map((i) => ({
    id: i.id,
    employee: i.employee.name,
    code: i.employee.employeeCode,
    branchCode: i.employee.branch.code,
    year: i.year,
    month: i.month,
    amount: n(i.amount),
    reason: i.reason,
    status: i.status,
    approvedBy: i.approvedBy?.name ?? null,
    paid: !!i.payslipId,
    canDecide: i.status === "PENDING" && i.createdById !== user.id && i.employee.userId !== user.id,
  }));
}
export type IncentiveRow = Awaited<ReturnType<typeof listIncentives>>[number];

export async function staffOptions(user: CurrentUser, permission: PermissionKey) {
  const branches = (await branchOptions(user, permission)).map((b) => b.value);
  const rows = await db.employee.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: { not: "EXITED" },
      branchId: { in: branches },
    },
    select: { id: true, name: true, employeeCode: true, branchId: true },
    orderBy: { name: "asc" },
  });
  return rows.map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode})`, branchId: e.branchId }));
}

// ------------------------------------------------------------------ payroll

export async function listPayrollRuns(user: CurrentUser, activeBranchId: string | null) {
  const c = branchConstraint(user.access, "payroll.view", activeBranchId);
  const runs = await db.payrollRun.findMany({
    where: { organizationId: user.organizationId, ...branchIn(c) },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 60,
    include: { branch: { select: { code: true, name: true } }, payslips: { select: { netPay: true } } },
  });
  return runs.map((r) => ({
    id: r.id,
    branch: r.branch.name,
    branchCode: r.branch.code,
    year: r.year,
    month: r.month,
    status: r.status,
    staff: r.payslips.length,
    net: n(r.payslips.reduce((a, s) => a + Number(s.netPay), 0)),
  }));
}

export async function getPayrollRun(user: CurrentUser, id: string) {
  const r = await db.payrollRun.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      branch: { select: { id: true, name: true, code: true } },
      finalizedBy: { select: { name: true } },
      payslips: {
        include: { employee: { select: { id: true, name: true, employeeCode: true } } },
        orderBy: { employee: { name: "asc" } },
      },
    },
  });
  if (!r || !canAccessBranch(user.access, "payroll.view", r.branchId)) return null;
  const accounts = await db.moneyAccount.findMany({
    where: { branchId: r.branchId, isActive: true },
    orderBy: { name: "asc" },
  });
  const slips = r.payslips.map((s) => {
    const sum = (s.summary ?? {}) as Partial<AttendanceSummary>;
    return {
      id: s.id,
      employeeId: s.employee.id,
      name: s.employee.name,
      code: s.employee.employeeCode,
      daysInMonth: s.daysInMonth,
      paidDays: Number(s.paidDays),
      lopDays: Number(s.lopDays),
      unmarked: sum.unmarked ?? 0,
      gross: n(s.grossEarnings),
      lop: n(s.lopAmount),
      incentives: n(s.incentives),
      deductions: n(s.otherDeductions),
      advance: n(s.advanceRecovery),
      net: n(s.netPay),
      paid: !!s.paidAt,
    };
  });
  return {
    id: r.id,
    branch: r.branch,
    year: r.year,
    month: r.month,
    status: r.status,
    finalizedBy: r.finalizedBy?.name ?? null,
    finalizedAt: r.finalizedAt?.toISOString() ?? null,
    slips,
    totals: {
      gross: n(slips.reduce((a, s) => a + s.gross, 0)),
      lop: n(slips.reduce((a, s) => a + s.lop, 0)),
      incentives: n(slips.reduce((a, s) => a + s.incentives, 0)),
      deductions: n(slips.reduce((a, s) => a + s.deductions + s.advance, 0)),
      net: n(slips.reduce((a, s) => a + s.net, 0)),
      unmarked: slips.reduce((a, s) => a + s.unmarked, 0),
    },
    accounts: accounts.map((a) => ({ value: a.id, label: a.name })),
  };
}

/** One payslip for printing. Staff may see their own; payroll viewers see their branches'. */
export async function getPayslip(user: CurrentUser, id: string) {
  const s = await db.payslip.findFirst({
    where: { id, payrollRun: { organizationId: user.organizationId } },
    include: {
      items: { orderBy: [{ type: "asc" }] },
      payrollRun: { include: { branch: true } },
      employee: { include: { designation: { select: { name: true } }, department: { select: { name: true } } } },
      incentiveLines: { select: { reason: true, amount: true } },
      moneyAccount: { select: { name: true } },
    },
  });
  if (!s) return null;
  const own = s.employee.userId === user.id;
  if (!own && !canAccessBranch(user.access, "payroll.view", s.payrollRun.branchId)) return null;
  if (s.payrollRun.status === "DRAFT" && own && !can(user.access, "payroll.view")) return null;
  return s;
}

export async function myEmployee(user: CurrentUser) {
  return db.employee.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      payslips: {
        where: { payrollRun: { status: { in: ["FINALIZED", "PAID"] } } },
        orderBy: [{ payrollRun: { year: "desc" } }, { payrollRun: { month: "desc" } }],
        take: 12,
        select: { id: true, netPay: true, payrollRun: { select: { year: true, month: true } } },
      },
    },
  });
}
