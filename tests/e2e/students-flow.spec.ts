import { expect, test, type Page } from "@playwright/test";

/** Admission with an instalment plan → first payment → collect next instalment → receipt; trainer marks attendance. */
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";
const phone = `7${String(Date.now()).slice(-9)}`;

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function pick(page: Page, label: string, option: string | RegExp) {
  await page.locator("form").first().getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).first().click();
}

test("admission, fees and attendance", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, "arun@demo.test");

  // --- Admission ---
  await page.goto("/admin/students/new");
  await pick(page, "Branch", "Kochi");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText("New student: fill in the details.").first()).toBeVisible();
  await page.getByLabel("Full name").fill("Playwright Student");
  await pick(page, "Course", /Advanced Chip-Level Mobile Repair/);
  await pick(page, "Fee plan", "3 instalments");
  // ₹35,000 → 40/30/30
  await expect(page.locator('input[aria-label="Amount"]').first()).toHaveValue("14000.00");
  await page.getByLabel("Amount (₹)").fill("14000");
  await pick(page, "Received into", /KOC Cash/);
  await page.getByRole("button", { name: "Admit student" }).click();

  await expect(page).toHaveURL(/\/admin\/students\/[a-z0-9]+\?admitted=1/);
  await expect(page.getByText("Admission saved.")).toBeVisible();
  await expect(page.getByText(/KOC\/RC\/\d{2}-\d{2}\/\d{5}/).first()).toBeVisible();
  await expect(page.getByText("₹21,000.00").first()).toBeVisible(); // due

  // --- Collect the next instalment ---
  await page.getByRole("button", { name: "Collect fee" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Amount (₹)")).toHaveValue("10500");
  await dialog.getByRole("combobox", { name: "Received into" }).click();
  await page.getByRole("option", { name: /KOC Cash/ }).click();
  await dialog.getByRole("button", { name: "Save receipt" }).click();
  await expect(page.getByText("Fee collected").first()).toBeVisible();
  await expect(page.getByText("₹10,500.00").first()).toBeVisible();

  // --- Receipt print view ---
  const href = await page
    .getByRole("link", { name: /KOC\/RC\// })
    .last()
    .getAttribute("href");
  await page.goto(href!);
  await expect(page.getByText("FEE RECEIPT")).toBeVisible();
  await expect(page.getByText("Rupees Ten Thousand Five Hundred Only")).toBeVisible();

  // --- Dues list shows the student only when filtered to all unpaid ---
  await page.goto(`/admin/fees/dues?f_when=all&q=${phone}`);
  await expect(page.getByText("Playwright Student")).toBeVisible();

  // --- Trainer marks attendance on their own batch ---
  await signIn(page, "trainer.koc@demo.test");
  await page.goto("/admin/batches");
  await expect(page.getByRole("heading", { name: "My batches" })).toBeVisible();
  await page.getByRole("link", { name: "Mobile Advanced · Morning" }).click();
  await page.getByLabel("Topic covered").fill("Playwright session");
  await page.getByRole("button", { name: "All present" }).click();
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText("Attendance saved").first()).toBeVisible();

  // Trainer can't see fees or admit students
  await page.goto("/admin/fees/dues");
  await expect(page).toHaveURL(/no-access/);
});
