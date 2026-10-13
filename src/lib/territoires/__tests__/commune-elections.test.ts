import { describe, expect, it } from "vitest";
import type { CommuneDossier } from "@/lib/data/territoires";
import {
  communeScrutins,
  decidingTour,
  historicalMunicipales,
  latestScrutinPerType,
} from "@/lib/territoires/commune-elections";

type Elections = CommuneDossier["elections"];

const NO_PRESIDENTIELLE: Elections["presidentielles"] = { blocks: [], agregatTerritoire: null };

function pres(
  slug: string,
  date: string,
  withRows = true
): Elections["presidentielles"]["blocks"][number] {
  return {
    electionSlug: slug,
    title: slug,
    round1Date: date,
    tours: withRows
      ? [
          {
            round: 1,
            date,
            registeredVoters: 100,
            actualVoters: 80,
            participationRate: 80,
            blankVotes: 1,
            nullVotes: 1,
            validVotes: 78,
            candidats: [{ name: "A", votes: 40, pct: 51.3 }],
          },
        ]
      : [],
    sources: [],
    importedAt: null,
  };
}

describe("communeScrutins", () => {
  it("ne produit aucune ligne sans résultat, jamais une ligne vide", () => {
    expect(
      communeScrutins({ municipales2026: null, presidentielles: NO_PRESIDENTIELLE }, "35238")
    ).toEqual([]);
    expect(
      communeScrutins(
        {
          municipales2026: null,
          presidentielles: {
            blocks: [pres("presidentielle-2022", "2022-04-10", false)],
            agregatTerritoire: null,
          },
        },
        "35238"
      )
    ).toEqual([]);
  });

  it("classe du plus récent au plus ancien et garde une ligne par type", () => {
    const scrutins = communeScrutins(
      {
        municipales2026: null,
        presidentielles: {
          blocks: [
            pres("presidentielle-2017", "2017-04-23"),
            pres("presidentielle-2022", "2022-04-10"),
          ],
          agregatTerritoire: null,
        },
      },
      "35238"
    );
    expect(scrutins.map((s) => s.slug)).toEqual(["presidentielle-2022", "presidentielle-2017"]);
    expect(latestScrutinPerType(scrutins).map((s) => s.slug)).toEqual(["presidentielle-2022"]);
    expect(decidingTour(scrutins[0] as (typeof scrutins)[number]).rows[0]?.pct).toBe(51.3);
  });
});

