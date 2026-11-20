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
  await expect(page.getByRole("cell", { name: "Palakkad", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Mukkam", exact: true })).toBeVisible();

  await page.goto("/admin/settings/audit-log?f_action=LOGIN_FAILED");
  await expect(page.getByText("LOGIN FAILED").first()).toBeVisible();
});

test("a service engineer only gets what their role allows", async ({ page }) => {
  await signIn(page, "engineer.pkd@demo.test");
  await expect(page.getByRole("heading", { name: /Welcome, Akhil/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);

  await page.goto("/admin/settings/users");
  await expect(page).toHaveURL(/\/admin\/no-access/);
  await expect(page.getByRole("heading", { name: /don't have access/ })).toBeVisible();
});

test("owners can't touch the super admin or other owners; the super admin can", async ({ page }) => {
  await signIn(page, "arun@demo.test");
  await expect(page.getByRole("heading", { name: /Welcome, Arun/ })).toBeVisible();
  await page.goto("/admin/settings/users?q=superadmin");
  await expect(page.getByRole("row", { name: /Super Admin/ }).getByText("Protected")).toBeVisible();
  await page.goto("/admin/settings/users?q=bindu");
  await expect(page.getByRole("row", { name: /Bindu Menon/ }).getByText("Protected")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, "superadmin@demo.test");
  await expect(page.getByRole("heading", { name: /Welcome, Super/ })).toBeVisible();
  await page.goto("/admin/settings/users?q=bindu");
  const row = page.getByRole("row", { name: /Bindu Menon/ });
  await expect(row.getByText("Protected")).toHaveCount(0);
  await expect(row.getByRole("button", { name: /Actions for Bindu Menon/ })).toBeVisible();
});

test("anyone can change their own password from My account", async ({ page }) => {
  const email = "placement@demo.test";
  const next = "Changed@2026x";
  const change = async (current: string, newPassword: string) => {
    await page.goto("/admin/account");
    await page.getByLabel("Current password", { exact: true }).fill(current);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Repeat new password").fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
  };

  await signIn(page, email);
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "My account" }).click();
  await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();

  await change("not-my-password1", next);
  await expect(page.getByText("Your current password is not correct.")).toBeVisible();

  await change(PASSWORD, next);
  await expect(page.getByText("Password changed")).toBeVisible();

  // The new password works, the old one doesn't.
  await page.context().clearCookies();
  await signIn(page, email, PASSWORD);
  await expect(page.getByText(/Incorrect email or password/)).toBeVisible();
  await signIn(page, email, next);
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

  // Put the demo password back for the other tests.
  await change(next, PASSWORD);
  await expect(page.getByText("Password changed")).toBeVisible();
});
