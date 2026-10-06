import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  CONDAMNATION_STATUSES,
  DEFINITIVE_CONVICTION_STATUSES,
  NON_DEFINITIVE_CONVICTION_STATUSES,
} from "@/config/judicial-maturity";
import { getCategoriesForSuper } from "@/config/labels";
import {
  ADVERSE_INVOLVEMENTS,
  ADVERSE_JURISDICTION_ORDER,
  POLITICAL_FINANCING_CATEGORIES,
  PUBLIC_AFFAIR_PUBLICATION_STATUS,
  getDefinitiveConvictionWhere,
  getFavorableOutcomeWhere,
  getNonDefinitiveConvictionWhere,
  getPoliticalFinancingBadgeSql,
  getPoliticalFinancingBadgeWhere,
  getProbityConvictionBadgeSql,
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

describe("getProbityConvictionBadgeSql", () => {
  it("lie exactement les constantes partagées, dans l'ordre du prédicat", () => {
    const sql = getProbityConvictionBadgeSql("a");
    expect(sql.values).toEqual([
      PUBLIC_AFFAIR_PUBLICATION_STATUS,
      ...ADVERSE_INVOLVEMENTS,
      ADVERSE_JURISDICTION_ORDER,
      ...DEFINITIVE_CONVICTION_STATUSES,
      ...getCategoriesForSuper("PROBITE"),
    ]);
  });

  it("filtre publication, implication, ordre, statut et catégorie, jamais la gravité", () => {
    const { sql } = getProbityConvictionBadgeSql("a");
    expect(sql).toContain('a."publicationStatus" =');
    expect(sql).toContain("a.involvement IN (");
    expect(sql).toContain('a."jurisdictionOrder" =');
    expect(sql).toContain("a.status IN (");
    expect(sql).toContain("a.category IN (");
    expect(sql).not.toMatch(/severity/i);
  });

  it("donne le même verdict que getProbityConvictionBadgeWhere sur la fixture", () => {
    const values = getProbityConvictionBadgeSql("a").values as unknown[];
    const sqlKept = Object.entries(CONVICTION_ROWS)
      .filter(
        ([, r]) =>
          values.includes(r.publicationStatus) &&
          values.includes(r.involvement) &&
          values.includes(r.jurisdictionOrder) &&
          values.includes(r.status) &&
          values.includes(r.category)
      )
      .map(([key]) => key)
      .sort();
    expect(sqlKept).toEqual(kept(getProbityConvictionBadgeWhere()));
  });

  it("refuse un alias non revu", () => {
    expect(() => getProbityConvictionBadgeSql("b" as "a")).toThrow();
  });
});

describe("getPoliticalFinancingBadgeSql", () => {
  it("lie les mêmes constantes que la probité, avec les catégories de financement", () => {
    expect(getPoliticalFinancingBadgeSql("a").values).toEqual([
      PUBLIC_AFFAIR_PUBLICATION_STATUS,
      ...ADVERSE_INVOLVEMENTS,
      ADVERSE_JURISDICTION_ORDER,
      ...DEFINITIVE_CONVICTION_STATUSES,
      ...POLITICAL_FINANCING_CATEGORIES,
    ]);
  });

  it("donne le même verdict que getPoliticalFinancingBadgeWhere sur la fixture", () => {
    const values = getPoliticalFinancingBadgeSql("a").values as unknown[];
    const sqlKept = Object.entries(CONVICTION_ROWS)
      .filter(
        ([, r]) =>
          values.includes(r.publicationStatus) &&
          values.includes(r.involvement) &&
          values.includes(r.jurisdictionOrder) &&
          values.includes(r.status) &&
          values.includes(r.category)
      )
      .map(([key]) => key)
      .sort();
    expect(sqlKept).toEqual(["definitiveCampaignFinancing"]);
    expect(sqlKept).toEqual(kept(getPoliticalFinancingBadgeWhere()));
  });

  it("refuse un alias non revu", () => {
    expect(() => getPoliticalFinancingBadgeSql("b" as "a")).toThrow();
  });
});
