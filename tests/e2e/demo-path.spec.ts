import { expect, test } from "@playwright/test";

test("globe-first demo path stays reachable", async ({ page }) => {
  const seenViews = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.endsWith("/api/v1/dashboard-data")) return;
    const view = url.searchParams.get("view");
    if (view) seenViews.add(view);
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Global Donation Flows" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Full Analytics/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Overview/i })).toBeHidden();
  await expect(page.getByRole("button", { name: /Open flow filters/i })).toBeHidden();

  await expect.poll(() => seenViews.has("globe_flows"), { timeout: 15000 }).toBe(true);
  expect(Array.from(seenViews).filter((view) => view !== "globe_flows")).toEqual([]);

  await page.getByRole("button", { name: /Full Analytics/i }).click();
  await expect(page.getByRole("tab", { name: /Overview/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open flow filters/i })).toBeVisible();
  await expect(page.getByText("Explore Country Flows")).toBeHidden();
  await expect.poll(() => seenViews.has("overview_metrics"), { timeout: 15000 }).toBe(true);

  await page.getByRole("button", { name: /Open flow filters/i }).click();
  await expect(page.getByRole("heading", { name: "Filter Flows" })).toBeVisible();
  await page.getByText("Year", { exact: true }).first().isVisible();
  await page.getByTestId("filter-drawer").getByRole("button", { name: /Close flow filters/i }).click();

  await expect(page.getByRole("tab", { name: /Raw Data Explorer/i })).toBeVisible();
  await page.getByRole("tab", { name: /Raw Data Explorer/i }).click();
  await expect.poll(() => seenViews.has("raw_table"), { timeout: 15000 }).toBe(true);
  await expect(page.getByText(/Project (ID|Key):/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Project Detail" })).toBeHidden();
});
