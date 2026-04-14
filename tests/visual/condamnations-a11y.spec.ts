import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("/affaires/condamnations — accessibility", () => {
  test("default view has no WCAG AA violations", async ({ page }) => {
    await page.goto("/affaires/condamnations");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("filtered view (mandat=depute) has no WCAG AA violations", async ({ page }) => {
    await page.goto("/affaires/condamnations?mandat=depute&certainty=etabli");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("stats view has no WCAG AA violations and table has caption", async ({ page }) => {
    await page.goto("/affaires/condamnations?view=stats");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    const captionCount = await page.locator("table caption").count();
    expect(captionCount).toBeGreaterThan(0);
  });
});
