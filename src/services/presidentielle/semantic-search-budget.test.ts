import { describe, expect, it, vi } from "vitest";
import { PresidentialSemanticSearchBudget } from "./semantic-search-budget";

const decision = (success: boolean) => ({ success, remaining: success ? 10 : 0, reset: 0 });

describe("budget global de la recherche sémantique", () => {
  it("réserve les budgets journalier et mensuel avant l'appel payant", async () => {
    const daily = { limit: vi.fn().mockResolvedValue(decision(true)) };
    const monthly = { limit: vi.fn().mockResolvedValue(decision(true)) };
    const budget = new PresidentialSemanticSearchBudget(daily, monthly, false);

    await expect(budget.reserve()).resolves.toEqual({ allowed: true, reason: "available" });
    expect(daily.limit).toHaveBeenCalledWith("global");
    expect(monthly.limit).toHaveBeenCalledWith("global");
  });

  it("coupe la partie sémantique lorsque le plafond est atteint", async () => {
    const daily = { limit: vi.fn().mockResolvedValue(decision(false)) };
    const monthly = { limit: vi.fn().mockResolvedValue(decision(true)) };
    const budget = new PresidentialSemanticSearchBudget(daily, monthly, false);

    await expect(budget.reserve()).resolves.toEqual({ allowed: false, reason: "daily-limit" });
  });

  it("échoue fermé en production si le compteur partagé est absent ou indisponible", async () => {
    await expect(
      new PresidentialSemanticSearchBudget(null, null, false).reserve()
    ).resolves.toEqual({ allowed: false, reason: "unavailable" });

    const failing = { limit: vi.fn().mockRejectedValue(new Error("redis")) };
    await expect(
      new PresidentialSemanticSearchBudget(failing, failing, false).reserve()
    ).resolves.toEqual({ allowed: false, reason: "unavailable" });
  });

  it("autorise le développement local sans Redis", async () => {
    await expect(new PresidentialSemanticSearchBudget(null, null, true).reserve()).resolves.toEqual(
      { allowed: true, reason: "available" }
    );
  });
});
