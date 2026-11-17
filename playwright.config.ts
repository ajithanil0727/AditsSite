import { defineConfig, devices } from "@playwright/test";

/**
 * Critical-flow E2E tests. Needs a seeded database (npm run db:seed).
 * Uses the installed Microsoft Edge by default (no browser download);
 * set PW_CHANNEL=chromium after `npx playwright install chromium` to use Playwright's own build (e.g. in CI).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL ?? "msedge" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
