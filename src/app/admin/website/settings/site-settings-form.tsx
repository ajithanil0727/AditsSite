"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { ImagePicker } from "@/components/cms/media-library";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { saveSiteSettingsAction } from "@/modules/website/website.actions";
import { siteSettingsSchema, type SiteSettings, type SiteSettingsInput } from "@/modules/website/site-settings";

export function SiteSettingsForm({ initial }: { initial: SiteSettingsInput }) {
  const [pending, start] = useTransition();
  const form = useForm<SiteSettingsInput, unknown, SiteSettings>({
    resolver: zodResolver(siteSettingsSchema),
    defaultValues: initial,
  });
  const onSubmit = form.handleSubmit(() =>
    start(async () => {
      const res = await saveSiteSettingsAction(form.getValues());
      if (handleActionResult(form, res, "Saved. The website is updated.")) form.reset(form.getValues());
    }),
  );
  const c = form.control;
  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-4xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Contact details</CardTitle>
          <CardDescription>
            Shown in the footer and on the contact page. Empty fields fall back to the company details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField control={c} name="contact.phone" label="Phone" inputMode="tel" maxLength={14} />
            <TextField control={c} name="contact.email" label="Email" type="email" />
            <TextareaField control={c} name="contact.address" label="Address" rows={2} className="sm:col-span-2" />
            <TextField
              control={c}
              name="contact.hours"
              label="Opening hours"
              placeholder="Mon–Sat, 9:30 AM – 7:00 PM"
            />
            <TextField
              control={c}
              name="contact.mapUrl"
              label="Google Maps link"
              placeholder="https://maps.app.goo.gl/…"
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp button</CardTitle>
          <CardDescription>A green chat button at the bottom right of every page.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <SwitchField control={c} name="whatsapp.enabled" label="Show the button" className="sm:col-span-2" />
            <TextField
              control={c}
              name="whatsapp.number"
              label="WhatsApp number"
              inputMode="tel"
              maxLength={14}
              description="Leave empty to use the contact phone."
            />
            <TextField control={c} name="whatsapp.message" label="Starting message" />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Placement figures</CardTitle>
          <CardDescription>
            Students placed and the placement % (placed ÷ students who completed and want placement help), worked out
            live from Placements. Turn on once real placements are recorded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SwitchField control={c} name="placements.showFigures" label="Show on the Placements page" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Social links</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField control={c} name="social.facebook" label="Facebook" placeholder="https://facebook.com/…" />
            <TextField control={c} name="social.instagram" label="Instagram" placeholder="https://instagram.com/…" />
            <TextField control={c} name="social.youtube" label="YouTube" placeholder="https://youtube.com/@…" />
            <TextField
              control={c}
              name="social.linkedin"
              label="LinkedIn"
              placeholder="https://linkedin.com/company/…"
            />
            <TextField control={c} name="social.x" label="X (Twitter)" placeholder="https://x.com/…" />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Header and footer</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField control={c} name="header.ctaLabel" label="Header button text" placeholder="Enquire now" />
            <TextField control={c} name="header.ctaHref" label="Header button link" placeholder="/enquire" />
            <TextareaField
              control={c}
              name="footer.about"
              label="Footer text"
              rows={2}
              className="sm:col-span-2"
              description="Leave empty to use the company tagline."
            />
            <TextField
              control={c}
              name="footer.copyright"
              label="Copyright line"
              className="sm:col-span-2"
              description="Leave empty for “© year company name”."
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search engines and sharing</CardTitle>
          <CardDescription>Defaults for pages that don&apos;t set their own.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={c}
              name="seo.defaultTitle"
              label="Home page title"
              maxLength={70}
              description="Up to 70 characters."
            />
            <TextField control={c} name="seo.titleSuffix" label="Added after page titles" placeholder="Company name" />
            <TextareaField
              control={c}
              name="seo.description"
              label="Description"
              rows={2}
              maxLength={160}
              className="sm:col-span-2"
              description="Up to 160 characters."
            />
            <TextField
              control={c}
              name="seo.keywords"
              label="Keywords"
              className="sm:col-span-2"
              placeholder="chip level repair course, mobile repair Kochi…"
            />
            <Controller
              control={c}
              name="seo.ogImageId"
              render={({ field }) => (
                <Field className="sm:col-span-2">
                  <FieldLabel>Default share image</FieldLabel>
                  <ImagePicker value={field.value} onChange={field.onChange} aspect={1200 / 630} />
                  <FieldDescription>
                    Shown when a link is shared on WhatsApp or Facebook. 1200×630 works best.
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !form.formState.isDirty}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
