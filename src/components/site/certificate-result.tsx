import { BadgeCheckIcon, CircleAlertIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

export type VerifiedCertificate = {
  number: string;
  status: "ISSUED" | "REVOKED";
  student: string;
  studentCode: string;
  course: string;
  branch: string;
  grade: string | null;
  issuedAt: string;
};

/** What the public sees when a certificate is checked. */
export function CertificateResult({ c }: { c: VerifiedCertificate }) {
  const valid = c.status === "ISSUED";
  return (
    <Card>
      <CardContent className="space-y-4">
        <div
          className={
            valid ? "flex items-center gap-2 text-mint-foreground" : "flex items-center gap-2 text-destructive"
          }
        >
          {valid ? <BadgeCheckIcon className="size-6" /> : <CircleAlertIcon className="size-6" />}
          <span className="text-lg font-semibold">
            {valid ? "Genuine certificate" : "This certificate was cancelled"}
          </span>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="font-medium">{c.student}</dd>
          <dt className="text-muted-foreground">Student ID</dt>
          <dd>{c.studentCode}</dd>
          <dt className="text-muted-foreground">Course</dt>
          <dd>{c.course}</dd>
          {c.grade && (
            <>
              <dt className="text-muted-foreground">Grade</dt>
              <dd>{c.grade}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Branch</dt>
          <dd>{c.branch}</dd>
          <dt className="text-muted-foreground">Certificate no.</dt>
          <dd className="font-mono">{c.number}</dd>
          <dt className="text-muted-foreground">Issued on</dt>
          <dd>{formatDate(c.issuedAt)}</dd>
        </dl>
        {!valid && (
          <p className="text-sm text-muted-foreground">Please contact us if you were given this certificate.</p>
        )}
      </CardContent>
    </Card>
  );
}
