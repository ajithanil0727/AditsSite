# Project Brief: Management Platform for Our Chip-Level Training Institutes & Service Centers

> Save this file as `PROJECT_BRIEF.md` in an empty repo, open Claude Code there and say:
> "Read PROJECT_BRIEF.md and start with Phase 0."

---

## 1. Role & working style

You are a senior full-stack engineer building a production-quality web platform for **one company** (ours). It is **not** a multi-tenant SaaS yet. Keep it simple, but don't block a future SaaS version (see Section 4).

How you work:

- **Plan before code.** Phase 0 is design only: give me the folder structure, Prisma schema, ERD (Mermaid), permission list and page map. Wait for my approval before writing features.
- **Build one phase at a time.** At the end of each phase: run tests, lint and type-check, fix all errors, then summarize what was built and what comes next.
- Do not guess business rules about money, tax or permissions. Ask me.
- Keep a `CLAUDE.md` with conventions, commands and key decisions, and keep it updated.
- Commit after each working milestone.
- Prefer simple, readable solutions over clever ones. No over-engineering.

---

## 2. Business context

We run **chip-level (board-level) repair training institutes** and **electronics service centers** (mobiles, laptops, desktops and similar devices) in **multiple branches across different locations**.

- **Institute:** students, courses, batches, fees, exams, certificates, placements.
- **Service center:** customer devices, job cards, diagnosis, service engineers, spare parts, billing, warranty.
- Some branches run both.
- The company is owned by **several owners (partners)**. "Partner" in this project always means a **co-owner** of the company, never an outside franchise or business partner.
- External parties are **hiring companies** (placements) and **parts vendors** (purchase). They are not partners.

Market: India. Use INR, GST invoices, Indian phone numbers and DD/MM/YYYY dates.

---

## 3. Tech stack

Keep it to **one full-stack app** so it's easy for one developer to run and maintain:

- **Next.js** (latest stable, App Router) + **TypeScript**: public website and admin panel in one app
- Backend logic in **server actions / route handlers**, organized in a `modules/` (or `features/`) folder with one folder per domain (students, service, accounts…). Keep business logic in service files, not inside UI components.
- **PostgreSQL + Prisma**
- **Auth.js (NextAuth)** or **Better Auth** with credentials login, roles and sessions. Phone OTP can come later.
- **Tailwind CSS + shadcn/ui**, **TanStack Table** for data tables, **React Hook Form + Zod** for forms and validation
- **File uploads:** local storage in development, S3-compatible storage (Cloudflare R2 / AWS S3) in production
- **PDFs:** invoices, receipts, job cards, certificates, payslips
- **Payments:** Razorpay for online fee payment (later phase)
- **Notifications:** email first. Put SMS/WhatsApp behind a simple provider interface so they can be added later.
- **Background jobs:** start simple (cron / a lightweight queue). Add Redis only when actually needed.
- **Testing:** Vitest for business logic, Playwright for a few critical flows
- **Docker Compose** for local Postgres, plus `.env.example`, a README and a seed script with realistic demo data

---

## 4. Keep it SaaS-ready (cheap now, saves a rewrite later)

- Create an `Organization` table with a single row for our company, and put `organizationId` on the main tables. Don't build any multi-tenant features; just keep the column.
- Don't hard-code the company name, logo, GST number, invoice prefixes or similar values. Keep them in a **Settings** table.
- Use permission-based RBAC (Section 5), not `if role === 'admin'` checks.

---

## 5. Branches & RBAC

**Branches**

- Almost every record (student, batch, job card, stock, expense, employee) belongs to a `branchId`.
- A user can be assigned to **one, several or all branches**.
- A **branch switcher** in the top bar filters all data to the selected branch, or "All branches" for users allowed to see them.

**Permissions**

- Format: `module.action`, for example `students.create`, `fees.collect`, `jobcards.assign`, `reports.export`.
- Roles are groups of permissions. The admin can create and edit roles in a **permission matrix UI**.
- Each role assignment has a **scope**: `own records`, `assigned branches` or `all branches`.
- Check permissions **on the server** for every action, and also hide menus and buttons in the UI.
- **Audit log:** who did what and when, with old and new values, for create/update/delete, login and permission changes.

**Default roles (seeded, editable):**

| Role                           | Access                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| Owner / Partner                | The co-owners. Full access to everything by default. Each owner can be restricted if needed. |
| Admin                          | Day-to-day full system administration (can be a staff member, not an owner)                  |
| Branch Manager                 | Everything in their branches                                                                 |
| Accountant                     | Fees, invoices, expenses, accounts, payroll                                                  |
| HR                             | Employees, attendance, leave, payroll                                                        |
| Counsellor / Front Office      | Enquiries, admissions, walk-in service intake                                                |
| Trainer                        | Own batches: attendance and assessments                                                      |
| Placement Officer              | Companies, drives, student placements                                                        |
| Service Manager                | All job cards in the branch, assignment, QC                                                  |
| Service Engineer               | Own assigned job cards, parts requests, status updates                                       |
| Store Keeper                   | Spare parts, stock, transfers, purchases                                                     |
| Student (portal, later phase)  | Own fees, attendance, results, certificates, jobs                                            |
| Customer (portal, later phase) | Track repair, approve quote, download invoice                                                |

