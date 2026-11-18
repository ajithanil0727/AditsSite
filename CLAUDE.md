# CLAUDE.md

Management platform for our chip-level repair training institutes and service centres (India, multi-branch, owned by several co-owners).
Brief: `PROJECT_BRIEF.md` · Design: `docs/PHASE_0_DESIGN.md` · Schema: `prisma/schema.prisma` · Setup: `README.md`

## Status

- Phase 0 (design): approved 2026-11-17.
- Phase 1 (foundation): done 2026-11-17. Auth, RBAC + permission matrix, branches, branch switcher, users, audit log, settings (company/logo, GST registrations, number series), theme, admin shell, seed, tests.
- Phase 2 (service centre + inventory): done 2026-11-17. Master-data editor, parts/stock/movements/adjustments, transfers, purchases + vendor payments, part requests, job cards (intake → diagnosis → quote → repair → QC → ready → delivered), GST invoices, advances/payments/refunds with receipts, print views (invoice, job card, receipt), public repair tracker (/track).
- Phase 3 (students + fees): done 2026-11-18. Courses (fee plans, syllabus), batches, admissions (editable instalment schedule), student profiles, fee collection + receipts, receipt cancellation, discounts with approval, refunds (request → approve → pay), transfers, dropout, instalment waivers, batch attendance, dues / receipts / approvals screens, printable fee receipt.
- Phase 4 (website + CRM): done 2026-11-18. Public site (GSAP home, pastel pages, course/service pages, enquiry + repair booking forms, sitemap/robots), content manager (page sections with draft → preview → publish, menus, media library with crop + alt text, services/testimonials/stories/gallery/FAQs/banners/companies, site settings), enquiries/CRM (round-robin, follow-ups, timeline, convert to admission / job card, conversion report), notification bell.
- Next: Phase 5 (accounts).

## Stack

Next.js 16 (App Router, **Cache Components on**) · Prisma **7.10.x** (stable, not the 8.0 RC; `prisma-client` generator → `src/generated/prisma`, URL in `prisma.config.ts`) + PostgreSQL · Better Auth 1.7 · Tailwind 4 + shadcn/ui (radix, nova) · TanStack Table **v9** · RHF + Zod 4 · Vitest 5 · Playwright.
Read `node_modules/next/dist/docs/` before using a Next API you haven't used here; v16 differs from older versions (middleware is now `src/proxy.ts`, `revalidateTag(tag, profile)`, `updateTag`, `refresh()` in actions).

## Commands

- `npm run dev` · `npm run build` · `npm run check` (typecheck + lint + vitest) · `npm run test:e2e`
- `npm run db:migrate` · `npm run db:seed` · `npm run db:studio`
- Local DB on this machine (no Docker): `npx prisma dev -d --name mgmt` (TCP 51214, shadow 51215). It allows 10 connections in total and doesn't free closed ones. Keep `DATABASE_POOL_MAX=3`, and restart it if it starts refusing connections.
- After `prisma migrate dev`, run `npm run db:generate`: Prisma 7 no longer regenerates the client automatically.
- The local `prisma dev` DB leaks connections across test runs; if tests or pages hang with "Server has closed the connection", restart it. Tests use a pool of 2 and run files one at a time.
- `prisma migrate reset` is blocked when run by an AI agent. Ask the user to run it, or make targeted data fixes instead.

## Conventions

