import { describe, it, expect } from "vitest";
import {
  checkEventPublishable,
  checkEventShape,
  DECISION_EVENT_TYPES,
  type EventGuardInput,
} from "../guard";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const valid: EventGuardInput = {
  type: "PROCES",
  occurrence: "HELD",
  date: d("2024-05-13"),
  datePrecision: "DAY",
  dateEnd: null,
  outcome: null,
  title: "Ouverture du procès devant le tribunal correctionnel",
  sourceUrl: "https://www.legifrance.gouv.fr/juri/id/1",
  sourceKind: "OFFICIAL",
  corroborationUrl: null,
};

const pressConviction: EventGuardInput = {
  ...valid,
  type: "JUGEMENT",
  outcome: "CONDAMNATION",
  sourceKind: "PRESS",
  sourceUrl: "https://www.lemonde.fr/article",
  corroborationUrl: "https://www.liberation.fr/article",
};

describe("DECISION_EVENT_TYPES", () => {
  it("contient les trois décisions", () => {
    expect([...DECISION_EVENT_TYPES].sort()).toEqual([
      "ARRET_APPEL",
      "ARRET_CASSATION",
      "JUGEMENT",
    ]);
  });
});

describe("checkEventPublishable", () => {
  it("accepte une étape valide", () => {
    expect(checkEventPublishable(valid)).toEqual([]);
  });

  it("accepte une condamnation de presse corroborée", () => {
    expect(checkEventPublishable(pressConviction)).toEqual([]);
  });

  it("accepte une révélation de presse et une période de faits", () => {
    expect(
      checkEventPublishable({
        ...valid,
        type: "REVELATION",
        sourceKind: "PRESS",
        sourceUrl: "https://www.mediapart.fr/x",
      })
    ).toEqual([]);
    expect(
      checkEventPublishable({
        ...valid,
        type: "FAITS",
        date: d("2012-01-01"),
        datePrecision: "YEAR",
        dateEnd: d("2014-01-01"),
      })
    ).toEqual([]);
  });

  it("accepte une décision annoncée sans issue", () => {
    expect(
      checkEventPublishable({
        ...valid,
        type: "JUGEMENT",
        occurrence: "SCHEDULED",
        date: d("2026-12-01"),
      })
    ).toEqual([]);
  });

  it.each<[string, Partial<EventGuardInput>, RegExp]>([
    ["URL http", { sourceUrl: "http://www.legifrance.gouv.fr/x" }, /https/],
    ["source absente", { sourceUrl: null }, /source/i],
    ["hôte Wikipédia", { sourceUrl: "https://fr.wikipedia.org/wiki/X" }, /wikipedia\.org/],
    ["sous-domaine over-blog", { sourceUrl: "https://x.over-blog.com/a" }, /over-blog\.com/],
    ["sourceKind nul", { sourceKind: null }, /nature de la source/i],
    ["titre avec cadratin", { title: "Procès — première audience" }, /tiret/],
    ["titre avec demi-cadratin", { title: "Procès – première audience" }, /tiret/],
    ["titre vide", { title: "   " }, /titre/i],
    ["titre trop long", { title: "a".repeat(121) }, /120/],
    ["JUGEMENT tenu sans issue", { type: "JUGEMENT" }, /issue/i],
    [
      "JUGEMENT annoncé avec issue",
      { type: "JUGEMENT", occurrence: "SCHEDULED", date: d("2026-12-01"), outcome: "RELAXE" },
      /issue/i,
    ],
    [
      "ARRET_CASSATION avec CONDAMNATION",
      { type: "ARRET_CASSATION", outcome: "CONDAMNATION" },
      /issue/i,
    ],
    [
      "condamnation de presse sans corroboration",
      { ...pressConviction, corroborationUrl: null },
      /seconde source/i,
    ],
    [
      "corroboration sur le même hôte",
      { ...pressConviction, corroborationUrl: "https://lemonde.fr/autre" },
      /autre média|même/i,
    ],
    [
      "corroboration en http",
      { ...pressConviction, corroborationUrl: "http://www.liberation.fr/a" },
      /https/,
    ],
    [
      "corroboration sur un hôte interdit",
      { ...pressConviction, corroborationUrl: "https://medium.com/a" },
      /medium\.com/,
    ],
    ["PROCES avec issue", { outcome: "CONDAMNATION" }, /issue/i],
    ["dateEnd sur PROCES", { dateEnd: d("2024-06-01") }, /fin/i],
    ["dateEnd antérieure sur FAITS", { type: "FAITS", dateEnd: d("2024-01-01") }, /fin/i],
    ["REVELATION en OFFICIAL", { type: "REVELATION" }, /presse/i],
    [
      "SCHEDULED en YEAR",
      { occurrence: "SCHEDULED", date: d("2027-01-01"), datePrecision: "YEAR" },
      /année/i,
    ],
    ["date incohérente", { date: d("2024-05-13"), datePrecision: "MONTH" }, /précision/i],
    ["type ancien CONDAMNATION", { type: "CONDAMNATION" }, /ancien/i],
  ])("refuse : %s (un seul message)", (_label, patch, pattern) => {
    const errors = checkEventPublishable({ ...valid, ...patch });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(pattern);
  });

  it("cumule un message par règle violée", () => {
    const errors = checkEventPublishable({
      ...valid,
      sourceUrl: "http://x.com/a",
      sourceKind: null,
      title: "",
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("aucun message ne contient de tiret long", () => {
    const errors = checkEventPublishable({
      ...valid,
      type: "ARRET_CASSATION",
      outcome: "CONDAMNATION",
      sourceUrl: "http://x.com/a",
      sourceKind: null,
      title: "—",
      dateEnd: d("2020-01-01"),
    });
    for (const e of errors) expect(e).not.toMatch(/[–—]/);
  });
});

describe("checkEventShape", () => {
  it("ne regarde pas la source ni le titre", () => {
    expect(checkEventShape({ ...valid, sourceUrl: null, sourceKind: null, title: "" })).toEqual([]);
  });
  it("tolère une décision tenue sans issue (brouillon en cours)", () => {
    expect(checkEventShape({ ...valid, type: "JUGEMENT" })).toEqual([]);
  });
  it("refuse une issue hors décision", () => {
    expect(checkEventShape({ ...valid, outcome: "RELAXE" })).toHaveLength(1);
  });
});
