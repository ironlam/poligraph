import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVICTION_ROWS } from "@/lib/affairs/__tests__/fixtures/conviction-rows";

const mocks = vi.hoisted(() => ({ partyFindMany: vi.fn() }));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { party: { findMany: mocks.partyFindMany } } }));

import { getParties } from "@/lib/data/partis";
import { summarizePartyCounts } from "@/lib/affairs/party-counts";
import { summarizePartyAffairs } from "@/app/partis/[slug]/_lib/affair-summary";

const ROWS = Object.values(CONVICTION_ROWS);

const EXPECTED = {
  condamnationsDefinitives: 3,
  condamnationsNonDefinitives: 3,
  enCours: 1,
  closesSansCondamnation: 1,
};

const ZERO = {
  condamnationsDefinitives: 0,
  condamnationsNonDefinitives: 0,
  enCours: 0,
  closesSansCondamnation: 0,
};

describe("summarizePartyCounts", () => {
  it("sépare condamnations définitives et non définitives sur les lignes de référence", () => {
    expect(summarizePartyCounts(ROWS)).toEqual(EXPECTED);
  });

  it("ne compte une condamnation non pénale (Cour des comptes) nulle part", () => {
    expect(summarizePartyCounts([CONVICTION_ROWS.nonPenalDefinitive])).toEqual(ZERO);
  });

  it("ne compte une enquête préliminaire dans aucune procédure en cours", () => {
    expect(summarizePartyCounts([CONVICTION_ROWS.preliminaryInquiry])).toEqual(ZERO);
  });

  it("compte un appel ou un pourvoi parmi les non définitives, jamais parmi les définitives", () => {
    expect(
      summarizePartyCounts([CONVICTION_ROWS.appealCorruption, CONVICTION_ROWS.cassationCorruption])
    ).toEqual({ ...ZERO, condamnationsNonDefinitives: 2 });
  });

  it("ne compte un témoin (INDIRECT) dans aucun compteur", () => {
    expect(
      summarizePartyCounts([
        { ...CONVICTION_ROWS.definitiveCorruptionGrave, involvement: "INDIRECT" },
        { ...CONVICTION_ROWS.relaxe, involvement: "INDIRECT" },
      ])
    ).toEqual(ZERO);
  });

  it("ne compte une relaxe non pénale parmi les closes", () => {
    expect(
      summarizePartyCounts([{ ...CONVICTION_ROWS.relaxe, jurisdictionOrder: "FINANCIER" }])
    ).toEqual(ZERO);
  });
});

describe("compteurs de la liste /partis", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lit l'implication et l'ordre de juridiction, et donne les quatre compteurs", async () => {
    mocks.partyFindMany.mockResolvedValue([
      {
        id: "party-a",
        slug: "parti-a",
        predecessor: null,
        _count: { politicians: 1, partyMemberships: 1 },
        affairsAtTime: ROWS.map((row, i) => ({ id: `affair-${i}`, ...row })),
      },
    ]);

    const [party] = await getParties();

    expect(mocks.partyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          affairsAtTime: expect.objectContaining({
            select: expect.objectContaining({
              status: true,
              involvement: true,
              jurisdictionOrder: true,
            }),
          }),
        }),
      })
    );
    expect(party?.affairCounts).toEqual({ ...EXPECTED, total: ROWS.length });
  });

  it("donne les mêmes quatre nombres que la carte de détail du parti", async () => {
    mocks.partyFindMany.mockResolvedValue([
      {
        id: "party-a",
        slug: "parti-a",
        predecessor: null,
        _count: { politicians: 1, partyMemberships: 1 },
        affairsAtTime: ROWS.map((row, i) => ({ id: `affair-${i}`, ...row })),
      },
    ]);

    const [party] = await getParties();
    const detail = summarizePartyAffairs(ROWS);

    expect({
      condamnationsDefinitives: detail.condamnationsDefinitives,
      condamnationsNonDefinitives: detail.condamnationsNonDefinitives,
      enCours: detail.enCours,
      closesSansCondamnation: detail.closesSansCondamnation,
    }).toEqual({
      condamnationsDefinitives: party?.affairCounts.condamnationsDefinitives,
      condamnationsNonDefinitives: party?.affairCounts.condamnationsNonDefinitives,
      enCours: party?.affairCounts.enCours,
      closesSansCondamnation: party?.affairCounts.closesSansCondamnation,
    });
  });
});
