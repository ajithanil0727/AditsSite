import { expect, test, type Page } from "@playwright/test";

/** HR: staff applies for leave, HR decides it; daily attendance; a draft payroll with a payslip. Repeatable. */
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

/** A Monday far ahead (2030), different on each run, so requests never overlap. */
function futureMonday() {
  const first = new Date(Date.UTC(2030, 0, 7)); // Monday
  const d = new Date(first.getTime() + (Math.floor(Date.now() / 1000) % 40) * 7 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test("leave request and decision, attendance, draft payroll and payslip", async ({ page }) => {
  test.setTimeout(180_000);
  const day = futureMonday();
  const reason = `E2E leave ${Date.now()}`;

  // --- The trainer applies for a day of casual leave ---
  await signIn(page, "trainer.pkd@demo.test");
  await page.goto("/admin/hr/leave");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Apply for leave" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("From").fill(day);
  await dialog.getByLabel("To").fill(day);
  await dialog.getByLabel("Reason").fill(reason);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Leave request sent").first()).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(reason) })).toBeVisible();

  // --- HR rejects it (approving would use up the demo balance on every run) ---
  await signIn(page, "hr@demo.test");
  await page.goto("/admin/hr/leave?f_status=PENDING");
  await page
    .getByRole("row", { name: new RegExp(reason) })
    .getByRole("button", { name: "Reject" })
    .click();
  await expect(page.getByText("Leave rejected").first()).toBeVisible();

  // --- Today's attendance ---
  await page.goto("/admin/hr/attendance");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "All present" }).click();
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText("Attendance saved").first()).toBeVisible();

  // --- Last month's payroll (draft) shows payslips; then the draft is removed again ---
  await page.goto("/admin/hr/payroll");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Work out payroll" }).click();
  const run = page.getByRole("dialog");
  await run.getByRole("combobox", { name: "Branch" }).click();
  await page.getByRole("option", { name: /Palakkad/ }).click();
  await run.getByRole("button", { name: "Work it out" }).click();
  await expect(page).toHaveURL(/\/admin\/hr\/payroll\/[a-z0-9]+/);
  const slip = page.getByRole("link", { name: /Payslip for/ }).first();
  await expect(slip).toBeVisible();

  const href = await slip.getAttribute("href");
  const isDraft = await page.getByRole("button", { name: "Delete draft" }).isVisible();
  await page.goto(href!);
  await expect(page.getByText("PAYSLIP", { exact: true })).toBeVisible();
  await expect(page.getByText("Net pay", { exact: true })).toBeVisible();

  if (isDraft) {
    await page.goBack();
    await page.getByRole("button", { name: "Delete draft" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/admin\/hr\/payroll$/);
  }
});
