import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  baseContext: vi.fn(),
  electionFindUnique: vi.fn(),
  cacheTag: vi.fn(),
  politicianFindFirst: vi.fn(),
  mentionFindMany: vi.fn(),
  candidacyFindFirst: vi.fn(),
  voteFindMany: vi.fn(),
  scrutinGroupBy: vi.fn(),
  dossierFindMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: mocks.cacheTag }));
vi.mock("@/lib/db", () => ({
  db: {
    politician: { findFirst: mocks.politicianFindFirst },
    factCheckMention: { findMany: mocks.mentionFindMany },
    candidacy: { findFirst: mocks.candidacyFindFirst },
    vote: { findMany: mocks.voteFindMany },
    scrutin: { groupBy: mocks.scrutinGroupBy },
    legislativeDossier: { findMany: mocks.dossierFindMany },
    election: { findUnique: mocks.electionFindUnique },
    $queryRaw: mocks.queryRaw,
  },
}));
vi.mock("../factchecks", () => ({ getPoliticianFactcheckContext: mocks.baseContext }));

import {
  EMPTY_FACTCHECK_CONTEXT,
  factCheckContextInput,
  getFactCheckContext,
  groupClaimDayScrutins,
  queryFactCheckContext,
  summarizeParticipation,
  summarizeSources,
  summarizeVerdicts,
} from "../factcheck-context";

const BASE = {
  fullName: "Mathilde Panot",
  slug: "mathilde-panot",
  photoUrl: null,
  blobPhotoUrl: "https://blob/panot",
  party: "LFI",
  factcheckCount: 11,
};

const PARTY = {
  id: "party-lfi",
  slug: "la-france-insoumise",
  name: "La France insoumise",
  shortName: "LFI",
  color: "#CC2443",
};

function politicianRow(party: typeof PARTY | null) {
  return {
    id: "pol-1",
    civility: "Mme",
    currentParty: party,
    mandates: [
      {
        type: "DEPUTE",
        title: "Députée de la 10ème circonscription",
        constituency: "Val-de-Marne (10)",
        startDate: new Date("2024-07-07"),
        parliamentaryData: { parliamentaryGroup: { code: "LFI-NFP", name: "La France insoumise" } },
      },
    ],
  };
}

function fc(slug: string, verdictRating: string, source: string, day: string) {
  return {
    factCheck: { slug, title: `Titre ${slug}`, verdictRating, source, publishedAt: new Date(day) },
  };
}

const INPUT = { factCheckSlug: "fc-current", authorSlug: "mathilde-panot", claimDay: "2026-10-09" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.baseContext.mockResolvedValue(BASE);
  mocks.electionFindUnique.mockResolvedValue({ id: "election-2027" });
  mocks.politicianFindFirst.mockResolvedValue(politicianRow(PARTY));
  mocks.mentionFindMany.mockResolvedValue([
    fc("fc-current", "UNVERIFIABLE", "Franceinfo", "2026-10-16"),
    fc("fc-2", "TRUE", "TF1 Info", "2026-10-12"),
    fc("fc-3", "HALF_TRUE", "TF1 Info", "2026-09-10"),
    fc("fc-4", "FALSE", "TF1 Info", "2026-03-06"),
    fc("fc-5", "MOSTLY_FALSE", "TF1 Info", "2025-05-26"),
    fc("fc-6", "TRUE", "TF1 Info", "2023-08-23"),
    fc("fc-7", "MOSTLY_TRUE", "20 Minutes", "2021-10-14"),
  ]);
  mocks.candidacyFindFirst.mockResolvedValue(null);
  mocks.voteFindMany.mockResolvedValue([
    {
      position: "POUR",
      scrutin: {
        slug: "amdt",
        title: "Amendement n° 1091",
        result: "REJECTED",
        type: "AMENDEMENT",
        sequence: 1,
      },
    },
    {
      position: "POUR",
      scrutin: {
        slug: "art-54",
        title: "Article 54",
        result: "ADOPTED",
        type: "ARTICLE",
        sequence: 5,
      },
    },
    {
      position: "CONTRE",
      scrutin: {
        slug: "art-55",
        title: "Article 55",
        result: "ADOPTED",
        type: "ARTICLE",
        sequence: 6,
      },
    },
    {
      position: "ABSTENTION",
      scrutin: {
        slug: "amdt-2",
        title: "Amendement n° 12",
        result: "REJECTED",
        type: "AMENDEMENT",
        sequence: 2,
      },
    },
  ]);
  mocks.scrutinGroupBy.mockResolvedValue([
    { chamber: "AN", dossierLegislatifId: "d1", _count: { _all: 47 } },
    { chamber: "AN", dossierLegislatifId: "d2", _count: { _all: 4 } },
  ]);
  mocks.dossierFindMany.mockResolvedValue([
    {
      id: "d1",
      slug: "violences-sexuelles",
      title: "Long titre 1",
      shortTitle: "Réponse intégrale aux violences sexuelles",
    },
    {
      id: "d2",
      slug: "autorite-judiciaire",
      title: "Adapter l'autorité judiciaire",
      shortTitle: null,
    },
  ]);
  mocks.queryRaw.mockResolvedValue([{ factchecks: BigInt(94), people: BigInt(30) }]);
});

