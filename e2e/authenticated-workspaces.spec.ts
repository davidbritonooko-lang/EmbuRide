import { expect, test, type Page } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "";
const passengerEmail = process.env.E2E_PASSENGER_EMAIL ?? "e2e-passenger@example.invalid";
const driverEmail = process.env.E2E_DRIVER_EMAIL ?? "e2e-driver@example.invalid";
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@example.invalid";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(
      Math.max(dimensions.document, dimensions.body),
      `Unexpected horizontal overflow at ${width}px`,
    ).toBeLessThanOrEqual(dimensions.viewport);
  }
}

test("passenger authentication, nearby-driver search, and responsive workspace", async ({ page }) => {
  test.skip(!password, "Local E2E credentials are not configured.");
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: -0.539, longitude: 37.457 });
  await signIn(page, passengerEmail);
  await expect(page).toHaveURL(/\/passenger$/);
  await expect(page.getByRole("heading", { name: "Find your next ride" })).toBeVisible();

  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.getByText(/1 nearby driver found/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("E2E Driver")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("verified driver can enable foreground presence and open the driver workspace", async ({ page }) => {
  test.skip(!password, "Local E2E credentials are not configured.");
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: -0.539, longitude: 37.457 });
  await signIn(page, driverEmail);
  await expect(page).toHaveURL(/\/driver$/);
  await expect(page.getByRole("heading", { name: "Your driving activity" })).toBeVisible();

  const enableButton = page.getByRole("button", { name: "Enable location sharing" });
  if (await enableButton.isVisible()) await enableButton.click();
  await expect(page.getByRole("button", { name: "Go offline" })).toBeVisible({ timeout: 15000 });
  await expectNoHorizontalOverflow(page);
});

test("super administrator can open the operations workspace", async ({ page }) => {
  test.skip(!password, "Local E2E credentials are not configured.");
  await signIn(page, adminEmail);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Operations overview" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("passenger cannot open administrator routes", async ({ page }) => {
  test.skip(!password, "Local E2E credentials are not configured.");
  await signIn(page, passengerEmail);
  await expect(page).toHaveURL(/\/passenger$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/passenger$/);
  await expect(page.getByRole("heading", { name: "Find your next ride" })).toBeVisible();
});
