import { describe, expect, it } from "vitest";
import type { CommuneDossier } from "@/lib/data/territoires";
import {
  communeScrutins,
  decidingTour,
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
