import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import { attendancePercent } from "@/modules/fees/fee-logic";
import { branchConstraint, canAccessBranch, scopeOf } from "@/modules/rbac/access";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Students the user may see: branch scope; trainers (OWN) see students in their own batches. */
export function studentScopeWhere(user: CurrentUser, activeBranchId: string | null): Prisma.StudentWhereInput {
  const c = branchConstraint(user.access, "students.view", activeBranchId);
  const base: Prisma.StudentWhereInput = { organizationId: user.organizationId, deletedAt: null };
  if (c.ownOnly) return { ...base, enrollments: { some: { batch: { trainerId: user.id }, deletedAt: null } } };
  if (!c.branchIds) return base;
  return {
    ...base,
    OR: [{ branchId: { in: c.branchIds } }, { enrollments: { some: { branchId: { in: c.branchIds } } } }],
  };
}

export async function findStudentByPhone(user: CurrentUser, phone: string) {
  const s = await db.student.findFirst({
    where: { organizationId: user.organizationId, phone, deletedAt: null },
    include: { enrollments: { where: { deletedAt: null }, include: { course: { select: { name: true } } } } },
  });
  if (!s) return null;
  return {
    id: s.id,
    studentCode: s.studentCode,
    details: {
      name: s.name,
      phone: s.phone,
      altPhone: s.altPhone ?? "",
      email: s.email ?? "",
      dob: s.dob ? s.dob.toISOString().slice(0, 10) : "",
      gender: s.gender,
      guardianName: s.guardianName ?? "",
      guardianPhone: s.guardianPhone ?? "",
      address: s.address ?? "",
      city: s.city ?? "",
      state: s.state ?? "",
      pincode: s.pincode ?? "",
      qualification: s.qualification ?? "",
    },
    courses: s.enrollments.map((e) => `${e.course.name} (${e.status.toLowerCase()})`),
  };
}

