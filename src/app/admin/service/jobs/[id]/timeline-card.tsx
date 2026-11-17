"use client";

import { SwitchField, TextareaField } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { StatusBadge, toTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { addNoteAction } from "@/modules/service/jobs.actions";
import { noteSchema } from "@/modules/service/service.schemas";

type Event =
  | { type: "status"; id: string; status: string; tone: string | null; by: string; note: string | null; at: string }
  | { type: "note"; id: string; note: string; by: string; at: string; customerVisible: boolean };

export function TimelineCard({
  jobId,
  history,
  notes,
}: {
  jobId: string;
  history: { id: string; status: string; tone: string | null; by: string; note: string | null; at: string }[];
  notes: { id: string; note: string; by: string; at: string; customerVisible: boolean }[];
}) {
  const events: Event[] = [
    ...history.map((h) => ({ type: "status" as const, ...h })),
    ...notes.map((n) => ({ type: "note" as const, ...n })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Timeline</CardTitle>
        <FormDialog
          trigger={
            <Button size="sm" variant="outline">
              Add note
            </Button>
          }
          title="Add a note"
          schema={noteSchema}
          defaultValues={{ jobId, note: "", customerVisible: false }}
          action={addNoteAction}
          successMessage="Note added"
        >
          {(form) => (
            <>
              <TextareaField control={form.control} name="note" label="Note" rows={4} />
              <SwitchField
                control={form.control}
                name="customerVisible"
                label="Show on the customer's repair tracker"
              />
            </>
          )}
        </FormDialog>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-4 border-l pl-5">
          {events.map((e) => (
            <li key={`${e.type}-${e.id}`} className="relative">
              <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-primary" aria-hidden />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {e.type === "status" ? (
                  <StatusBadge tone={toTone(e.tone)}>{e.status}</StatusBadge>
                ) : (
                  <span className="font-medium">
                    Note
                    {e.customerVisible && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">(customer can see)</span>
                    )}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(e.at)} · {e.by}
                </span>
              </div>
              {e.note && <p className="mt-1 text-sm whitespace-pre-wrap">{e.note}</p>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