---

## 6. Modules

### 6.1 Public website

- Home (who we are, what we do), About, Courses, Services, Branches (with map), Placements/Success stories, Gallery, Testimonials, Contact
- **Course enquiry form** and **service booking form**, which create leads in the CRM
- **Repair status tracker** (job card number + phone)
- **Certificate verification** (certificate number / QR code)
- Fast, mobile-first and SEO-friendly (SSG/SSR, meta tags, sitemap)
- **All website content is editable from the admin panel** (see 6.11). Nothing on the public site is hard-coded.

### 6.2 Enquiries / CRM

- Leads for courses and service, from website, walk-in, phone or referral
- Status pipeline, follow-up dates and reminders, assignment to a counsellor, notes
- Convert a lead to a Student or a Service Customer
- Conversion report by source and counsellor

### 6.3 Students

- Courses (duration, fee, syllabus) and batches (branch, trainer, timing, capacity)
- Admission: personal details, documents/photo, course, batch, fee plan, student ID
- Attendance per batch
- Practical and theory assessments, results
- Certificates as PDFs with a QR code for verification
- Batch and branch transfer

### 6.4 Fees

- Fee plans: full payment or instalments, discounts (needs approval)
- Collect payments (cash/UPI/card/bank), with a receipt PDF
- Dues list and due reminders
- Online payment through Razorpay (later phase)

### 6.5 Service center

- **Device intake:** customer, brand/model, serial/IMEI, problem reported, accessories received, condition photos, estimated date
- **Job card statuses:** Received → Diagnosis → Quote sent → Approved/Rejected → In repair → Waiting for parts → QC → Ready → Delivered (admin can configure)
- Assign to a service engineer, priority, turnaround-time tracking
- Quotation, customer approval and job timeline
- Parts used (deducted from stock) + labour charge, giving a **GST invoice**
- Warranty on repairs, with repeat-repair detection
- Printable job card/receipt with job number
- Engineer report: jobs done, average turnaround, revenue, comebacks

### 6.6 Inventory & purchase

- Spare parts, ICs, tools and lab equipment, stocked per branch
- Stock in/out, **transfer between branches**, low-stock alerts
- Vendors, purchase entries and vendor bills
- Barcode/QR labels (later)

### 6.7 Employees / HR

- Employee profiles, documents, branch, designation, reporting manager
- Attendance, leave requests and approvals, holidays
- Monthly payroll: salary structure, allowances, deductions, payslip PDF
- Incentives (e.g. admissions per counsellor, jobs per engineer)

### 6.8 Accounts

- Income: course fees and service invoices are recorded automatically; add other income manually
- Expenses with categories, bill upload, approval
- Cash and bank accounts, day book
- GST invoice numbering, credit notes
- **Branch-wise profit & loss**, plus a combined P&L
- **Owners / partners:** record each owner's share percentage, capital contributions and drawings, and produce a profit distribution report per owner (overall and per branch if branches have different ownership; confirm with me in Phase 0)
- Export to Excel (and a Tally-friendly format later)

### 6.9 Placements

- Hiring companies and contacts
- Job openings / placement drives, eligible students
- Applications, interview rounds, offers, joining status
- Placement stats per batch, course and branch (also shown on the public site)

### 6.10 Common features

- **Role-based dashboards:** admissions, collections, dues, open job cards, pending turnaround, stock alerts, placements
- **Reports** with date/branch filters and Excel/PDF export
- In-app notifications + email
- Global search (student, phone, job card number, invoice number)
- Excel/CSV import for students, employees and parts
- Settings: company details, logo, GST, branches, number series (invoice/receipt/job card prefixes), working hours
- Activity timeline on students, job cards and employees
- Soft delete, mobile-responsive UI

### 6.11 Full admin panel: everything editable

The owners must be able to manage **everything** from the admin panel without touching code. Rule: **if it appears on the site or in the system, an admin can edit it.**

**Website content manager**

- Home page sections: hero headline/sub-text/buttons/images, stats counters, "what we do", featured courses and services, testimonials, placement highlights, call-to-action. Admins can edit, reorder, show/hide and add/remove sections.
- Pages: About, Courses, Services, Branches, Placements, Gallery, Testimonials, FAQs, Contact, plus custom pages
- Navigation menu, footer, contact details, social links, WhatsApp button, Google Maps links
- Image/media library with upload, crop and alt text
- SEO per page (title, description, OG image) + site-wide SEO settings
- Banners/announcements with start and end dates
- Draft / publish with a preview before publishing

**Master data & configuration**

