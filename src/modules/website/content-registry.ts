/**
 * Simple website content lists (services, testimonials, stories, gallery, FAQs, banners, company logos),
 * defined once and edited through one generic screen. Pure: no DB access.
 */
import type { PermissionKey } from "@/lib/permissions";
import { ICON_OPTIONS, type CmsField } from "./fields";

export const CONTENT_KINDS = [
  "services",
  "testimonials",
  "stories",
  "gallery",
  "faqs",
  "banners",
  "companies",
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export type ContentDef = {
  kind: ContentKind;
  model: "serviceOffering" | "testimonial" | "successStory" | "galleryItem" | "faq" | "banner" | "company";
  label: string;
  singular: string;
  description: string;
  permission: PermissionKey;
  fields: CmsField[];
  /** Columns in the list (first = title). */
  columns: string[];
  /** Field that says whether the item is live on the site. */
  liveField: string;
  orderBy: Record<string, "asc" | "desc">[];
  softDelete?: boolean;
};

const sort: CmsField = { name: "sortOrder", label: "Sort order", type: "number", min: 0, max: 999 };
const published: CmsField = { name: "isPublished", label: "Show on the website", type: "switch", default: true };

export const CONTENT: Record<ContentKind, ContentDef> = {
  services: {
    kind: "services",
    model: "serviceOffering",
    label: "Services",
    singular: "service",
    description: "Repair services shown on /services and the home page.",
    permission: "website.edit",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 100 },
      { name: "slug", label: "Web address", type: "text", max: 80, help: "Leave empty to create it from the title." },
      { name: "summary", label: "Short summary", type: "textarea", max: 300, rows: 2 },
      { name: "description", label: "Full description", type: "markdown" },
      { name: "iconName", label: "Icon", type: "select", options: ICON_OPTIONS, default: "wrench" },
      { name: "imageId", label: "Image", type: "image", aspect: 4 / 3 },
      { name: "deviceTypeId", label: "Device type", type: "ref", ref: "deviceType" },
      { name: "startingPrice", label: "Starting from (₹)", type: "number", min: 0, max: 1_000_000, step: 1 },
      { ...published, default: false },
      { name: "isFeatured", label: "Feature on the home page", type: "switch" },
      sort,
      { name: "seoTitle", label: "SEO title", type: "text", max: 70 },
      { name: "seoDescription", label: "SEO description", type: "textarea", max: 160, rows: 2 },
    ],
    columns: ["title", "startingPrice", "isFeatured", "isPublished"],
    liveField: "isPublished",
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  },
  testimonials: {
    kind: "testimonials",
    model: "testimonial",
    label: "Testimonials",
    singular: "testimonial",
    description: "Quotes from students and customers.",
    permission: "website.edit",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 80 },
      { name: "role", label: "Who they are", type: "text", max: 100, placeholder: "Student, Advanced Mobile Repair" },
      { name: "quote", label: "Quote", type: "textarea", required: true, max: 600, rows: 4 },
      { name: "rating", label: "Rating (1–5)", type: "number", min: 1, max: 5 },
      { name: "photoId", label: "Photo", type: "image", aspect: 1 },
      { name: "branchId", label: "Branch", type: "ref", ref: "branch" },
      { name: "videoUrl", label: "Video link (YouTube)", type: "url" },
      published,
      sort,
    ],
    columns: ["name", "role", "rating", "isPublished"],
    liveField: "isPublished",
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  },
  stories: {
    kind: "stories",
    model: "successStory",
    label: "Success stories",
    singular: "success story",
    description: "Placed students (with their consent).",
    permission: "website.edit",
    fields: [
      { name: "studentName", label: "Student", type: "text", required: true, max: 80 },
      { name: "companyName", label: "Company", type: "text", required: true, max: 100 },
      { name: "designation", label: "Job title", type: "text", max: 80 },
      { name: "courseName", label: "Course", type: "text", max: 100 },
      { name: "packageText", label: "Package (as you want it shown)", type: "text", max: 40, placeholder: "₹3.2 LPA" },
      { name: "quote", label: "Quote", type: "textarea", max: 400, rows: 3 },
      { name: "photoId", label: "Photo", type: "image", aspect: 1 },
      published,
      sort,
    ],
    columns: ["studentName", "companyName", "designation", "isPublished"],
    liveField: "isPublished",
    orderBy: [{ sortOrder: "asc" }, { studentName: "asc" }],
  },
  gallery: {
    kind: "gallery",
    model: "galleryItem",
    label: "Gallery",
    singular: "photo",
    description: "Photos of labs, classes, events and the service centre.",
    permission: "website.edit",
    fields: [
      { name: "fileId", label: "Photo", type: "image", required: true },
      { name: "caption", label: "Caption", type: "text", max: 150 },
      { name: "album", label: "Album", type: "text", max: 60, placeholder: "Labs, Events, Convocation…" },
      { name: "branchId", label: "Branch", type: "ref", ref: "branch" },
      published,
      sort,
    ],
    columns: ["fileId", "caption", "album", "isPublished"],
    liveField: "isPublished",
    orderBy: [{ sortOrder: "asc" }, { id: "desc" }],
  },
  faqs: {
    kind: "faqs",
    model: "faq",
    label: "FAQs",
    singular: "FAQ",
    description: "Questions and answers for /faq and FAQ sections.",
    permission: "website.edit",
    fields: [
      { name: "question", label: "Question", type: "text", required: true, max: 200 },
      { name: "answer", label: "Answer", type: "markdown", required: true, max: 3000 },
      { name: "category", label: "Category", type: "text", max: 60, placeholder: "Courses, Repairs, Fees…" },
      published,
      sort,
    ],
    columns: ["question", "category", "isPublished"],
    liveField: "isPublished",
    orderBy: [{ sortOrder: "asc" }, { question: "asc" }],
  },
  banners: {
    kind: "banners",
    model: "banner",
    label: "Banners",
    singular: "banner",
    description: "Announcements with start and end dates: a bar on every page, or a popup on the home page.",
    permission: "website.edit",
    fields: [
      {
        name: "placement",
        label: "Where",
        type: "select",
        required: true,
        default: "TOP_BAR",
        options: [
          { value: "TOP_BAR", label: "Bar at the top of every page" },
          { value: "HOME_POPUP", label: "Popup on the home page" },
        ],
      },
      { name: "title", label: "Title", type: "text", required: true, max: 120 },
      { name: "message", label: "Message", type: "textarea", max: 300, rows: 2 },
      { name: "linkLabel", label: "Button label", type: "text", max: 40 },
      { name: "linkUrl", label: "Button link", type: "url" },
      { name: "startsAt", label: "Show from", type: "date", required: true },
      { name: "endsAt", label: "Show until (inclusive)", type: "date" },
      { name: "isActive", label: "Active", type: "switch", default: true },
    ],
    columns: ["title", "placement", "startsAt", "endsAt", "isActive"],
    liveField: "isActive",
    orderBy: [{ startsAt: "desc" }],
  },
  companies: {
    kind: "companies",
    model: "company",
    label: "Hiring companies",
    singular: "company",
    description: "Companies that hire our students. Logos marked for the website appear in the placements strip.",
    permission: "companies.manage",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 120 },
      { name: "logoId", label: "Logo", type: "image" },
      { name: "website", label: "Website", type: "url" },
      { name: "industry", label: "Industry", type: "text", max: 80 },
      { name: "city", label: "City", type: "text", max: 80 },
      { name: "showOnWebsite", label: "Show logo on the website", type: "switch" },
      { name: "isActive", label: "Active", type: "switch", default: true },
    ],
    columns: ["name", "logoId", "city", "showOnWebsite"],
    liveField: "showOnWebsite",
    orderBy: [{ name: "asc" }],
    softDelete: true,
  },
};

export function isContentKind(v: string): v is ContentKind {
  return (CONTENT_KINDS as readonly string[]).includes(v);
}
