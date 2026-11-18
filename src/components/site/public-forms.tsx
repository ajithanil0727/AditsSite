"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useForm, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  courseEnquirySchema,
  repairBookingSchema,
  type CourseEnquiryInput,
  type RepairBookingInput,
} from "@/modules/leads/leads.schemas";
import {
  submitCourseEnquiry,
  submitRepairBooking,
  type PublicFormResult,
} from "@/modules/leads/public-enquiry.actions";

type Option = { value: string; label: string };

/** Hidden from people (off-screen, not focusable); bots fill it in. */
function Honeypot<T extends FieldValues>({ form }: { form: UseFormReturn<T, unknown, unknown> }) {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input tabIndex={-1} autoComplete="off" {...form.register("website" as Path<T>)} />
      </label>
    </div>
  );
}

function useStartedAt<T extends FieldValues>(form: UseFormReturn<T, unknown, unknown>) {
  useEffect(() => {
    form.setValue("startedAt" as Path<T>, Date.now() as never);
  }, [form]);
}

function applyErrors<T extends FieldValues>(form: UseFormReturn<T, unknown, unknown>, res: PublicFormResult) {
  if (res.ok) return;
  for (const [k, v] of Object.entries(res.fieldErrors ?? {}))
    if (v?.[0]) form.setError(k as Path<T>, { message: v[0] });
  form.setError("root", { message: res.error });
}

function Thanks({ title, text, again }: { title: string; text: string; again: () => void }) {
  return (
    <div role="status" className="flex flex-col items-center rounded-3xl border bg-mint/40 p-8 text-center">
      <CheckCircle2Icon className="size-12 text-mint-foreground" />
      <h2 className="mt-4 text-2xl font-bold">{title}</h2>
      <p className="mt-2 max-w-md text-muted-foreground">{text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={again}>
          Send another
        </Button>
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}

export function CourseEnquiryForm({
  branches,
  courses,
  defaultCourseId,
}: {
  branches: Option[];
  courses: Option[];
  defaultCourseId?: string | null;
}) {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const defaults: CourseEnquiryInput = {
    name: "",
    phone: "",
    email: "",
    city: "",
    branchId: branches.length === 1 ? branches[0].value : "",
    courseId: defaultCourseId ?? null,
    message: "",
    website: "",
    startedAt: 0,
  };
  const form = useForm<CourseEnquiryInput>({
    resolver: zodResolver(courseEnquirySchema) as never,
    defaultValues: defaults,
  });
  useStartedAt(form);
  const onSubmit = form.handleSubmit(() =>
    start(async () => {
      const res = await submitCourseEnquiry(form.getValues());
      if (res.ok) setDone(true);
      else applyErrors(form, res);
    }),
  );
  if (done)
    return (
      <Thanks
        title="Thank you! We'll call you soon."
        text="A counsellor from your chosen branch will contact you, usually within one working day."
        again={() => {
          form.reset({ ...defaults, startedAt: Date.now() });
          setDone(false);
        }}
      />
    );
  return (
    <form onSubmit={onSubmit} noValidate className="relative">
      <Honeypot form={form} />
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="name" label="Your name" autoComplete="name" />
        <TextField
          control={form.control}
          name="phone"
          label="Mobile number"
          inputMode="tel"
          autoComplete="tel"
          maxLength={14}
        />
        <TextField control={form.control} name="email" label="Email (optional)" type="email" autoComplete="email" />
        <TextField control={form.control} name="city" label="City (optional)" autoComplete="address-level2" />
        <SelectField control={form.control} name="branchId" label="Nearest branch" options={branches} />
        <SelectField control={form.control} name="courseId" label="Course" options={courses} allowNone="Not sure yet" />
        <TextareaField
          control={form.control}
          name="message"
          label="Anything you'd like to ask? (optional)"
          rows={3}
          className="sm:col-span-2"
        />
      </FieldGroup>
      {form.formState.errors.root && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {form.formState.errors.root.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-6 h-11 w-full rounded-full sm:w-auto sm:px-8">
        {pending && <Loader2Icon className="animate-spin" />} Send enquiry
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">We only use your details to answer your enquiry.</p>
    </form>
  );
}

export function RepairBookingForm({ branches, deviceTypes }: { branches: Option[]; deviceTypes: Option[] }) {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const defaults: RepairBookingInput = {
    name: "",
    phone: "",
    email: "",
    branchId: branches.length === 1 ? branches[0].value : "",
    deviceTypeId: null,
    deviceText: "",
    problemText: "",
    website: "",
    startedAt: 0,
  };
  const form = useForm<RepairBookingInput>({
    resolver: zodResolver(repairBookingSchema) as never,
    defaultValues: defaults,
  });
  useStartedAt(form);
  const onSubmit = form.handleSubmit(() =>
    start(async () => {
      const res = await submitRepairBooking(form.getValues());
      if (res.ok) setDone(true);
      else applyErrors(form, res);
    }),
  );
  if (done)
    return (
      <Thanks
        title="Booking received!"
        text="Our service desk will call you to confirm a time. Bring your device and charger when you visit."
        again={() => {
          form.reset({ ...defaults, startedAt: Date.now() });
          setDone(false);
        }}
      />
    );
  return (
    <form onSubmit={onSubmit} noValidate className="relative">
      <Honeypot form={form} />
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="name" label="Your name" autoComplete="name" />
        <TextField
          control={form.control}
          name="phone"
          label="Mobile number"
          inputMode="tel"
          autoComplete="tel"
          maxLength={14}
        />
        <SelectField
          control={form.control}
          name="deviceTypeId"
          label="Device type"
          options={deviceTypes}
          allowNone="Other"
        />
        <TextField
          control={form.control}
          name="deviceText"
          label="Brand and model"
          placeholder="e.g. Samsung A52, HP Pavilion 15"
        />
        <TextareaField
          control={form.control}
          name="problemText"
          label="What's the problem?"
          rows={3}
          placeholder="Not charging, dead after water damage, no display…"
          className="sm:col-span-2"
        />
        <SelectField control={form.control} name="branchId" label="Nearest branch" options={branches} />
        <TextField control={form.control} name="email" label="Email (optional)" type="email" autoComplete="email" />
      </FieldGroup>
      {form.formState.errors.root && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {form.formState.errors.root.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-6 h-11 w-full rounded-full sm:w-auto sm:px-8">
        {pending && <Loader2Icon className="animate-spin" />} Book repair
      </Button>
    </form>
  );
}