export async function listStudents(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const f = p.filters;
  const enrollmentFilter: Prisma.EnrollmentWhereInput = {
    deletedAt: null,
    ...(f.course ? { courseId: f.course } : {}),
    ...(f.batch ? { batchId: f.batch } : {}),
    ...(f.status ? { status: f.status as never } : {}),
  };
  const hasEnrollmentFilter = !!(f.course || f.batch || f.status);
  const where: Prisma.StudentWhereInput = {
    AND: [
      studentScopeWhere(user, activeBranchId),
      hasEnrollmentFilter ? { enrollments: { some: enrollmentFilter } } : {},
      p.q
        ? {
            OR: [
              { name: { contains: p.q, mode: "insensitive" } },
              { phone: { contains: p.q } },
              { studentCode: { contains: p.q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
  const [rows, total] = await Promise.all([
    db.student.findMany({
      where,
      include: {
        branch: { select: { code: true } },
        enrollments: {
          where: { deletedAt: null },
          include: {
            course: { select: { code: true } },
            batch: { select: { name: true } },
            installments: { select: { amount: true, paidAmount: true, status: true, dueDate: true } },
          },
          orderBy: { enrolledAt: "desc" },
        },
      },
      orderBy: p.sort === "name" ? { name: p.dir } : { createdAt: "desc" },
      ...paging(p),
    }),
    db.student.count({ where }),
  ]);
  const today = istDateOnly(new Date()).getTime();
  return {
    total,
    rows: rows.map((s) => {
      const open = s.enrollments
        .flatMap((e) => e.installments)
        .filter((i) => i.status === "DUE" || i.status === "PARTIAL");
      const due = open.reduce((a, i) => a + Number(i.amount) - Number(i.paidAmount), 0);
      const overdue = open
        .filter((i) => i.dueDate.getTime() < today)
        .reduce((a, i) => a + Number(i.amount) - Number(i.paidAmount), 0);
      const current = s.enrollments[0];
      return {
        id: s.id,
        studentCode: s.studentCode,
        name: s.name,
        phone: s.phone,
        branchCode: s.branch.code,
        course: current ? current.course.code : null,
        batch: current?.batch?.name ?? null,
        status: current?.status ?? null,
        due: r2(due),
        overdue: r2(overdue),
      };
    }),
  };
}
export type StudentRow = Awaited<ReturnType<typeof listStudents>>["rows"][number];

export async function getStudent(user: CurrentUser, id: string) {
  const s = await db.student.findFirst({
    where: { AND: [{ id }, studentScopeWhere(user, null)] },
    include: {
      branch: { select: { id: true, name: true } },
      photo: { select: { id: true } },
      enrollments: {
        where: { deletedAt: null },
        include: {
          course: { select: { id: true, name: true, code: true } },
          batch: { select: { id: true, name: true, timing: true } },
          branch: { select: { id: true, name: true, code: true } },
          installments: { orderBy: { sequence: "asc" } },
          payments: {
            include: {
              paymentMode: { select: { name: true } },
              collectedBy: { select: { name: true } },
              branch: { select: { code: true } },
            },
            orderBy: { paidAt: "asc" },
          },
          refunds: {
            include: { requestedBy: { select: { name: true } }, approvedBy: { select: { name: true } } },
            orderBy: { createdAt: "asc" },
          },
          discountRequests: {
            include: { requestedBy: { select: { name: true } }, decidedBy: { select: { name: true } } },
            orderBy: { createdAt: "asc" },
          },
          transfers: {
            include: {
              fromBranch: { select: { code: true } },
              toBranch: { select: { code: true } },
              transferredBy: { select: { name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          attendance: { select: { status: true } },
        },
        orderBy: { enrolledAt: "desc" },
      },
    },
  });
  if (!s) return null;
  const today = istDateOnly(new Date()).getTime();
  return {
    student: s,
    enrollments: s.enrollments.map((e) => {
      const received = e.payments.filter((p) => !p.cancelledAt).reduce((a, p) => a + Number(p.amount), 0);
      const refunded = e.refunds.filter((r) => r.paidAt).reduce((a, r) => a + Number(r.amount), 0);
      const open = e.installments.filter((i) => i.status === "DUE" || i.status === "PARTIAL");
      const due = open.reduce((a, i) => a + Number(i.amount) - Number(i.paidAmount), 0);
      const pendingRefunds = e.refunds
        .filter((r) => r.status === "PENDING" || (r.status === "APPROVED" && !r.paidAt))
        .reduce((a, r) => a + Number(r.amount), 0);
      return {
        e,
        received: r2(received),
        refunded: r2(refunded),
        due: r2(due),
        overdue: r2(
          open
            .filter((i) => i.dueDate.getTime() < today)
            .reduce((a, i) => a + Number(i.amount) - Number(i.paidAmount), 0),
        ),
        refundable: r2(received - refunded - pendingRefunds),
        attendance: attendancePercent(e.attendance.map((a) => a.status)),
        sessions: e.attendance.length,
        pendingDiscount: e.discountRequests.some((d) => d.status === "PENDING"),
        inBranch: (perm: Parameters<typeof canAccessBranch>[1]) => canAccessBranch(user.access, perm, e.branchId),
      };
    }),
  };
}

/** Options for the admission form. */
export async function admissionBranches(user: CurrentUser, selectable: { id: string; name: string }[]) {
  const ids = selectable.map((b) => b.id);
  const branches = await db.branch.findMany({
    where: { id: { in: ids }, kind: { in: ["INSTITUTE", "BOTH"] } },
    select: { id: true, name: true },
  });
  return branches.filter((b) => canAccessBranch(user.access, "students.create", b.id));
}

// ---------------------------------------------------------------- fee lists

export async function listFeePayments(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const c = branchConstraint(user.access, "fees.view", activeBranchId);
  const where: Prisma.FeePaymentWhereInput = {
    organizationId: user.organizationId,
    ...(c.branchIds ? { branchId: { in: c.branchIds } } : {}),
    ...(p.filters.status === "cancelled"
      ? { cancelledAt: { not: null } }
      : p.filters.status === "all"
        ? {}
        : { cancelledAt: null }),
    ...(p.q
      ? {
          OR: [
            { receiptNo: { contains: p.q, mode: "insensitive" } },
            { enrollment: { student: { name: { contains: p.q, mode: "insensitive" } } } },
            { enrollment: { student: { phone: { contains: p.q } } } },
            { enrollment: { student: { studentCode: { contains: p.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [rows, total, sum] = await Promise.all([
    db.feePayment.findMany({
      where,
      include: {
        enrollment: {
          select: {
            student: { select: { id: true, name: true, studentCode: true } },
            course: { select: { code: true } },
          },
        },
        paymentMode: { select: { name: true } },
        collectedBy: { select: { name: true } },
        branch: { select: { code: true } },
      },
      orderBy: { paidAt: "desc" },
      ...paging(p),
    }),
    db.feePayment.count({ where }),
    db.feePayment.aggregate({ where: { ...where, cancelledAt: null }, _sum: { amount: true } }),
  ]);
  return {
    total,
    sum: Number(sum._sum.amount ?? 0),
    rows: rows.map((r) => ({
      id: r.id,
      receiptNo: r.receiptNo,
      paidAt: r.paidAt.toISOString(),
      studentId: r.enrollment.student.id,
      student: r.enrollment.student.name,
      studentCode: r.enrollment.student.studentCode,
      course: r.enrollment.course.code,
      amount: Number(r.amount),
      mode: r.paymentMode.name,
      reference: r.reference,
      by: r.collectedBy.name,
      branchCode: r.branch.code,
      cancelled: !!r.cancelledAt,
      cancelReason: r.cancelReason,
    })),
  };
}
export type FeePaymentRow = Awaited<ReturnType<typeof listFeePayments>>["rows"][number];

/** Unpaid instalments (overdue first). Filter "overdue" / "week" (due within 7 days) / "all". */
export async function listDues(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const c = branchConstraint(user.access, "fees.view", activeBranchId);
  const today = istDateOnly(new Date());
  const when = p.filters.when ?? "overdue";
  const where: Prisma.FeeInstallmentWhereInput = {
    status: { in: ["DUE", "PARTIAL"] },
    enrollment: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: { in: ["ACTIVE", "ON_HOLD", "COMPLETED"] },
      ...(c.branchIds ? { branchId: { in: c.branchIds } } : {}),
      ...(p.filters.course ? { courseId: p.filters.course } : {}),
      ...(p.q
        ? {
            student: {
              OR: [
                { name: { contains: p.q, mode: "insensitive" } },
                { phone: { contains: p.q } },
                { studentCode: { contains: p.q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    ...(when === "overdue"
      ? { dueDate: { lt: today } }
      : when === "week"
        ? { dueDate: { lt: new Date(today.getTime() + 8 * 86_400_000) } }
        : {}),
  };
  const [rows, total, all] = await Promise.all([
    db.feeInstallment.findMany({
      where,
      include: {
        enrollment: {
          select: {
            id: true,
            student: { select: { id: true, name: true, phone: true, studentCode: true } },
            course: { select: { code: true } },
            branch: { select: { code: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
      ...paging(p),
    }),
    db.feeInstallment.count({ where }),
    db.feeInstallment.findMany({ where, select: { amount: true, paidAmount: true } }),
  ]);
  return {
    total,
    sum: r2(all.reduce((a, i) => a + Number(i.amount) - Number(i.paidAmount), 0)),
    rows: rows.map((i) => ({
      id: i.id,
      enrollmentId: i.enrollment.id,
      studentId: i.enrollment.student.id,
      student: i.enrollment.student.name,
      phone: i.enrollment.student.phone,
      studentCode: i.enrollment.student.studentCode,
      course: i.enrollment.course.code,
      branchCode: i.enrollment.branch.code,
      label: i.label,
      dueDate: i.dueDate.toISOString(),
      due: r2(Number(i.amount) - Number(i.paidAmount)),
      overdueDays: Math.max(0, Math.floor((today.getTime() - i.dueDate.getTime()) / 86_400_000)),
    })),
  };
}
export type DueRow = Awaited<ReturnType<typeof listDues>>["rows"][number];

/** Pending discount requests and refunds the user may decide on (plus approved refunds to pay out). */
export async function listApprovals(user: CurrentUser) {
  const dc = branchConstraint(user.access, "fees.discount_approve", null);
  const rc = branchConstraint(user.access, "fees.refund_approve", null);
  const pc = branchConstraint(user.access, "fees.collect", null);
  const studentSel = { select: { id: true, name: true, studentCode: true } };
  const [discounts, refunds, toPay] = await Promise.all([
    scopeOf(user.access, "fees.discount_approve")
      ? db.discountRequest.findMany({
          where: {
            organizationId: user.organizationId,
            status: "PENDING",
            ...(dc.branchIds ? { branchId: { in: dc.branchIds } } : {}),
          },
          include: {
            enrollment: {
              select: {
                courseFee: true,
                discountAmount: true,
                student: studentSel,
                course: { select: { code: true } },
              },
            },
            requestedBy: { select: { id: true, name: true } },
            branch: { select: { code: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    scopeOf(user.access, "fees.refund_approve")
      ? db.feeRefund.findMany({
          where: {
            organizationId: user.organizationId,
            status: "PENDING",
            ...(rc.branchIds ? { branchId: { in: rc.branchIds } } : {}),
          },
          include: {
            enrollment: { select: { student: studentSel, course: { select: { code: true } } } },
            requestedBy: { select: { id: true, name: true } },
            branch: { select: { code: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    scopeOf(user.access, "fees.collect")
      ? db.feeRefund.findMany({
          where: {
            organizationId: user.organizationId,
            status: "APPROVED",
            paidAt: null,
            ...(pc.branchIds ? { branchId: { in: pc.branchIds } } : {}),
          },
          include: {
            enrollment: { select: { student: studentSel, course: { select: { code: true } } } },
            branch: { select: { id: true, code: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);
  return { discounts, refunds, toPay };
}
