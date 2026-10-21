import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const FORM = "/signaler?from=%2Fpolitiques%2Fyael-braun-pivet%3Fq%3Dsecret";

test.describe("/signaler", () => {
  test("aucune violation WCAG AA en thème clair", async ({ page }) => {
    await page.goto(FORM);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .include("main")
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test.describe("thème sombre", () => {
    test.use({ colorScheme: "dark" });
    test("aucune violation de contraste", async ({ page }) => {
      await page.goto(FORM);
      await expect(page.locator("html")).toHaveClass(/dark/);
      const results = await new AxeBuilder({ page })
        .include("main")
        .withRules(["color-contrast"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  });

  test("affiche la page d'origine sans les paramètres de requête", async ({ page }) => {
    await page.goto(FORM);
    await expect(page.getByText("/politiques/yael-braun-pivet", { exact: true })).toBeVisible();
    await expect(page.getByText("secret")).toHaveCount(0);
  });

  test("envoie le retour et annonce la confirmation", async ({ page }) => {
    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/feedback", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 200, json: { success: true } });
    });
    await page.goto(FORM);
    await page.getByLabel("Erreur dans une information").check();
    await page.getByLabel("Votre message").fill("Le mandat indiqué est daté de travers.");
    await page.getByRole("button", { name: "Envoyer" }).click();

    const confirmation = page.getByRole("status");
    await expect(confirmation).toContainText("Merci");
    await expect(confirmation).toBeFocused();
    expect(sent).toMatchObject({
      category: "FACTUAL_ERROR",
      pagePath: "/politiques/yael-braun-pivet",
      website: "",
    });
  });

  test("signale une indisponibilité du serveur sans perdre le message", async ({ page }) => {
    await page.route("**/api/feedback", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Le formulaire est momentanément indisponible." },
      })
    );
    await page.goto(FORM);
    await page.getByLabel("Autre").check();
    await page.getByLabel("Votre message").fill("Un message assez long pour être accepté.");
    await page.getByRole("button", { name: "Envoyer" }).click();

    await expect(page.locator("form").getByRole("alert")).toContainText(
      "momentanément indisponible"
    );
    await expect(page.getByLabel("Votre message")).toHaveValue(
      "Un message assez long pour être accepté."
    );
  });
});
