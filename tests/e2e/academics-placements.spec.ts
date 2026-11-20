import { expect, test, type Page } from "@playwright/test";

/** Assessments (trainer enters marks), placements (drive → students → offer), certificates list, public verification. */
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test("assessment marks, placement drive with an offer, certificates and verification", async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();

  // --- The trainer adds an assessment to their batch and enters marks ---
  await signIn(page, "trainer.pkd@demo.test");
  await page.goto("/admin/batches");
  await page.getByRole("link", { name: "Smartphone Engineering · Morning" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Assessments", { exact: true })).toBeVisible();
  // Trainers enter marks but don't create assessments (assessments.manage): the owner does.
  await expect(page.getByRole("button", { name: "New assessment" })).toHaveCount(0);
  const batchUrl = page.url();

  await signIn(page, "arun@demo.test");
  await page.goto(batchUrl);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New assessment" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Title").fill(`E2E test ${stamp}`);
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Assessment saved").first()).toBeVisible();
  await page.getByRole("link", { name: `E2E test ${stamp}` }).click();
  await expect(page).toHaveURL(/\/admin\/assessments\//);
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  const assessmentUrl = page.url();

  await signIn(page, "trainer.pkd@demo.test");
  await page.goto(assessmentUrl);
  await page.waitForLoadState("networkidle");
  const marks = page.getByLabel(/^Marks for /);
  await marks.first().fill("72");
  await expect(page.getByText("pass", { exact: true }).first()).toBeVisible();
  await page
    .getByRole("checkbox", { name: / was absent$/ })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Save marks" }).click();
  await expect(page.getByText("Marks saved").first()).toBeVisible();
  await page.reload();
  await expect(marks.first()).toHaveValue("72");

  // --- The placement officer runs a drive ---
  await signIn(page, "placement@demo.test");
  await page.goto("/admin/placements/drives");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New drive" }).click();
  const drive = page.getByRole("dialog");
  await drive.getByLabel("Title").fill(`E2E drive ${stamp}`);
  await drive.getByLabel("Job role").fill("Service technician");
  await drive.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/admin\/placements\/drives\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: `E2E drive ${stamp}` })).toBeVisible();

  await page.getByRole("button", { name: "Add students" }).click();
  const add = page.getByRole("dialog");
  await add.getByRole("checkbox").first().click();
  await add.getByRole("button", { name: /^Add 1/ }).click();
  await expect(page.getByText("1 student(s) added").first()).toBeVisible();

  await page.getByRole("button", { name: "Offer" }).first().click();
  const offer = page.getByRole("dialog");
  await offer.getByLabel("CTC (₹ per year)").fill("180000");
  await offer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Offer saved").first()).toBeVisible();
  await expect(page.getByText("1 placed")).toBeVisible();

  await page.goto("/admin/placements/stats");
  await expect(page.getByText("Placement %", { exact: true }).first()).toBeVisible();

  // --- Certificates (owner) ---
  await signIn(page, "arun@demo.test");
  await page.goto("/admin/certificates");
  await expect(page.getByRole("link", { name: "Ready to issue" })).toBeVisible();
  await page.getByRole("link", { name: "Issued" }).click();
  await expect(page).toHaveURL(/tab=issued/);

  // --- Public verification ---
  await page.context().clearCookies();
  await page.goto("/verify");
  await page.getByLabel("Certificate number").fill("PKD/CERT/00-00/99999");
  await page.getByLabel("Issued on").fill("2020-01-01");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/No certificate matches/)).toBeVisible();
  await page.goto("/verify/NOTAREALCODE");
  await expect(page.getByText(/could not find this certificate/)).toBeVisible();
});
