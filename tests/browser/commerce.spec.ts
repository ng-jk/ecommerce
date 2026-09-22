import { test, expect } from "@playwright/test";

for (const [shop, product] of [
  ["fashion", "The everyday overshirt"],
  ["electronics", "Studio headphones"],
] as const) {
  test(`${shop}: register, search, product, cart, checkout, order history`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://${shop}.localhost:8080/account`);
    await page
      .getByRole("button", { name: "New here? Create account" })
      .click();
    await page.getByLabel("Your name", { exact: true }).fill("Browser Tester");
    await page
      .getByLabel("Email", { exact: true })
      .fill(`browser-${Date.now()}@${shop}.test`);
    await page.getByLabel("Password", { exact: true }).fill("BrowserTest2026!");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Account", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Search products").fill(product);
    await page
      .getByRole("link", { name: `View ${product}`, exact: true })
      .click();
    await page.reload();
    await expect(page.getByRole("heading", { name: product })).toBeVisible();
    await page.getByRole("button", { name: "Add to bag", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your bag." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue to checkout" }).click();
    await page.getByLabel("Full name").fill("Browser Tester");
    await page.getByLabel("Street address").fill("12 Jalan Portfolio");
    await page.getByLabel("City", { exact: true }).fill("Melaka");
    await page.getByLabel("Postcode").fill("75000");
    await page
      .getByRole("button", { name: "Place demo order", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your orders." }),
    ).toBeVisible();
    await expect(
      page.getByText("1 × " + product, { exact: false }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("1 × " + product, { exact: false }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
  test(`${shop}: narrow viewport, empty search, and direct routes`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://${shop}.localhost:8080/`);
    await expect(
      page.getByRole("link", { name: `View ${product}` }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/${shop}-mobile.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page
      .getByRole("button", { name: "Explore the collection ↓", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name:
          shop === "fashion" ? "The everyday edit" : "Find your next upgrade",
        exact: true,
      }),
    ).toBeInViewport();
    await page.getByLabel("Search products").fill("no-such-product-xyz");
    await expect(
      page.getByText("No products match your search."),
    ).toBeVisible();
    await page.goto(`http://${shop}.localhost:8080/product/999999`);
    await expect(
      page.getByRole("heading", { name: "Piece not found." }),
    ).toBeVisible();
  });
}

test("admin: edit stock and advance an order in its own shop", async ({
  page,
}) => {
  await page.goto("http://admin.localhost:8080/");
  await page.getByLabel("Email", { exact: true }).fill("admin@fashion.demo");
  await page.getByLabel("Password", { exact: true }).fill("Portfolio2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit The everyday overshirt", exact: true })
    .click();
  await page.getByLabel("Stock", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page
    .getByRole("button", { name: "Mark processing", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Mark shipped", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Volt", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Admin sign in" }),
  ).toBeVisible();
  await page
    .getByLabel("Email", { exact: true })
    .fill("admin@electronics.demo");
  await page.getByLabel("Password", { exact: true }).fill("Portfolio2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Studio headphones", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Edit The everyday overshirt",
      exact: true,
    }),
  ).toHaveCount(0);
});
