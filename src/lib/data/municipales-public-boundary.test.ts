import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  electionFindUnique: vi.fn(),
  candidacyFindMany: vi.fn(),
  mandateFindMany: vi.fn(),
  mandateCount: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/services/sync/compute-municipales-snapshots", () => ({
  computeDepartmentPartyDataLive: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: mocks.electionFindUnique },
    candidacy: { findMany: mocks.candidacyFindMany },
    mandate: { findMany: mocks.mandateFindMany, count: mocks.mandateCount },
    $queryRaw: mocks.queryRaw,
  },
}));

import { getCumulCandidates, getMaires, getMaireStats } from "./municipales";

function rawSqlText(query: unknown): string {
  return (query as { sql: string }).sql;
}

describe("getCumulCandidates, frontière publique", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.electionFindUnique.mockResolvedValue({ id: "municipales-2026" });
  });

  it("combine le statut public et le mandat national dans une seule relation politician", async () => {
    mocks.candidacyFindMany.mockImplementation(
      async (args: { where?: Record<string, unknown> }) => {
        const politicianWhere = args.where?.politician;
        const publicAndNational =
          typeof politicianWhere === "object" &&
          politicianWhere !== null &&
          "publicationStatus" in politicianWhere &&
          politicianWhere.publicationStatus === "PUBLISHED" &&
          "mandates" in politicianWhere;

        const publicCandidate = {
          id: "candidacy-public",
          candidateName: "Alice Publique",
          listName: "Liste publique",
          listPosition: 1,
          communeId: "75056",
          commune: { name: "Paris", departmentCode: "75" },
          politician: {
            id: "politician-public",
            slug: "alice-publique",
            fullName: "Alice Publique",
            photoUrl: null,
            currentParty: { shortName: "PP", color: "#123456" },
            mandates: [{ type: "DEPUTE" }],
          },
        };
        const draftCandidate = {
          ...publicCandidate,
          id: "candidacy-draft",
          candidateName: "Bastien Brouillon",
          politician: {
            ...publicCandidate.politician,
            id: "politician-draft",
            slug: "bastien-brouillon",
            fullName: "Bastien Brouillon",
          },
        };

        return (publicAndNational ? [publicCandidate] : [publicCandidate, draftCandidate]) as never;
      }
    );

    const candidates = await getCumulCandidates();

    expect(candidates).toEqual([
      expect.objectContaining({
        id: "candidacy-public",
        politician: expect.objectContaining({
          id: "politician-public",
          fullName: "Alice Publique",
        }),
      }),
    ]);
    expect(JSON.stringify(candidates)).not.toContain("Bastien Brouillon");
    expect(JSON.stringify(candidates)).not.toContain("politician-draft");
  });
});

describe("maires, population publique des listes et agrégats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exclut le maire DRAFT de la liste et de chaque statistique", async () => {
    const mairePublic = {
      id: "mandate-public",
      departmentCode: "75",
      startDate: new Date("2020-05-18T00:00:00.000Z"),
      politician: {
        slug: "alice-publique",
        fullName: "Alice Publique",
        firstName: "Alice",
        lastName: "Publique",
        civility: "Mme",
        photoUrl: null,
        blobPhotoUrl: null,
        birthDate: null,
        currentParty: { shortName: "PP", color: "#123456", slug: "parti-public" },
      },
      localData: {
        functionStart: new Date("2020-05-18T00:00:00.000Z"),
        commune: { name: "Paris", departmentCode: "75", population: 2_000_000 },
      },
    };
    const maireDraft = {
      ...mairePublic,
      id: "mandate-draft",
      politician: {
        ...mairePublic.politician,
        slug: "bastien-brouillon",
        fullName: "Bastien Brouillon",
        firstName: "Bastien",
        lastName: "Brouillon",
        civility: "M.",
        currentParty: { shortName: "PD", color: "#654321", slug: "parti-draft" },
      },
      localData: {
        ...mairePublic.localData,
        functionStart: new Date("2010-01-01T00:00:00.000Z"),
      },
    };

    mocks.mandateFindMany.mockImplementation(async (args: { where?: unknown }) => {
      const publicOnly = JSON.stringify(args.where).includes(
        '"politician":{"publicationStatus":"PUBLISHED"}'
      );
      return (publicOnly ? [mairePublic] : [mairePublic, maireDraft]) as never;
    });
    mocks.mandateCount.mockImplementation(async (args: { where?: unknown }) =>
      JSON.stringify(args.where).includes('"politician":{"publicationStatus":"PUBLISHED"}') ? 1 : 2
    );
    mocks.queryRaw.mockImplementation(async (query: unknown) => {
      const sql = rawSqlText(query);
      const values = (query as { values: unknown[] }).values;
      const publicOnly =
        sql.includes('JOIN "Politician" p ON p.id = m."politicianId"') &&
        sql.includes('p."publicationStatus" = ?') &&
        values.includes("PUBLISHED");

      if (sql.includes("COUNT(*) FILTER")) {
        return publicOnly
          ? [{ total: 1, female: 1, with_party: 1, with_national_mandate: 0 }]
          : [{ total: 2, female: 1, with_party: 2, with_national_mandate: 1 }];
      }
      if (sql.includes('JOIN "Party" pa')) {
        return publicOnly
          ? [{ shortName: "PP", color: "#123456", count: 1 }]
          : [
              { shortName: "PP", color: "#123456", count: 1 },
              { shortName: "PD", color: "#654321", count: 1 },
            ];
      }
      return publicOnly
        ? [{ bracket: "Depuis 2020", count: 1 }]
        : [
            { bracket: "Depuis 2020", count: 1 },
            { bracket: "Avant 2014", count: 1 },
          ];
    });

    const [listing, stats] = await Promise.all([getMaires(), getMaireStats()]);

    expect(listing).toMatchObject({
      total: 1,
      maires: [expect.objectContaining({ slug: "alice-publique" })],
    });
    expect(JSON.stringify(listing)).not.toContain("Bastien Brouillon");
    expect(stats).toEqual({
      total: 1,
      femaleRate: 1,
      withParty: 1,
      withNationalMandate: 0,
      partyDistribution: [{ shortName: "PP", color: "#123456", count: 1 }],
      mandateDistribution: [{ bracket: "Depuis 2020", count: 1 }],
    });

    const countQuery = mocks.queryRaw.mock.calls.find(([query]) =>
      rawSqlText(query).includes("COUNT(*) FILTER")
    )?.[0] as { sql: string; values: unknown[] };
    const mandateDistributionQuery = mocks.queryRaw.mock.calls.find(([query]) =>
      rawSqlText(query).includes('WHEN ml."functionStart"')
    )?.[0] as { sql: string; values: unknown[] };

    for (const query of [countQuery, mandateDistributionQuery]) {
      expect(query.sql).toContain('JOIN "Politician" p ON p.id = m."politicianId"');
      expect(query.sql).toContain('p."publicationStatus" = ?');
      expect(query.values).toEqual(["PUBLISHED"]);
    }
  });
});
