import { expect, test } from "@playwright/test";

test("globe-first demo path stays reachable", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Global Donation Flows" })).toBeVisible();
  await expect(page.getByText("Filter Flows")).toBeVisible();
  await expect(page.getByRole("tab", { name: /Overview/i })).toBeVisible();

  await page.getByRole("button", { name: "Filter Flows" }).click();
  await expect(page.getByRole("heading", { name: "Filter Flows" })).toBeVisible();
  await page.getByText("Year", { exact: true }).first().isVisible();
  await page.getByRole("button").filter({ hasText: "Open Data Tables" }).click();

  await expect(page.getByRole("tab", { name: /Raw Data Explorer/i })).toBeVisible();
  await page.getByRole("tab", { name: /Raw Data Explorer/i }).click();
  await expect(page.getByText("Project Detail")).toBeHidden();
});
