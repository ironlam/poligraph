/**
 * Consommateurs d'agrégats d'affaires : chaque surface garde son propre périmètre de statut,
 * mais un témoin (INDIRECT) et une condamnation d'ordre non pénal n'y entrent jamais.
 *
 * Les `where` Prisma sont appliqués à ATTRIBUTION_ROWS par l'évaluateur partagé ; les requêtes
 * SQL brutes ne sont pas évaluées, leur texte généré est vérifié.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma";
import { ATTRIBUTION_ROWS } from "@/lib/affairs/__tests__/fixtures/attribution";
import { evaluateWhere } from "@/lib/affairs/__tests__/fixtures/evaluate-where";

type Where = Record<string, unknown>;

const ROWS = ATTRIBUTION_ROWS.map((row) => ({
  ...row,
  id: row.key,
  politicianId: "politician-1",
  severity: "CRITIQUE" as const,
}));

const matching = (where: Where | undefined) =>
  ROWS.filter((row) => evaluateWhere(row, where ?? {}));

/** Le périmètre de membres (parti, groupe) n'est pas l'objet de ces tests. */
const withoutMemberScope = (where: Where): Where => {
  const { politician: _members, ...own } = where;
  return own;
};

function groupBy(args: { by: string[]; where?: Where; _count: true | Record<string, true> }) {
  const [field] = args.by as [keyof (typeof ROWS)[number]];
  const groups = new Map<unknown, number>();
  for (const row of matching(args.where)) {
    groups.set(row[field], (groups.get(row[field]) ?? 0) + 1);
  }
  return [...groups].map(([value, n]) => ({
    [field]: value,
    _count:
      args._count === true
        ? n
        : Object.fromEntries(Object.keys(args._count).map((key) => [key, n])),
  }));
}

