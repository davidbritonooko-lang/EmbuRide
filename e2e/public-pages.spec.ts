import { expect, test } from "@playwright/test";

const publicPages = [
  { path: "/", heading: "Your ride, connected." },
  { path: "/login", heading: "Welcome back" },
  { path: "/signup", heading: "Create your account" },
];

test("home page exposes working account navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your ride, connected." })).toBeVisible();
  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByLabel("Full name")).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("authentication forms expose labelled and constrained inputs", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email address")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();

  await page.goto("/signup");
  await expect(page.getByLabel("Full name")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Email address")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Password")).toHaveAttribute("minlength", "10");
});

for (const { path, heading } of publicPages) {
  test(`no horizontal overflow on ${path} at supported viewport widths`, async ({ page }) => {
    for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect(
        Math.max(dimensions.document, dimensions.body),
        `Unexpected horizontal overflow at ${width}px on ${path}`,
      ).toBeLessThanOrEqual(dimensions.viewport);
    }
  });
}
