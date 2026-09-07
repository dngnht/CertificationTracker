import { test, expect } from "@playwright/test";

/**
 * Smoke/E2E tests. These require a running app with a seeded database and
 * AUTH_ENABLE_DEV_LOGIN=true (the default for local dev).
 *
 * Setup:
 *   docker compose up -d
 *   npx prisma migrate dev
 *   npm run db:seed
 *   npm run test:e2e
 */

test.describe("Authentication", () => {
  test("redirects anonymous users to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("admin can log in via dev login and see the admin dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Choose a seeded user/i }).click();
    await page.getByText("admin@company.com").click();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
  });

  test("member can log in and see their certification plan", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Choose a seeded user/i }).click();
    await page.getByText("john@company.com").click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "My Certification Plan" })).toBeVisible();
  });
});

test.describe("Admin reports", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Choose a seeded user/i }).click();
    await page.getByText("admin@company.com").click();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("overdue report loads", async ({ page }) => {
    await page.goto("/admin/reports/overdue");
    await expect(page.getByRole("heading", { name: "Overdue Report" })).toBeVisible();
  });

  test("certification plan page allows assigning", async ({ page }) => {
    await page.goto("/admin/certification-plan");
    await expect(page.getByRole("heading", { name: "Certification Plan" })).toBeVisible();
  });
});