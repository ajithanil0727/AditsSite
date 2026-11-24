import type { Metadata } from "next";
import { FileTextIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDate, formatINR } from "@/lib/format";
import { istDateOnly } from "@/lib/fy";
import { requirePagePermission } from "@/modules/auth/current";
import { employeeFormOptions, getEmployee } from "@/modules/hr/hr.queries";
import { employeeMonthSummary } from "@/modules/hr/staff-register";
import { EMPLOYEE_STATUS_LABELS, MONTHS } from "@/modules/hr/hr.schemas";
import { can, canAccessBranch } from "@/modules/rbac/access";
import { EmployeeFormDialog } from "../employee-form";
import { AdvanceDialog, DocumentUpload, SalaryDialog } from "./employee-dialogs";

export const metadata: Metadata = { title: "Employee" };

const LEAVE_TONE = { PENDING: "peach", APPROVED: "mint", REJECTED: "danger", CANCELLED: "neutral" } as const;

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="break-words">{v || "—"}</dd>
    </>
  );
}

export default async function EmployeePage(props: PageProps<"/admin/hr/employees/[id]">) {
  const user = await requirePagePermission("employees.view");
  const { id } = await props.params;
  const e = await getEmployee(user, id);
  if (!e) notFound();
  const today = istDateOnly(new Date()).toISOString().slice(0, 10);
  const month = await employeeMonthSummary(user, e.id);
  const canEdit = canAccessBranch(user.access, "employees.update", e.branch.id) && !e.deleted;
  const canPay = canAccessBranch(user.access, "payroll.run", e.branch.id);
  const canAdvance = canAccessBranch(user.access, "advances.manage", e.branch.id);
  const [options, components, accounts] = await Promise.all([
    canEdit ? employeeFormOptions(user) : Promise.resolve(null),
    canPay
      ? db.salaryComponent.findMany({
          where: { organizationId: user.organizationId, isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    canAdvance
      ? db.moneyAccount.findMany({ where: { branchId: e.branch.id, isActive: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);
  const current = e.salaries?.[0];
  return (
    <>
      <PageHeader
        title={e.name}
        description={`${e.code} · ${e.designation ?? "Staff"} · ${e.branch.name} · joined ${formatDate(e.joinDate)}`}
        actions={
          canEdit &&
          options && (
            <EmployeeFormDialog
              options={options}
              initial={e.form}
              today={today}
              sensitive={can(user.access, "employees.view_sensitive")}
              trigger={
                <Button variant="outline">
                  <PencilIcon /> Edit
                </Button>
              }
            />
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Details</CardTitle>
            <StatusBadge tone={e.status === "ACTIVE" ? "mint" : e.status === "ON_NOTICE" ? "peach" : "neutral"}>
              {EMPLOYEE_STATUS_LABELS[e.status]}
            </StatusBadge>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <Row k="Phone" v={e.phone} />
              <Row k="Email" v={e.email} />
              <Row k="Department" v={e.department} />
              <Row
                k="Reports to"
                v={
                  e.manager ? (
                    <Link href={`/admin/hr/employees/${e.manager.id}`} className="hover:underline">
                      {e.manager.name}
                    </Link>
                  ) : null
                }
              />
              <Row k="Shift" v={e.shift} />
              <Row k="Login" v={e.login} />
              <Row k="Date of birth" v={e.dob ? formatDate(e.dob) : null} />
              <Row k="Address" v={e.address} />
              {e.exitDate && <Row k="Last working day" v={formatDate(e.exitDate)} />}
              {e.sensitive && (
                <>
                  <Row k="PAN" v={e.sensitive.pan} />
                  <Row
                    k="Bank"
                    v={[e.sensitive.bankName, e.sensitive.bankAccountNo, e.sensitive.ifsc].filter(Boolean).join(" · ")}
                  />
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        {e.salaries && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Salary</CardTitle>
              {canPay && components.length > 0 && (
                <SalaryDialog
                  employeeId={e.id}
                  components={components.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
                  current={current?.items.map((i) => ({ componentId: i.componentId, amount: i.amount })) ?? []}
                  today={today}
                />
              )}
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {!current ? (
                <p className="text-muted-foreground">No salary set yet. Payroll skips employees without one.</p>
              ) : (
                <>
                  <p>
                    <span className="text-2xl font-semibold tabular-nums">{formatINR(current.gross)}</span>{" "}
                    <span className="text-muted-foreground">a month from {formatDate(current.from)}</span>
                  </p>
                  <ul className="grid gap-1">
                    {current.items.map((i) => (
                      <li key={i.componentId} className="flex justify-between">
                        <span>
                          {i.label}
                          {i.type === "DEDUCTION" ? " (deduction)" : ""}
                        </span>
                        <span className="tabular-nums">{formatINR(i.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  {e.salaries.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Earlier:{" "}
                      {e.salaries
                        .slice(1)
                        .map((s) => `${formatINR(s.gross)} from ${formatDate(s.from)}`)
                        .join(" · ")}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {month && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Attendance · {month.period.label}</CardTitle>
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/hr/attendance-register?branch=${month.branchId}&month=${month.period.month}`}>
                  Register
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
                {(
                  [
                    ["Present", month.summary.present],
                    ["Half days", month.summary.halfDays],
                    ["Absent", month.summary.absent],
                    ["Leave", month.summary.paidLeave + month.summary.unpaidLeave],
                    ["Not marked", month.summary.unmarked],
                    ["Paid days so far", month.summary.paidDays],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-muted/50 p-2">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {month.summary.lopDays > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">{month.summary.lopDays} loss-of-pay day(s) so far.</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Leave this year</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/hr/leave">Leave requests</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="grid gap-1">
              {e.leave.map((l) => (
                <div key={l.id} className="flex justify-between">
                  <span>
                    {l.name}
                    {l.isPaid ? "" : " (unpaid)"}
                  </span>
                  <span className="tabular-nums">
                    {l.isPaid ? `${l.left} of ${l.allotted} left` : `${l.used} taken`}
                  </span>
                </div>
              ))}
            </div>
            {e.leaveRequests.length > 0 && (
              <ul className="grid gap-1 border-t pt-3">
                {e.leaveRequests.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span>
                      {r.type} · {formatDate(r.from)}
                      {r.to !== r.from ? ` – ${formatDate(r.to)}` : ""} ({r.days}d)
                    </span>
                    <StatusBadge tone={LEAVE_TONE[r.status as keyof typeof LEAVE_TONE] ?? "neutral"}>
                      {r.status.toLowerCase()}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {e.advances && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Salary advances</CardTitle>
              {canAdvance && !e.deleted && (
                <AdvanceDialog
                  employeeId={e.id}
                  accounts={accounts.map((a) => ({ value: a.id, label: a.name }))}
                  today={today}
                />
              )}
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {e.advances.length === 0 && <p className="text-muted-foreground">None.</p>}
              {e.advances.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2">
                  <span>
                    {formatINR(a.amount)} on {formatDate(a.givenAt)}
                    <span className="block text-xs text-muted-foreground">
                      {formatINR(a.monthlyRecovery)}/month · recovered {formatINR(a.recovered)}
                    </span>
                  </span>
                  <StatusBadge tone={a.status === "OPEN" ? "peach" : "mint"}>
                    {a.status === "OPEN" ? "Recovering" : "Cleared"}
                  </StatusBadge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {e.payslips && (
          <Card>
            <CardHeader>
              <CardTitle>Payslips</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {e.payslips.length === 0 && <p className="text-muted-foreground">None yet.</p>}
              {e.payslips.map((s) => (
                <div key={s.id} className="flex items-center justify-between">
                  <Link href={`/print/payslip/${s.id}`} target="_blank" className="hover:underline">
                    {MONTHS[s.month - 1]} {s.year}
                  </Link>
                  <span className="tabular-nums">
                    {formatINR(s.net)}{" "}
                    <span className="text-xs text-muted-foreground">{s.paidAt ? "paid" : s.status.toLowerCase()}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {e.documents.length === 0 && <p className="text-muted-foreground">No documents.</p>}
            {e.documents.map((d) => (
              <a
                key={d.id}
                href={`/api/files/${d.fileId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:underline"
              >
                <FileTextIcon className="size-4" /> {d.label ?? d.name}
                <span className="text-xs text-muted-foreground">{formatDate(d.at)}</span>
              </a>
            ))}
            {canEdit && <DocumentUpload employeeId={e.id} />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
