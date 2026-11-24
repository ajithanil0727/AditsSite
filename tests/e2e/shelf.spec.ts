import "dotenv/config";
import { Client } from "pg";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * The shelf: engineers take unassigned jobs and can put their own back; alerts go out; only one engineer can take a job;
 * engineers don't see customer phone numbers or the Customers list.
 */
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function newSignedInPage(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email);
  return page;
}

/** "PKD/JC/26-27/00004" out of a heading that may run straight into the status label. */
function jobNoFrom(text: string | null) {
  const m = /[A-Z0-9]{2,4}\/JC\/\d{2}-\d{2}\/\d+/.exec(text ?? "");
  if (!m) throw new Error(`No job number in "${text}"`);
  return m[0];
}

async function notificationCount(title: string) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(`SELECT count(*)::int AS n FROM "Notification" WHERE title = $1`, [title]);
  await c.end();
  return r.rows[0].n as number;
}

test("engineer returns a job to the shelf and takes it back; no customer phone", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "engineer.pkd@demo.test");

  // No Customers tab, no customers page.
  await expect(page.locator('a[href="/admin/service/customers"]')).toHaveCount(0);
  await page.goto("/admin/service/customers");
  await expect(page).toHaveURL(/\/admin\/no-access/);

  // Dashboard lists "My jobs" and the shelf.
  await page.goto("/admin");
  await expect(page.getByText(/^My jobs \(\d+\)$/)).toBeVisible();
  await expect(page.getByText("On the shelf").first()).toBeVisible();

  // Open one of my jobs: the customer's name, but no phone number.
  await page.goto("/admin/service/jobs");
  await page.locator("tbody a[href^='/admin/service/jobs/']").first().click();
  await expect(page).toHaveURL(/\/admin\/service\/jobs\/[a-z0-9]+$/);
  const jobNo = jobNoFrom(await page.getByRole("heading", { level: 1 }).textContent());
  await expect(page.getByText("Contact the customer through the service desk.")).toBeVisible();
  await expect(page.getByText(/\b[6-9]\d{9}\b/)).toHaveCount(0);

  // Return it to the shelf.
  await page.getByRole("button", { name: "Return to shelf" }).click();
  await page.getByRole("dialog").getByLabel("Why? (optional)").fill("E2E test");
  await page.getByRole("dialog").getByRole("button", { name: "Return to shelf" }).click();
  // The job isn't theirs any more, so they land on the shelf with a confirmation (not a "not found" page).
  await expect(page).toHaveURL(/\/admin\/service\/shelf\?returned=/);
  await expect(page.getByRole("status").filter({ hasText: `Job ${jobNo} is back on the shelf` })).toBeVisible();
  expect(await notificationCount(`Akhil Raj returned job ${jobNo} to the shelf`)).toBeGreaterThan(0);

  // Take it back from the shelf.
  await page.goto("/admin/service/shelf");
  const row = page.getByRole("row", { name: new RegExp(jobNo.replace(/\//g, "\\/")) });
  await row.getByRole("button", { name: /Take/ }).click();
  await expect(page.getByText(`Job ${jobNo} is yours`).first()).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(jobNo.replace(/\//g, "\\/")) })).toHaveCount(0);
  expect(await notificationCount(`Akhil Raj took job ${jobNo}`)).toBeGreaterThan(0);
});

test("a taken job can't be taken again; the manager can still assign", async ({ browser }) => {
  test.setTimeout(120_000);
  const engineer = await newSignedInPage(browser, "engineer.pkd@demo.test");
  const manager = await newSignedInPage(browser, "service.pkd@demo.test");

  // Put one of the engineer's jobs on the shelf.
  await engineer.goto("/admin/service/jobs");
  await engineer.locator("tbody a[href^='/admin/service/jobs/']").first().click();
  await expect(engineer).toHaveURL(/\/admin\/service\/jobs\/[a-z0-9]+$/);
  const jobNo = jobNoFrom(await engineer.getByRole("heading", { level: 1 }).textContent());
  const jobUrl = engineer.url();
  await engineer.getByRole("button", { name: "Return to shelf" }).click();
  await engineer.getByRole("dialog").getByRole("button", { name: "Return to shelf" }).click();
  await expect(engineer.getByText("Back on the shelf").first()).toBeVisible();

  const rowName = new RegExp(jobNo.replace(/\//g, "\\/"));
  // Both have the shelf open; the engineer takes it first, then the manager clicks on the now-stale page.
  await manager.goto("/admin/service/shelf");
  await expect(manager.getByRole("row", { name: rowName })).toBeVisible();
  await engineer.goto("/admin/service/shelf");
  await engineer.getByRole("row", { name: rowName }).getByRole("button", { name: /Take/ }).click();
  await expect(engineer.getByText(`Job ${jobNo} is yours`).first()).toBeVisible();
  await manager.getByRole("row", { name: rowName }).getByRole("button", { name: /Take/ }).click();
  await expect(manager.getByText("Already taken by Akhil Raj.").first()).toBeVisible();

  // The manager can still assign as before, and the engineer is told.
  await engineer.goto(jobUrl);
  await engineer.getByRole("button", { name: "Return to shelf" }).click();
  await engineer.getByRole("dialog").getByRole("button", { name: "Return to shelf" }).click();
  await expect(engineer.getByText("Back on the shelf").first()).toBeVisible();
  await manager.goto(jobUrl);
  await manager.getByRole("button", { name: "Assign" }).click();
  await manager.getByRole("dialog").getByRole("combobox", { name: "Engineer" }).click();
  await manager.getByRole("option", { name: /Akhil Raj/ }).click();
  await manager.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(manager.getByText("Assignment saved").first()).toBeVisible();
  expect(await notificationCount(`Job ${jobNo} assigned to you`)).toBeGreaterThan(0);
  await engineer.context().close();
  await manager.context().close();
});