function findMany(args: { where?: Where; distinct?: string[] }) {
  const found = matching(args.where);
  if (!args.distinct) return found;
  const seen = new Set<string>();
  return found.filter((row) => {
    const key = args.distinct!.map((f) => String(row[f as keyof typeof row])).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const mocks = vi.hoisted(() => ({
  affairFindMany: vi.fn(),
  affairCount: vi.fn(),
  affairGroupBy: vi.fn(),
  queryRaw: vi.fn(),
  politicianFindFirst: vi.fn(),
  partyFindFirst: vi.fn(),
  partyFindMany: vi.fn(),
  parliamentaryGroupFindFirst: vi.fn(),
  parliamentaryGroupFindMany: vi.fn(),
  mandateGroupBy: vi.fn(),
  mandateFindMany: vi.fn(),
  factCheckMentionFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/services/voteStats", () => ({
  getPoliticianVotingStats: vi.fn(async () => ({})),
  voteStatsService: {},
}));
vi.mock("@/services/factcheckStats", () => ({ factcheckStatsService: {} }));
vi.mock("@/lib/db", () => ({
  db: {
    affair: {
      findMany: mocks.affairFindMany,
      count: mocks.affairCount,
      groupBy: mocks.affairGroupBy,
    },
    $queryRaw: mocks.queryRaw,
    politician: { findFirst: mocks.politicianFindFirst },
    party: { findFirst: mocks.partyFindFirst, findMany: mocks.partyFindMany },
    parliamentaryGroup: {
      findFirst: mocks.parliamentaryGroupFindFirst,
      findMany: mocks.parliamentaryGroupFindMany,
    },
    mandate: { groupBy: mocks.mandateGroupBy, findMany: mocks.mandateFindMany },
    factCheckMention: { findMany: mocks.factCheckMentionFindMany },
  },
}));

import {
  DEFAULT_LISTING_INVOLVEMENTS,
  VICTIM_LISTING_INVOLVEMENTS,
  getAdverseInvolvementSql,
} from "@/lib/affairs/public-filters";
import { getJudicialMaturity } from "@/config/judicial-maturity";
import { getProbityStats } from "@/lib/affairs/probity-stats";
import { getCondamnations, getCondamnationsStatsByParty } from "@/lib/data/condamnations";
import { loadComparisonData } from "@/lib/data/compare";
import { getJudicialData } from "@/lib/data/statistics";
import { getParties, getPartiesStats } from "@/lib/data/partis";
import { getHemicycleData } from "@/lib/data/hemicycle";
import { getAdverseCertaintyCounts, getAffairs, getCertaintyFacetCounts } from "@/lib/data/affairs";

const ADVERSE_SQL = getAdverseInvolvementSql("a").sql;

function lastRawSql(): Prisma.Sql {
  const call = mocks.queryRaw.mock.calls.at(-1);
  expect(call, "aucune requête SQL brute").toBeDefined();
  return call![0] as Prisma.Sql;
}

function expectAdverseSql(query: Prisma.Sql) {
  expect(query.sql).toContain(ADVERSE_SQL);
  expect(query.sql).toContain('a."jurisdictionOrder" = ?');
  expect(query.sql).not.toContain("INDIRECT");
  expect(query.values).toContain("DIRECT");
  expect(query.values).toContain("PENAL");
  expect(query.values).not.toContain("INDIRECT");
}

const keys = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

/** Lignes DIRECT d'ordre pénal, tous statuts : le périmètre des surfaces documentaires. */
const DIRECT_PENAL_KEYS = ROWS.filter(
  (row) => row.involvement === "DIRECT" && row.jurisdictionOrder === "PENAL"
)
  .map((row) => row.key)
  .sort();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.affairFindMany.mockImplementation(findMany);
  mocks.affairCount.mockImplementation(
    async (args: { where?: Where }) => matching(args.where).length
  );
  mocks.affairGroupBy.mockImplementation(groupBy);
  mocks.queryRaw.mockResolvedValue([]);
  mocks.mandateGroupBy.mockResolvedValue([]);
  mocks.mandateFindMany.mockResolvedValue([]);
  mocks.factCheckMentionFindMany.mockResolvedValue([]);
});

describe("condamnations", () => {
  it("la liste ne retient que la condamnation DIRECT pénale", async () => {
    const etabli = await getCondamnations({ certainty: "etabli" });
    expect(keys(etabli.affairs)).toEqual(["directPenalConvicted"]);
    expect(etabli.total).toBe(1);
  });

  it("le SQL par parti filtre l'implication par le fragment partagé", async () => {
    await getCondamnationsStatsByParty();
    expectAdverseSql(lastRawSql());
  });
});

describe("comparateur", () => {
  const politician = (type: string) => async (args: { select: { affairs: { where: Where } } }) => ({
    id: "politician-1",
    slug: "personne",
    mandates: [{ type, isCurrent: true }],
    _count: { factCheckMentions: 0 },
    affairs: matching(args.select.affairs.where),
  });

  const condamnations = (affairs: { status: Parameters<typeof getJudicialMaturity>[0] }[]) =>
    affairs.filter((a) => getJudicialMaturity(a.status) === "CONDAMNATION").length;

  it.each([
    ["deputes", "DEPUTE"],
    ["senateurs", "SENATEUR"],
    ["ministres", "MINISTRE"],
  ] as const)("%s : témoin et non pénal exclus des affaires comparées", async (cat, type) => {
    mocks.politicianFindFirst.mockImplementation(politician(type));
    const data = await loadComparisonData(cat, "a", "b");
    const left = data!.left as unknown as { affairs: (typeof ROWS)[number][] };
    expect(keys(left.affairs)).toEqual(DIRECT_PENAL_KEYS);
    expect(condamnations(left.affairs)).toBe(1);
  });

  it("partis : témoin et non pénal exclus des affaires des membres", async () => {
    mocks.partyFindFirst.mockResolvedValue({ id: "party-1", _count: { politicians: 1 } });
    mocks.affairFindMany.mockImplementation((args: { where: Where }) =>
      matching(withoutMemberScope(args.where))
    );
    const data = await loadComparisonData("partis", "a", "b");
    const left = data!.left as unknown as { affairs: (typeof ROWS)[number][] };
    expect(keys(left.affairs)).toEqual(DIRECT_PENAL_KEYS);
    expect(condamnations(left.affairs)).toBe(1);
  });

  it("groupes : témoin et non pénal exclus des affaires des membres", async () => {
    mocks.parliamentaryGroupFindFirst.mockResolvedValue({
      id: "group-1",
      chamber: "AN",
      defaultParty: null,
      _count: { mandates: 0 },
    });
    mocks.affairFindMany.mockImplementation((args: { where: Where }) =>
      matching(withoutMemberScope(args.where))
    );
    const data = await loadComparisonData("groupes", "a", "b");
    const left = data!.left as unknown as { affairs: (typeof ROWS)[number][] };
    expect(keys(left.affairs)).toEqual(DIRECT_PENAL_KEYS);
    expect(condamnations(left.affairs)).toBe(1);
  });
});

describe("getJudicialData", () => {
  it("byStatus et uniqueCondamnes portent sur la même population", async () => {
    const data = await getJudicialData();
    expect(data.maturityCounts.CONDAMNATION).toBe(1);
    expect(data.uniqueCondamnes).toBe(1);
    const counted = data.byStatus.reduce((sum, s) => sum + s.count, 0);
    expect(counted).toBe(DIRECT_PENAL_KEYS.length);
  });
});

describe("/partis", () => {
  it("les compteurs d'un parti excluent le témoin et le non pénal", async () => {
    mocks.partyFindMany.mockImplementation(
      async (args: { include: { affairsAtTime: { where: Where } } }) => [
        {
          id: "party-1",
          slug: "parti",
          predecessor: null,
          _count: { politicians: 1, partyMemberships: 1 },
          affairsAtTime: matching(args.include.affairsAtTime.where),
        },
      ]
    );
    const [party] = await getParties();
    expect(party!.affairCounts).toEqual({
      condamnations: 1,
      enCours: 2,
      closesSansCondamnation: 1,
      total: DIRECT_PENAL_KEYS.length,
    });
  });

  it("le SQL des statistiques filtre l'implication par le fragment partagé", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        actifs: BigInt(0),
        gauche: BigInt(0),
        centre: BigInt(0),
        droite: BigInt(0),
        affaires: BigInt(0),
      },
    ]);
    await getPartiesStats();
    const query = lastRawSql();
    expectAdverseSql(query);
    expect(query.sql).not.toContain("NOT IN ('VICTIM'");
  });
});

