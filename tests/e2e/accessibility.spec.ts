import { expect, test } from "@playwright/test";

test("keyboard users can open filters and navigate tabs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Full Analytics/i }).click();

  const openFilters = page.getByRole("button", { name: /Open flow filters/i });
  await openFilters.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Filter Flows" })).toBeVisible();

  const includeDomestic = page.getByLabel("Include domestic giving");
  await includeDomestic.focus();
  await page.keyboard.press("Space");
  await expect(includeDomestic).toBeChecked();

  await page.locator("aside").filter({ hasText: "Filter Flows" }).getByRole("button").first().click();

  const flowsTab = page.getByRole("tab", { name: /Donor -> Recipient Flows/i });
  await flowsTab.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tabpanel", { name: /Donor -> Recipient Flows/i })).toBeVisible();
});
