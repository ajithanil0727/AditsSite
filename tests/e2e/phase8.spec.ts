import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";

/** Dashboard, reports (page, Excel, print), global search, imports check, and the student portal invite → login. */
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";
const STUDENT_EMAIL = "midhun.portal@example.com";

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(admin|portal)/);
}

test("dashboard, reports, search and imports", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, "arun@demo.test");
  await expect(page.getByText("Fees collected today")).toBeVisible();
  await expect(page.getByText("Open job cards")).toBeVisible();
  await expect(page.getByText("Waiting for you").first()).toBeVisible();

  // Reports: view, Excel, print.
  await page.goto("/admin/reports");
  await page.getByRole("link", { name: /Fee collections/ }).click();
  await page.getByLabel("From").fill("2020-01-01");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.locator("tfoot")).toContainText("Total");
  const excelHref = await page.getByRole("link", { name: "Excel" }).getAttribute("href");
  const excel = await page.request.get(excelHref!);
  expect(excel.status()).toBe(200);
  expect(excel.headers()["content-type"]).toContain("spreadsheetml");
  const printHref = await page.getByRole("link", { name: "Print / PDF" }).getAttribute("href");
  await page.goto(printHref!);
  await expect(page.getByText("Fee collections", { exact: true })).toBeVisible();

  // Global search.
  await page.goto("/admin");
  await page.getByRole("searchbox", { name: "Search" }).fill("Midhun");
  await page.getByRole("searchbox", { name: "Search" }).press("Enter");
  await expect(page).toHaveURL(/\/admin\/search\?q=Midhun/);
  await expect(page.getByRole("link", { name: /Midhun Krishna/ }).first()).toBeVisible();

  // Imports: a file with a bad row is checked, not imported.
  await page.goto("/admin/imports");
  const tpl = await page.request.get("/api/imports/template/students");
  expect(tpl.status()).toBe(200);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  ws.addRow(["Name", "Phone", "Branch code"]);
  ws.addRow(["E2E Import", "12345", "NOPE"]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await page.getByLabel("Filled template").setInputFiles({
    name: "students.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByRole("list", { name: "Problems" })).toContainText("isn't a valid 10-digit mobile number");
  await expect(page.getByRole("list", { name: "Problems" })).toContainText('Branch code "NOPE"');
  await expect(page.getByRole("button", { name: /^Import/ })).toHaveCount(0);
});

test("student portal: staff invite, student sets a password and sees their fees", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signIn(page, "manager.pkd@demo.test");
  await page.goto("/admin/students?q=Midhun");
  await page.getByRole("link", { name: "Midhun Krishna" }).first().click();
  await page.waitForLoadState("networkidle");

  if (await page.getByText("Add an email to give portal access").isVisible()) {
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByLabel("Email").fill(STUDENT_EMAIL);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.getByRole("button", { name: /Give portal access|Send a new login link/ }).click();
  const link = (await page.getByTestId("portal-link").textContent())!.trim();
  expect(link).toContain("/set-password?token=");

  // The student opens the link in their own browser.
  const ctx = await browser.newContext();
  const student = await ctx.newPage();
  await student.goto(new URL(link).pathname + new URL(link).search);
  await student.getByLabel("New password").fill("Portal2026x");
  await student.getByLabel("Type it again").fill("Portal2026x");
  await student.getByRole("button", { name: "Set password" }).click();
  await expect(student.getByText(/Your password is set/)).toBeVisible();

  // The same link can't be used twice.
  await student.goto(new URL(link).pathname + new URL(link).search);
  await student.getByLabel("New password").fill("Another2026x");
  await student.getByLabel("Type it again").fill("Another2026x");
  await student.getByRole("button", { name: "Set password" }).click();
  await expect(student.getByText(/expired or was already used/)).toBeVisible();

  await signIn(student, STUDENT_EMAIL, "Portal2026x");
  await expect(student).toHaveURL(/\/portal/);
  await expect(student.getByText("Fee instalments").first()).toBeVisible();
  await expect(student.getByText("Job openings")).toBeVisible();
  // Students can't open the staff panel.
  await student.goto("/admin");
  await expect(student).toHaveURL(/\/portal/);
  await ctx.close();
});

test("public: forgot password never reveals accounts; bad invoice links 404", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("nobody-at-all@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If that email has an account");
  // Streamed pages answer 200 with the not-found page; the invoice itself must not render.
  await page.goto("/track/invoice/doesnotexist?t=bad");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});
