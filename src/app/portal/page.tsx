import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheckIcon, PrinterIcon } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatINR } from "@/lib/format";
import { requireUser } from "@/modules/auth/current";
import { portalOverview, portalStudent } from "@/modules/portal/portal.queries";

export const metadata: Metadata = { title: "My portal", robots: { index: false } };

const INST_TONE = { DUE: "sky", PARTIAL: "peach", PAID: "mint", WAIVED: "neutral" } as const;
const ENROLL = { ACTIVE: ["Studying", "mint"], ON_HOLD: ["On hold", "peach"], COMPLETED: ["Completed", "lavender"], DROPPED: ["Left", "neutral"] } as const;

/** Student portal: own fees, receipts, attendance, results, certificate and open jobs. Read-only. */
export default async function PortalPage() {
  const user = await requireUser();
  const student = await portalStudent(user.id);
  if (!student) redirect("/admin");
  const { enrollments, jobs } = await portalOverview(student.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hi, {student.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          Student ID {student.studentCode} · {student.branch.name}
          {student.branch.phone ? ` · questions? call ${student.branch.phone}` : ""}
        </p>
      </div>

      {enrollments.map((e) => (
        <Card key={e.id}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{e.course}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {e.branch} · joined {formatDate(e.enrolledAt)}
                {e.batch ? ` · ${e.batch}` : ""}
              </p>
            </div>
            <StatusBadge tone={ENROLL[e.status][1]}>{ENROLL[e.status][0]}</StatusBadge>
          </CardHeader>
          <CardContent className="space-y-6">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                ["Course fee", formatINR(e.netFee)],
                ["Paid", formatINR(e.paid)],
                ["Balance", formatINR(e.due)],
                ["Attendance", e.attendancePct === null ? "—" : `${e.attendancePct}% (${e.sessions} classes)`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted/50 p-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>

            <section>
              <h2 className="mb-2 text-sm font-medium">Fee instalments</h2>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Instalment</TableHead>
                      <TableHead>Due on</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {e.instalments.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.label}</TableCell>
                        <TableCell>{formatDate(i.dueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatINR(i.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatINR(i.paid)}</TableCell>
                        <TableCell>
                          <StatusBadge tone={INST_TONE[i.status]}>{i.status.toLowerCase()}</StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Pay at the front office. Online payment isn&apos;t available yet.</p>
            </section>

            {e.receipts.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-medium">Receipts</h2>
                <ul className="divide-y rounded-lg border text-sm">
                  {e.receipts.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span>
                        <span className="font-mono text-xs">{r.number}</span> · {formatDate(r.date)} · {r.mode}
                      </span>
                      <span className="flex items-center gap-3 tabular-nums">
                        {formatINR(r.amount)}
                        <Link href={`/print/fee-receipt/${r.id}`} target="_blank" aria-label={`Print receipt ${r.number}`} className="text-muted-foreground hover:text-foreground">
                          <PrinterIcon className="size-4" />
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="mb-2 text-sm font-medium">
                Results{e.overall !== null ? ` · overall ${e.overall}%` : ""}
              </h2>
              {e.results.length === 0 ? (
                <p className="text-sm text-muted-foreground">No marks yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border text-sm">
                  {e.results.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2 px-3 py-2">
                      <span>
                        {r.title} <span className="text-xs text-muted-foreground">· {r.type} · {formatDate(r.date)}</span>
                      </span>
                      <span className="tabular-nums">
                        {r.isAbsent ? (
                          <StatusBadge tone="neutral">absent</StatusBadge>
                        ) : (
                          <>
                            {r.marks}/{r.maxMarks}{" "}
                            {r.marks !== null && (r.marks >= r.passMarks ? <StatusBadge tone="mint">pass</StatusBadge> : <StatusBadge tone="danger">fail</StatusBadge>)}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {e.certificate && (
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-mint p-4 text-mint-foreground">
                <span className="flex items-center gap-2 text-sm">
                  <BadgeCheckIcon className="size-5" />
                  Certificate {e.certificate.number}
                  {e.certificate.grade ? ` · grade ${e.certificate.grade}` : ""} · {formatDate(e.certificate.issuedAt)}
                </span>
                <span className="flex gap-3 text-sm">
                  <Link href={`/print/certificate/${e.certificate.id}`} target="_blank" className="underline">
                    Print / save
                  </Link>
                  <Link href={`/verify/${e.certificate.verifyCode}`} target="_blank" className="underline">
                    Verification page
                  </Link>
                </span>
              </section>
            )}

            {e.applications.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-medium">My placement applications</h2>
                <ul className="divide-y rounded-lg border text-sm">
                  {e.applications.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2 px-3 py-2">
                      <span>
                        {a.company} · {a.role}
                      </span>
                      <StatusBadge tone={a.offer && a.offer.joiningStatus !== "DECLINED" ? "mint" : "sky"}>
                        {a.offer ? `offer: ${a.offer.designation}` : a.status.toLowerCase().replace("_", " ")}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Job openings</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open placement drives for your course right now.</p>
          ) : (
            <>
              <ul className="divide-y text-sm">
                {jobs.map((j) => (
                  <li key={j.id} className="py-2">
                    <div className="font-medium">
                      {j.role} · {j.company}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        j.location,
                        j.salaryMin !== null || j.salaryMax !== null
                          ? [j.salaryMin, j.salaryMax].filter((x) => x !== null).map((x) => formatINR(x!)).join(" – ") + " / month"
                          : null,
                        j.driveDate ? `drive on ${formatDate(j.driveDate)}` : null,
                        j.lastDate ? `apply by ${formatDate(j.lastDate)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Interested? Tell the placement officer at your branch.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
