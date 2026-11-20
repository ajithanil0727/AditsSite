import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/modules/auth/current";
import { myEmployee } from "@/modules/hr/hr.queries";
import { MONTHS } from "@/modules/hr/hr.schemas";
import { SCOPE_LABELS } from "@/modules/users/users.schemas";
import { formatINR } from "@/lib/format";
import Link from "next/link";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "My account" };

/** Every signed-in user: their own details, roles, branches, and a password change. */
export default async function AccountPage() {
  const user = await requireUser();
  const me = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      name: true,
      email: true,
      phone: true,
      lastLoginAt: true,
      roles: { select: { scope: true, role: { select: { name: true } } } },
      branches: { select: { branch: { select: { name: true } } }, orderBy: { branch: { sortOrder: "asc" } } },
    },
  });
  const employee = await myEmployee(user);
  const rows: [string, string][] = [
    ["Name", me.name],
    ["Email (sign-in)", me.email],
    ["Phone", me.phone ?? "—"],
    ["Roles", me.roles.map((r) => `${r.role.name} (${SCOPE_LABELS[r.scope].toLowerCase()})`).join(", ") || "—"],
    ["Branches", me.branches.map((b) => b.branch.name).join(", ") || "—"],
    ["Last sign-in", me.lastLoginAt ? formatDateTime(me.lastLoginAt) : "—"],
  ];
  return (
    <>
      <PageHeader
        title="My account"
        description="Your details and password. Ask an admin to change your name, roles or branches."
      />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              At least 8 characters with a letter and a number. Other devices are signed out; this one stays signed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
        {employee && (
          <Card>
            <CardHeader>
              <CardTitle>My payslips</CardTitle>
              <CardDescription>
                {employee.name} · {employee.employeeCode}. Apply for leave under HR → Leave.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {employee.payslips.length === 0 && <p className="text-muted-foreground">No payslips yet.</p>}
              {employee.payslips.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <Link href={`/print/payslip/${p.id}`} target="_blank" className="hover:underline">
                    {MONTHS[p.payrollRun.month - 1]} {p.payrollRun.year}
                  </Link>
                  <span className="tabular-nums">{formatINR(Number(p.netPay))}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
