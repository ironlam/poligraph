import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  CONDAMNATION_STATUSES,
  DEFINITIVE_CONVICTION_STATUSES,
  NON_DEFINITIVE_CONVICTION_STATUSES,
} from "@/config/judicial-maturity";
import {
  getDefinitiveConvictionWhere,
  getFavorableOutcomeWhere,
  getNonDefinitiveConvictionWhere,
  getProbityConvictionBadgeWhere,
} from "@/lib/affairs/public-filters";
import { CONVICTION_ROWS } from "./fixtures/conviction-rows";
import { evaluateWhere } from "./fixtures/evaluate-where";

const kept = (where: object) =>
  Object.entries(CONVICTION_ROWS)
    .filter(([, r]) => evaluateWhere(r, where as Record<string, unknown>))
    .map(([key]) => key)
    .sort();

describe("statuts de condamnation", () => {
  it("sépare définitives et non définitives sans perdre de statut", () => {
    expect(DEFINITIVE_CONVICTION_STATUSES).toEqual(["CONDAMNATION_DEFINITIVE"]);
    expect(NON_DEFINITIVE_CONVICTION_STATUSES).toEqual(
      expect.arrayContaining([
        "CONDAMNATION_PREMIERE_INSTANCE",
        "APPEL_EN_COURS",
        "POURVOI_EN_CASSATION",
      ])
    );
    expect(NON_DEFINITIVE_CONVICTION_STATUSES).not.toContain("CONDAMNATION_DEFINITIVE");
    expect(
      [...DEFINITIVE_CONVICTION_STATUSES, ...NON_DEFINITIVE_CONVICTION_STATUSES].sort()
    ).toEqual([...CONDAMNATION_STATUSES].sort());
  });
});

describe("helpers de condamnation", () => {
  it("getDefinitiveConvictionWhere ne retient que les définitives pénales DIRECT", () => {
    expect(kept(getDefinitiveConvictionWhere())).toEqual([
      "definitiveCampaignFinancing",
      "definitiveCorruptionGrave",
      "definitiveHateCritique",
    ]);
  });

  it("getNonDefinitiveConvictionWhere retient première instance, appel et pourvoi", () => {
    expect(kept(getNonDefinitiveConvictionWhere())).toEqual([
      "appealCorruption",
      "cassationCorruption",
      "firstInstanceCorruption",
    ]);
  });

  it("getProbityConvictionBadgeWhere se fonde sur la catégorie, pas sur la gravité", () => {
    const where = getProbityConvictionBadgeWhere();
    expect(kept(where)).toEqual(["definitiveCorruptionGrave"]);
    expect(Object.keys(where)).not.toContain("severity");
  });

  it("getFavorableOutcomeWhere exclut une relaxe non pénale", () => {
    const nonPenal = { ...CONVICTION_ROWS.relaxe, jurisdictionOrder: "FINANCIER" };
    expect(evaluateWhere(CONVICTION_ROWS.relaxe, getFavorableOutcomeWhere())).toBe(true);
    expect(evaluateWhere(nonPenal, getFavorableOutcomeWhere())).toBe(false);
  });
});
