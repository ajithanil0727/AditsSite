/**
 * Website page sections. Each section type has a label, an editor field list and defaults.
 * Content is stored as JSON on PageSection (draftContent / publishedContent) and validated here.
 */
import type { PageKind } from "@/generated/prisma/enums";
import { emptyFor, fieldsSchema, ICON_OPTIONS, TONE_OPTIONS, type CmsField } from "./fields";

const title: CmsField = { name: "title", label: "Heading", type: "text", max: 120 };
const subtitle: CmsField = { name: "subtitle", label: "Sub-heading", type: "textarea", max: 300, rows: 2 };
const limit: CmsField = { name: "limit", label: "How many to show", type: "number", min: 1, max: 24 };

export type SectionDef = {
  label: string;
  description: string;
  fields: CmsField[];
  defaults: Record<string, unknown>;
};

export const SECTION_TYPES = [
  "hero",
  "stats",
  "features",
  "steps",
  "courses",
  "services",
  "placements",
  "testimonials",
  "branches",
  "cta",
  "richText",
  "imageText",
  "faq",
  "gallery",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTIONS: Record<SectionType, SectionDef> = {
  hero: {
    label: "Hero",
    description: "Big headline with buttons. Shows the animated circuit illustration unless you add an image.",
    fields: [
      { name: "eyebrow", label: "Small text above the headline", type: "text", max: 80 },
      { name: "headline", label: "Headline", type: "text", required: true, max: 140 },
      { name: "highlight", label: "Words to highlight in the headline", type: "text", max: 60 },
      { name: "subtext", label: "Text under the headline", type: "textarea", max: 400, rows: 3 },
      { name: "primary", label: "Main button", type: "link" },
      { name: "secondary", label: "Second button", type: "link" },
      { name: "image", label: "Image (optional)", type: "image", aspect: 4 / 3 },
    ],
    defaults: {
      eyebrow: "Chip-level repair training & service",
      headline: "Learn chip-level repair. Get devices fixed right.",
      highlight: "chip-level repair",
      subtext: "Hands-on courses in mobile and laptop repair, and a service centre you can trust.",
      primary: { label: "Enquire about a course", href: "/enquire" },
      secondary: { label: "Book a repair", href: "/book-repair" },
      image: null,
    },
  },
  stats: {
    label: "Numbers",
    description: "Counters that animate on the home page (students trained, devices repaired…).",
    fields: [
      title,
      {
        name: "items",
        label: "Numbers",
        type: "list",
        itemLabel: "Number",
        max: 6,
        fields: [
          { name: "value", label: "Number", type: "number", required: true, min: 0, max: 100_000_000 },
          { name: "suffix", label: "After the number (+, %, k)", type: "text", max: 4 },
          { name: "label", label: "Label", type: "text", required: true, max: 60 },
        ],
      },
    ],
    defaults: {
      title: "",
      items: [
        { value: 5000, suffix: "+", label: "Students trained" },
        { value: 25000, suffix: "+", label: "Devices repaired" },
        { value: 3, suffix: "", label: "Branches" },
        { value: 85, suffix: "%", label: "Placement rate" },
      ],
    },
  },
  features: {
    label: "What we do",
    description: "Cards with an icon, title and text. Good for 'Institute / Service centre'.",
    fields: [
      title,
      subtitle,
      {
        name: "items",
        label: "Cards",
        type: "list",
        itemLabel: "Card",
        max: 6,
        fields: [
          { name: "icon", label: "Icon", type: "select", options: ICON_OPTIONS, default: "cpu" },
          { name: "tone", label: "Colour", type: "select", options: TONE_OPTIONS, default: "mint" },
          { name: "title", label: "Title", type: "text", required: true, max: 80 },
          { name: "text", label: "Text", type: "textarea", max: 400, rows: 3 },
          { name: "link", label: "Link", type: "link" },
        ],
      },
    ],
    defaults: {
      title: "What we do",
      subtitle: "",
      items: [
        {
          icon: "graduation",
          tone: "lavender",
          title: "Training institute",
          text: "Job-ready courses in chip-level mobile and laptop repair, taught on real boards.",
          link: { label: "See courses", href: "/courses" },
        },
        {
          icon: "wrench",
          tone: "mint",
          title: "Service centre",
          text: "Board-level repairs for phones and laptops with honest quotes and warranty.",
          link: { label: "Book a repair", href: "/book-repair" },
        },
      ],
    },
  },
  steps: {
    label: "How it works",
    description: "Numbered steps. On the home page this becomes a horizontal scroll story on desktop.",
    fields: [
      title,
      subtitle,
      {
        name: "items",
        label: "Steps",
        type: "list",
        itemLabel: "Step",
        max: 8,
        fields: [
          { name: "title", label: "Title", type: "text", required: true, max: 60 },
          { name: "text", label: "Text", type: "textarea", max: 300, rows: 2 },
        ],
      },
    ],
    defaults: {
      title: "How a repair works",
      subtitle: "",
      items: [
        { title: "Received", text: "We log your device and give you a job card number." },
        { title: "Diagnosis", text: "An engineer finds the fault at board level." },
        { title: "Quote", text: "You approve the price before any repair starts." },
        { title: "Repair & QC", text: "Repaired, then checked by a second engineer." },
        { title: "Delivered", text: "Collect it with a warranty on the repair." },
      ],
    },
  },
  courses: {
    label: "Courses",
    description: "Course cards from Courses (only those shown on the website).",
    fields: [
      title,
      subtitle,
      {
        name: "mode",
        label: "Which courses",
        type: "select",
        default: "featured",
        options: [
          { value: "featured", label: "Featured only" },
          { value: "all", label: "All website courses" },
        ],
      },
      limit,
    ],
    defaults: { title: "Our courses", subtitle: "", mode: "featured", limit: 6 },
  },
  services: {
    label: "Services",
    description: "Service cards from Website → Services.",
    fields: [
      title,
      subtitle,
      {
        name: "mode",
        label: "Which services",
        type: "select",
        default: "featured",
        options: [
          { value: "featured", label: "Featured only" },
          { value: "all", label: "All published services" },
        ],
      },
      limit,
    ],
    defaults: { title: "Repair services", subtitle: "", mode: "featured", limit: 6 },
  },
  placements: {
    label: "Placements",
    description: "Hiring-company logos and success stories.",
    fields: [
      title,
      subtitle,
      { name: "showLogos", label: "Show company logos", type: "switch", default: true },
      { name: "showStories", label: "Show success stories", type: "switch", default: true },
    ],
    defaults: { title: "Where our students work", subtitle: "", showLogos: true, showStories: true },
  },
  testimonials: {
    label: "Testimonials",
    description: "Published testimonials as a carousel.",
    fields: [title, subtitle],
    defaults: { title: "What people say", subtitle: "" },
  },
  branches: {
    label: "Branches",
    description: "Branch cards with address, phone and map links.",
    fields: [title, subtitle],
    defaults: { title: "Visit us", subtitle: "" },
  },
  cta: {
    label: "Call to action",
    description: "A coloured band with a headline and buttons.",
    fields: [
      { name: "headline", label: "Headline", type: "text", required: true, max: 140 },
      { name: "text", label: "Text", type: "textarea", max: 300, rows: 2 },
      { name: "primary", label: "Main button", type: "link" },
      { name: "secondary", label: "Second button", type: "link" },
      { name: "tone", label: "Colour", type: "select", options: TONE_OPTIONS, default: "lavender" },
    ],
    defaults: {
      headline: "Ready to start?",
      text: "Talk to a counsellor or bring your device in today.",
      primary: { label: "Enquire about a course", href: "/enquire" },
      secondary: { label: "Book a repair", href: "/book-repair" },
      tone: "lavender",
    },
  },
  richText: {
    label: "Text",
    description: "Formatted text: headings, paragraphs, lists, links.",
    fields: [title, { name: "body", label: "Text", type: "markdown", required: true }],
    defaults: { title: "", body: "Write something here." },
  },
  imageText: {
    label: "Image + text",
    description: "An image beside formatted text.",
    fields: [
      title,
      { name: "body", label: "Text", type: "markdown" },
      { name: "image", label: "Image", type: "image", aspect: 4 / 3 },
      {
        name: "imageSide",
        label: "Image side",
        type: "select",
        default: "right",
        options: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ],
      },
      { name: "link", label: "Button", type: "link" },
    ],
    defaults: { title: "", body: "", image: null, imageSide: "right", link: { label: "", href: "" } },
  },
  faq: {
    label: "FAQs",
    description: "Questions from Website → FAQs.",
    fields: [title, { name: "category", label: "Only this category (optional)", type: "text", max: 60 }],
    defaults: { title: "Frequently asked questions", category: "" },
  },
  gallery: {
    label: "Gallery",
    description: "Photos from Website → Gallery.",
    fields: [title, { name: "album", label: "Only this album (optional)", type: "text", max: 60 }, limit],
    defaults: { title: "Gallery", album: "", limit: 8 },
  },
};

