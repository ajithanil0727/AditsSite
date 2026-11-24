# Manual testing guide

Test the whole system by hand, role by role, on your own computer with demo data.

## Before you start

- App: **http://localhost:3000** (website) · **http://localhost:3000/login** (staff and student sign in)
- Every demo login uses the password **`Demo@12345`**
- Sign out: click your initials (top right) → **Sign out**. Or use a private/incognito window for a second person at the same time (useful for approvals: one person asks, another approves).
- The **branch switcher** (top bar) shows one branch or all of them. Most lists follow it.
- Emails aren't really sent on this computer: **Settings → Communications** lists them (who, subject), and their text goes to the app's server log (ask me if you need a link from one). Portal invites also show the link on screen to copy.
- Everything is demo data. Break things freely; ask me to reset the data afterwards.
- Found a problem? Note the **login**, the **page address** and **what you clicked**, and tell me.

## Demo logins

| Role | Email | Branches | What they're for |
| --- | --- | --- | --- |
| Super Admin | `superadmin@demo.test` | all | You: the system and website; the only one who can add owners |
| Owner / Partner | `arun@demo.test` (also `bindu@`, `faisal@` MKM only) | all | Runs the business: everything except managing owners |
| Admin | `admin@demo.test` | all | Staff-level administration (no certificates, no profit lock) |
| Branch Manager | `manager.pkd@demo.test`, `manager.mkm@demo.test` | one | Everything in their branch |
| Accountant | `accounts@demo.test` | all | Fees, invoices, expenses, accounts |
| HR | `hr@demo.test` | all | Employees, attendance, leave, payroll |
| Front office | `frontdesk.pkd@demo.test` | PKD | Enquiries, admissions, fee collection, repair intake |
| Trainer | `trainer.pkd@demo.test` | PKD | Own batches: attendance and marks |
| Placement Officer | `placement@demo.test` | all | Companies, drives, offers |
| Service Manager | `service.pkd@demo.test` | PKD | All job cards, assigning, QC |
| Service Engineer | `engineer.pkd@demo.test`, `engineer.mkm@demo.test` | one | Own job cards |
| Store Keeper | `store.pkd@demo.test` | PKD | Stock, part requests, purchases |

---

## 1. Super Admin (`superadmin@demo.test`)

- [ ] **Dashboard** shows tiles (admissions, fees, dues, job cards, stock, placements) and "Waiting for you".
- [ ] **Settings → Users**: add a new owner (role Owner / Partner). Then sign in as `arun@demo.test` and check Arun **can't** edit you or the other owners.
- [ ] **Settings → Company**: change the phone; it shows on invoices and the website footer.
- [ ] **Settings → Number series**: look at the invoice / receipt / job card formats.
- [ ] **Settings → Roles & permissions**: open a role, look at the permission matrix (don't save changes you don't want).
- [ ] **Settings → Audit log**: your sign-ins and changes are listed.
- [ ] **Settings → Communications**: click **Send me a test email**; it shows in the list.
- [ ] **Website → Pages**: edit a section of the home page, **Preview**, then **Publish**. Open http://localhost:3000 and see the change.
- [ ] **Website → Site settings → Placement figures**: turn on, then open http://localhost:3000/placements (figures show only once someone is placed).
- [ ] **My account**: change your password (then change it back to `Demo@12345`), turn on **Email me my alerts**.

## 2. Owner (`arun@demo.test`)

**Students and fees**
- [ ] **Students → New admission**: admit a new student to a course and batch. Edit the instalment schedule. Optionally give a discount (above your limit it waits for approval).
- [ ] On the student's page: **Collect fee** → print the receipt. **Cancel** a receipt (reason needed).
- [ ] **Fees → Dues / Receipts / Approvals**: approve a discount or refund someone else asked for.
- [ ] Student page: give **Portal access** (add an email first with **Edit**). Copy the link; open it in a private window, set a password, sign in as the student (see section 8).

**Service**
- [ ] **Service → New intake**: book in a phone (customer, device, problem, estimate, advance).
- [ ] Open the job card: assign an engineer, add a quotation, record the customer's decision, move it through repair → QC → ready, make the **invoice**, take payment, **deliver**.
- [ ] Print the job card, invoice and receipt (Print / Save as PDF).
- [ ] After delivery: make a **credit note** from the invoice.
- [ ] Public tracker: http://localhost:3000/track with the job number and customer phone. You should see the status, the **quote** (view only) and an **Invoice** button.

**Accounts**
- [ ] **Accounts → Expenses**: add one under ₹5,000 (paid straight away) and one above (waits for approval).
- [ ] **Day book**: both payments appear. Make a transfer between cash and bank.
- [ ] **Profit & loss**: pick this month; download Excel.
- [ ] **Partners**: set shares per branch. **Profit distribution**: create a run, look at it, delete or lock it.

