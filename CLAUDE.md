# CLAUDE.md

Management platform for our chip-level repair training institutes and service centres (India, multi-branch, owned by several co-owners).
Brief: `PROJECT_BRIEF.md` · Design: `docs/PHASE_0_DESIGN.md` · Schema: `prisma/schema.prisma` · Setup: `README.md`

## Status

- Phase 0 (design): approved 2026-11-17.
- Phase 1 (foundation): done 2026-11-17. Auth, RBAC + permission matrix, branches, branch switcher, users, audit log, settings (company/logo, GST registrations, number series), theme, admin shell, seed, tests.
- Phase 2 (service centre + inventory): done 2026-11-17. Master-data editor, parts/stock/movements/adjustments, transfers, purchases + vendor payments, part requests, job cards (intake → diagnosis → quote → repair → QC → ready → delivered), GST invoices, advances/payments/refunds with receipts, print views (invoice, job card, receipt), public repair tracker (/track).
- Phase 3 (students + fees): done 2026-11-18. Courses (fee plans, syllabus), batches, admissions (editable instalment schedule), student profiles, fee collection + receipts, receipt cancellation, discounts with approval, refunds (request → approve → pay), transfers, dropout, instalment waivers, batch attendance, dues / receipts / approvals screens, printable fee receipt.
- Phase 4 (website + CRM): done 2026-11-18. Public site (GSAP home, pastel pages, course/service pages, enquiry + repair booking forms, sitemap/robots), content manager (page sections with draft → preview → publish, menus, media library with crop + alt text, services/testimonials/stories/gallery/FAQs/banners/companies, site settings), enquiries/CRM (round-robin, follow-ups, timeline, convert to admission / job card, conversion report), notification bell.
- Phase 5 (accounts): done 2026-11-20. Expenses (approval above a limit, bills, pay later), other income, day book with balances + transfers between accounts, branch and combined P&L, partners (optional shares per branch from a date, capital, drawings), profit distribution runs (draft → lock), credit notes for delivered repairs (with refund), Excel export (P&L, day book, expenses). Also: Super Admin role, My account (change password), real ADITS branches/courses in the seed.
- Phase 6 (HR + payroll): done 2026-11-20. Employees (profile, documents, sensitive PAN/bank fields), HR masters (departments, designations, shifts, leave types, salary components), holidays, daily staff attendance, leave (apply → approve, yearly balances), salary structures, advances with monthly recovery, manual incentives with approval, monthly payroll per branch (draft → finalise → pay), payslips (print + My account), salaries in the P&L.
- Phase 7 (placements, assessments, certificates): done 2026-11-20. Assessment types (master), batch assessments + marks sheet, certificate rules (setting), certificates (ready-to-issue list, issue, cancel, re-issue, A4 print with QR), public verification (`/verify`, `/verify/[code]`), student profile results + placement opt-out, hiring companies with contacts, placement drives (eligible students, rounds, offers, joining), placement stats (branch / course / batch), optional live figures on the public Placements page.
- Next: Phase 8 (dashboards, reports, notifications, Razorpay, portals, deployment guide) per the brief, unless the owners reprioritise.

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
- **Role hierarchy (2026-11-20)**: **Super Admin** (the system/website handler) has every permission, including `users.manage_protected`. **Owner / Partner** has everything else (website included) and runs the business. **Admin** is staff-level under the owners. Super Admin and Owner are **protected roles** (`Role.isProtected`): only someone with `users.manage_protected` can give or remove them, edit them, or edit/reset/deactivate/delete an account holding one (people can still edit their own details). So only the super admin adds owners, and owners can't touch the super admin. Rule in `rbac/escalation.ts` (`protectedRoleChangeProblem`, `canManageProtected`), enforced in `users.service.ts` / `roles.service.ts`. Known gap, accepted: an owner can still build a custom (unprotected) role from their own permissions.
- **My account** (`/admin/account`, every signed-in user): own details + change password (needs the current one; other sessions are signed out, this one stays; failures audited). Admins still reset passwords for others.
- **Partner shares are optional**: an owner needs no share; Phase 5 profit reports must work when a branch has no shares set (show the profit, skip the distribution).

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
- **Brand**: ADITS (ADITS Innovative LLP), content from the old site (`D:\Adits\Adits`) and the setup questionnaire (2026-11-20). `prisma/seed/brand.ts` runs once (marker Setting `seed.brand`) and uploads the processed images in `prisma/seed/assets/adits/` (logo = the yellow mark only; the original's white lettering is for dark backgrounds). Only confirmed facts are published ("100% placement assistance", never "100% placement"); demo testimonials, stories, FAQs, banner and service prices stay unpublished.
- **Real branches and courses in the seed**: PKD Palakkad (both, GSTIN 32ABPFA5868C1ZE, main office, no separate head office) and MKM Mukkam (both, no GSTIN given → non-GST). Courses SPE Smartphone Engineering ₹90,000 / 22 months (7 class + 15 OJT), SPL Smartphone + Laptop ₹1,28,000 / 15 months (12 + 3), LCE Laptop Chiplevel Engineering ₹95,000 / 22 months; fees hidden on the website, GST mode unknown (EXEMPT), no syllabus yet, "3 instalments" is a demo plan. Owners (Arun/Bindu/Faisal) and staff are still demo: real partners/staff (Sajeer, Sreenath, Sachin…) come later. Demo logins use `.pkd` / `.mkm` (e.g. `frontdesk.pkd@demo.test`); `superadmin@demo.test` is the demo super admin.

### Phase 5 decisions (accounts)

- **P&L rules** (`modules/accounts/pnl-logic.ts`, figures in `pnl.queries.ts`): fees on the receipt date (cancelled receipts out), fee refunds on the day paid; service income on the invoice date at its value before GST; credit notes reduce it on their date; advances aren't income until invoiced; other income on its date. Costs: parts when used in a repair (job issues less returns, at the movement's cost), internal use, stock written off (adjustments out only: stock added by an adjustment is not a gain). Purchases are stock, not cost. Approved expenses on their date; GST on an expense is a cost only for a branch without GSTIN.
- **Expenses**: one branch each (no shared-cost split). Above the limit (Setting `accounts`, default ₹5,000, editable by `settings.update` on the Expenses page) they wait for approval by someone else with `expenses.approve`; people who can approve skip it for their own entries. Pending expenses can't be paid and aren't in the P&L. Cancel = day-book reversal (ADJUSTMENT) if paid. Bills are private uploads (images/PDF) attached as `Attachment` "Expense". Front office (Counsellor) can enter petty expenses.
- **Day book** = `MoneyTransaction`. Transfers (contra) only between accounts of the same branch; no P&L effect.
- **Partners**: shares optional; a share set for a branch from a date must total 100% (empty = no shares from that date); the previous set ends the day before; no back-dating before an existing later set or into a locked period. Capital in/out and drawings write the day book when an account is picked. Partner balance = locked profit share − drawings.
- **Profit distribution**: a run works out each branch's net profit for the period, split at every share change (`shareSegments`), paise split by largest remainder; branch periods without valid shares stay undistributed. Draft runs can be deleted; locked runs are frozen and can't overlap another locked run.
- **Credit notes**: only after delivery (before delivery, cancel the invoice). Full credit copies the lines; partial is split across the invoice's GST rates by value. Optional refund (ServicePayment REFUND + day book). Number series CREDIT_NOTE (`PKD/C2627/00001`).
- Excel via `exceljs` at `/api/export/[report]` (pnl, daybook, expenses), same permissions as the pages, audited (EXPORT).
- Payroll isn't built: salaries go in as expenses until the HR phase.

