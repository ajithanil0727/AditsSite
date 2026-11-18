"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, SearchIcon, Trash2Icon, UserCheckIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import type { CourseOption } from "@/modules/courses/courses.queries";
import { discountNeedsApproval, scheduleFromPlan } from "@/modules/fees/fee-logic";
import { admitAction, findStudentAction } from "@/modules/students/students.actions";
import { admissionSchema, type AdmissionInput } from "@/modules/students/students.schemas";

type Opt = { value: string; label: string };
const paise = (v: unknown) => Math.round(Number(v || 0) * 100);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function AdmissionForm({
  branches,
  defaultBranchId,
  courses,
  batches,
  payment,
  today,
  limits,
  canDiscount,
  lead,
}: {
  branches: Opt[];
  defaultBranchId: string;
  courses: CourseOption[];
  batches: (Opt & { courseId: string; branchId: string; full: boolean })[];
  payment: { modes: Opt[]; accounts: (Opt & { branchId: string })[] };
  today: string;
  limits: { percent: number; amount: number };
  canDiscount: boolean;
  /** Converting an enquiry: pre-fill from it and link it on save. */
  lead?: {
    id: string;
    name: string;
    phone: string;
    altPhone: string | null;
    email: string | null;
    city: string | null;
    courseId: string | null;
  } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [looking, startLookup] = useTransition();
  const [existing, setExisting] = useState<{ code: string; courses: string[] } | null>(null);
  const [planId, setPlanId] = useState<string>("");

  const form = useForm<AdmissionInput, unknown, z.output<typeof admissionSchema>>({
    resolver: zodResolver(admissionSchema),
    defaultValues: {
      branchId: defaultBranchId,
      studentId: null,
      leadId: lead?.id ?? null,
      student: {
        name: lead?.name ?? "",
        phone: lead?.phone ?? "",
        altPhone: lead?.altPhone ?? "",
        email: lead?.email ?? "",
        dob: "",
        gender: null,
        guardianName: "",
        guardianPhone: "",
        address: "",
        city: lead?.city ?? "",
        state: "",
        pincode: "",
        qualification: "",
      },
      courseId: lead?.courseId && courses.some((c) => c.value === lead.courseId) ? lead.courseId : "",
      batchId: null,
      enrolledAt: today,
      discountAmount: "",
      discountReason: "",
      schedule: [],
      payment: { amount: "", paymentModeId: payment.modes[0]?.value ?? null, moneyAccountId: null, reference: "" },
    },
  });
  const schedule = useFieldArray({ control: form.control, name: "schedule" });
  const [branchId, courseId, discount, lines, enrolledAt] = useWatch({
    control: form.control,
    name: ["branchId", "courseId", "discountAmount", "schedule", "enrolledAt"],
  });
  const course = courses.find((c) => c.value === courseId);
  const feeP = course ? Math.round(course.fee * 100) : 0;
  const discountP = paise(discount);
  const pendingApproval =
    discountP > 0 &&
    discountNeedsApproval({
      courseFeePaise: feeP,
      discountPaise: discountP,
      limitPercent: limits.percent,
      limitAmountRupees: limits.amount,
    });
  const netP = feeP - (pendingApproval ? 0 : discountP);
  const scheduleP = (lines ?? []).reduce((a, l) => a + paise(l?.amount), 0);

  const rebuild = (cId = courseId, pId = planId, disc = discountP) => {
    const c = courses.find((x) => x.value === cId);
    if (!c) return;
    const plan = c.plans.find((p) => p.value === pId) ?? c.plans[0];
    const fee = Math.round(c.fee * 100);
    const needs =
      disc > 0 &&
      discountNeedsApproval({
        courseFeePaise: fee,
        discountPaise: disc,
        limitPercent: limits.percent,
        limitAmountRupees: limits.amount,
      });
    const net = fee - (needs ? 0 : disc);
    const start = new Date(`${form.getValues("enrolledAt") || today}T00:00:00.000Z`);
    const rows = scheduleFromPlan(net, plan?.items ?? [], start);
    schedule.replace(
      rows.map((r) => ({ label: r.label, amount: (r.amount / 100).toFixed(2), dueDate: ymd(r.dueDate) })),
    );
  };

  const lookup = () =>
    startLookup(async () => {
      const phone = form.getValues("student.phone");
      const res = await findStudentAction({ phone });
      if (!res.ok) return void form.setError("student.phone", { message: res.fieldErrors?.phone?.[0] ?? res.error });
      if (!res.data) {
        setExisting(null);
        form.setValue("studentId", null);
        toast.info("New student: fill in the details.");
        return;
      }
      setExisting({ code: res.data.studentCode, courses: res.data.courses });
      form.setValue("studentId", res.data.id);
      form.setValue("student", { ...res.data.details, gender: res.data.details.gender ?? null });
      toast.success(`Found ${res.data.details.name} (${res.data.studentCode})`);
    });

  // Converting an enquiry: check straight away whether this phone is already a student.
  const leadPhone = lead?.phone;
  useEffect(() => {
    if (!leadPhone) return;
    startLookup(async () => {
      const res = await findStudentAction({ phone: leadPhone });
      if (res.ok && res.data) {
        setExisting({ code: res.data.studentCode, courses: res.data.courses });
        form.setValue("studentId", res.data.id);
        form.setValue("student", { ...res.data.details, gender: res.data.details.gender ?? null });
      }
    });
  }, [leadPhone, form]);

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await admitAction(form.getValues());
      handleActionResult(form, res);
    }),
  );

  const courseBatches = batches.filter((b) => b.courseId === courseId && b.branchId === branchId);
  const scheduleError = form.formState.errors.schedule?.root?.message ?? form.formState.errors.schedule?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-5xl gap-6">
      {lead && (
        <p className="rounded-md bg-lavender px-3 py-2 text-sm text-lavender-foreground">
          Converting the enquiry from <strong>{lead.name}</strong>. Saving the admission marks it as won.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Student</CardTitle>
          <CardDescription>A student taking a second course keeps the same student ID.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            {branches.length > 1 && (
              <SelectField
                control={form.control}
                name="branchId"
                label="Branch"
                options={branches}
                className="sm:col-span-2"
              />
            )}
            <div className="flex items-end gap-2 sm:col-span-2">
              <TextField
                control={form.control}
                name="student.phone"
                label="Mobile number"
                inputMode="tel"
                autoFocus
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lookup();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={lookup} disabled={looking}>
                <SearchIcon /> Find
              </Button>
            </div>
            {existing && (
              <div className="flex items-center gap-2 rounded-md bg-mint px-3 py-2 text-sm text-mint-foreground sm:col-span-2">
                <UserCheckIcon className="size-4" /> Existing student {existing.code}
                {existing.courses.length ? ` · ${existing.courses.join(", ")}` : ""}
              </div>
            )}
            <TextField control={form.control} name="student.name" label="Full name" />
            <TextField control={form.control} name="student.email" label="Email" type="email" />
            <TextField control={form.control} name="student.dob" label="Date of birth" type="date" />
            <SelectField
              control={form.control}
              name="student.gender"
              label="Gender"
              allowNone="—"
              options={[
                { value: "MALE", label: "Male" },
                { value: "FEMALE", label: "Female" },
                { value: "OTHER", label: "Other" },
              ]}
            />
            <TextField control={form.control} name="student.guardianName" label="Parent / guardian" />
            <TextField control={form.control} name="student.guardianPhone" label="Guardian phone" inputMode="tel" />
            <TextField
              control={form.control}
              name="student.qualification"
              label="Qualification"
              placeholder="e.g. Diploma in Electronics"
            />
            <TextField control={form.control} name="student.altPhone" label="Alternate phone" inputMode="tel" />
            <TextField control={form.control} name="student.address" label="Address" className="sm:col-span-2" />
            <TextField control={form.control} name="student.city" label="City" />
            <div className="grid grid-cols-2 gap-2">
              <TextField control={form.control} name="student.state" label="State" />
              <TextField
                control={form.control}
                name="student.pincode"
                label="PIN code"
                inputMode="numeric"
                maxLength={6}
              />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Course & fee</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="courseId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Course</FieldLabel>
                  <Select
                    value={field.value || undefined}
                    onValueChange={(v) => {
                      field.onChange(v);
                      form.setValue("batchId", null);
                      const first = courses.find((c) => c.value === v)?.plans[0]?.value ?? "";
                      setPlanId(first);
                      rebuild(v, first);
                    }}
                  >
                    <SelectTrigger className="w-full" aria-label="Course">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label} · {formatINR(c.fee)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <SelectField
              control={form.control}
              name="batchId"
              label="Batch"
              allowNone="Assign later"
              options={courseBatches.map((b) => ({ value: b.value, label: b.full ? `${b.label} – full` : b.label }))}
            />
            <TextField control={form.control} name="enrolledAt" label="Admission date" type="date" />
            <div className="grid gap-2">
              <span className="text-sm font-medium">Fee plan</span>
              <div className="flex gap-2">
                <Select
                  value={planId || undefined}
                  onValueChange={(v) => {
                    setPlanId(v);
                    rebuild(courseId, v);
                  }}
                  disabled={!course}
                >
                  <SelectTrigger className="flex-1" aria-label="Fee plan">
                    <SelectValue placeholder="Pick a course first" />
                  </SelectTrigger>
                  <SelectContent>
                    {course?.plans.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" disabled={!course} onClick={() => rebuild()}>
                  {lines?.length ? "Rebuild" : "Make schedule"}
                </Button>
              </div>
            </div>
            {canDiscount && (
              <>
                <TextField
                  control={form.control}
                  name="discountAmount"
                  label="Discount (₹)"
                  type="number"
                  min={0}
                  step="1"
                  onBlur={() => lines?.length && rebuild()}
                />
                <TextField control={form.control} name="discountReason" label="Reason for discount" />
                {discountP > 0 && (
                  <p
                    className={`rounded-md px-3 py-2 text-sm sm:col-span-2 ${pendingApproval ? "bg-peach text-peach-foreground" : "bg-mint text-mint-foreground"}`}
                  >
                    {pendingApproval
                      ? `Above your limit: the discount goes for approval. The schedule uses the full fee until it's approved, then the last instalments are reduced.`
                      : `Within your limit: applied now.`}
                  </p>
                )}
              </>
            )}
          </FieldGroup>

          {course && (
            <div className="mt-6 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">Instalments</span>
                <span className="text-muted-foreground">
                  Fee {formatINR(feeP / 100)}
                  {!pendingApproval && discountP > 0 ? ` − ${formatINR(discountP / 100)}` : ""} ={" "}
                  <span className="font-medium text-foreground">{formatINR(netP / 100)}</span>
                  {lines?.length ? (
                    <>
                      {" "}
                      · schedule {formatINR(scheduleP / 100)}
                      {scheduleP !== netP && <span className="text-destructive"> (must match)</span>}
                    </>
                  ) : null}
                </span>
              </div>
              {schedule.fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-[1fr_8rem_10rem_2.25rem] gap-2">
                  <Controller
                    control={form.control}
                    name={`schedule.${i}.label`}
                    render={({ field }) => <Input {...field} aria-label="Label" />}
                  />
                  <Controller
                    control={form.control}
                    name={`schedule.${i}.amount`}
                    render={({ field }) => (
                      <Input
                        {...field}
                        value={(field.value as string) ?? ""}
                        type="number"
                        step="0.01"
                        min={0}
                        aria-label="Amount"
                      />
                    )}
                  />
                  <Controller
                    control={form.control}
                    name={`schedule.${i}.dueDate`}
                    render={({ field }) => <Input {...field} type="date" aria-label="Due date" />}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove"
                    onClick={() => schedule.remove(i)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    schedule.append({
                      label: `Instalment ${schedule.fields.length + 1}`,
                      amount: "",
                      dueDate: enrolledAt || today,
                    })
                  }
                >
                  <PlusIcon /> Add instalment
                </Button>
                <FieldError>{scheduleError}</FieldError>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment now (optional)</CardTitle>
          <CardDescription>A fee receipt is issued and the amount settles the first instalments.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="payment.amount" label="Amount (₹)" type="number" min={0} step="1" />
            <SelectField control={form.control} name="payment.paymentModeId" label="Paid by" options={payment.modes} />
            <SelectField
              control={form.control}
              name="payment.moneyAccountId"
              label="Received into"
              options={payment.accounts.filter((a) => a.branchId === branchId)}
            />
            <TextField control={form.control} name="payment.reference" label="Reference (UPI ref…)" />
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending || !course || !lines?.length}>
          {pending ? "Saving…" : "Admit student"}
        </Button>
      </div>
    </form>
  );
}