**Everything else**
- [ ] **Reports**: open each report, change dates/branch, click **Excel** and **Print / PDF**.
- [ ] **Search box** (top bar): try a student name, a phone number, a job number like `PKD/JC`.
- [ ] **Certificates**: "Ready to issue" lists completed students and what's missing. Use **Rules** to look at the pass mark / attendance minimum.
- [ ] **Imports**: download the Students template, fill two rows (one with a wrong phone), upload, **Check the file** → fix → **Import**.

## 3. Branch Manager (`manager.pkd@demo.test`)

- [ ] Branch switcher only offers **Palakkad**; Mukkam's students and job cards aren't visible.
- [ ] Approve the big expense from section 2 (**Accounts → Expenses**, filter Pending).
- [ ] Mark a student's course **Completed**; if fees are paid, marks ≥ 40% and attendance ≥ 75%, **issue a certificate** from **Certificates** and print it. Scan the QR code with your phone (it opens localhost, so only works on this computer's browser: open the link under the QR instead).
- [ ] Open http://localhost:3000/verify and check the certificate by number + issue date.
- [ ] **Batches** → open a batch → **New assessment**.

## 4. Front office (`frontdesk.pkd@demo.test`)

- [ ] **Enquiries**: add an enquiry, set a follow-up, add a note; **Convert** it to an admission.
- [ ] Website form: http://localhost:3000/enquire (as a visitor, in a private window). The enquiry appears in the list and the assigned person gets a bell alert.
- [ ] Collect a fee; try a discount (no own limit, so it waits for approval).
- [ ] Book in a repair (**New intake**).
- [ ] Check what's **not** there: no Accounts P&L, no HR, no Settings.

## 5. Trainer (`trainer.pkd@demo.test`)

- [ ] **Batches**: only their own batches.
- [ ] Mark today's **attendance** for a batch.
- [ ] Open an assessment (from the batch page) and **enter marks**; tick **Absent** for one student; **Save marks**.
- [ ] **Students → Attendance register**: only their own batches; pick a month; **Excel** and **Print / PDF**.
- [ ] They can't create assessments, collect fees or see job cards.

## 6. Service team

**Service Manager (`service.pkd@demo.test`)**: all job cards, assign engineers, QC, warranty decisions.

**Engineer (`engineer.pkd@demo.test`)**
- [ ] Sees **only their own** job cards. Add diagnosis, request a part, change status.
- [ ] **Service → Shelf**: take a job (it moves to My jobs on the dashboard); on a job card, **Return to shelf**. No customer phone numbers anywhere, no Customers tab.
- [ ] As `service.pkd@demo.test`: assign a job to an engineer; the engineer gets a bell alert. You get an alert when an engineer takes or returns a job.
- [ ] Reveal the device **unlock code** (only the assigned engineer can); it's recorded in the audit log.

**Store Keeper (`store.pkd@demo.test`)**
- [ ] **Part requests**: issue the part the engineer asked for.
- [ ] **Purchases**: enter a purchase from a vendor; stock goes up.
- [ ] **Transfers**: send stock to Mukkam; sign in as `manager.mkm@demo.test` to receive it.
- [ ] Stock can't go below zero.

## 7. HR, accounts and placements

**HR (`hr@demo.test`)**
- [ ] **Employees**: open one, set a salary, give an advance.
- [ ] **Attendance**: mark today (All present → change one to Absent → Save).
- [ ] **Attendance register** (HR): pick branch + month (try last month); check loss-of-pay and paid days; **Excel** and **Print / PDF**. Open an employee: the "Attendance" card shows this month so far.
- [ ] **Leave**: apply for someone; approve as `manager.pkd@demo.test` (you can't approve your own).
- [ ] **Payroll**: **Work out payroll** for last month → check the payslips → **Finalise** → **Mark paid**. Print a payslip. Salaries now show in the P&L.
- [ ] **Incentives**: add one; approve as `arun@demo.test`.

**Accountant (`accounts@demo.test`)**: fees, invoices, expenses, day book, P&L; no HR or settings.

**Placement Officer (`placement@demo.test`)**
- [ ] **Companies**: add a company with a contact.
- [ ] **Drives**: new drive → **Add students** → add an interview round → record an **Offer**.
- [ ] **Placement stats**: placement % by branch, course and batch.

## 8. Student portal

- [ ] As owner or branch manager, give a student **Portal access** (section 2). Copy the link.
- [ ] In a private window: open the link, set a password, sign in with the student's email.
- [ ] The portal shows fees, instalments, receipts (print), attendance, results, certificate (if issued) and job openings.
- [ ] Going to http://localhost:3000/admin sends the student back to their portal.
- [ ] Using the same link a second time says it has expired.
- [ ] **Forgot password?** on the login page: the email appears in Settings → Communications. On this computer emails aren't really sent, so ask me for the reset link from the server log.

## 9. Public website (no login, private window)

- [ ] Home page animations, Courses, Services, Branches, Placements, Gallery, FAQ, Contact.
- [ ] **Enquire** and **Book a repair** forms (filling them too fast is treated as spam on purpose: wait a few seconds).
- [ ] **Track** a repair; **Verify** a certificate.
- [ ] Try it on your phone-sized screen (browser dev tools → device mode).
