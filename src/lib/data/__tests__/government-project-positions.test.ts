import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  scrutin: { findMany: vi.fn() },
  legislativeDossier: { findMany: vi.fn() },
  anOrgan: { findMany: vi.fn() },
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getGovernmentProjectPositionDataset } from "../government-project-positions";
import { parseAnOrgan } from "@/lib/parlement/an-organes";
import organesFixture from "@/config/__tests__/fixtures/an17-organes.json";

function scrutin(overrides: Record<string, unknown> = {}) {
  return {
    externalId: "VTANR5L17V518",
    officialDossierRef: "DLR5L17N1",
    slug: "2025-01-01-projet-test",
    title: "l'ensemble du projet de loi test.",
    votingDate: new Date("2025-01-01T12:00:00Z"),
    sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/scrutins/518",
    codeTypeVote: "SPO",
    libelleTypeVote: "scrutin public ordinaire",
    votesFor: 6,
    votesAgainst: 2,
    votesAbstain: 4,
    officialGroupsIssues: [],
    officialGroupsHash: "official-snapshot",
    officialGroupsSourceFetchedAt: new Date("2026-10-01T00:00:00Z"),
    officialGroupCounts: [
      {
        organeRef: "PO845401",
        memberCount: 12,
        forCount: 6,
        againstCount: 2,
        abstainCount: 4,
        nonVoterCount: 0,
        majorityPosition: "POUR",
        issues: [],
      },
    ],
    dossierLegislatif: null,
    ...overrides,
  };
}

const dossier = {
  externalId: "DLR5L17N1",
  slug: "projet-test",
  title: "Projet de loi test",
  sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/dossiers/projet-test",
  origin: "GOUVERNEMENTALE",
  timeline: null,
};

