"use client";

import { CheckCircle2Icon, DownloadIcon, UploadIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importAction } from "@/modules/imports/imports.actions";
import type { CheckResult } from "@/modules/imports/imports.service";

type Entity = { value: string; label: string; note: string };

export function ImportPanel({ entities }: { entities: Entity[] }) {
  const [entity, setEntity] = useState(entities[0]?.value ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const current = entities.find((e) => e.value === entity);

  const send = (mode: "check" | "import") =>
    start(async () => {
      if (!file) return;
      const fd = new FormData();
      fd.set("entity", entity);
      fd.set("file", file);
      fd.set("mode", mode);
      const r = await importAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.check) setCheck(r.data.check);
      if (r.data.imported !== undefined) {
        setDone(r.data.imported);
        setCheck(null);
        setFile(null);
        if (input.current) input.current.value = "";
        toast.success(`${r.data.imported} row(s) imported`);
      }
    });

  return (
    <div className="max-w-3xl space-y-6">
      <ol className="space-y-4">
        <li className="space-y-2">
          <div className="text-sm font-medium">1. What are you importing?</div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={entity}
              onValueChange={(v) => {
                setEntity(v);
                setCheck(null);
                setDone(null);
              }}
            >
              <SelectTrigger className="w-48" aria-label="What to import">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" asChild>
              <a href={`/api/imports/template/${entity}`}>
                <DownloadIcon /> Download the template
              </a>
            </Button>
          </div>
          {current && <p className="text-sm text-muted-foreground">{current.note}</p>}
        </li>
        <li className="space-y-2">
          <div className="text-sm font-medium">2. Fill it in Excel or Google Sheets (download as .xlsx), then upload it</div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              ref={input}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Filled template"
              className="max-w-xs"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setCheck(null);
                setDone(null);
              }}
            />
            <Button onClick={() => send("check")} disabled={!file || pending}>
              <UploadIcon /> {pending ? "Checking…" : "Check the file"}
            </Button>
          </div>
        </li>
      </ol>

      {check && (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="text-sm">
            <span className="font-medium">{check.total}</span> row(s) found · <span className="font-medium text-mint-foreground">{check.valid} ready</span>
            {check.errors.length > 0 && (
              <>
                {" "}
                · <span className="font-medium text-destructive">{check.errors.length} problem(s)</span>
              </>
            )}
          </div>
          {check.errors.length > 0 ? (
            <>
              <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm" aria-label="Problems">
                {check.errors.map((e, i) => (
                  <li key={i} className="px-3 py-1.5">
                    <span className="font-mono text-xs text-muted-foreground">Row {e.row}</span> {e.message}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">Fix these in the file and check it again. Nothing is imported until every row is right.</p>
            </>
          ) : (
            <Button onClick={() => send("import")} disabled={pending}>
              <CheckCircle2Icon /> {pending ? "Importing…" : `Import ${check.valid} row(s)`}
            </Button>
          )}
        </div>
      )}
      {done !== null && (
        <p role="status" className="rounded-md bg-mint px-3 py-2 text-sm text-mint-foreground">
          Imported {done} row(s).
        </p>
      )}
    </div>
  );
}
