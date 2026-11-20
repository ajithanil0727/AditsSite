"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { FormDialog } from "@/components/forms/form-dialog";
import { SwitchField, TextField } from "@/components/forms/fields";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveCompanyAction } from "@/modules/placements/placements.actions";
import type { CompanyRow } from "@/modules/placements/placements.queries";
import { companySchema, type CompanyInput } from "@/modules/placements/placements.schemas";

const EMPTY: CompanyInput = {
  name: "",
  industry: "",
  website: "",
  city: "",
  address: "",
  isActive: true,
  contacts: [],
};

export function CompanyDialog({ initial, trigger }: { initial?: CompanyInput; trigger?: React.ReactNode }) {
  return (
    <FormDialog
      trigger={
        trigger ?? (
          <Button>
            <PlusIcon /> New company
          </Button>
        )
      }
      title={initial ? "Edit company" : "New company"}
      description="Logo and showing it on the website are set in Website → Content → Hiring companies."
      schema={companySchema}
      defaultValues={initial ?? EMPTY}
      action={saveCompanyAction}
      successMessage="Company saved"
      wide
    >
      {(form) => <CompanyFields form={form} />}
    </FormDialog>
  );
}

function CompanyFields({ form }: { form: UseFormReturn<CompanyInput, unknown, unknown> }) {
  const contacts = useFieldArray({ control: form.control, name: "contacts" });
  return (
    <>
      <TextField control={form.control} name="name" label="Name" />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          control={form.control}
          name="industry"
          label="Industry"
          placeholder="Mobile service, Laptop retail…"
        />
        <TextField control={form.control} name="city" label="City" />
      </div>
      <TextField control={form.control} name="website" label="Website" placeholder="https://" />
      <TextField control={form.control} name="address" label="Address" />
      <SwitchField control={form.control} name="isActive" label="Active (can get new drives)" />
      <div className="space-y-2">
        <div className="text-sm font-medium">Contacts</div>
        {contacts.fields.map((f, i) => (
          <div key={f.id} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <TextField control={form.control} name={`contacts.${i}.name`} label="Name" />
            <TextField control={form.control} name={`contacts.${i}.designation`} label="Designation" />
            <TextField control={form.control} name={`contacts.${i}.phone`} label="Phone" />
            <TextField control={form.control} name={`contacts.${i}.email`} label="Email" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove contact"
              onClick={() => contacts.remove(i)}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => contacts.append({ name: "", designation: "", phone: "", email: "" })}
        >
          <PlusIcon /> Add contact
        </Button>
      </div>
    </>
  );
}

export function CompaniesTable({ rows, canManage }: { rows: CompanyRow[]; canManage: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Contacts</TableHead>
            <TableHead className="text-right">Drives</TableHead>
            <TableHead className="text-right">Hired</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                No companies yet.
              </TableCell>
            </TableRow>
          )}
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <div className="font-medium">
                  {c.name} {!c.isActive && <StatusBadge tone="neutral">inactive</StatusBadge>}
                  {c.showOnWebsite && <StatusBadge tone="lavender">on website</StatusBadge>}
                </div>
                <div className="text-xs text-muted-foreground">{[c.industry, c.city].filter(Boolean).join(" · ")}</div>
              </TableCell>
              <TableCell className="text-sm">
                {c.contacts.length === 0
                  ? "—"
                  : c.contacts.map((x) => (
                      <div key={`${x.name}${x.phone}`}>
                        {x.name}
                        {x.designation ? ` (${x.designation})` : ""}
                        {x.phone ? ` · ${x.phone}` : ""}
                      </div>
                    ))}
              </TableCell>
              <TableCell className="text-right tabular-nums">{c.drives}</TableCell>
              <TableCell className="text-right tabular-nums">{c.hired}</TableCell>
              <TableCell className="text-right">
                {canManage && (
                  <CompanyDialog
                    initial={{
                      id: c.id,
                      name: c.name,
                      industry: c.industry ?? "",
                      website: c.website ?? "",
                      city: c.city ?? "",
                      address: c.address ?? "",
                      isActive: c.isActive,
                      contacts: c.contacts.map((x) => ({
                        name: x.name,
                        designation: x.designation ?? "",
                        phone: x.phone ?? "",
                        email: x.email ?? "",
                      })),
                    }}
                    trigger={
                      <Button size="xs" variant="ghost" aria-label={`Edit ${c.name}`}>
                        <PencilIcon />
                      </Button>
                    }
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
