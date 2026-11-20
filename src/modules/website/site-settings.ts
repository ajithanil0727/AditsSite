/** Site-wide website settings (stored in Setting "site"). Pure: shared by the editor and the server. */
import { z } from "zod";
import { indianPhone } from "@/lib/format";
import { SAFE_HREF } from "./fields";

export const SITE_KEY = "site";

const text = (max: number) => z.string().trim().max(max).optional().default("");
const url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => !v || /^https:\/\/[^\s]+$/i.test(v), "Use a full https:// link")
  .optional()
  .default("");
const href = z
  .string()
  .trim()
  .max(300)
  .refine((v) => !v || SAFE_HREF.test(v), "Use a path like /enquire or a full https:// link")
  .optional()
  .default("");
const optPhone = indianPhone.or(z.literal("")).optional().default("");

export const siteSettingsSchema = z.object({
  contact: z.object({
    phone: optPhone,
    email: z.email("Enter a valid email").or(z.literal("")).optional().default(""),
    address: text(300),
    hours: text(120),
    mapUrl: url,
  }),
  whatsapp: z.object({
    enabled: z.boolean().default(true),
    number: optPhone,
    message: text(200),
  }),
  social: z.object({
    facebook: url,
    instagram: url,
    youtube: url,
    linkedin: url,
    x: url,
  }),
  header: z.object({ ctaLabel: text(30), ctaHref: href }),
  // Live placement figures (placed students, placement %) on the Placements page. Off until the data is real.
  placements: z.object({ showFigures: z.boolean().default(false) }),
  footer: z.object({ about: text(400), copyright: text(120) }),
  seo: z.object({
    defaultTitle: text(70),
    titleSuffix: text(40),
    description: text(160),
    keywords: text(300),
    ogImageId: z
      .string()
      .nullable()
      .optional()
      .transform((v) => v || null),
  }),
});
export type SiteSettings = z.output<typeof siteSettingsSchema>;
export type SiteSettingsInput = z.input<typeof siteSettingsSchema>;

export const DEFAULT_SITE: SiteSettings = {
  contact: { phone: "", email: "", address: "", hours: "Mon–Sat, 9:30 AM – 7:00 PM", mapUrl: "" },
  whatsapp: { enabled: true, number: "", message: "Hi, I'd like to know more." },
  social: { facebook: "", instagram: "", youtube: "", linkedin: "", x: "" },
  header: { ctaLabel: "Enquire now", ctaHref: "/enquire" },
  placements: { showFigures: false },
  footer: { about: "", copyright: "" },
  seo: { defaultTitle: "", titleSuffix: "", description: "", keywords: "", ogImageId: null },
};

/** Stored JSON → settings, filling anything missing with defaults. */
export function readSiteSettings(value: unknown): SiteSettings {
  const v = (value ?? {}) as Partial<Record<keyof SiteSettings, object>>;
  const merged = Object.fromEntries(
    Object.entries(DEFAULT_SITE).map(([k, d]) => [k, { ...d, ...(v[k as keyof SiteSettings] ?? {}) }]),
  );
  const parsed = siteSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SITE;
}

// ------------------------------------------------------------------ pages & menus (admin forms)

export const pageMetaSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2, "Give the page a title").max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(/^[a-z0-9-]*$/, "Lowercase letters, digits and -")
    .optional()
    .default(""),
  seoTitle: text(70),
  seoDescription: text(160),
  ogImageId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null),
});
export type PageMetaInput = z.input<typeof pageMetaSchema>;

export const menuItemSchema = z.object({
  id: z.string().optional(),
  location: z.enum(["HEADER", "FOOTER"]),
  label: z.string().trim().min(1, "Label").max(40),
  pageId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null),
  url: href,
  parentId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null),
  isVisible: z.boolean().default(true),
  openInNewTab: z.boolean().default(false),
});
export type MenuItemInput = z.input<typeof menuItemSchema>;
