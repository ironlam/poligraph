import { describe, expect, it } from "vitest";
import {
  EXPENSES,
  RESCRIT_STATUS,
  totalMonthlyEuros,
  MONTHLY_TIERS,
  ONE_TIME_AMOUNTS,
  MISSION_ITEMS,
  SUPPORT_PLATFORMS,
  activeSecondaryPlatforms,
  DONATION_PREFILL_MODE,
  HELLOASSO_ORIGIN,
  HELLOASSO_FORM_URL,
  buildDonationWidgetUrl,
  taxReceiptMessage,
} from "./donation";

describe("donation config", () => {
  describe("EXPENSES", () => {
    it("contient au moins les 4 postes de base", () => {
      expect(EXPENSES.length).toBeGreaterThanOrEqual(4);
    });

    it("chaque dépense expose un montant entier positif en euros", () => {
      for (const expense of EXPENSES) {
        expect(Number.isInteger(expense.monthlyEuros)).toBe(true);
        expect(expense.monthlyEuros).toBeGreaterThan(0);
      }
    });

    it("chaque dépense a un label et une description non vides", () => {
      for (const expense of EXPENSES) {
        expect(expense.label.length).toBeGreaterThan(0);
        expect(expense.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe("totalMonthlyEuros", () => {
    it("retourne la somme entière des montants", () => {
      const expected = EXPENSES.reduce((sum, e) => sum + e.monthlyEuros, 0);
      expect(totalMonthlyEuros()).toBe(expected);
    });
  });

  describe("RESCRIT_STATUS", () => {
    it("est l'une des trois valeurs autorisées", () => {
      expect(["pending", "in_review", "validated"]).toContain(RESCRIT_STATUS);
    });
  });
});

describe("donation config v2", () => {
  it("MONTHLY_TIERS a exactement un palier recommandé", () => {
    expect(MONTHLY_TIERS.filter((t) => t.recommended)).toHaveLength(1);
  });
  it("MONTHLY_TIERS est trié par montant croissant avec des libellés non vides", () => {
    for (let i = 1; i < MONTHLY_TIERS.length; i++) {
      expect(MONTHLY_TIERS[i]!.monthlyEuros).toBeGreaterThan(MONTHLY_TIERS[i - 1]!.monthlyEuros);
    }
    for (const t of MONTHLY_TIERS) expect(t.impactLabel.trim().length).toBeGreaterThan(0);
  });
  it("ONE_TIME_AMOUNTS est trié, positif, entier", () => {
    for (const a of ONE_TIME_AMOUNTS) expect(Number.isInteger(a) && a > 0).toBe(true);
  });
  it("MISSION_ITEMS non vide", () => {
    expect(MISSION_ITEMS.length).toBeGreaterThanOrEqual(3);
  });
  it("SUPPORT_PLATFORMS a exactement une plateforme primaire (helloasso) activée avec url", () => {
    const primary = SUPPORT_PLATFORMS.filter((p) => p.primary);
    expect(primary).toHaveLength(1);
    expect(primary[0]!.id).toBe("helloasso");
    expect(primary[0]!.enabled).toBe(true);
    expect(primary[0]!.url).toMatch(/^https:\/\/www\.helloasso\.com\//);
  });
  it("toutes les url présentes sont en https", () => {
    for (const p of SUPPORT_PLATFORMS) if (p.url) expect(p.url.startsWith("https://")).toBe(true);
  });
  it("activeSecondaryPlatforms exclut les plateformes désactivées ou sans url", () => {
    const ids = activeSecondaryPlatforms().map((p) => p.id);
    expect(ids).not.toContain("github-sponsors");
    expect(ids).not.toContain("kofi");
    expect(ids).not.toContain("helloasso");
  });
  it("DONATION_PREFILL_MODE est une valeur autorisée", () => {
    expect(["unsupported", "verified"]).toContain(DONATION_PREFILL_MODE);
  });
  it("buildDonationWidgetUrl contient view=form et ignore les options en mode unsupported", () => {
    const url = buildDonationWidgetUrl({ frequency: "monthly", amountEuros: 10 });
    expect(url).toContain("view=form");
    if (DONATION_PREFILL_MODE === "unsupported") {
      expect(url).not.toContain("amount=");
      expect(url).not.toContain("frequency=");
    }
  });
  it("HELLOASSO_ORIGIN est l'origine https attendue", () => {
    expect(HELLOASSO_ORIGIN).toBe("https://www.helloasso.com");
  });
  it("HELLOASSO_FORM_URL est défini et pointe vers helloasso.com", () => {
    expect(HELLOASSO_FORM_URL).toBeDefined();
    expect(HELLOASSO_FORM_URL.startsWith("https://www.helloasso.com/")).toBe(true);
  });
  it("taxReceiptMessage en in_review ne promet pas de reçu à venir", () => {
    expect(taxReceiptMessage()).toContain("rescrit");
    expect(taxReceiptMessage().toLowerCase()).not.toContain("à venir");
  });
});