describe("historicalMunicipales", () => {
  const base = {
    inseeCode: "35238",
    slug: "municipales-2020",
    year: 2020,
    round1Date: "2020-03-15T00:00:00.000Z",
    round2Date: "2020-06-28T00:00:00.000Z",
    sources: { 1: "https://example.test/t1", 2: "https://example.test/t2" },
  };

  it("garde le statut d'élu sur le tour qui décide, et rien sur le premier", () => {
    const s = historicalMunicipales({
      ...base,
      entries: [
        {
          label: "Liste A",
          isNamedList: true,
          candidateName: "A",
          round1Pct: 30,
          round2Pct: 55,
          isElected: true,
        },
        {
          label: "Liste B",
          isNamedList: true,
          candidateName: "B",
          round1Pct: 35,
          round2Pct: 45,
          isElected: false,
        },
      ],
    });
    expect(s?.tours.map((t) => t.round)).toEqual([1, 2]);
    expect(s?.tours[0]?.rows.every((r) => r.status === null)).toBe(true);
    expect(s?.tours[1]?.rows[0]).toMatchObject({ label: "Liste A", status: "élue" });
    expect(s?.resultsHref).toBe("/elections/municipales-2020/communes/35238");
  });

  it("garde la mention d'élu au 1er tour sur un scrutin mixte", () => {
    const s = historicalMunicipales({
      ...base,
      entries: [
        {
          label: "Élu dès le 1er tour",
          isNamedList: false,
          candidateName: "A",
          round1Pct: 62,
          round2Pct: null,
          isElected: true,
        },
        {
          label: "Élu au 2d tour",
          isNamedList: false,
          candidateName: "B",
          round1Pct: 30,
          round2Pct: 51,
          isElected: true,
        },
      ],
    });
    const t1 = s?.tours.find((t) => t.round === 1)?.rows ?? [];
    const t2 = s?.tours.find((t) => t.round === 2)?.rows ?? [];
    expect(t1.find((r) => r.label === "Élu dès le 1er tour")?.status).toBe("élu");
    expect(t1.find((r) => r.label === "Élu au 2d tour")?.status).toBeNull();
    expect(t2[0]).toMatchObject({ label: "Élu au 2d tour", status: "élu" });
  });

  it("relie chaque tour à son fichier source", () => {
    const s = historicalMunicipales({
      ...base,
      entries: [
        {
          label: "X",
          isNamedList: true,
          candidateName: "X",
          round1Pct: 40,
          round2Pct: 60,
          isElected: true,
        },
      ],
    });
    expect(s?.tours.map((t) => t.source?.url)).toEqual([
      "https://example.test/t1",
      "https://example.test/t2",
    ]);
  });

  it("présente les candidats d'un scrutin plurinominal sans les appeler listes", () => {
    const s = historicalMunicipales({
      ...base,
      entries: [
        {
          label: "Odile DECELLE",
          isNamedList: false,
          candidateName: "Odile DECELLE",
          round1Pct: 60,
          round2Pct: null,
          isElected: true,
        },
      ],
    });
    expect(s?.rowsNoun).toBe("candidats");
    expect(s?.tours[0]?.rows[0]).toMatchObject({ detail: null, status: "élu" });
  });

  it("ne produit rien sans part exprimée, et n'invente aucune participation", () => {
    expect(
      historicalMunicipales({
        ...base,
        entries: [
          {
            label: "X",
            isNamedList: true,
            candidateName: "X",
            round1Pct: null,
            round2Pct: null,
            isElected: false,
          },
        ],
      })
    ).toBeNull();
    const s = historicalMunicipales({
      ...base,
      entries: [
        {
          label: "X",
          isNamedList: true,
          candidateName: "X",
          round1Pct: 10,
          round2Pct: null,
          isElected: false,
        },
      ],
    });
    expect(s?.tours[0]?.participationRate).toBeNull();
  });

  it("classe 2026, 2022, 2020 et 2014 du plus récent au plus ancien", () => {
    const h14 = historicalMunicipales({
      ...base,
      slug: "municipales-2014",
      year: 2014,
      round1Date: "2014-03-23T00:00:00.000Z",
      round2Date: null,
      entries: [
        {
          label: "X",
          isNamedList: true,
          candidateName: "X",
          round1Pct: 10,
          round2Pct: null,
          isElected: false,
        },
      ],
    });
    const h20 = historicalMunicipales({
      ...base,
      entries: [
        {
          label: "X",
          isNamedList: true,
          candidateName: "X",
          round1Pct: 10,
          round2Pct: null,
          isElected: false,
        },
      ],
    });
    const all = communeScrutins(
      {
        municipales2026: null,
        presidentielles: {
          blocks: [pres("presidentielle-2022", "2022-04-10")],
          agregatTerritoire: null,
        },
      },
      "35238",
      [h14, h20].filter((x): x is NonNullable<typeof x> => x !== null)
    );
    expect(all.map((s) => s.slug)).toEqual([
      "presidentielle-2022",
      "municipales-2020",
      "municipales-2014",
    ]);
  });
});

describe("municipales 2026", () => {
  const liste = (name: string, p1: number, p2: number | null) => ({
    listName: name,
    teteDeListe: { name: `Tête ${name}`, person: null },
    round1Votes: 100,
    round1Pct: p1,
    round2Votes: null,
    round2Pct: p2,
    elueAuPremierTour: false,
    electionAuPremierTour: "NON_ELUE" as const,
    elueAuSecondTour: p2 != null && p2 > 50,
  });

  it("ne relie pas le 2d tour au fichier du 1er tour", () => {
    const [s] = communeScrutins(
      {
        municipales2026: {
          state: "DISPONIBLE",
          electionSlug: "municipales-2026",
          round1Date: "2026-03-15T00:00:00.000Z",
          round2Date: "2026-03-22T00:00:00.000Z",
          listes: [liste("A", 40, 55), liste("B", 35, 45)],
          participation: [],
          source: { label: "Ministère", url: "https://example.test/premier-tour" },
        },
        presidentielles: NO_PRESIDENTIELLE,
      },
      "35238"
    );
    expect(s?.tours.map((t) => t.source?.url ?? null)).toEqual([
      "https://example.test/premier-tour",
      null,
    ]);
  });
});
