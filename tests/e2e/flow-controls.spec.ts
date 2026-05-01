import { expect, test } from "@playwright/test";

test("domestic filter and table search are wired to dashboard-data requests", async ({ page }) => {
  const requestUrls: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.endsWith("/api/v1/dashboard-data")) return;
    requestUrls.push(url);
  });

  await page.goto("/?includeDomestic=true");
  await page.getByRole("button", { name: /Full Analytics/i }).click();
  await page.getByRole("button", { name: /Open flow filters/i }).click();

  const filterDrawer = page.getByTestId("filter-drawer");
  await expect(filterDrawer.getByText("Cross-border flows only")).toBeVisible();
  await expect.poll(() => page.url().includes("includeDomestic=true")).toBe(true);
  await filterDrawer.getByRole("button", { name: /Close flow filters/i }).click();

  await expect.poll(() => requestUrls.some((url) => url.searchParams.get("view") === "globe_flows")).toBe(true);
  expect(
    requestUrls
      .filter((url) => url.searchParams.get("view") === "globe_flows")
      .every((url) => url.searchParams.get("includeDomestic") !== "true")
  ).toBe(true);

  await page.getByRole("tab", { name: /Donor -> Recipient Flows/i }).click();
  await page.getByLabel("Country and flow table search").fill("india");

  await expect
    .poll(
      () =>
        requestUrls.some(
          (url) =>
            url.searchParams.get("view") === "flow_summary" &&
            url.searchParams.get("includeDomestic") === "true" &&
            url.searchParams.get("tableQ") === "india"
        ),
      { timeout: 15_000 }
    )
    .toBe(true);

  await page.getByRole("tab", { name: /Cause Analysis/i }).click();
  await page.getByRole("tab", { name: /Yearly Trends/i }).click();
  await page.getByRole("tab", { name: /Raw Data Explorer/i }).click();
  const rawSearch = page.getByLabel("Raw data search");
  await rawSearch.fill("water");

  await expect
    .poll(
      () =>
        ["cause_summary", "yearly_summary"].every((view) =>
          requestUrls.some(
            (url) =>
              url.searchParams.get("view") === view &&
              url.searchParams.get("includeDomestic") === "true" &&
              url.searchParams.get("tableQ") === "india"
          )
        ),
      { timeout: 15_000 }
    )
    .toBe(true);

  await expect
    .poll(
      () =>
        requestUrls.some(
          (url) =>
            url.searchParams.get("view") === "raw_table" &&
            url.searchParams.get("includeDomestic") === "true" &&
            url.searchParams.get("tableQ") === "india" &&
            url.searchParams.get("q") === "water"
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
  await expect(rawSearch).toHaveValue("water");
  await expect(rawSearch).toBeFocused();
});

test("forced globe crash falls back to 2D mode", async ({ page }) => {
  await page.goto("/?forceGlobeCrash=true");
  await expect(page.getByText("2D fallback mode")).toBeVisible();
  await page.getByRole("button", { name: /Full Analytics/i }).click();
  await expect(page.getByRole("tab", { name: /Overview/i })).toBeVisible();
});

test("low graphics mode toggles 2D fallback", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Low graphics mode off/i }).click();
  await expect(page.getByText("2D fallback mode")).toBeVisible();
});

test("country focus search pins local globe state without changing analytics filters", async ({ page }) => {
  const requestUrls: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.endsWith("/api/v1/dashboard-data")) return;
    requestUrls.push(url);
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Top 5$/i })).toBeVisible();
  await expect.poll(() => requestUrls.some((url) => url.searchParams.get("view") === "globe_flows")).toBe(true);
  const requestCountBeforeFocus = requestUrls.length;

  await page.getByLabel("Search country").fill("United States");
  await page.getByRole("button", { name: /^Focus$/i }).click();

  await expect(page.getByText("Pinned country", { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("connectedCountry")).toBe(null);
  await page.waitForTimeout(500);
  expect(requestUrls.length).toBe(requestCountBeforeFocus);
  const requestCountBeforeInteraction = requestUrls.length;

  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Globe canvas not found");
  const startX = box.x + box.width * 0.5;
  const startY = box.y + box.height * 0.45;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY + 18, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByText("Pinned country", { exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  expect(requestUrls.length).toBe(requestCountBeforeInteraction);

  await page.keyboard.press("Escape");
  await expect(page.getByText("Pinned country", { exact: true })).toBeHidden();
  await expect.poll(() => new URL(page.url()).searchParams.get("connectedCountry")).toBe(null);
});

test("country with no corridors stays pinned locally without changing analytics filters", async ({ page }) => {
  await page.goto("/?cause=Climate");
  await expect(page.getByText(/not applied to the globe/i)).toBeHidden();

  await page.getByLabel("Search country").fill("Antarctica");
  await page.getByRole("button", { name: /^Focus$/i }).click();
  await expect(page.getByText("Pinned country", { exact: true })).toBeVisible();
  await expect(page.getByText(/No donation corridors found for this country in the globe dataset/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Top 5$/i })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("connectedCountry")).toBe(null);
});

test("filter drawer exposes sector and keeps stable country and sector options", async ({ page }) => {
  const requestUrls: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.endsWith("/api/v1/dashboard-data")) return;
    requestUrls.push(url);
  });

  await page.goto("/?connectedCountry=United%20States&sector=Health");
  await page.getByRole("button", { name: /Full Analytics/i }).click();
  await page.getByRole("button", { name: /Open flow filters/i }).click();

  const filterDrawer = page.getByTestId("filter-drawer");
  const connectedSelect = filterDrawer.getByLabel("Connected Country");
  const sectorSelect = filterDrawer.getByLabel("Sector");

  await expect.poll(() => connectedSelect.locator("option").count()).toBeGreaterThan(1);
  await expect.poll(() => sectorSelect.locator("option").count()).toBeGreaterThan(1);

  const selectedCountry = "United States";
  const selectedSector = "Health";

  await expect.poll(() => new URL(page.url()).searchParams.get("connectedCountry")).toBe(selectedCountry);
  await expect.poll(() => new URL(page.url()).searchParams.get("sector")).toBe(selectedSector);
  await expect(connectedSelect).toHaveValue(selectedCountry);
  await expect(sectorSelect).toHaveValue(selectedSector);
  await expect
    .poll(
      () =>
        requestUrls.some(
          (url) =>
            url.searchParams.get("view") === "overview_metrics" &&
            url.searchParams.get("connectedCountry") === selectedCountry &&
            url.searchParams.get("sector") === selectedSector
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
  await expect.poll(() => connectedSelect.locator("option").count()).toBeGreaterThan(1);
  await expect.poll(() => sectorSelect.locator("option").count()).toBeGreaterThan(1);
});

test("overview and cause tab show refreshed insight and expanded cause breakdowns", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Full Analytics/i }).click();

  await expect(page.getByText("Current scope")).toBeVisible();
  await expect(page.getByText("Data caveat")).toBeHidden();

  await page.getByRole("tab", { name: /Cause Analysis/i }).click();
  await expect(page.getByText(/Donor continent breakdown/i)).toBeVisible();
  await expect(page.getByText(/Organization breakdown/i)).toBeVisible();
  await expect(page.getByText(/Sector breakdown/i)).toBeVisible();
  await expect(page.getByText(/Sector details/i)).toBeVisible();
});
