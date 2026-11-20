"use client";

import Link from "next/link";
import { BadgeCheckIcon, Ban, PrinterIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { useFieldArray } from "react-hook-form";
import { FormDialog } from "@/components/forms/form-dialog";
import { TextareaField, TextField } from "@/components/forms/fields";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatINR } from "@/lib/format";
import {
  issueCertificateAction,
  revokeCertificateAction,
  saveCertificateRulesAction,
} from "@/modules/academics/academics.actions";
import type { CandidateRow, CertificateRow } from "@/modules/academics/academics.queries";
import {
  certificateRulesSchema,
  issueCertificateSchema,
  revokeCertificateSchema,
  type CertificateRulesInput,
} from "@/modules/academics/academics.schemas";

export function IssueDialog({
  row,
  today,
}: {
  row: { enrollmentId: string; student: string; course: string; grade: string | null };
  today: string;
}) {
  return (
    <FormDialog
      trigger={
        <Button size="xs">
          <BadgeCheckIcon /> Issue
        </Button>
      }
      title={`Certificate for ${row.student}`}
      description={`${row.course}${row.grade ? ` · grade ${row.grade}` : ""}. The number comes from the branch's certificate series and can't be reused.`}
      schema={issueCertificateSchema}
      defaultValues={{ enrollmentId: row.enrollmentId, issuedAt: today }}
      action={issueCertificateAction}
      submitLabel="Issue certificate"
      successMessage="Certificate issued"
    >
      {(form) => <TextField control={form.control} name="issuedAt" label="Issue date" type="date" />}
    </FormDialog>
  );
}

export function RevokeDialog({ id, number }: { id: string; number: string }) {
  return (
    <FormDialog
      trigger={
        <Button size="xs" variant="ghost" aria-label={`Cancel ${number}`}>
          <Ban /> Cancel
        </Button>
      }
      title={`Cancel ${number}?`}
      description="Verification will show it as cancelled. The number stays used. You can issue a new certificate afterwards."
      schema={revokeCertificateSchema}
      defaultValues={{ id, reason: "" }}
      action={revokeCertificateAction}
      submitLabel="Cancel certificate"
      destructive
      successMessage="Certificate cancelled"
    >
      {(form) => (
        <TextareaField control={form.control} name="reason" label="Why?" rows={2} placeholder="Name spelt wrong" />
      )}
    </FormDialog>
  );
}

export function RulesDialog({ rules }: { rules: CertificateRulesInput }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline">
          <SettingsIcon /> Rules
        </Button>
      }
      title="Certificate rules"
      description="A certificate needs: course completed, no fees due, overall % at or above the pass mark (average of all assessments) and enough attendance."
      schema={certificateRulesSchema}
      defaultValues={rules}
      action={saveCertificateRulesAction}
      successMessage="Rules saved"
    >
      {(form) => <RulesFields form={form} />}
    </FormDialog>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RulesFields({ form }: { form: any }) {
  const grades = useFieldArray({ control: form.control, name: "grades" });
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          control={form.control}
          name="minAttendance"
          label="Minimum attendance %"
          type="number"
          min={0}
          max={100}
        />
        <TextField
          control={form.control}
          name="passPercent"
          label="Pass mark (overall %)"
          type="number"
          min={0}
          max={100}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Grades (from this % upwards)</div>
        {grades.fields.map((f, i) => (
          <div key={f.id} className="flex items-end gap-2">
            <TextField control={form.control} name={`grades.${i}.grade`} label="Grade" />
            <TextField control={form.control} name={`grades.${i}.min`} label="From %" type="number" min={0} max={100} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove grade"
              onClick={() => grades.remove(i)}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => grades.append({ grade: "", min: 0 })}>
          <PlusIcon /> Add grade
        </Button>
      </div>
    </>
  );
}

export function CandidatesTable({ rows, today }: { rows: CandidateRow[]; today: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Course</TableHead>
            <TableHead className="text-right">Overall</TableHead>
            <TableHead className="text-right">Attendance</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                Nobody is waiting for a certificate. Students appear here once their course is marked completed.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.enrollmentId}>
              <TableCell>
                <Link href={`/admin/students/${r.studentId}`} className="font-medium hover:underline">
                  {r.student}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {r.studentCode} · {r.branchCode}
                  {r.completedAt ? ` · completed ${formatDate(r.completedAt)}` : ""}
                </div>
              </TableCell>
              <TableCell>{r.course}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.overall === null ? "—" : `${r.overall}%`}
                {r.grade && <span className="block text-xs text-muted-foreground">grade {r.grade}</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.attendancePct === null ? "—" : `${r.attendancePct}%`}
              </TableCell>
              <TableCell className="max-w-sm">
                {r.eligible ? (
                  r.canIssue ? (
                    <IssueDialog row={r} today={today} />
                  ) : (
                    <StatusBadge tone="mint">ready</StatusBadge>
                  )
                ) : (
                  <ul className="text-xs text-muted-foreground">
                    {r.duePaise > 0 && (
                      <li className="font-medium text-destructive">Due {formatINR(r.duePaise / 100)}</li>
                    )}
                    {r.problems
                      .filter((p) => !p.startsWith("Fees"))
                      .map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                  </ul>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function CertificatesTable({ rows, revokeBranchIds }: { rows: CertificateRow[]; revokeBranchIds: string[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Number</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Course</TableHead>
            <TableHead>Grade</TableHead>
            <TableHead>Issued</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                No certificates yet.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs">{r.number}</TableCell>
              <TableCell>
                <Link href={`/admin/students/${r.studentId}`} className="font-medium hover:underline">
                  {r.student}
                </Link>
                <div className="text-xs text-muted-foreground">{r.studentCode}</div>
              </TableCell>
              <TableCell>{r.course}</TableCell>
              <TableCell>
                {r.grade ?? "—"}
                {r.percentage !== null && <span className="ml-1 text-xs text-muted-foreground">({r.percentage}%)</span>}
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(r.issuedAt)}</TableCell>
              <TableCell>
                {r.status === "ISSUED" ? (
                  <StatusBadge tone="mint">valid</StatusBadge>
                ) : (
                  <StatusBadge tone="danger">cancelled</StatusBadge>
                )}
                {r.revokedReason && <div className="text-xs text-muted-foreground">{r.revokedReason}</div>}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="xs" variant="ghost" asChild>
                    <Link href={`/print/certificate/${r.id}`} target="_blank" aria-label={`Print ${r.number}`}>
                      <PrinterIcon />
                    </Link>
                  </Button>
                  {r.status === "ISSUED" && revokeBranchIds.includes(r.branchId) && (
                    <RevokeDialog id={r.id} number={r.number} />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