describe("summarizeVerdicts", () => {
  it("range chaque verdict dans son groupe", () => {
    expect(
      summarizeVerdicts([
        "TRUE",
        "MOSTLY_TRUE",
        "HALF_TRUE",
        "MISLEADING",
        "OUT_OF_CONTEXT",
        "FALSE",
        "MOSTLY_FALSE",
        "UNVERIFIABLE",
      ])
    ).toEqual({ vrai: 2, trompeur: 3, faux: 2, inverifiable: 1 });
  });

  it("rend des zéros pour une liste vide", () => {
    expect(summarizeVerdicts([])).toEqual({ vrai: 0, trompeur: 0, faux: 0, inverifiable: 0 });
  });
});

describe("summarizeSources", () => {
  it("trie par effectif puis par nom", () => {
    expect(
      summarizeSources([
        "Franceinfo",
        "TF1 Info",
        "AFP Factuel",
        "TF1 Info",
        "Franceinfo",
        "TF1 Info",
      ])
    ).toEqual([
      { name: "TF1 Info", count: 3 },
      { name: "Franceinfo", count: 2 },
      { name: "AFP Factuel", count: 1 },
    ]);
  });
});

describe("summarizeParticipation", () => {
  it("ne compte ni ABSENT ni NON_VOTANT", () => {
    expect(
      summarizeParticipation(["POUR", "ABSENT", "CONTRE", "NON_VOTANT", "ABSTENTION", "POUR"])
    ).toEqual({
      POUR: 2,
      CONTRE: 1,
      ABSTENTION: 1,
      total: 4,
    });
  });
});

describe("groupClaimDayScrutins", () => {
  it("garde trois textes au plus et compte le reste, scrutins sans dossier compris", () => {
    const chambers = groupClaimDayScrutins([
      { chamber: "SENAT", dossierSlug: "s1", dossierTitle: "Texte du Sénat", count: 2 },
      { chamber: "AN", dossierSlug: "a", dossierTitle: "B texte", count: 10 },
      { chamber: "AN", dossierSlug: "b", dossierTitle: "A texte", count: 10 },
      { chamber: "AN", dossierSlug: "c", dossierTitle: "C texte", count: 5 },
      { chamber: "AN", dossierSlug: "d", dossierTitle: "D texte", count: 3 },
      { chamber: "AN", dossierSlug: null, dossierTitle: null, count: 7 },
    ]);
    expect(chambers.map((c) => c.chamber)).toEqual(["AN", "SENAT"]);
    expect(chambers[0]!.scrutinCount).toBe(35);
    expect(chambers[0]!.dossiers.map((d) => d.title)).toEqual(["A texte", "B texte", "C texte"]);
    expect(chambers[0]!.otherCount).toBe(10);
    expect(chambers[1]).toEqual({
      chamber: "SENAT",
      scrutinCount: 2,
      dossiers: [{ slug: "s1", title: "Texte du Sénat", scrutinCount: 2 }],
      otherCount: 0,
    });
  });
});