### Phase 6 decisions (HR + payroll)

- **Sunday** is the only weekly off; Sundays and holidays (org-wide or per branch) are paid.
- **A day's pay = monthly salary ÷ days in that month** (`hr/payroll-logic.ts`). Earnings are prorated by paid days; fixed deductions aren't. Paid days = days employed in the month − absences − ½ per half day − unpaid leave. Late = present.
- **Leave**: 12 casual + 6 sick per FY (April–March), paid; unused leave lapses (no carry forward); anything beyond is loss of pay. Quotas live on the Leave type master. A request can't cross 31 March, can't overlap another, and Sundays/holidays inside it aren't counted. Approver ≠ requester ≠ the employee. Approval updates `LeaveBalance` and marks the days LEAVE; cancelling an approved leave gives the days back.
- **Attendance** is marked daily by a manager/HR (`hr_attendance.mark`), no future dates. **Unmarked working days count as present** but are flagged (count shown before finalising).
- **Incentives** are manual only and need approval by someone other than the person who entered them; approved ones join that month's payslip at finalise.
- **Advances**: paid out of a money account (day book SALARY_ADVANCE), recovered monthly (capped at net pay), oldest first, at finalise. An advance isn't a P&L cost.
- **Payroll** per branch per month: draft (rebuild any time; employees without a salary structure are skipped and listed) → **finalise** (locks that month's attendance, leave and salary-structure changes) → **pay** (one day-book PAYROLL entry per payslip). No PF/ESI/PT/TDS.
- **P&L**: salary cost = earned pay (gross − LOP) + incentives, counted in the **month the salary is for**, once finalised. Don't also enter salaries as expenses from now on (that would count them twice).
- Employee IDs: EMPLOYEE_ID series `PKD-E001`, per branch, **never resets** (`reset: "NEVER"`, FY key "ALL").
- Demo HR data (`prisma/seed/phase6.ts`, runs once when no employees exist): employees linked to the demo logins with DEMO salaries, last month's attendance, one approved leave, an advance and an incentive. Holidays seeded are fixed-date national ones only; Onam/Vishu etc. are added in HR → Holidays.

### Phase 7 decisions (assessments, certificates, placements)

- **Certificate rules** (owners, 2026-11-20; `academics/academic-logic.ts`): the enrollment is **completed**, **no fees due**, **overall % ≥ pass mark** and **attendance ≥ minimum**. Overall % = the **average of each assessment's %** (equal weight; absent = 0; unmarked left out). Defaults: pass 40%, attendance 75%, grades A+ 90 / A 75 / B 60 / C 40; editable on the Certificates page (Setting `certificates`, `settings.update`). The grade, % and attendance are stored on the certificate when issued.
- **Who issues**: **Owner + Branch Manager** (`certificates.issue` / `revoke`). The Admin role doesn't (removed from defaults; seed one-off `seed.revokes.phase7` removes it from existing DBs). Trainers enter marks for their own batches only (OWN); creating assessments is `assessments.manage`.
- Numbers from the CERTIFICATE series (`PKD/CERT/26-27/00001`, per branch, per FY). One **ISSUED** certificate per enrollment; cancelling (with a reason) keeps the number used and shows "cancelled" on verification; a new one can then be issued. Marks of a student with an issued certificate are frozen.
- **Verification**: the QR opens `/verify/<code>` (12 random chars, unguessable). By hand: certificate number **plus issue date** (both printed), rate-limited per IP, so numbers can't be enumerated. Shows only what's printed on the certificate.
- **Placement %** (owners) = placed ÷ students who **completed** the course and **didn't opt out** of placement help (`Enrollment.placementOptOut`, a switch on the student profile). Placed = an offer not declined (joining or joined). Students placed before completing count once they complete.
- **Drives**: per branch, or all branches (only for all-branch users); eligible courses optional. Students are put forward from eligible enrollments (not dropped, not opted out). A failed / missed round marks the application not selected; recording an offer marks it selected. Companies are organisation-wide (logo / website display stay in Website → Content).
- **Public figures** (placed, %, hiring companies) on `/placements` only when **Site settings → Placement figures** is on (default off, so demo numbers never go public).
- `revalidateSite()` is a no-op outside server actions (tests, seed).
- Demo data (`prisma/seed/phase7.ts`): assessment types, two assessments with marks in PKD-SPE-01, two "Demo …" companies (not on the website), one drive with an offer.

## Open points (asked in Phase 0, unanswered)

Tax invoices on GST-applicable course fees (waiting for the CA); P&L timing (fees on receipt, service on invoice); real owner/branch list for the seed; real partners + shares and staff roles; whether Mukkam must be added to the Palakkad GSTIN as an additional place of business (same PAN, same state: ask the CA); course GST mode, instalment plans, syllabus; Google Maps links, opening hours, social links, testimonials. Certificate template wording / signatory names and whether certificates need a photo (current print: name, guardian, course, dates, grade, QR, blank signature line).
