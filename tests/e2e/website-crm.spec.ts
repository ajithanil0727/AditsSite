import { expect, test, type Page } from "@playwright/test";

/**
 * Public website → CRM: a course enquiry from the website lands with the branch's counsellor (round-robin),
 * who logs a follow-up and converts it into an admission. Then an editor changes the home page:
 * the draft is invisible to visitors until it is published.
 */
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";
const phone = `8${String(Date.now()).slice(-9)}`;

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test("website enquiry → follow-up → admission", async ({ page }) => {
  test.setTimeout(180_000);

  // --- Visitor sends an enquiry from a course page ---
  await page.goto("/courses");
  await page
    .getByRole("link", { name: /Smartphone Engineering/ })
    .first()
    .click();
  await page.getByRole("link", { name: "Enquire about this course" }).click();
  await expect(page).toHaveURL(/\/enquire\?course=/);
  await page.waitForLoadState("networkidle"); // let the form hydrate before typing (first dev compile is slow)
  await page.getByLabel("Your name").fill("Website Visitor");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("combobox", { name: "Nearest branch" }).click();
  await page.getByRole("option", { name: /^Palakkad/ }).click();
  await expect(page.getByRole("combobox", { name: "Course" })).toContainText("Smartphone Engineering");
  await page.waitForTimeout(3_200); // people take more than 3 s; faster submissions are treated as bots
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByText("Thank you! We'll call you soon.")).toBeVisible();

  // --- The Palakkad counsellor gets it (round-robin) and follows up ---
  await signIn(page, "frontdesk.pkd@demo.test");
  await page.goto(`/admin/leads?q=${phone}`);
  await page.getByRole("link", { name: "Website Visitor" }).click();
  await expect(page.getByText("Course enquiry · Palakkad")).toBeVisible();
  await expect(page.getByText("Assigned automatically (round-robin)")).toBeVisible();
  await page.getByRole("button", { name: "Call", exact: true }).click();
  await page.getByLabel("What happened?").fill("Called, will visit on Saturday");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Called, will visit on Saturday")).toBeVisible();

  // --- Convert: the admission form is pre-filled from the enquiry ---
  await page.getByRole("link", { name: /Convert: admit student/ }).click();
  await expect(page).toHaveURL(/\/admin\/students\/new\?lead=/);
  await expect(page.getByLabel("Full name")).toHaveValue("Website Visitor");
  await expect(page.getByLabel("Mobile number")).toHaveValue(phone);
  await page.locator("form:not([role=search])").first().getByRole("combobox", { name: "Fee plan" }).click();
  await page.getByRole("option", { name: "Full payment" }).click();
  await page.getByRole("button", { name: "Admit student" }).click();
  await expect(page.getByText("Admission saved.")).toBeVisible();

  // --- The enquiry is now won and linked ---
  await page.goto(`/admin/leads?q=${phone}&f_state=all`);
  await page.getByRole("link", { name: "Website Visitor" }).click();
  await expect(page.getByText(/Converted .*Smartphone Engineering admission/)).toBeVisible();
});

test("page drafts stay private until published", async ({ page }) => {
  test.setTimeout(120_000);
  const headline = `Fix it right ${Date.now()}`;
  await signIn(page, "arun@demo.test");
  await page.goto("/admin/website/pages");
  await page.getByRole("link", { name: "Home", exact: true }).click();

  const editHero = async (text: string) => {
    await page.getByRole("button", { name: "Edit Hero" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Headline/).fill(text);
    await dialog.getByRole("button", { name: "Save to draft" }).click();
    await expect(page.getByText("Section saved to the draft")).toBeVisible();
  };

  const original = await (async () => {
    await page.getByRole("button", { name: "Edit Hero" }).click();
    const v = await page
      .getByRole("dialog")
      .getByLabel(/^Headline/)
      .inputValue();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    return v;
  })();

  await editHero(headline);
  await expect(page.getByText("You have changes that visitors can't see yet.")).toBeVisible();

  // Visitors still see the old headline; the preview shows the draft.
  const visitor = await page.context().browser()!.newPage();
  await visitor.goto("/");
  await expect(visitor.getByRole("heading", { level: 1 })).not.toContainText(headline);
  await page.goto(page.url().replace(/\/admin\/website\/pages\/(.+)$/, "/preview/$1"));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(headline);
  await page.goBack();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published. The website is updated.")).toBeVisible();
  await visitor.goto("/");
  await expect(visitor.getByRole("heading", { level: 1 })).toContainText(headline);

  // Put the demo content back.
  await editHero(original);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published. The website is updated.")).toBeVisible();
  await visitor.close();
});
