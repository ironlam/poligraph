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

describe("checkEventPublishable : étape tenue datée dans le futur (H1)", () => {
  const TODAY = new Date("2026-10-08T10:00:00Z");
  const FUTURE_MESSAGE =
    "Une étape tenue ne peut pas être datée dans le futur : la marquer comme annoncée.";

  it("refuse un jour futur", () => {
    expect(checkEventPublishable({ ...valid, date: d("2026-12-01") }, TODAY)).toContain(
      FUTURE_MESSAGE
    );
  });

  it("refuse le mois prochain", () => {
    expect(
      checkEventPublishable({ ...valid, date: d("2026-11-01"), datePrecision: "MONTH" }, TODAY)
    ).toContain(FUTURE_MESSAGE);
  });

  it("refuse l'année prochaine", () => {
    expect(
      checkEventPublishable({ ...valid, date: d("2027-01-01"), datePrecision: "YEAR" }, TODAY)
    ).toContain(FUTURE_MESSAGE);
  });

  it("accepte le mois et l'année en cours", () => {
    expect(
      checkEventPublishable({ ...valid, date: d("2026-10-01"), datePrecision: "MONTH" }, TODAY)
    ).toEqual([]);
    expect(
      checkEventPublishable({ ...valid, date: d("2026-01-01"), datePrecision: "YEAR" }, TODAY)
    ).toEqual([]);
  });

  it("compte le jour à Paris : le 9 octobre est atteint à 00:30 heure de Paris", () => {
    expect(
      checkEventPublishable({ ...valid, date: d("2026-10-09") }, new Date("2026-10-08T22:30:00Z"))
    ).toEqual([]);
    expect(
      checkEventPublishable({ ...valid, date: d("2026-10-09") }, new Date("2026-10-08T21:30:00Z"))
    ).toContain(FUTURE_MESSAGE);
  });

  it("accepte une étape annoncée dans le futur", () => {
    expect(
      checkEventPublishable({ ...valid, occurrence: "SCHEDULED", date: d("2026-12-01") }, TODAY)
    ).toEqual([]);
  });
});

describe("checkEventPublishable : seconde source du même média (L4)", () => {
  it.each([
    ["https://www.lemonde.fr/a", "https://abonnes.lemonde.fr/b"],
    ["https://amp.liberation.fr/a", "https://www.liberation.fr/b"],
    ["https://www.bbc.co.uk/a", "https://news.bbc.co.uk/b"],
  ])("refuse %s puis %s", (sourceUrl, corroborationUrl) => {
    expect(checkEventPublishable({ ...pressConviction, sourceUrl, corroborationUrl })).toContain(
      "La seconde source doit venir d'un autre média que la première."
    );
  });

  it.each([
    ["https://www.bbc.co.uk/a", "https://www.theguardian.com/b"],
    ["https://www.bbc.co.uk/a", "https://www.legifrance.gouv.fr/b"],
  ])("accepte %s puis %s (suffixe public à deux niveaux)", (sourceUrl, corroborationUrl) => {
    expect(checkEventPublishable({ ...pressConviction, sourceUrl, corroborationUrl })).toEqual([]);
  });
});

describe("checkEventPublishable : hôtes interdits ajoutés (L5)", () => {
  it.each([
    "linkedin.com",
    "bsky.app",
    "threads.net",
    "youtu.be",
    "t.co",
    "reddit.com",
    "t.me",
    "wikiwand.com",
  ])("refuse une source sur %s", (host) => {
    const errors = checkEventPublishable({ ...valid, sourceUrl: `https://www.${host}/x` });
    expect(errors.some((e) => e.includes(host))).toBe(true);
  });
});

describe("checkEventPublishable : tirets longs hors du titre (L6)", () => {
  it.each(["court", "description", "sourceTitle"] as const)("refuse un tiret long dans %s", (f) => {
    const errors = checkEventPublishable({ ...valid, [f]: "Tribunal — Paris" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/tiret long/);
  });
});

describe("checkEventPublishable : listes blanches de sources", () => {
  const held = {
    type: "MISE_EN_EXAMEN" as const,
    occurrence: "HELD" as const,
    date: new Date("2024-05-13T00:00:00Z"),
    datePrecision: "DAY" as const,
    title: "Mise en examen",
  };

  it("refuse un article de presse déclaré comme source officielle", () => {
    expect(
      checkEventPublishable({
        ...held,
        sourceUrl: "https://www.lemonde.fr/a",
        sourceKind: "OFFICIAL",
      })
    ).toContain(
      "Cette adresse n'est pas celle d'une juridiction, d'une administration ou d'une assemblée : choisir « Presse »."
    );
  });

  it.each([
    "https://www.legifrance.gouv.fr/juri/id/X",
    "https://www.cours-appel.justice.fr/paris/a",
  ])("accepte %s comme source officielle", (sourceUrl) => {
    expect(checkEventPublishable({ ...held, sourceUrl, sourceKind: "OFFICIAL" })).toEqual([]);
  });

  it.each([
    "https://www.aol.com/news/a",
    "https://fr.news.yahoo.com/a",
    "https://monblog.example.fr/a",
    "https://france3-regions.blog.francetvinfo.fr/a",
  ])("refuse %s comme presse", (sourceUrl) => {
    expect(checkEventPublishable({ ...held, sourceUrl, sourceKind: "PRESS" })).toContain(
      "Ce média ne figure pas encore dans la liste des sources de presse admises : si c'est une rédaction professionnelle, l'ajouter (src/lib/affairs/events/sources.ts)."
    );
  });

  it.each([
    "https://www.franceinfo.fr/a",
    "https://france3-regions.franceinfo.fr/a",
    "https://la1ere.franceinfo.fr/a",
    "https://www.sudouest.fr/a",
  ])("accepte %s comme presse", (sourceUrl) => {
    expect(checkEventPublishable({ ...held, sourceUrl, sourceKind: "PRESS" })).toEqual([]);
  });

  it("refuse une seconde source hors liste", () => {
    expect(
      checkEventPublishable({
        type: "JUGEMENT",
        occurrence: "HELD",
        outcome: "CONDAMNATION",
        date: new Date("2024-05-13T00:00:00Z"),
        datePrecision: "DAY",
        title: "Jugement",
        sourceUrl: "https://www.lemonde.fr/a",
        sourceKind: "PRESS",
        corroborationUrl: "https://www.aol.com/b",
      })
    ).toContain("La seconde source ne figure pas dans la liste des sources admises.");
  });
});

describe("listes de sources", () => {
  it("ne contiennent ni doublon ni domaine présent dans les deux listes", async () => {
    const { PRESS_SOURCE_HOSTS, OFFICIAL_SOURCE_HOSTS } = await import("../sources");
    expect(new Set(PRESS_SOURCE_HOSTS).size).toBe(PRESS_SOURCE_HOSTS.length);
    expect(new Set(OFFICIAL_SOURCE_HOSTS).size).toBe(OFFICIAL_SOURCE_HOSTS.length);
    expect(PRESS_SOURCE_HOSTS.filter((h) => OFFICIAL_SOURCE_HOSTS.includes(h))).toEqual([]);
  });
});
