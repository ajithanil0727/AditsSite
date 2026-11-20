/**
 * Phase 4 demo data: lead sources & statuses, website pages/sections, menus, site settings, services,
 * testimonials, success stories, FAQs, a banner, course descriptions and a few enquiries.
 * Neutral placeholder content: replace it from Website in the admin panel.
 * Idempotent: each block skips when its data already exists.
 */
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { SECTIONS, SYSTEM_PAGES, type SectionType } from "../../src/modules/website/sections";
import { DEFAULT_SITE, SITE_KEY } from "../../src/modules/website/site-settings";

type Ctx = { orgId: string; branchIds: Record<string, string>; userIds: Record<string, string> };
const json = (v: unknown) => v as Prisma.InputJsonValue;
const DAY = 86_400_000;

type SectionSeed = { type: SectionType; content?: Record<string, unknown> };

const PAGE_SECTIONS: Partial<Record<(typeof SYSTEM_PAGES)[number]["kind"], SectionSeed[]>> = {
  HOME: [
    { type: "hero" },
    { type: "stats" },
    { type: "features" },
    {
      type: "courses",
      content: {
        title: "Popular courses",
        subtitle: "Learn on real boards with experienced technicians.",
        mode: "featured",
        limit: 3,
      },
    },
    { type: "steps" },
    {
      type: "services",
      content: {
        title: "Repair services",
        subtitle: "Phones, laptops and more, fixed at chip level.",
        mode: "featured",
        limit: 6,
      },
    },
    { type: "placements" },
    { type: "testimonials" },
    { type: "branches" },
    { type: "cta" },
  ],
  ABOUT: [
    {
      type: "imageText",
      content: {
        title: "About us",
        body:
          "We started as a small repair bench and grew into a **training institute and service centre** under one roof.\n\n" +
          "Our trainers are working technicians, so students learn the faults that actually come into a service centre, and customers get repairs from people who teach the trade.\n\n" +
          "- Hands-on training on real phone and laptop boards\n- Small batches and lab practice every day\n- Placement support after the course",
        imageSide: "right",
        link: { label: "See our courses", href: "/courses" },
      },
    },
    { type: "stats", content: { title: "In numbers" } },
    { type: "cta" },
  ],
  COURSES: [],
  SERVICES: [{ type: "steps" }],
  BRANCHES: [],
  PLACEMENTS: [{ type: "stats", content: { title: "" } }],
  GALLERY: [],
  TESTIMONIALS: [],
  FAQ: [],
  CONTACT: [],
};