describe("queryFactCheckContext", () => {
  it("rend un contexte vide sans auteur rattaché, sans lire la base", async () => {
    const ctx = await queryFactCheckContext({ ...INPUT, authorSlug: null });
    expect(ctx).toEqual(EMPTY_FACTCHECK_CONTEXT);
    expect(mocks.baseContext).not.toHaveBeenCalled();
  });

  it("rend un contexte vide pour un auteur inconnu ou non publié", async () => {
    mocks.baseContext.mockResolvedValue(null);
    const ctx = await queryFactCheckContext(INPUT);
    expect(ctx).toEqual(EMPTY_FACTCHECK_CONTEXT);
    expect(mocks.politicianFindFirst).not.toHaveBeenCalled();
  });

  it("assemble identité, bilan, jour de la déclaration et parti", async () => {
    const ctx = await queryFactCheckContext(INPUT);

    expect(ctx.author).toMatchObject({
      slug: "mathilde-panot",
      fullName: "Mathilde Panot",
      mandateTitle: "Députée de la 10ème circonscription",
      constituency: "Val-de-Marne (10)",
      group: { code: "LFI-NFP", name: "La France insoumise" },
      party: { slug: "la-france-insoumise", shortName: "LFI" },
    });

    expect(ctx.record?.total).toBe(7);
    expect(ctx.record?.breakdown).toEqual({ vrai: 3, trompeur: 1, faux: 2, inverifiable: 1 });
    expect(ctx.record?.sources[0]).toEqual({ name: "TF1 Info", count: 5 });
    // The page's own fact-check is counted in the record but never listed as "recent".
    expect(ctx.record?.recent.map((r) => r.slug)).toEqual(["fc-2", "fc-3", "fc-4", "fc-5", "fc-6"]);

    expect(ctx.claimDay?.participation).toEqual({ POUR: 2, CONTRE: 1, ABSTENTION: 1, total: 4 });
    expect(ctx.claimDay?.chambers[0]?.dossiers.map((d) => d.title)).toEqual([
      "Réponse intégrale aux violences sexuelles",
      "Adapter l'autorité judiciaire",
    ]);
    // Articles before amendments, then in sitting order.
    expect(ctx.claimDay?.sample.map((v) => v.scrutinSlug)).toEqual(["art-54", "art-55", "amdt"]);

    expect(ctx.party).toEqual({
      slug: "la-france-insoumise",
      name: "La France insoumise",
      shortName: "LFI",
      factCheckCount: 94,
      personCount: 30,
    });
    expect(ctx.candidacy).toBeNull();
    // Record, claim day and party: three blocks.
    expect(ctx.indexable).toBe(true);
  });

  it("n'indexe pas un auteur sans parti dont le seul fact-check est celui de la page", async () => {
    mocks.politicianFindFirst.mockResolvedValue(politicianRow(null));
    mocks.mentionFindMany.mockResolvedValue([
      {
        factCheck: {
          slug: INPUT.factCheckSlug,
          title: "Seul",
          verdictRating: "FALSE",
          source: "AFP Factuel",
          publishedAt: new Date("2026-10-09"),
        },
      },
    ]);
    mocks.voteFindMany.mockResolvedValue([]);
    const ctx = await queryFactCheckContext(INPUT);
    expect(ctx.record?.total).toBe(1);
    expect(ctx.indexable).toBe(false);
  });

  it("n'a pas de bloc parti pour un auteur sans parti", async () => {
    mocks.politicianFindFirst.mockResolvedValue(politicianRow(null));
    const ctx = await queryFactCheckContext(INPUT);
    expect(ctx.author?.party).toBeNull();
    expect(ctx.party).toBeNull();
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(ctx.record).not.toBeNull();
  });

  it("n'a pas de bloc du jour si l'auteur n'a pris part à aucun scrutin", async () => {
    mocks.voteFindMany.mockResolvedValue([]);
    const ctx = await queryFactCheckContext(INPUT);
    expect(ctx.claimDay).toBeNull();
    expect(mocks.scrutinGroupBy).not.toHaveBeenCalled();
  });

  it("ne lit pas les votes sans date de déclaration", async () => {
    const ctx = await queryFactCheckContext({ ...INPUT, claimDay: null });
    expect(ctx.claimDay).toBeNull();
    expect(mocks.voteFindMany).not.toHaveBeenCalled();
  });

  it("borne la journée en UTC, du jour de la déclaration au lendemain", async () => {
    await queryFactCheckContext(INPUT);
    expect(mocks.voteFindMany.mock.calls[0]![0].where.scrutin.votingDate).toEqual({
      gte: new Date("2026-10-09T00:00:00.000Z"),
      lt: new Date("2026-10-10T00:00:00.000Z"),
    });
  });

  it("rend le statut de candidature sourcée", async () => {
    mocks.candidacyFindFirst.mockResolvedValue({ status: "DECLARE" });
    const ctx = await queryFactCheckContext(INPUT);
    expect(ctx.candidacy).toEqual({ status: "DECLARE" });
  });

  it("n'a pas de bloc parti quand aucun fact-check public n'y est rattaché", async () => {
    mocks.queryRaw.mockResolvedValue([{ factchecks: BigInt(0), people: BigInt(0) }]);
    const ctx = await queryFactCheckContext(INPUT);
    expect(ctx.party).toBeNull();
  });

  it("n'a pas de bilan quand l'auteur n'a aucune déclaration publique vérifiée", async () => {
    mocks.mentionFindMany.mockResolvedValue([]);
    const ctx = await queryFactCheckContext(INPUT);
    expect(ctx.record).toBeNull();
  });
});

