"use client";

import { Controller } from "react-hook-form";
import { ImagePicker } from "@/components/cms/media-library";
import { FormDialog } from "@/components/forms/form-dialog";
import { TextareaField, TextField } from "@/components/forms/fields";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { savePageMetaAction } from "@/modules/website/website.actions";
import { pageMetaSchema, type PageMetaInput } from "@/modules/website/site-settings";

export function NewPageDialog({ trigger }: { trigger: React.ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title="New page"
      description="For things like scholarships, franchise enquiries or a campaign. It stays off the site until you publish it."
      schema={pageMetaSchema}
      defaultValues={{ title: "", slug: "", seoTitle: "", seoDescription: "", ogImageId: null }}
      action={savePageMetaAction}
      submitLabel="Create page"
    >
      {(form) => (
        <>
          <TextField control={form.control} name="title" label="Title" />
          <TextField
            control={form.control}
            name="slug"
            label="Web address"
            description="e.g. scholarships → /scholarships. Leave empty to use the title."
          />
        </>
      )}
    </FormDialog>
  );
}

export function PageSettingsDialog({
  trigger,
  initial,
  isCustom,
}: {
  trigger: React.ReactNode;
  initial: PageMetaInput;
  isCustom: boolean;
}) {
  return (
    <FormDialog
      trigger={trigger}
      title="Page settings"
      description="Title and search engine details. These apply straight away."
      schema={pageMetaSchema}
      defaultValues={initial}
      action={savePageMetaAction}
      successMessage="Page settings saved"
    >
      {(form) => (
        <>
          <TextField control={form.control} name="title" label="Title" />
          {isCustom && <TextField control={form.control} name="slug" label="Web address" />}
          <TextField
            control={form.control}
            name="seoTitle"
            label="SEO title"
            maxLength={70}
            description="Shown in Google and the browser tab. Up to 70 characters."
          />
          <TextareaField
            control={form.control}
            name="seoDescription"
            label="SEO description"
            rows={2}
            maxLength={160}
            description="Up to 160 characters."
          />
          <Controller
            control={form.control}
            name="ogImageId"
            render={({ field }) => (
              <Field>
                <FieldLabel>Share image</FieldLabel>
                <ImagePicker value={field.value} onChange={field.onChange} aspect={1200 / 630} />
                <FieldDescription>
                  Shown when the page is shared on WhatsApp or Facebook. 1200×630 works best.
                </FieldDescription>
              </Field>
            )}
          />
        </>
      )}
    </FormDialog>
  );
}
