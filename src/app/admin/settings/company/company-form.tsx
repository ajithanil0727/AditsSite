"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, UploadIcon } from "lucide-react";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { handleActionResult } from "@/components/forms/action-helpers";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { saveCompanyProfileAction, uploadLogoAction } from "@/modules/settings/settings.actions";
import {
  companyProfileSchema,
  type CompanyProfile,
  type CompanyProfileInput,
} from "@/modules/settings/settings.schemas";

export function CompanyForm({
  initial,
  logoUrl,
  canEdit,
}: {
  initial: CompanyProfileInput;
  logoUrl: string | null;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [uploading, startUpload] = useTransition();
  const [preview, setPreview] = useState(logoUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<CompanyProfileInput, unknown, CompanyProfile>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: initial,
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await saveCompanyProfileAction(form.getValues());
      if (handleActionResult(form, res, "Company details saved")) form.reset(form.getValues());
    }),
  );

  const onPickLogo = (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startUpload(async () => {
      const res = await uploadLogoAction(fd);
      if (!res.ok) return void toast.error(res.error);
      form.setValue("logoFileId", res.data.id, { shouldDirty: true });
      setPreview(res.data.url);
      toast.info("Logo uploaded. Save to apply it.");
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-4xl gap-6">
      <fieldset disabled={!canEdit} className="contents">
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>PNG, JPG or WebP, up to 2 MB. A square image works best.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <span className="flex size-20 items-center justify-center overflow-hidden rounded-xl border bg-muted">
              {preview ? (
                <Image
                  src={preview}
                  alt="Company logo"
                  width={80}
                  height={80}
                  className="size-20 object-contain"
                  unoptimized
                />
              ) : (
                <ImageIcon className="size-6 text-muted-foreground" />
              )}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => onPickLogo(e.target.files?.[0])}
            />
            <Button type="button" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <UploadIcon /> {uploading ? "Uploading…" : "Upload logo"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="name" label="Display name" />
              <TextField control={form.control} name="legalName" label="Legal name" />
              <TextField control={form.control} name="tagline" label="Tagline" className="sm:col-span-2" />
              <TextField control={form.control} name="phone" label="Phone" inputMode="tel" />
              <TextField control={form.control} name="email" label="Email" type="email" />
              <TextField control={form.control} name="website" label="Website" className="sm:col-span-2" />
              <TextField control={form.control} name="addressLine1" label="Address line 1" className="sm:col-span-2" />
              <TextField control={form.control} name="addressLine2" label="Address line 2" className="sm:col-span-2" />
              <TextField control={form.control} name="city" label="City" />
              <TextField control={form.control} name="state" label="State" />
              <TextField control={form.control} name="pincode" label="PIN code" inputMode="numeric" maxLength={6} />
            </FieldGroup>
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending || !form.formState.isDirty}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
