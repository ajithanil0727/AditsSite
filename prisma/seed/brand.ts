/**
 * ADITS brand content for the website, taken from the old adits site (index.html + images).
 * Runs once per database (marker Setting "seed.brand"); after that, everything is edited in the admin panel.
 *
 * Only facts from the old site are used. Anything not known (numbers, testimonials, prices, FAQs, email,
 * opening hours) is left out or unpublished so the live site never shows made-up claims.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { SECTIONS, type SectionType } from "../../src/modules/website/sections";
import { DEFAULT_SITE, SITE_KEY } from "../../src/modules/website/site-settings";

type Ctx = { orgId: string; branchIds: Record<string, string>; userIds: Record<string, string> };
const json = (v: unknown) => v as Prisma.InputJsonValue;
const MARKER = "seed.brand";
const ASSETS = path.join(__dirname, "assets", "adits");

export const ADITS_COMPANY = {
  name: "ADITS",
  legalName: "ADITS Innovative",
  tagline: "Chip-level smartphone and laptop engineering training in Kerala.",
  phone: "9061347096",
  email: undefined,
  website: undefined,
  addressLine1: "2nd Floor, AR Complex, Opp. Priyadarshini Theatre",
  addressLine2: undefined,
  city: "Palakkad",
  state: "Kerala",
  pincode: "678001",
  logoFileId: null as string | null,
};

const SERVICES_TEXT =
  "An exclusive training institute with the latest equipment and devices, and a hi-tech lab with sophisticated tools. " +
  "Our trained, qualified and experienced faculty make sure technicians learn the latest technologies on upgraded equipment. " +
  "We offer job placement assistance after the course, and upgrading classes for working mobile phone technicians.";

const ABOUT_TEXT =
  "**ADITS** is a group dedicated to developing and building knowledge in innovative technologies, and we have been redefining the scope of mobile phone technology.\n\n" +
  "Our team provides the best and most experienced facilities for our students. Our academic and curriculum activities are well planned and scheduled to ensure success, not only academically but in the overall lives of our students.";

const IMAGES = [
  { file: "logo-mark.png", type: "image/png", alt: "ADITS logo", folder: "branding" },
  { file: "img_1.webp", type: "image/webp", alt: "Inauguration of the ADITS training centre", folder: "gallery" },
  { file: "img_2.webp", type: "image/webp", alt: "Students in a theory class at ADITS", folder: "gallery" },
  { file: "img_3.webp", type: "image/webp", alt: "BGA rework station in the ADITS lab", folder: "gallery" },
  { file: "img_4.webp", type: "image/webp", alt: "ADITS students in uniform", folder: "gallery" },
  { file: "card1.webp", type: "image/webp", alt: "Technician replacing a smartphone display", folder: "courses" },
  { file: "card2.webp", type: "image/webp", alt: "Laptop motherboard repair", folder: "courses" },
  { file: "card3.webp", type: "image/webp", alt: "Smartphone and laptop repair", folder: "courses" },
] as const;

async function upload(db: PrismaClient, orgId: string, img: (typeof IMAGES)[number]) {
  const existing = await db.fileAsset.findFirst({
    where: { organizationId: orgId, originalName: `adits-${img.file}`, deletedAt: null },
  });
  if (existing) return existing.id;
  const data = await readFile(path.join(ASSETS, img.file));
  const ext = img.file.split(".").pop();
  const key = `${orgId}/website/${randomUUID()}.${ext}`;
  const root = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  const file = path.resolve(root, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  const meta = await import("sharp").then((s) => s.default(data).metadata());
  const asset = await db.fileAsset.create({
    data: {
      organizationId: orgId,
      storageKey: key,
      originalName: `adits-${img.file}`,
      mimeType: img.type,
      sizeBytes: data.length,
      width: meta.width ?? null,
      height: meta.height ?? null,
      altText: img.alt,
      folder: img.folder,
      isPublic: true,
    },
  });
  return asset.id;
}

async function replaceSections(
  db: PrismaClient,
  pageId: string,
  list: { type: SectionType; content?: Record<string, unknown> }[],
) {
  await db.pageSection.deleteMany({ where: { pageId } });
  for (const [i, s] of list.entries()) {
    const content = json({ ...SECTIONS[s.type].defaults, ...(s.content ?? {}) });
    await db.pageSection.create({
      data: {
        pageId,
        type: s.type,
        sortOrder: i,
        isVisible: true,
        draftContent: content,
        publishedContent: content,
        publishedSortOrder: i,
        publishedVisible: true,
      },
    });
  }
  await db.page.update({ where: { id: pageId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
}

export async function applyBrand(db: PrismaClient, ctx: Ctx) {
  const { orgId } = ctx;
  const done = await db.setting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: MARKER } } });
  if (done) return;

  // --- Images ---
  const ids: Record<string, string> = {};
  for (const img of IMAGES) ids[img.file] = await upload(db, orgId, img);

  // --- Company profile + organisation ---
  const company = { ...ADITS_COMPANY, logoFileId: ids["logo-mark.png"] };
  await db.setting.upsert({
    where: { organizationId_key: { organizationId: orgId, key: "company" } },
    create: { organizationId: orgId, key: "company", value: json(company) },
    update: { value: json(company) },
  });
  await db.organization.update({ where: { id: orgId }, data: { name: company.name, legalName: company.legalName } });

  // --- Site settings ---
  await db.setting.upsert({
    where: { organizationId_key: { organizationId: orgId, key: SITE_KEY } },
    create: { organizationId: orgId, key: SITE_KEY, value: json({}) },
    update: {},
  });
  await db.setting.update({
    where: { organizationId_key: { organizationId: orgId, key: SITE_KEY } },
    data: {
      value: json({
        ...DEFAULT_SITE,
        contact: {
          ...DEFAULT_SITE.contact,
          phone: "9061347096",
          hours: "",
          mapUrl: "https://maps.google.com/?q=Adits+innovative+Palakkad",
        },
        whatsapp: {
          enabled: true,
          number: "9061347096",
          message: "Hi there! I am interested in your courses. Can you tell me more?",
        },
        header: { ctaLabel: "Contact us", ctaHref: "/contact" },
        footer: {
          about:
            "We provide the best mobile repair training in Kerala, helping students gain the skills and confidence to succeed in their careers.",
          copyright: "",
        },
        seo: {
          ...DEFAULT_SITE.seo,
          defaultTitle: "ADITS · Smartphone & laptop chip-level training in Kerala",
          titleSuffix: "ADITS",
          description:
            "Smartphone and laptop chip-level engineering courses in Palakkad and Mukkam, with a hi-tech lab, on-the-job training and placement assistance.",
          keywords:
            "smartphone engineering course, mobile repair course Palakkad, laptop chip level course Kerala, mobile technician training Mukkam",
          ogImageId: ids["img_4.webp"],
        },
      }),
    },
  });

  // --- Pages ---
  const page = (slug: string) =>
    db.page.findUniqueOrThrow({ where: { organizationId_slug: { organizationId: orgId, slug } } });
  await replaceSections(db, (await page("")).id, [
    {
      type: "hero",
      content: {
        eyebrow: "Chip-level training institute · Kerala",
        headline: "Become a smartphone and laptop chip-level engineer.",
        highlight: "chip-level engineer",
        subtext:
          "Hands-on training in a hi-tech lab with experienced faculty, on-the-job training and placement assistance after the course.",
        primary: { label: "Enquire about a course", href: "/enquire" },
        secondary: { label: "Visit our centres", href: "/branches" },
        image: null,
      },
    },
    {
      type: "features",
      content: {
        title: "Why ADITS",
        subtitle: "",
        items: [
          {
            icon: "microscope",
            tone: "lavender",
            title: "Hi-tech lab",
            text: "The latest equipment and devices, with sophisticated tools for board-level work.",
            link: { label: "", href: "" },
          },
          {
            icon: "graduation",
            tone: "mint",
            title: "Experienced faculty",
            text: "Trained, qualified and experienced faculty who keep you up to date with the latest technologies.",
            link: { label: "", href: "" },
          },
          {
            icon: "briefcase",
            tone: "peach",
            title: "Placement assistance",
            text: "Job placement assistance after you complete the course.",
            link: { label: "", href: "" },
          },
          {
            icon: "zap",
            tone: "sky",
            title: "Upgrade classes",
            text: "Upgrading classes for working mobile phone technicians.",
            link: { label: "Ask about upgrade classes", href: "/enquire" },
          },
        ],
      },
    },
    {
      type: "courses",
      content: {
        title: "Our courses",
        subtitle: "Smartphone and laptop chip-level engineering.",
        mode: "all",
        limit: 6,
      },
    },
    {
      type: "imageText",
      content: {
        title: "Learn on real equipment",
        body: SERVICES_TEXT,
        image: ids["img_3.webp"],
        imageSide: "left",
        link: { label: "Enquire now", href: "/enquire" },
      },
    },
    {
      type: "steps",
      content: {
        title: "How the training works",
        subtitle: "",
        items: [
          { title: "Enquire", text: "Talk to us about the course that suits you." },
          { title: "Class training", text: "Theory and practical classes with our faculty." },
          { title: "Lab practice", text: "Hands-on work on real phones and laptops in our lab." },
          { title: "On-the-job training", text: "Real work experience as part of the longer courses." },
          { title: "Placement", text: "Job placement assistance when you finish." },
        ],
      },
    },
    { type: "gallery", content: { title: "Life at ADITS", album: "", limit: 8 } },
    { type: "testimonials" },
    { type: "branches", content: { title: "Our centres", subtitle: "" } },
    {
      type: "cta",
      content: {
        headline: "Start your career in mobile technology",
        text: "Call or WhatsApp us on +91 90613 47096, or send an enquiry.",
        primary: { label: "Enquire about a course", href: "/enquire" },
        secondary: { label: "WhatsApp us", href: "https://wa.me/919061347096" },
        tone: "peach",
      },
    },
  ]);
  await replaceSections(db, (await page("about")).id, [
    {
      type: "imageText",
      content: {
        title: "About ADITS",
        body: ABOUT_TEXT,
        image: ids["img_4.webp"],
        imageSide: "right",
        link: { label: "", href: "" },
      },
    },
    {
      type: "imageText",
      content: {
        title: "What we offer",
        body: SERVICES_TEXT,
        image: ids["img_2.webp"],
        imageSide: "left",
        link: { label: "See our courses", href: "/courses" },
      },
    },
    {
      type: "richText",
      content: {
        title: "Supporting partners",
        body: "- **ADITS Computer Sales and Service**, near Stadium Bus Stand, Palakkad\n- **G4TECH**, near Bus Stand, Edavanna, Malappuram\n- **TECHZONE**, Mannarkkad, Palakkad",
      },
    },
    {
      type: "cta",
      content: {
        ...SECTIONS.cta.defaults,
        headline: "Want to know more?",
        text: "Call or WhatsApp us on +91 90613 47096.",
        tone: "peach",
      },
    },
  ]);

  // --- Gallery ---
  await db.galleryItem.deleteMany({ where: { organizationId: orgId } });
  await db.galleryItem.createMany({
    data: [
      { fileId: ids["img_1.webp"], caption: "Inauguration of our training centre", album: "Events" },
      { fileId: ids["img_2.webp"], caption: "Theory classes", album: "Classes" },
      { fileId: ids["img_3.webp"], caption: "BGA rework station in our lab", album: "Lab" },
      { fileId: ids["img_4.webp"], caption: "Our students", album: "Classes" },
    ].map((g, i) => ({ ...g, organizationId: orgId, isPublished: true, sortOrder: i })),
  });

  // --- No made-up claims on a real brand: keep the demo items as unpublished examples ---
  await db.testimonial.updateMany({ where: { organizationId: orgId }, data: { isPublished: false } });
  await db.successStory.updateMany({ where: { organizationId: orgId }, data: { isPublished: false } });
  await db.faq.updateMany({ where: { organizationId: orgId }, data: { isPublished: false } });
  await db.banner.updateMany({ where: { organizationId: orgId }, data: { isActive: false } });
  await db.serviceOffering.updateMany({ where: { organizationId: orgId }, data: { startingPrice: null } });

  // --- Course images ---
  for (const [code, file] of [
    ["MOB-ADV", "card1.webp"],
    ["LAP-CHIP", "card2.webp"],
    ["MOB-BASIC", "card3.webp"],
  ] as const) {
    await db.course.updateMany({ where: { organizationId: orgId, code, imageId: null }, data: { imageId: ids[file] } });
  }

  await db.setting.create({
    data: { organizationId: orgId, key: MARKER, value: json({ brand: "adits", at: new Date().toISOString() }) },
  });
}
