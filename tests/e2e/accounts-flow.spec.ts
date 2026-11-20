import { expect, test, type Page } from "@playwright/test";

/** Accounts: expense in → day book; approve + pay a pending one; P&L + Excel; partners; profit distribution. */
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test("expenses, day book, P&L, partners and profit distribution", async ({ page }) => {
  test.setTimeout(180_000);
  const what = `Courier for parts ${Date.now()}`;
  await signIn(page, "arun@demo.test");

  // --- A small paid expense ---
  await page.goto("/admin/accounts/expenses");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New expense" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Travel & conveyance" }).click();
  await dialog.getByLabel("What was it for?").fill(what);
  await dialog.getByLabel("Amount before GST (₹)").fill("350");
  await dialog.getByRole("combobox", { name: "From / into account" }).click();
  await page.getByRole("option", { name: /PKD Cash/ }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Expense saved").first()).toBeVisible();
  await expect(page.locator("tbody").getByText(what)).toBeVisible();

  // --- The day book shows it going out of PKD Cash ---
  await page.goto("/admin/accounts/daybook");
  await expect(page.getByText(new RegExp(`Expense · ${what}`))).toBeVisible();

  // --- Front office enters a big expense: it waits for someone else's approval ---
  const ad = `Flex banner ${Date.now()}`;
  await signIn(page, "frontdesk.pkd@demo.test");
  await page.goto("/admin/accounts/expenses");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New expense" }).click();
  const big = page.getByRole("dialog");
  await big.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Marketing & ads" }).click();
  await big.getByLabel("What was it for?").fill(ad);
  await big.getByLabel("Amount before GST (₹)").fill("8000");
  await expect(big.getByText(/it will wait for approval/)).toBeVisible();
  await big.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Expense saved. Waiting for approval.").first()).toBeVisible();

  // --- The owner approves and pays it ---
  await signIn(page, "arun@demo.test");
  await page.goto(`/admin/accounts/expenses?f_status=PENDING&q=${encodeURIComponent(ad)}`);
  await page
    .getByRole("row", { name: new RegExp(ad) })
    .getByRole("button", { name: "Approve" })
    .click();
  await expect(page.getByText("Approved").first()).toBeVisible();
  await page.goto(`/admin/accounts/expenses?f_status=UNPAID&q=${encodeURIComponent(ad)}`);
  await page
    .getByRole("row", { name: new RegExp(ad) })
    .getByRole("button", { name: "Actions" })
    .click();
  await page.getByRole("menuitem", { name: "Pay" }).click();
  const pay = page.getByRole("dialog");
  await pay.getByRole("combobox", { name: "Paid by" }).click();
  await page.getByRole("option", { name: "Bank transfer" }).click();
  await pay.getByRole("combobox", { name: "From / into account" }).click();
  await page.getByRole("option", { name: /PKD HDFC/ }).click();
  await pay.getByLabel(/Reference/).fill("NEFT123");
  await pay.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Expense paid").first()).toBeVisible();

  // --- P&L with both branches and the combined column; Excel download ---
  await page.goto("/admin/accounts/pnl");
  await expect(page.getByRole("columnheader", { name: "Combined" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Net profit" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Travel & conveyance" })).toBeVisible();
  const xlsx = await page.request.get("/api/export/pnl");
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");

  // --- Partners: shares per branch ---
  await page.goto("/admin/accounts/partners");
  await expect(page.getByRole("link", { name: "Arun Kumar" })).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();

  // --- Profit distribution for last month ---
  await page.goto("/admin/accounts/profit-distribution");
  await page.getByRole("button", { name: "Work out a period" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Work it out" }).click();
  await expect(page).toHaveURL(/\/admin\/accounts\/profit-distribution\/[a-z0-9]+/);
  await expect(page.getByText("By branch")).toBeVisible();
  await expect(page.getByText("By partner")).toBeVisible();
  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/admin\/accounts\/profit-distribution$/);
});