export async function seedPhase4(db: PrismaClient, ctx: Ctx) {
  const { orgId, branchIds, userIds } = ctx;

  // --- Lead sources & statuses ---
  if ((await db.leadSource.count({ where: { organizationId: orgId } })) === 0) {
    await db.leadSource.create({ data: { organizationId: orgId, name: "Website", isSystem: true } });
    await db.leadSource.createMany({
      data: ["Walk-in", "Phone call", "Referral", "Instagram", "Facebook", "Google"].map((name) => ({
        organizationId: orgId,
        name,
      })),
    });
  }
  if ((await db.leadStatus.count({ where: { organizationId: orgId } })) === 0) {
    await db.leadStatus.createMany({
      data: [
        { name: "New", color: "sky", sortOrder: 0, isDefault: true },
        { name: "Contacted", color: "lavender", sortOrder: 1 },
        { name: "Interested", color: "peach", sortOrder: 2 },
        { name: "Visit scheduled", color: "peach", sortOrder: 3 },
        { name: "Won", color: "mint", sortOrder: 4, isWon: true },
        { name: "Lost", color: "neutral", sortOrder: 5, isLost: true },
      ].map((s) => ({ ...s, organizationId: orgId })),
    });
  }

  // --- Head office isn't a place customers visit ---
  if (branchIds.HO)
    await db.branch.updateMany({ where: { id: branchIds.HO, kind: "HEAD_OFFICE" }, data: { showOnWebsite: false } });

  // --- Pages + sections (published) ---
  const pageIds: Record<string, string> = {};
  for (const p of SYSTEM_PAGES) {
    let page = await db.page.findUnique({ where: { organizationId_slug: { organizationId: orgId, slug: p.slug } } });
    if (!page) {
      page = await db.page.create({
        data: {
          organizationId: orgId,
          kind: p.kind,
          slug: p.slug,
          title: p.title,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      const sections = PAGE_SECTIONS[p.kind] ?? [];
      for (const [i, s] of sections.entries()) {
        const content = json({ ...SECTIONS[s.type].defaults, ...(s.content ?? {}) });
        await db.pageSection.create({
          data: {
            pageId: page.id,
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
    }
    pageIds[p.kind] = page.id;
  }

  // --- Menus ---
  if ((await db.menuItem.count({ where: { organizationId: orgId } })) === 0) {
    const header: [string, string | null, string | null][] = [
      ["Courses", "COURSES", null],
      ["Services", "SERVICES", null],
      ["Placements", "PLACEMENTS", null],
      ["Branches", "BRANCHES", null],
      ["About", "ABOUT", null],
      ["Contact", "CONTACT", null],
    ];
    for (const [i, [label, kind, url]] of header.entries())
      await db.menuItem.create({
        data: {
          organizationId: orgId,
          location: "HEADER",
          label,
          pageId: kind ? pageIds[kind] : null,
          url,
          sortOrder: i,
        },
      });
    const about = await db.menuItem.findFirst({ where: { organizationId: orgId, label: "About" } });
    if (about) {
      for (const [i, [label, kind]] of (
        [
          ["Gallery", "GALLERY"],
          ["Testimonials", "TESTIMONIALS"],
          ["FAQs", "FAQ"],
        ] as const
      ).entries())
        await db.menuItem.create({
          data: {
            organizationId: orgId,
            location: "HEADER",
            label,
            pageId: pageIds[kind],
            parentId: about.id,
            sortOrder: i,
          },
        });
    }
    const footer: [string, string | null, string | null][] = [
      ["About us", "ABOUT", null],
      ["Courses", "COURSES", null],
      ["Book a repair", null, "/book-repair"],
      ["Track your repair", null, "/track"],
      ["Gallery", "GALLERY", null],
      ["FAQs", "FAQ", null],
      ["Contact", "CONTACT", null],
    ];
    for (const [i, [label, kind, url]] of footer.entries())
      await db.menuItem.create({
        data: {
          organizationId: orgId,
          location: "FOOTER",
          label,
          pageId: kind ? pageIds[kind] : null,
          url,
          sortOrder: i,
        },
      });
  }

  // --- Site settings ---
  const hasSite = await db.setting.findUnique({
    where: { organizationId_key: { organizationId: orgId, key: SITE_KEY } },
  });
  if (!hasSite) {
    await db.setting.create({
      data: {
        organizationId: orgId,
        key: SITE_KEY,
        value: json({
          ...DEFAULT_SITE,
          seo: {
            ...DEFAULT_SITE.seo,
            description:
              "Chip-level mobile and laptop repair courses with placement support, and a trusted repair service centre.",
            keywords: "chip level repair course, mobile repair course, laptop repair, phone repair Palakkad",
          },
        }),
      },
    });
  }

  // --- Services ---
  if ((await db.serviceOffering.count({ where: { organizationId: orgId } })) === 0) {
    const mobile = await db.deviceType.findFirst({ where: { organizationId: orgId, name: { contains: "Mobile" } } });
    const laptop = await db.deviceType.findFirst({ where: { organizationId: orgId, name: { contains: "Laptop" } } });
    const services = [
      [
        "Mobile board repair",
        "mobile-board-repair",
        "smartphone",
        mobile?.id,
        800,
        "Dead phones, no charging, no network and short circuits fixed at chip level.",
      ],
      [
        "Laptop motherboard repair",
        "laptop-motherboard-repair",
        "laptop",
        laptop?.id,
        1500,
        "No power, no display and liquid damage on laptop boards.",
      ],
      [
        "Water damage recovery",
        "water-damage-recovery",
        "zap",
        mobile?.id,
        1000,
        "Ultrasonic cleaning and component-level repair after liquid damage.",
      ],
      [
        "Screen & battery replacement",
        "screen-battery",
        "shield",
        mobile?.id,
        600,
        "Genuine-quality displays and batteries, fitted and tested.",
      ],
      [
        "Data recovery",
        "data-recovery",
        "cpu",
        null,
        1500,
        "Get photos and files back from dead phones and laptops where possible.",
      ],
      [
        "IC & BGA rework",
        "ic-bga-rework",
        "microscope",
        null,
        1200,
        "Reballing and replacing power, charging and audio ICs.",
      ],
    ] as const;
    for (const [i, [title, slug, icon, deviceTypeId, price, summary]] of services.entries()) {
      await db.serviceOffering.create({
        data: {
          organizationId: orgId,
          title,
          slug,
          iconName: icon,
          deviceTypeId: deviceTypeId ?? null,
          startingPrice: price,
          summary,
          description: json(
            `${summary}\n\n## How it works\n\n1. Free inspection and diagnosis\n2. A clear quote before we start\n3. Repair, quality check and warranty on the work`,
          ),
          isPublished: true,
          isFeatured: true,
          sortOrder: i,
        },
      });
    }
  }

  // --- Testimonials, stories, FAQs ---
  if ((await db.testimonial.count({ where: { organizationId: orgId } })) === 0) {
    await db.testimonial.createMany({
      data: [
        {
          name: "Akhil R.",
          role: "Student, Advanced Mobile Repair",
          rating: 5,
          quote: "The lab practice made the difference. I opened my own repair shop three months after the course.",
        },
        {
          name: "Fathima S.",
          role: "Student, Laptop Chip-Level",
          rating: 5,
          quote:
            "Trainers explain every fault on real boards. I got placed at a service centre before the course ended.",
        },
        {
          name: "Joseph K.",
          role: "Customer",
          rating: 5,
          quote: "My phone was dead after rain. They fixed the board and saved all my photos. Honest price too.",
        },
        {
          name: "Priya M.",
          role: "Customer",
          rating: 4,
          quote: "Clear updates on WhatsApp and the laptop came back working like new.",
        },
      ].map((t, i) => ({
        ...t,
        organizationId: orgId,
        isPublished: true,
        sortOrder: i,
        branchId: branchIds.PKD ?? null,
      })),
    });
  }
  if ((await db.successStory.count({ where: { organizationId: orgId } })) === 0) {
    await db.successStory.createMany({
      data: [
        {
          studentName: "Arjun P.",
          companyName: "QuickFix Mobiles",
          designation: "Board-level technician",
          courseName: "Advanced Mobile Repair",
          packageText: "₹22,000 / month",
        },
        {
          studentName: "Sneha V.",
          companyName: "LapCare Service",
          designation: "Laptop engineer",
          courseName: "Laptop Chip-Level",
          packageText: "₹2.8 LPA",
        },
        {
          studentName: "Rahul T.",
          companyName: "Own business",
          designation: "Founder, RT Mobile Clinic",
          courseName: "Advanced Mobile Repair",
          quote: "Started with one bench. Now two technicians work with me.",
        },
      ].map((s, i) => ({ ...s, organizationId: orgId, isPublished: true, sortOrder: i })),
    });
  }
  if ((await db.faq.count({ where: { organizationId: orgId } })) === 0) {
    await db.faq.createMany({
      data: [
        [
          "Courses",
          "Do I need any experience to join?",
          "No. Our basic course starts from electronics fundamentals. The advanced course suits people who already know basic repairs.",
        ],
        [
          "Courses",
          "Can I pay the fee in instalments?",
          "Yes. Most courses can be paid in **three instalments**. Ask a counsellor for the plan that suits you.",
        ],
        [
          "Courses",
          "Do you help with jobs?",
          "Yes. We share openings from service centres and repair shops and help you prepare for interviews.",
        ],
        [
          "Repairs",
          "How long does a repair take?",
          "Simple repairs are often done the same day. Board-level repairs usually take 2–4 days. We give you a date when you drop the device off.",
        ],
        [
          "Repairs",
          "Do you charge for diagnosis?",
          "Diagnosis is free if you go ahead with the repair. You approve the quote before any work starts.",
        ],
        [
          "Repairs",
          "Is there a warranty?",
          "Yes, every repair comes with a warranty on the work done. The period depends on the repair and is written on your invoice.",
        ],
      ].map(([category, question, answer], i) => ({
        organizationId: orgId,
        category,
        question,
        answer,
        isPublished: true,
        sortOrder: i,
      })),
    });
  }

  // --- Banner ---
  if ((await db.banner.count({ where: { organizationId: orgId } })) === 0) {
    await db.banner.create({
      data: {
        organizationId: orgId,
        placement: "TOP_BAR",
        title: "New batches start every month.",
        message: "Weekday and weekend timings.",
        linkLabel: "Enquire now",
        linkUrl: "/enquire",
        startsAt: new Date(Date.now() - DAY),
        endsAt: new Date(Date.now() + 60 * DAY),
        isActive: true,
      },
    });
  }

  // --- Course website copy ---
  const courses = await db.course.findMany({ where: { organizationId: orgId, deletedAt: null } });
  for (const c of courses) {
    if (c.description !== null) continue;
    await db.course.update({
      where: { id: c.id },
      data: {
        description: json(
          `${c.shortDescription ?? c.name}\n\n## What makes it different\n\n- Daily practice on real boards in our lab\n- Small batches, so trainers can help everyone\n- Fault-finding with schematics and boardview\n- Placement support after you finish\n\n## After the course\n\nYou can work as a technician in a service centre or start your own repair business.`,
        ),
        eligibility:
          c.eligibility ??
          "Anyone aged 16+ with an interest in electronics. No prior experience needed for the basic level.",
      },
    });
  }

  // --- A few enquiries (Palakkad) ---
  if ((await db.lead.count({ where: { organizationId: orgId } })) === 0 && branchIds.PKD) {
    const [website, walkIn, phone] = await Promise.all(
      ["Website", "Walk-in", "Phone call"].map((n) =>
        db.leadSource.findFirstOrThrow({ where: { organizationId: orgId, name: n } }),
      ),
    );
    const statuses = Object.fromEntries(
      (await db.leadStatus.findMany({ where: { organizationId: orgId } })).map((s) => [s.name, s.id]),
    );
    const adv = courses.find((c) => c.code === "SPE");
    const lap = courses.find((c) => c.code === "LCE");
    const counsellor = userIds["frontdesk.pkd@demo.test"] ?? null;
    const now = Date.now();
    const leads = [
      {
        name: "Nikhil Raj",
        phone: "9447100001",
        type: "COURSE",
        sourceId: website.id,
        statusId: statuses.New,
        courseId: adv?.id,
        message: "Weekend batch available?",
        followUp: now - 2 * 3600_000,
        age: 1,
      },
      {
        name: "Aswathy Menon",
        phone: "9447100002",
        type: "COURSE",
        sourceId: walkIn.id,
        statusId: statuses.Interested,
        courseId: lap?.id,
        followUp: now + 2 * 3600_000,
        age: 3,
      },
      {
        name: "Vivek Das",
        phone: "9447100003",
        type: "SERVICE",
        sourceId: phone.id,
        statusId: statuses.Contacted,
        deviceText: "Redmi Note 12",
        problemText: "Not charging",
        followUp: now - 2 * DAY,
        age: 4,
      },
      {
        name: "Meenu George",
        phone: "9447100004",
        type: "COURSE",
        sourceId: website.id,
        statusId: statuses.Lost,
        courseId: adv?.id,
        lostReason: "Joined a course closer to home",
        age: 12,
      },
    ] as const;
    for (const l of leads) {
      const created = new Date(now - l.age * DAY);
      const lead = await db.lead.create({
        data: {
          organizationId: orgId,
          branchId: branchIds.PKD,
          type: l.type,
          sourceId: l.sourceId,
          statusId: l.statusId,
          assignedToId: counsellor,
          name: l.name,
          phone: l.phone,
          courseId: "courseId" in l ? (l.courseId ?? null) : null,
          deviceText: "deviceText" in l ? l.deviceText : null,
          problemText: "problemText" in l ? l.problemText : null,
          message: "message" in l ? l.message : null,
          lostReason: "lostReason" in l ? l.lostReason : null,
          nextFollowUpAt: "followUp" in l ? new Date(l.followUp) : null,
          createdAt: created,
          lastEnquiryAt: created,
        },
      });
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: null,
          kind: "ASSIGNMENT",
          note: "Assigned automatically (round-robin)",
          createdAt: created,
        },
      });
      if (l.statusId !== statuses.New)
        await db.leadActivity.create({
          data: {
            leadId: lead.id,
            userId: counsellor,
            kind: "CALL",
            note: "Called and shared batch timings.",
            createdAt: new Date(created.getTime() + 3600_000),
          },
        });
    }
  }
}
