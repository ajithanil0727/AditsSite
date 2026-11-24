import { z } from "zod";
import { indianPhone } from "@/lib/format";

const optText = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const optId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null);
export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optYmd = ymd
  .or(z.literal(""))
  .optional()
  .nullable()
  .transform((v) => v || null);
const money = z.coerce.number({ message: "Enter an amount" }).min(0, "Can't be negative").max(10_000_000);
const positive = z.coerce.number({ message: "Enter an amount" }).positive("Must be more than zero").max(10_000_000);

export const EMPLOYEE_STATUSES = ["ACTIVE", "ON_NOTICE", "EXITED"] as const;
export const EMPLOYEE_STATUS_LABELS: Record<(typeof EMPLOYEE_STATUSES)[number], string> = {
  ACTIVE: "Active",
  ON_NOTICE: "On notice",
  EXITED: "Left",
};

export const employeeSchema = z
  .object({
    id: z.string().optional(),
    branchId: z.string().min(1, "Select the branch"),
    name: z.string().trim().min(2, "Enter the name").max(100),
    phone: indianPhone,
    email: z
      .email("Enter a valid email")
      .or(z.literal(""))
      .optional()
      .nullable()
      .transform((v) => v || null),
    dob: optYmd,
    gender: z
      .enum(["MALE", "FEMALE", "OTHER"])
      .optional()
      .nullable()
      .transform((v) => v || null),
    address: optText(300),
    departmentId: optId,
    designationId: optId,
    managerId: optId,
    shiftId: optId,
    userId: optId,
    joinDate: ymd,
    exitDate: optYmd,
    status: z.enum(EMPLOYEE_STATUSES),
    // Sensitive (only saved when the user may see them)
    pan: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN")
      .or(z.literal(""))
      .optional()
      .nullable()
      .transform((v) => v || null),
    bankName: optText(80),
    bankAccountNo: z
      .string()
      .trim()
      .regex(/^[0-9]{6,20}$/, "Digits only")
      .or(z.literal(""))
      .optional()
      .nullable()
      .transform((v) => v || null),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC")
      .or(z.literal(""))
      .optional()
      .nullable()
      .transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.status === "EXITED" && !v.exitDate)
      ctx.addIssue({ code: "custom", path: ["exitDate"], message: "Enter the last working day" });
    if (v.exitDate && v.exitDate < v.joinDate)
      ctx.addIssue({ code: "custom", path: ["exitDate"], message: "Can't be before joining" });
  });
export type EmployeeInput = z.input<typeof employeeSchema>;

export const salaryStructureSchema = z.object({
  employeeId: z.string().min(1),
  effectiveFrom: ymd,
  items: z
    .array(z.object({ componentId: z.string().min(1), amount: money }))
    .max(30)
    .transform((list) => list.filter((i) => i.amount > 0)),
  notes: optText(200),
});
export type SalaryStructureInput = z.input<typeof salaryStructureSchema>;

export const STAFF_MARKS = ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "LEAVE"] as const;
export const STAFF_MARK_LABELS: Record<(typeof STAFF_MARKS)[number], string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  HALF_DAY: "Half day",
  LEAVE: "Leave",
};

export const staffAttendanceSchema = z.object({
  branchId: z.string().min(1),
  date: ymd,
  records: z
    .array(z.object({ employeeId: z.string().min(1), status: z.enum(STAFF_MARKS), note: optText(100) }))
    .min(1, "No staff to mark"),
});
export type StaffAttendanceInput = z.input<typeof staffAttendanceSchema>;

export const leaveRequestSchema = z
  .object({
    employeeId: z.string().min(1, "Select the employee"),
    leaveTypeId: z.string().min(1, "Select the leave type"),
    fromDate: ymd,
    toDate: ymd,
    reason: optText(300),
  })
  .refine((v) => v.toDate >= v.fromDate, { path: ["toDate"], message: "Must be on or after the start" });
export type LeaveRequestInput = z.input<typeof leaveRequestSchema>;

export const decisionSchema = z.object({ id: z.string().min(1), approve: z.boolean(), note: optText(300) });

export const holidaySchema = z.object({
  id: z.string().optional(),
  date: ymd,
  name: z.string().trim().min(2, "Name the holiday").max(80),
  branchId: optId, // null = all branches
});
export type HolidayInput = z.input<typeof holidaySchema>;

export const advanceSchema = z
  .object({
    employeeId: z.string().min(1),
    amount: positive,
    monthlyRecovery: positive,
    givenAt: ymd,
    moneyAccountId: z.string().min(1, "Select the account it's paid from"),
    note: optText(200),
  })
  .refine((v) => v.monthlyRecovery <= v.amount, {
    path: ["monthlyRecovery"],
    message: "Can't be more than the advance",
  });
export type AdvanceInput = z.input<typeof advanceSchema>;

export const incentiveSchema = z.object({
  employeeId: z.string().min(1, "Select the employee"),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  amount: positive,
  reason: z.string().trim().min(3, "What is it for?").max(200),
});
export type IncentiveInput = z.input<typeof incentiveSchema>;

export const payrollRunSchema = z.object({
  branchId: z.string().min(1, "Select the branch"),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type PayrollRunInput = z.input<typeof payrollRunSchema>;

export const payrollPaySchema = z.object({
  runId: z.string().min(1),
  moneyAccountId: z.string().min(1, "Select the account salaries are paid from"),
  paidOn: ymd,
});
export type PayrollPayInput = z.input<typeof payrollPaySchema>;

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
