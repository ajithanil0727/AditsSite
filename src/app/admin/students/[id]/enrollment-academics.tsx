"use client";

import Link from "next/link";
import { PrinterIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/format";
import { setPlacementOptOutAction } from "@/modules/academics/academics.actions";

type Academics = {
  enrollmentId: string;
  placementOptOut: boolean;
  results: {
    id: string;
    title: string;
    type: string;
    date: string;
    marks: number | null;
    maxMarks: number;
    passMarks: number;
    isAbsent: boolean;
  }[];
  overall: number | null;
  grade: string | null;
  eligible: boolean;
  problems: string[];
  certificates: { id: string; number: string; status: "ISSUED" | "REVOKED"; issuedAt: string; grade: string | null }[];
};

export function EnrollmentAcademics({
  a,
  canOptOut,
  canViewCertificates,
}: {
  a: Academics;
  canOptOut: boolean;
  canViewCertificates: boolean;
}) {
  const [pending, start] = useTransition();
  const issued = a.certificates.find((c) => c.status === "ISSUED");
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium">Assessments</div>
        <div className="text-sm text-muted-foreground">
          Overall {a.overall === null ? "—" : `${a.overall}%`}
          {a.grade && ` · grade ${a.grade}`}
        </div>
      </div>
      {a.results.length === 0 ? (
        <p className="text-sm text-muted-foreground">No marks yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {a.results.map((r) => (
            <li key={r.id} className="flex justify-between gap-2 py-1.5">
              <span>
                {r.title}{" "}
                <span className="text-xs text-muted-foreground">
                  · {r.type} · {formatDate(r.date)}
                </span>
              </span>
              <span className="tabular-nums">
                {r.isAbsent ? (
                  <StatusBadge tone="neutral">absent</StatusBadge>
                ) : (
                  <>
                    {r.marks}/{r.maxMarks}{" "}
                    {r.marks !== null && r.marks < r.passMarks && <StatusBadge tone="danger">fail</StatusBadge>}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {issued ? (
            <span className="flex items-center gap-2">
              Certificate <span className="font-mono text-xs">{issued.number}</span> · {formatDate(issued.issuedAt)}
              {canViewCertificates && (
                <Link
                  href={`/print/certificate/${issued.id}`}
                  target="_blank"
                  aria-label="Print certificate"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <PrinterIcon className="size-4" />
                </Link>
              )}
            </span>
          ) : a.eligible ? (
            <span className="text-mint-foreground">
              Ready for a certificate
              {canViewCertificates && (
                <>
                  {" "}
                  (
                  <Link href="/admin/certificates" className="underline">
                    Certificates
                  </Link>
                  )
                </>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Certificate: {a.problems.join(" ")}</span>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={!a.placementOptOut}
            disabled={!canOptOut || pending}
            aria-label="Wants placement help"
            onCheckedChange={(v) =>
              start(async () => {
                const res = await setPlacementOptOutAction({ enrollmentId: a.enrollmentId, optOut: !v });
                if (res.ok) toast.success(v ? "Placement help on" : "Opted out of placement");
                else toast.error(res.error);
              })
            }
          />
          Wants placement help
        </label>
      </div>
    </div>
  );
}