- Branches, departments, designations
- Courses, modules, fee plans, batches, assessment types, certificate templates
- Service: device types, brands, models, problem categories, job card statuses, warranty rules, labour charges
- Inventory: part categories, units, vendors
- Accounts: income/expense categories, payment modes, bank accounts, GST rates, HSN/SAC codes
- HR: leave types, holidays, salary components, shifts
- Lead sources and lead statuses
- Number series (invoice, receipt, job card, student ID, certificate)
- Print/PDF templates: invoice, receipt, job card, certificate, payslip, with logo, header/footer and terms
- Email/SMS/WhatsApp message templates
- Company profile, logos, GST details, owners and share percentages
- Users, roles, permission matrix, audit log viewer

Every list in the admin panel has search, filters, sorting, pagination, create/edit/delete (soft delete with restore) and Excel export where it makes sense.

---

## 6A. Design & UI

### Theme

- **Three theme options: Light, Dark and System (default).** Use `next-themes` with a toggle in both the public site header and the admin top bar. Remember the user's choice and avoid a flash of the wrong theme on load.
- Build a **design token system** with CSS variables and the Tailwind theme so every color works in both modes. Never hard-code colors in components.
- **Pastel palette:** soft pastel accents (e.g. mint, lavender, peach, sky blue) on clean neutral backgrounds. In dark mode, use deep neutral backgrounds with muted, slightly brighter pastel accents. Keep WCAG AA contrast in both modes.
- Typography: one modern sans-serif (e.g. Inter / Plus Jakarta Sans / Geist) with a clear type scale.

### Home page (the showcase)

- Modern, attractive and **interactive**, built with **GSAP** (+ ScrollTrigger; use `@gsap/react`'s `useGSAP` for proper cleanup in React).
- Ideas to implement (pick the best mix and propose it in Phase 0):
  - Animated hero: staggered text reveal, subtle parallax or a floating circuit-board / chip illustration that reacts to scroll or mouse movement
  - Scroll-triggered section reveals and animated **stat counters** (students trained, devices repaired, branches, placement %)
  - Pinned/horizontal-scroll section for "Our courses" or "How a repair works"
  - Interactive service cards with hover/tilt effects
  - Smooth testimonial and placement-company logo carousels
  - Branch locations section with an animated map or cards
  - Strong call-to-actions: "Enquire about a course" and "Book a repair"
- **Performance & accessibility:** respect `prefers-reduced-motion` (turn heavy animation off), lazy-load media, keep Lighthouse performance ≥ 90 on mobile, and keep animations smooth on low-end phones.
- All home page text, images and numbers come from the admin content manager (6.11).

### Other public pages

- **Simple, clean and modern** using the pastel palette, with light motion only (fade/slide-in on scroll). No heavy animation.

### Admin panel

- Clean, minimal and fast, following the same pastel tokens and theme toggle
- Collapsible sidebar grouped by module (only permitted items visible), branch switcher, breadcrumbs, global search, notification bell
- Consistent tables, forms, dialogs, toasts, empty states and loading skeletons (shadcn/ui)
- Fully responsive so staff can use it on a phone or tablet

---

## 7. Quality & security

- Strict TypeScript, ESLint, Prettier
- Zod validation on every input, argon2/bcrypt password hashing, rate-limited login, secure file URLs
- Every server action checks the user's permission **and** branch scope
- Paginated, indexed queries
- Database migrations through Prisma, seed data and a written backup plan
- Clean admin UI: sidebar grouped by module (only allowed items visible), branch switcher, breadcrumbs, searchable/filterable tables

---

## 8. Phases (MVP first)

**Phase 0 – Design (no feature code).** Folder structure, full Prisma schema, ERD, permissions list, page map. Wait for my approval.

**Phase 1 – Foundation.** Project setup, Docker, database, login, users, branches, roles and permission matrix, branch switcher, audit log, design tokens + light/dark/system theme, admin layout, settings, seed data.

**Phase 2 – Service center + inventory.** Device intake, job cards, engineers, parts and stock, GST invoice, repair tracker.

**Phase 3 – Students + fees.** Courses, batches, admissions, attendance, fee collection, receipts, dues.

**Phase 4 – Public website + content manager + enquiries/CRM.** GSAP home page, pastel public pages, full website content manager.

**Phase 5 – Accounts.** Income/expenses, branch P&L, owner share and profit distribution.

**Phase 6 – Employees / HR + payroll.**

**Phase 7 – Placements, assessments, certificates with QR verification.**

**Phase 8 – Dashboards, reports, notifications, Razorpay, student & customer portals, deployment guide.**

_(I may reorder phases based on what the business needs first.)_

Every phase must be working and tested before moving on.

---

## 9. Start now

Begin **Phase 0**. First ask me up to 10 clarifying questions about anything that affects the database or business rules (for example: how many owners there are and whether ownership differs by branch, whether fees are per course or per module, whether GST applies to course fees, and how job card numbers should look). Then present the Phase 0 design.
