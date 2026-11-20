import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { istDateOnly } from "@/lib/fy";
import { assessmentTypeOptions, getAssessmentSheet } from "@/modules/academics/academics.queries";
import { requirePagePermission } from "@/modules/auth/current";
import { AssessmentDialog, DeleteAssessmentButton } from "../../batches/[id]/batch-assessments";
import { MarksSheet } from "./marks-sheet";

export const metadata: Metadata = { title: "Assessment" };

export default async function AssessmentPage(props: PageProps<"/admin/assessments/[id]">) {
  const user = await requirePagePermission("assessments.view");
  const { id } = await props.params;
  const a = await getAssessmentSheet(user, id);
  if (!a) notFound();
  const today = istDateOnly(new Date()).toISOString().slice(0, 10);
  const types = a.canManage ? await assessmentTypeOptions(user.organizationId) : [];
  const held = a.date <= today;

  return (
    <>
      <PageHeader
        title={a.title}
        description={`${a.type} · ${formatDate(a.date)} · out of ${a.maxMarks} (pass ${a.passMarks}) · ${a.batch.name} · ${a.batch.course} · ${a.batch.branch}`}
        actions={
          a.canManage && (
            <>
              <AssessmentDialog
                batchId={a.batch.id}
                types={types}
                today={today}
                initial={{
                  id: a.id,
                  batchId: a.batch.id,
                  typeId: a.typeId,
                  title: a.title,
                  date: a.date,
                  maxMarks: a.maxMarks,
                  passMarks: a.passMarks,
                }}
                trigger={
                  <Button variant="outline">
                    <PencilIcon /> Edit
                  </Button>
                }
              />
              <DeleteAssessmentButton id={a.id} />
            </>
          )
        }
      />
      <p className="mb-4 text-sm">
        <Link href={`/admin/batches/${a.batch.id}`} className="text-muted-foreground underline hover:text-foreground">
          Back to {a.batch.name}
        </Link>
      </p>
      {!held && (
        <p className="mb-4 rounded-md bg-sky px-3 py-2 text-sm text-sky-foreground">
          Marks can be entered from {formatDate(a.date)}.
        </p>
      )}
      <MarksSheet
        assessmentId={a.id}
        maxMarks={a.maxMarks}
        passMarks={a.passMarks}
        editable={a.canEnter && held}
        students={a.students}
      />
    </>
  );
}