describe("lecture des positions sur les projets gouvernementaux", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.legislativeDossier.findMany.mockResolvedValue([dossier]);
    dbMock.anOrgan.findMany.mockResolvedValue([
      {
        organeRef: "PO845401",
        label: "Rassemblement National",
        abbreviation: "RN",
        startDate: new Date("2024-07-18T00:00:00Z"),
        endDate: null,
      },
    ]);
  });

  it("utilise la référence officielle du dossier et ne filtre pas le type SPO", async () => {
    dbMock.scrutin.findMany.mockResolvedValue([scrutin()]);

    const dataset = await getGovernmentProjectPositionDataset(17);

    expect(dataset.groups.RN?.summary).toMatchObject({
      candidateCount: 1,
      eligibleScrutinCount: 1,
      consideredCount: 1,
      counts: { POUR: 1, ABSTENTION: 0, CONTRE: 0 },
    });
    expect(dataset.groups.RN?.rows[0]).toMatchObject({ position: "POUR", exclusion: null });
  });

  it("refuse un rattachement heuristique mais accepte un voteRef exact", async () => {
    dbMock.legislativeDossier.findMany.mockResolvedValue([]);
    dbMock.scrutin.findMany.mockResolvedValue([
      scrutin({
        officialDossierRef: null,
        dossierLegislatif: { ...dossier, timeline: [] },
      }),
      scrutin({
        externalId: "VTANR5L17V3055",
        officialDossierRef: null,
        dossierLegislatif: {
          ...dossier,
          timeline: [{ voteRefs: ["VTANR5L17V3055"] }],
        },
      }),
    ]);

    const dataset = await getGovernmentProjectPositionDataset(17);

    expect(dataset.groups.RN?.rows).toEqual([
      expect.objectContaining({
        position: null,
        exclusion: "DOSSIER_LINK_REQUIRES_REVIEW",
      }),
      expect.objectContaining({ position: "POUR", exclusion: null }),
    ]);
    expect(dataset.groups.RN?.summary.consideredCount).toBe(1);
    expect(dataset.groups.RN?.summary).toMatchObject({
      eligibleScrutinCount: 1,
      groupExcludedCount: 0,
      scopeExcludedCount: 1,
    });
  });

  it("compte séparément une exclusion de données dans le périmètre", async () => {
    dbMock.scrutin.findMany.mockResolvedValue([
      scrutin({
        officialGroupCounts: [
          {
            organeRef: "PO845401",
            forCount: 4,
            againstCount: 4,
            abstainCount: 0,
            majorityPosition: null,
            issues: [],
          },
        ],
        votesFor: 4,
        votesAgainst: 4,
        votesAbstain: 0,
      }),
    ]);

    const dataset = await getGovernmentProjectPositionDataset(17);

    expect(dataset.groups.RN?.summary).toMatchObject({
      eligibleScrutinCount: 1,
      consideredCount: 0,
      groupExcludedCount: 1,
      scopeExcludedCount: 0,
    });
  });

  it("ne retombe pas sur un lien heuristique quand une référence officielle est inconnue", async () => {
    dbMock.legislativeDossier.findMany.mockResolvedValue([]);
    dbMock.scrutin.findMany.mockResolvedValue([
      scrutin({
        officialDossierRef: "DLR5L17NABSENT",
        dossierLegislatif: dossier,
      }),
    ]);

    const dataset = await getGovernmentProjectPositionDataset(17);

    expect(dataset.groups.RN?.rows[0]).toMatchObject({
      position: null,
      exclusion: "DOSSIER_UNRESOLVED",
    });
  });

  it("ne calcule aucune position collective pour les non-inscrits", async () => {
    dbMock.scrutin.findMany.mockResolvedValue([scrutin()]);

    const dataset = await getGovernmentProjectPositionDataset(17);

    expect(dataset.groups).not.toHaveProperty("NI");
    expect(dataset.groups.RN?.summary.consideredCount).toBe(1);
  });

  it.each([
    ["référentiel absent", []],
    [
      "organe inconnu",
      [{ organeRef: "POINCONNU", label: "Autre", startDate: null, endDate: null }],
    ],
    [
      "scrutin hors période",
      [{ organeRef: "PO845401", label: "RN", startDate: new Date("2025-02-01"), endDate: null }],
    ],
  ])("masque l'indicateur si le décompte ne peut pas être validé : %s", async (_name, organes) => {
    dbMock.scrutin.findMany.mockResolvedValue([scrutin()]);
    dbMock.anOrgan.findMany.mockResolvedValue(organes);

    const dataset = await getGovernmentProjectPositionDataset(17);

    expect(dataset.groups.RN?.rows[0]).toMatchObject({
      position: null,
      exclusion: "OFFICIAL_GROUP_COUNTS_WITHHELD",
    });
    expect(dataset.groups.RN?.summary.consideredCount).toBe(0);
  });

  it("refuse une ancienne ligne sans marqueur d'import du décompte officiel", async () => {
    dbMock.scrutin.findMany.mockResolvedValue([scrutin({ officialGroupsHash: null })]);

    const dataset = await getGovernmentProjectPositionDataset(17);

    expect(dataset.groups.RN?.rows[0]?.exclusion).toBe("OFFICIAL_GROUP_COUNTS_WITHHELD");
  });

  it("refuse aussi un diagnostic dans un autre groupe du scrutin", async () => {
    const original = scrutin();
    dbMock.scrutin.findMany.mockResolvedValue([
      scrutin({
        officialGroupCounts: [
          ...original.officialGroupCounts,
          {
            ...original.officialGroupCounts[0],
            organeRef: "PO845419",
            forCount: 0,
            againstCount: 0,
            abstainCount: 0,
            issues: ["memberCount:invalid"],
          },
        ],
      }),
    ]);

    const dataset = await getGovernmentProjectPositionDataset(17);

    expect(dataset.groups.RN?.rows[0]?.exclusion).toBe("OFFICIAL_GROUP_COUNTS_WITHHELD");
  });

  it.each([
    ["2025-09-04", "PO847173", true],
    ["2025-09-05", "PO872880", true],
    ["2025-09-04", "PO872880", false],
    ["2025-09-05", "PO847173", false],
  ])("vérifie l'identité UDR %s/%s dans les périodes AnOrgan", async (day, organeRef, valid) => {
    dbMock.anOrgan.findMany.mockResolvedValue(
      organesFixture.organes.map((raw) => {
        const result = parseAnOrgan(raw, [17]);
        if (!("row" in result)) throw new Error(result.skipped);
        return result.row;
      })
    );
    const original = scrutin();
    dbMock.scrutin.findMany.mockResolvedValue([
      scrutin({
        votingDate: new Date(`${day}T12:00:00Z`),
        officialGroupCounts: [{ ...original.officialGroupCounts[0], organeRef }],
      }),
    ]);

    const dataset = await getGovernmentProjectPositionDataset(17);

    expect(dataset.groups.UDR?.rows[0]).toMatchObject(
      valid
        ? { position: "POUR", exclusion: null }
        : { position: null, exclusion: "OFFICIAL_GROUP_COUNTS_WITHHELD" }
    );
  });
});