- **Business logic** lives in `src/modules/<domain>/<domain>.service.ts`. `*.actions.ts` = `"use server"` wrappers, `*.queries.ts` = reads for pages, `*.schemas.ts` = Zod (shared by client and server).
- **Every server action** goes through `defineAction({ permission, schema }, handler)` (`src/modules/rbac/action.ts`): session → permission → Zod → handler; `ActionError` gives friendly messages. Branch scope is checked in the service using `canAccessBranch` / `branchConstraint`.
- **Pages**: the first line is `requirePagePermission("x.view")`. The admin layout wraps everything in Suspense; `admin/loading.tsx` streams pages.
- **Forms**: RHF + `zodResolver`, validated on the client, but **send `form.getValues()` (the raw input) to the action**, never the transformed output (transforms aren't idempotent). Use `useWatch`, not `form.watch` (React Compiler lint). Field components are in `components/forms/fields.tsx`. Results go through `handleActionResult`.
- **Lists**: search, paging, sort and filters live in the URL (`parseListParams`, `f_<name>` filters, `deleted=1`). `DataTable` only renders.
- **Never write role-name checks**. Permissions are `module.action` from `src/lib/permissions.ts` (the seed syncs them into the DB). The nav is filtered by permissions in `components/layout/nav-config.ts`.
- **No privilege escalation**: users can only grant roles, permissions, scopes and branches they hold themselves (`rbac/escalation.ts`).
- **Audit**: `writeAudit(tx, ctx.actor, …)` inside the same transaction. UPDATE stores only changed fields; secrets are redacted.
- **Soft delete**: always filter `deletedAt: null` explicitly (no Prisma extension: Prisma 7 doesn't expose the data model at runtime). Ledgers are append-only.
- **Money** `Decimal(12,2)` with `Prisma.Decimal`, never floats. **Dates** shown DD/MM/YYYY in IST (`lib/format.ts`); FY starts 1 April, written "26-27" (`lib/fy.ts`).
- **Document numbers** come only from `nextDocNumber(tx, …)` inside the document's transaction (atomic, per branch, per FY).
- **Colours** come only from tokens in `globals.css` (`bg-mint`, `text-lavender-foreground`, `bg-primary`…). No hex values in components.
- `"server-only"` is on server modules. Pure modules (permissions, fy, numbering/format, access, escalation, password) stay importable by the seed and by tests.
- Uploaded images: PNG/JPG/WebP only (no SVG). Public files are served from `/api/files/[id]`; private ones require an org session.

## Key business decisions

- Owner shares are **per branch** and dated. Head-office expenses are allocated to branches by a **fixed dated %**.
- Course: one fixed fee. GST mode (exempt/inclusive/exclusive) is **set per course**.
- Some branches have **no GSTIN** → non-GST invoices. A GSTIN must be in the branch's state.
- Number series: **per branch, resets every FY**. GST invoice/credit-note numbers are **≤16 chars**, so branch codes are capped at **4 chars**. Defaults: `KOC/2627/00001`, `KOC/B2627/…`, `KOC/C2627/…`, `KOC/JC/26-27/00001`. Next number can only go up.
- **No counter sales.** Parts leave stock only via job cards, transfers, adjustments or internal use.
- Discounts: per-role limit on `Role` (0 = always needs approval; the highest limit across a user's roles applies). Refunds need approval, plus a credit note when a tax invoice exists.
- Stock: weighted average cost per branch. Payroll: simple (no PF/ESI/PT/TDS).
- Role scope: union of roles; the widest scope per permission wins. OWN = assigned branches + own records.

### Phase 2 decisions (service + inventory)

- **Prices are GST-inclusive.** Registered branch: invoice splits taxable + GST per line (`modules/tax/gst.ts`, paise maths, per-line rounding, total rounded to the rupee). Unregistered branch: no GST, "Non-GST invoice".
- **CGST+SGST** normally; **IGST** only when the customer has a GSTIN from another state.
- Default GST 18% for parts and labour when an item has no rate (`DEFAULT_SERVICE_GST`).
- **Repair may start** if charges ≤ the intake estimate; above it needs an **approved quotation** (`repairAllowed`). Quote decisions are recorded by staff (phone / in person / WhatsApp).
- **Warranty repeat job**: labour always free; the service manager (`jobcards.warranty_decide`) can make parts free for the job or per part. Warranty days come from the most specific Warranty rule and start on delivery (only for jobs that went through repair).
- **Advance** optional at intake, receipted (SERVICE_RECEIPT series), adjusted on the invoice; refundable. Payments/refunds go to the day book (`MoneyTransaction`).
- **Delivery** needs an invoice when there are charges and full payment, unless the user has `jobcards.deliver_credit` (then it's flagged and the invoice shows in the dues list).
- **Unlock codes**: AES-256-GCM (`DATA_ENCRYPTION_KEY`), revealed only by the assigned engineer or `jobcards.view_unlock_code` (Owner, Service Manager), every reveal audited (REVEAL_SECRET), wiped on delivery/cancel.
- **Stock**: no negative stock; row-locked (`SELECT … FOR UPDATE`) movements via `inventory/stock.service.ts` only. Unregistered branches add purchase GST to the part cost (no input credit). Transfers move at the sender's average cost.
- Invoices can be cancelled before delivery (number stays used; money stays on the job). After delivery, credit notes (Phase 5).
- Printing is HTML print views (`/print/*`, "Print / Save as PDF"), not server-generated PDF files yet.

### Phase 3 decisions (students + fees)

- **Fees get receipts only** (FEE_RECEIPT series), no tax invoices yet; each course keeps its GST mode for later (waiting for the CA). So refunds have no credit note.
- Schedules come from a course fee plan and are **editable at admission**; they must add up to the net fee (`fees/fee-logic.ts`).
- Payments settle the **oldest unpaid instalment first**; over-payment is refused.
- **Discounts**: within the user's role limits (both % and ₹) apply immediately; above, a pending request. Approvers can't approve their own request and only within their own limit. Approved discounts reduce the **last unpaid instalments first**.
- **Refunds**: request → approve (not your own) → pay out (day book OUT). Refundable = received − refunded − pending/approved refunds.
- **Branch transfer**: paid fees stay with the old branch; future collections are the new branch's (enrollment.branchId moves; receipts use the collecting branch's series).
- **Dropout** waives all unpaid instalments automatically. "Completed" keeps any dues in the dues list.
- Receipts can be cancelled (wrong entry): allocations reversed, day-book reversal (ADJUSTMENT OUT), number stays used.
- Attendance: one session per batch per day, re-saving overwrites; trainers (OWN) only mark their own batches; no future dates. Late = present, half-day = ½, leave/holiday excluded from %.
- Login rate limit is env-configurable (`AUTH_LOGIN_MAX_PER_MINUTE`, default 5); only the Playwright web server raises it.

### Phase 4 decisions (website + CRM)

- **Public site** lives in `src/app/(public)`; data comes only from `modules/website/site.data.ts` (`"use cache"`, tag `site`). Every CMS / course / branch / company change calls `revalidateSite()` (`updateTag("site")`). Dynamic routes await `params` inside `<Suspense>` (no `generateStaticParams`: it must be non-empty with Cache Components). Client hooks like `usePathname` in the public layout break prerendering of dynamic routes, so don't add them there.
- **Sections**: types, editor fields and defaults in `modules/website/sections.ts` (field descriptors + Zod in `fields.ts`). Editing changes the draft columns of `PageSection`; **Publish** copies them to `published*`; never-published sections have `publishedSortOrder = null`. Page title/SEO apply immediately. System pages (fixed slugs) are always live; custom pages need publishing. Preview: `/preview/[pageId]` (signed in, `website.view`).
- **Motion**: home page uses GSAP via data attributes (`components/site/home-motion.tsx`; the pinned row is created before other ScrollTriggers). Inner pages use `reveal.tsx` (IntersectionObserver + CSS). Reduced motion = no animation. Content is server-rendered and visible without JS. The hidden browser pane doesn't run rAF; check motion with headless Playwright.
- **Rich text** is Markdown (`MarkdownEditor`, rendered by `components/cms/markdown.tsx`; raw HTML ignored, inline images only from `/api/files`). Course / service descriptions are Markdown strings in their `Json` column.
- **Media**: public website images only (PNG/JPG/WebP, ≤5 MB), cropped client-side (react-easy-crop → WebP/PNG), alt text + folder. Images in use can't be deleted (`mediaUsage`). next/image only optimises `/api/files/**`.
- **Website leads**: visitor picks the branch (institute branches for course enquiries, service branches for bookings). Spam: honeypot + 3 s minimum fill time + per-IP (5/10 min) and per-phone (3/h) limits, in memory; bots get a fake "thank you".
- **Round-robin**: users assigned to the branch whose role gives `leads.receive` at OWN/ASSIGNED scope (all-branch roles hold it for grant purposes but aren't in the rotation; Branch Manager doesn't get it by default). Next = longest since last lead, serialised with an advisory lock. Nobody eligible → unassigned and the branch's `leads.assign` users are notified.
- **Duplicates**: an enquiry from a phone with an open lead of the same type is added to it (ENQUIRY activity, `enquiryCount`), never a new lead.
- **Conversion**: admitting a student / opening a job card for a phone with an open lead of that type marks it won and links `Lead.enrollmentId` / `Lead.jobCardId` (`convertLeadOnCreate`). The Convert button opens `/admin/students/new?lead=` or `/admin/service/intake?lead=` pre-filled.
- **Notifications**: in-app only (`notify()` inside the transaction); the bell polls every minute and shows today's / overdue follow-ups. Email/WhatsApp later with message templates.
- Course fees on the site: per-course `showFeeOnWebsite`; off = "Contact us for fees".
- Seed content is a neutral placeholder; the owner will send real brand details (name, numbers, contacts) to replace it.

## Open points (asked in Phase 0, unanswered)

Tax invoices on GST-applicable course fees (waiting for the CA); P&L timing (fees on receipt, service on invoice); real owner/branch list for the seed; real brand details for the website content. Certificate verification (`/verify`) comes with certificates.
