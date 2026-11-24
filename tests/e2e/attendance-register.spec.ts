import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";

/** Student attendance register: owner sees every batch; a trainer only their own (page and Excel). */
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test("register: owner sees all batches, trainer only theirs; Excel matches", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "arun@demo.test");
  await page.goto("/admin/attendance-register");
  const options = await page.locator("select[name=batch] option").allTextContents();
  expect(options.length).toBeGreaterThanOrEqual(3);
  const other = await page.locator("select[name=batch] option", { hasText: "Afternoon (MKM)" }).getAttribute("value");

  // From the batch page button.
  await page.goto("/admin/batches");
  await page.getByRole("link", { name: "Smartphone Engineering · Morning" }).click();
  await page.getByRole("link", { name: "Monthly register" }).click();
  await expect(page).toHaveURL(/\/admin\/attendance-register\?batch=.+&month=\d{4}-\d{2}/);
  await expect(page.getByRole("columnheader", { name: "Present" })).toBeVisible();

  // Trainer: only their own batch is offered; another batch's Excel is refused.
  await signIn(page, "trainer.pkd@demo.test");
  await page.goto("/admin/attendance-register");
  await expect(
    page
      .locator('[data-sidebar] a[href="/admin/attendance-register"], aside a[href="/admin/attendance-register"]')
      .first(),
  ).toBeVisible(); // in the sidebar
  const mine = await page.locator("select[name=batch] option").allTextContents();
  // Vishnu teaches the two Palakkad batches in the demo data; never Mukkam's.
  expect(mine.sort()).toEqual(["Laptop Chiplevel · Evening (PKD)", "Smartphone Engineering · Morning (PKD)"]);
  await page.goto(`/admin/attendance-register?batch=${other}`);
  await expect(page.locator("select[name=batch]")).not.toHaveValue(other!);
  const refused = await page.request.get(`/api/attendance-register?batch=${other}`);
  expect(refused.status()).toBe(404);

  // Excel for their batch has one row per student plus the totals columns.
  const morning = await page
    .locator("select[name=batch] option", { hasText: "Smartphone Engineering · Morning" })
    .getAttribute("value");
  await page.goto(`/admin/attendance-register?batch=${morning}`);
  await expect(page.getByRole("columnheader", { name: "Present" })).toBeVisible();
  const href = await page.getByRole("link", { name: "Excel" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const wb = new ExcelJS.Workbook();
  const body = await res.body();
  await wb.xlsx.load(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer);
  const ws = wb.worksheets[0];
  const header = (ws.getRow(4).values as unknown[]).filter(Boolean).map(String);
  expect(header[0]).toBe("Student");
  expect(header.slice(-5)).toEqual(["Present", "Half days", "Absent", "Leave", "Attendance %"]);
  const studentsOnPage = await page.locator("tbody tr").count();
  let excelRows = 0;
  for (let r = 5; r <= ws.rowCount; r++) {
    const first = String(ws.getRow(r).getCell(1).value ?? "");
    if (first.startsWith("Present that day")) break;
    if (first) excelRows++;
  }
  expect(excelRows).toBe(studentsOnPage);
});

test("staff register: HR sees every branch, a branch manager only theirs; Excel matches", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "hr@demo.test");
  await page.goto("/admin/hr/attendance-register");
  expect((await page.locator("select[name=branch] option").allTextContents()).sort()).toEqual(["Mukkam", "Palakkad"]);
  const mkm = await page.locator("select[name=branch] option", { hasText: "Mukkam" }).getAttribute("value");

  await signIn(page, "manager.pkd@demo.test");
  await page.goto("/admin/hr/attendance");
  await page.getByRole("link", { name: "Monthly register" }).click();
  await expect(page).toHaveURL(/\/admin\/hr\/attendance-register/);
  expect(await page.locator("select[name=branch] option").allTextContents()).toEqual(["Palakkad"]);
  expect((await page.request.get(`/api/staff-attendance?branch=${mkm}`)).status()).toBe(404);

  await expect(page.getByRole("columnheader", { name: "Paid days" })).toBeVisible();
  const staffOnPage = await page.locator("tbody tr").count();
  expect(staffOnPage).toBeGreaterThan(0);
  const res = await page.request.get((await page.getByRole("link", { name: "Excel" }).getAttribute("href"))!);
  expect(res.status()).toBe(200);
  const body = await res.body();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer);
  const ws = wb.worksheets[0];
  const header = (ws.getRow(4).values as unknown[]).filter((v) => v !== undefined && v !== null).map(String);
  expect(header.slice(0, 3)).toEqual(["Employee", "Employee ID", "Designation"]);
  expect(header.slice(-2)).toEqual(["LOP days", "Paid days"]);
  let rows = 0;
  for (let r = 5; r <= ws.rowCount && ws.getRow(r).getCell(2).value; r++) rows++;
  expect(rows).toBe(staffOnPage);
});
