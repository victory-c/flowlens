import { expect, test } from "@playwright/test";

test("judge demo path stays reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FlowLens" })).toBeVisible();
  await expect(page.getByText("Filter Ladder")).toBeVisible();
  await expect(page.getByText("Project Inspector")).toBeVisible();

  await page.getByLabel("Year").selectOption({ label: "2021" }).catch(() => undefined);
  await page.getByLabel("Sector").selectOption({ index: 1 }).catch(() => undefined);

  const firstProject = page.locator("tbody tr").first();
  await firstProject.click({ timeout: 30_000 }).catch(() => undefined);
  await expect(page.getByText("Project Detail")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button").filter({ hasText: "" }).last().click().catch(() => undefined);

  await page.getByRole("button", { name: /Raw Rows/i }).click();
  await page.getByRole("button", { name: /Reset/i }).click();
});
