import { expect, test, type Page } from "@playwright/test";

// Seeded demo accounts (prisma/seed/index.ts). Password from SEED_DEFAULT_PASSWORD.
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("unauthenticated visitors are sent to the login page", async ({ page }) => {
  await page.goto("/admin/settings/users");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fsettings%2Fusers/);
});

test("a wrong password shows an error and is audited as a failed login", async ({ page }) => {
  await signIn(page, "arun@demo.test", "wrong-password-1");
  await expect(page.getByText(/Incorrect email or password/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("an owner can sign in, see settings and the audit trail", async ({ page }) => {
  await signIn(page, "arun@demo.test");
  await expect(page.getByRole("heading", { name: /Welcome, Arun/ })).toBeVisible();

  await page.goto("/admin/settings/branches");
  await expect(page.getByRole("cell", { name: "Kochi", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Kozhikode", exact: true })).toBeVisible();

  await page.goto("/admin/settings/audit-log?f_action=LOGIN_FAILED");
  await expect(page.getByText("LOGIN FAILED").first()).toBeVisible();
});

test("a service engineer only gets what their role allows", async ({ page }) => {
  await signIn(page, "engineer.koc@demo.test");
  await expect(page.getByRole("heading", { name: /Welcome, Akhil/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);

  await page.goto("/admin/settings/users");
  await expect(page).toHaveURL(/\/admin\/no-access/);
  await expect(page.getByRole("heading", { name: /don't have access/ })).toBeVisible();
});
