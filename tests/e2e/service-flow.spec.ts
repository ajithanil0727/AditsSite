import { expect, test, type Page } from "@playwright/test";

/**
 * Critical flow: device intake → diagnosis → part issued → repair → QC → invoice → payment → delivery,
 * then the customer tracks it on the public tracker. Uses the seeded owner account (all permissions).
 */
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";
const phone = `9${String(Date.now()).slice(-9)}`; // unique customer each run

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

/** Pick from a select inside the page's form (the top bar also has a "Branch" select). */
async function pickSelect(page: Page, label: string, option: string | RegExp) {
  await page.locator("form").first().getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).first().click();
}

async function moveTo(page: Page, status: string) {
  await page.getByRole("button", { name: "Move to…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "New status" }).click();
  await page.getByRole("option", { name: status, exact: true }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Status updated").first()).toBeVisible();
  await expect(dialog).toBeHidden();
}

test("intake to delivery, then the customer tracks it", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, "arun@demo.test");

  // --- Make sure a display is in stock (each run uses one): stock adjustment through the UI ---
  await page.goto("/admin/inventory/stock");
  await page.getByRole("button", { name: "Adjust stock" }).click();
  const adjust = page.getByRole("dialog");
  await adjust.getByRole("combobox", { name: "Branch" }).click();
  await page.getByRole("option", { name: "Palakkad" }).click();
  await adjust.getByRole("combobox").filter({ hasText: "Select a part" }).click();
  await page.getByPlaceholder("Search name or SKU…").fill("DSP-A52");
  await page.getByRole("option", { name: /Galaxy A52/ }).click();
  await adjust.getByLabel("Quantity").fill("1");
  await adjust.getByLabel("Reason").fill("E2E test stock");
  await adjust.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Stock updated").first()).toBeVisible();

  // --- Intake ---
  await page.goto("/admin/service/intake");
  await pickSelect(page, "Branch", "Palakkad");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText("New customer: enter their details.")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Playwright Customer");
  await pickSelect(page, "Brand", "Samsung");
  await pickSelect(page, "Model", "Galaxy A52");
  await page.getByLabel("IMEI").fill(`35${phone}123`);
  await pickSelect(page, "Problem category", "Display / touch");
  await page.getByLabel("Problem reported by the customer").fill("Screen cracked, touch not working.");
  await page.getByRole("button", { name: "Charger" }).click();
  await page.getByLabel("Unlock code / pattern").fill("2580");
  await page.getByLabel("Estimated cost (₹, incl. GST)").fill("6000");
  await pickSelect(page, "Engineer", "Akhil Raj");
  await page.getByLabel("Amount (₹)").fill("500");
  await pickSelect(page, "Received into", /Cash/);
  await page.getByRole("button", { name: "Create job card" }).click();

  await expect(page).toHaveURL(/\/admin\/service\/jobs\/[a-z0-9]+/);
  const jobNo = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  expect(jobNo).toMatch(/^PKD\/JC\/\d{2}-\d{2}\/\d{5}$/);
  await expect(page.getByText("advance").first()).toBeVisible();

  // --- Unlock code is hidden until revealed (owner is not the assigned engineer but has the permission) ---
  await expect(page.getByText("••••••")).toBeVisible();
  await page.getByRole("button", { name: "Reveal" }).click();
  await expect(page.getByText("2580")).toBeVisible();

  // --- Diagnosis, part from stock, labour, repair, QC, ready ---
  await moveTo(page, "Diagnosis");
  await page.getByRole("button", { name: "Issue part" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").first().click();
  await page.getByPlaceholder("Search name or SKU…").fill("DSP-A52");
  await page.getByRole("option", { name: /Galaxy A52/ }).click();
  await dialog.getByRole("button", { name: "Issue" }).click();
  await expect(page.getByText("Part issued").first()).toBeVisible();

  await page.getByRole("button", { name: "Labour" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: /Display replacement labour/ }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Labour added").first()).toBeVisible();
  // ₹4,500 display + ₹500 labour = ₹5,000 (within the ₹6,000 estimate, so no quote needed)
  await expect(page.getByText("₹5,000.00").first()).toBeVisible();

  await moveTo(page, "In repair");
  await moveTo(page, "Quality check");
  await moveTo(page, "Ready for pickup");

  // --- Invoice: ₹5,000 incl. GST, ₹500 advance already adjusted ---
  await page.getByRole("button", { name: "Issue invoice" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Issue invoice" }).click();
  await expect(page.getByText("Invoice issued").first()).toBeVisible();
  await expect(page.getByText(/PKD\/2627\/\d{5}/).first()).toBeVisible();
  await expect(page.getByText("₹4,500.00 due").first()).toBeVisible();

  // Delivery is blocked while money is due
  await page.getByRole("button", { name: "Deliver" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deliver" }).click();
  await expect(page.getByText(/still due/).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // --- Collect the balance, deliver ---
  await page.getByRole("button", { name: /Collect ₹4,500.00/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Received into" }).click();
  await page.getByRole("option", { name: /Cash/ }).click();
  await dialog.getByRole("button", { name: "Save receipt" }).click();
  await expect(page.getByText("Payment recorded").first()).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Deliver" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deliver" }).click();
  await expect(page.getByText("Delivered").first()).toBeVisible();
  await expect(page.getByText(/90 days · until/)).toBeVisible(); // display warranty rule
  await expect(page.getByText("••••••")).toHaveCount(0); // unlock code wiped

  // --- Invoice print view shows the GST split ---
  const invoiceLink = page.getByRole("link", { name: /PKD\/2627\// }).first();
  await invoiceLink.click();
  await expect(page.getByText("TAX INVOICE")).toBeVisible();
  await expect(page.getByText("Rupees Five Thousand Only")).toBeVisible();

  // --- After delivery: a partial credit note with the money paid back ---
  await page.getByRole("button", { name: "Credit note" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Amount including GST/).fill("590");
  await dialog.getByLabel("Reason").fill("Charging port replaced again free of charge");
  await dialog.getByRole("switch", { name: /Pay the money back now/ }).click();
  await dialog.getByRole("combobox", { name: "From account" }).click();
  await page.getByRole("option", { name: /Cash/ }).click();
  await dialog.getByRole("button", { name: "Issue credit note" }).click();
  await expect(page.getByText("CREDIT NOTE", { exact: true })).toBeVisible();
  await expect(page.getByText(/PKD\/C2627\/\d{5}/).first()).toBeVisible();
  await expect(page.getByText(/Against invoice/)).toBeVisible();

  // --- Public tracker (no login needed) ---
  await page.context().clearCookies();
  await page.goto("/track");
  await page.getByLabel("Job number").fill(jobNo);
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Track" }).click();
  await expect(page.getByText("Hi Playwright")).toBeVisible();
  await expect(page.getByText("Delivered").first()).toBeVisible();

  // Wrong phone reveals nothing
  await page.getByLabel("Phone number").fill("9000000000");
  await page.getByRole("button", { name: "Track" }).click();
  await expect(page.getByText("No repair found")).toBeVisible();
});
