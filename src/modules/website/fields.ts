/**
 * Field descriptors for CMS editors (page sections and content lists), and the Zod schema built from them.
 * Pure: shared by the admin editor (client) and the server actions.
 */
import { z } from "zod";

export type Option = { value: string; label: string };

type Common = { name: string; label: string; help?: string; required?: boolean };

export type CmsField =
  | (Common & { type: "text"; max?: number; placeholder?: string })
  | (Common & { type: "url"; placeholder?: string })
  | (Common & { type: "textarea"; max?: number; rows?: number })
  | (Common & { type: "markdown"; max?: number })
  | (Common & { type: "number"; min?: number; max?: number; step?: number })
  | (Common & { type: "switch"; default?: boolean })
  | (Common & { type: "select"; options: Option[]; default?: string })
  /** Options come from the server (branches, device types…). */
  | (Common & { type: "ref"; ref: "branch" | "deviceType" })
  | (Common & { type: "image"; aspect?: number })
  | (Common & { type: "link" })
  | (Common & { type: "date" })
  | (Common & { type: "list"; itemLabel: string; max: number; fields: CmsField[] });

/** Internal path ("/courses", "#contact") or http(s) URL, or tel:/mailto:/WhatsApp. */
export const SAFE_HREF = /^(\/(?!\/)[^\s]*|#[\w-]*|https?:\/\/[^\s]+|tel:\+?[\d\s-]+|mailto:[^\s]+)$/i;

const href = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || SAFE_HREF.test(v), "Use a path like /courses or a full https:// link");

function fieldSchema(f: CmsField): z.ZodType {
  switch (f.type) {
    case "text":
    case "textarea":
    case "markdown": {
      const max = f.max ?? (f.type === "text" ? 200 : f.type === "textarea" ? 1000 : 20_000);
      const s = z.string().trim().max(max, `${f.label}: at most ${max} characters`);
      return f.required ? s.min(1, `${f.label} is required`) : s.optional().default("");
    }
    case "url":
      return f.required ? href.refine((v) => !!v, `${f.label} is required`) : href.optional().default("");
    case "number": {
      let n = z.number({ message: `${f.label}: enter a number` });
      if (f.min !== undefined) n = n.min(f.min);
      if (f.max !== undefined) n = n.max(f.max);
      const toNumber = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : Number(v));
      return f.required ? z.preprocess(toNumber, n) : z.preprocess(toNumber, n.optional()).transform((v) => v ?? null);
    }
    case "switch":
      return z.boolean().default(f.default ?? false);
    case "select":
      return f.required
        ? z.string().refine((v) => f.options.some((o) => o.value === v), `Select ${f.label.toLowerCase()}`)
        : z
            .string()
            .nullable()
            .optional()
            .transform((v) => v || f.default || null);
    case "ref":
    case "image":
      return f.required
        ? z.string({ message: `${f.label} is required` }).min(1, `${f.label} is required`)
        : z
            .string()
            .nullable()
            .optional()
            .transform((v) => v || null);
    case "date":
      return f.required
        ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
        : z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .or(z.literal(""))
            .nullable()
            .optional()
            .transform((v) => v || null);
    case "link":
      return z
        .object({ label: z.string().trim().max(60).optional().default(""), href: href.optional().default("") })
        .optional()
        .default({ label: "", href: "" })
        .superRefine((v, ctx) => {
          if (f.required && (!v.label || !v.href))
            ctx.addIssue({ code: "custom", message: `${f.label}: add a label and a link` });
          else if (!!v.label !== !!v.href)
            ctx.addIssue({ code: "custom", message: `${f.label}: fill both the label and the link, or neither` });
        });
    case "list":
      return z
        .array(fieldsSchema(f.fields))
        .max(f.max, `At most ${f.max} ${f.itemLabel.toLowerCase()}s`)
        .optional()
        .default([]);
  }
}

export function fieldsSchema(fields: CmsField[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) shape[f.name] = fieldSchema(f);
  return z.object(shape);
}

export function emptyFor(fields: CmsField[]): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const f of fields) {
    v[f.name] =
      f.type === "switch"
        ? (f.default ?? false)
        : f.type === "list"
          ? []
          : f.type === "link"
            ? { label: "", href: "" }
            : f.type === "select"
              ? (f.default ?? null)
              : f.type === "image" || f.type === "ref" || f.type === "date"
                ? null
                : "";
  }
  return v;
}

/** All image ids referenced by values of these fields (to resolve URLs / alt text in one query). */
export function imageIdsIn(fields: CmsField[], values: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === "image" && typeof v === "string" && v) out.push(v);
    if (f.type === "list" && Array.isArray(v))
      for (const item of v) out.push(...imageIdsIn(f.fields, item as Record<string, unknown>));
  }
  return out;
}

/** Badge / accent colours are design tokens. */
export const TONE_OPTIONS: Option[] = [
  { value: "mint", label: "Mint" },
  { value: "lavender", label: "Lavender" },
  { value: "peach", label: "Peach" },
  { value: "sky", label: "Sky" },
];

export const ICON_OPTIONS: Option[] = [
  { value: "graduation", label: "Graduation cap" },
  { value: "wrench", label: "Wrench" },
  { value: "cpu", label: "Chip" },
  { value: "smartphone", label: "Phone" },
  { value: "laptop", label: "Laptop" },
  { value: "briefcase", label: "Briefcase" },
  { value: "shield", label: "Shield" },
  { value: "clock", label: "Clock" },
  { value: "award", label: "Award" },
  { value: "users", label: "People" },
  { value: "microscope", label: "Microscope" },
  { value: "zap", label: "Lightning" },
];