describe("hémicycle", () => {
  it("un élu avec seulement une enquête préliminaire n'est pas mis en cause", async () => {
    const deputy = (slug: string, keysOf: string[]) => (where: Where) => ({
      mandate: {
        politician: {
          slug,
          firstName: slug,
          lastName: slug,
          affairs: matching(where).filter((row) => keysOf.includes(row.key)),
        },
      },
    });
    mocks.parliamentaryGroupFindMany.mockImplementation(
      async (args: {
        select: {
          mandates: {
            select: {
              mandate: { select: { politician: { select: { affairs: { where: Where } } } } };
            };
          };
        };
      }) => {
        const where = args.select.mandates.select.mandate.select.politician.select.affairs.where;
        return [
          {
            code: "G",
            name: "Groupe",
            shortName: null,
            color: null,
            politicalPosition: null,
            mandates: [
              deputy("enquete", ["directPreliminaryInquiry"])(where),
              deputy("temoin", ["indirectWitnessConvicted", "directNonPenalConvicted"])(where),
              deputy("condamne", ["directPenalConvicted"])(where),
            ],
          },
        ];
      }
    );

    const [group] = await getHemicycleData();
    const bySlug = Object.fromEntries(group!.deputies.map((d) => [d.slug, d]));
    expect(bySlug.enquete).toMatchObject({ activeAffairCount: 0, maxCertaintyLevel: null });
    expect(bySlug.temoin).toMatchObject({ activeAffairCount: 0, maxCertaintyLevel: null });
    expect(bySlug.condamne).toMatchObject({ activeAffairCount: 1, maxCertaintyLevel: "ETABLI" });
  });
});

describe("probity-stats", () => {
  it("le témoin et le non pénal sont exclus", async () => {
    const stats = await getProbityStats("politician-1");
    expect(stats.etabli).toBe(1);
    expect(stats.total).toBe(DIRECT_PENAL_KEYS.length);
  });
});

describe("facettes de certitude", () => {
  async function listingTotal(involvements: readonly string[]) {
    const listing = await getAffairs(undefined, undefined, undefined, undefined, undefined, 1, [
      ...involvements,
    ] as Parameters<typeof getAffairs>[6]);
    return listing.total;
  }

  const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

  it("mode mis en cause : CLOS_FAVORABLE garde l'issue favorable et le total égale le listing", async () => {
    const counts = await getCertaintyFacetCounts(DEFAULT_LISTING_INVOLVEMENTS);
    expect(counts.CLOS_FAVORABLE).toBe(1);
    expect(sum(counts)).toBe(await listingTotal(DEFAULT_LISTING_INVOLVEMENTS));
  });

  it("mode victime : le total égale le listing, catégories de violences comprises", async () => {
    const counts = await getCertaintyFacetCounts(VICTIM_LISTING_INVOLVEMENTS);
    const total = await listingTotal(VICTIM_LISTING_INVOLVEMENTS);
    expect(total).toBe(1);
    expect(sum(counts)).toBe(total);
  });

  it("getAdverseCertaintyCounts : ETABLI et EN_COURS ne comptent que le DIRECT pénal", async () => {
    const counts = await getAdverseCertaintyCounts();
    expect(counts).toEqual({
      ETABLI: 1,
      PRONONCE: 0,
      EN_COURS: 1,
      CLOS_SANS_CHARGE: 0,
      CLOS_FAVORABLE: 0,
    });
  });
});