export function isSectionType(v: string): v is SectionType {
  return (SECTION_TYPES as readonly string[]).includes(v);
}

export function sectionSchema(type: SectionType) {
  return fieldsSchema(SECTIONS[type].fields);
}

/** Parse stored JSON for rendering. Invalid / old content falls back to defaults field by field. */
export function readSection(type: string, content: unknown): Record<string, unknown> | null {
  if (!isSectionType(type)) return null;
  const def = SECTIONS[type];
  const merged = { ...emptyFor(def.fields), ...def.defaults, ...(content as Record<string, unknown> | null) };
  const parsed = sectionSchema(type).safeParse(merged);
  return parsed.success ? (parsed.data as Record<string, unknown>) : { ...emptyFor(def.fields), ...def.defaults };
}

// ------------------------------------------------------------------ pages

export const SYSTEM_PAGES: { kind: Exclude<PageKind, "CUSTOM">; slug: string; title: string; path: string }[] = [
  { kind: "HOME", slug: "", title: "Home", path: "/" },
  { kind: "ABOUT", slug: "about", title: "About us", path: "/about" },
  { kind: "COURSES", slug: "courses", title: "Courses", path: "/courses" },
  { kind: "SERVICES", slug: "services", title: "Services", path: "/services" },
  { kind: "BRANCHES", slug: "branches", title: "Branches", path: "/branches" },
  { kind: "PLACEMENTS", slug: "placements", title: "Placements", path: "/placements" },
  { kind: "GALLERY", slug: "gallery", title: "Gallery", path: "/gallery" },
  { kind: "TESTIMONIALS", slug: "testimonials", title: "Testimonials", path: "/testimonials" },
  { kind: "FAQ", slug: "faq", title: "FAQs", path: "/faq" },
  { kind: "CONTACT", slug: "contact", title: "Contact", path: "/contact" },
];

/** Slugs custom pages can't use (system pages and app routes). */
export const RESERVED_SLUGS = new Set([
  ...SYSTEM_PAGES.map((p) => p.slug).filter(Boolean),
  "admin",
  "api",
  "login",
  "logout",
  "forgot-password",
  "reset-password",
  "print",
  "track",
  "enquire",
  "book-repair",
  "preview",
  "verify",
  "portal",
  "sitemap.xml",
  "robots.txt",
]);

export const pagePath = (kind: PageKind, slug: string) =>
  kind === "CUSTOM" ? `/${slug}` : (SYSTEM_PAGES.find((p) => p.kind === kind)?.path ?? `/${slug}`);

/** What a system page shows after its sections (the built-in part an admin can't remove). */
export const BUILT_IN_BLOCK: Partial<Record<PageKind, string>> = {
  COURSES: "List of website courses",
  SERVICES: "List of published services",
  BRANCHES: "Branch cards with maps",
  PLACEMENTS: "Company logos and success stories",
  GALLERY: "All published photos",
  TESTIMONIALS: "All published testimonials",
  FAQ: "All published FAQs",
  CONTACT: "Contact details and the enquiry form",
};