describe("factCheckContextInput", () => {
  const mention = (slug: string, isClaimant: boolean) => ({ isClaimant, politician: { slug } });

  it("retient l'auteur unique et le jour UTC de la déclaration", () => {
    expect(
      factCheckContextInput({
        slug: "fc",
        claimDate: new Date("2026-10-09T22:30:00.000Z"),
        mentions: [mention("panot", true), mention("attal", false)],
      })
    ).toEqual({ factCheckSlug: "fc", authorSlug: "panot", claimDay: "2026-10-09" });
  });

  it("ne retient aucun auteur quand il y en a plusieurs ou aucun", () => {
    const base = { slug: "fc", claimDate: null };
    expect(
      factCheckContextInput({ ...base, mentions: [mention("a", true), mention("b", true)] })
        .authorSlug
    ).toBeNull();
    expect(
      factCheckContextInput({ ...base, mentions: [mention("a", false)] }).authorSlug
    ).toBeNull();
  });
});

describe("getFactCheckContext", () => {
  it("ne résout pas l'élection quand il n'y a pas d'auteur", async () => {
    const ctx = await getFactCheckContext({ ...INPUT, authorSlug: null });
    expect(ctx).toEqual(EMPTY_FACTCHECK_CONTEXT);
    expect(mocks.electionFindUnique).not.toHaveBeenCalled();
  });

  it("transmet la date de déclaration à la lecture", async () => {
    const ctx = await getFactCheckContext(INPUT);
    expect(ctx.claimDay?.day).toBe("2026-10-09");
  });

  it("porte les tags de la fiche de l'auteur et des candidatures présidentielles", async () => {
    await getFactCheckContext(INPUT);
    const tags = mocks.cacheTag.mock.calls.flat();
    expect(tags).toEqual(
      expect.arrayContaining([
        "factchecks",
        "politician:mathilde-panot",
        "votes",
        "elections",
        "election-candidacies:election-2027",
      ])
    );
  });
});
