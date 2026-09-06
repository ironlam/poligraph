import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for POLIGRAPH-1E (2026-09-04).
 *
 * The "Plus indépendants" sort runs a raw aggregate over every vote of every
 * sitting parliamentarian. Measured against production it cannot finish inside
 * the statement timeout, so it raises 57014 and, being unguarded, took the
 * whole /politiques Server Component down with it. A ranking that cannot be
 * computed must degrade to an empty ranking, never to a 500.
 */

const mocks = vi.hoisted(() => ({
  getPoliticianDissidenceRanking: vi.fn(),
  politicianFindMany: vi.fn(),
  politicianCount: vi.fn(),
  partyFindMany: vi.fn(),
  queryRaw: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/services/voteStats", () => ({
  getPoliticianDissidenceRanking: mocks.getPoliticianDissidenceRanking,
}));
vi.mock("@/lib/db", () => ({
  db: {
    politician: { findMany: mocks.politicianFindMany, count: mocks.politicianCount },
    party: { findMany: mocks.partyFindMany },
    $queryRaw: mocks.queryRaw,
  },
}));

import PolitiquesPage from "./page";

type Params = Record<string, string>;
const render = (searchParams: Params) =>
  (PolitiquesPage as (p: { searchParams: Promise<Params> }) => Promise<unknown>)({
    searchParams: Promise.resolve(searchParams),
  });

/** The exact shape Postgres returns when statement_timeout fires. */
function statementTimeout() {
  const e = new Error(
    "Invalid `prisma.$queryRaw()` invocation: Raw query failed. Code: `57014`. " +
      "Message: `canceling statement due to statement timeout`"
  );
  (e as unknown as { code: string }).code = "P2010";
  return e;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.politicianFindMany.mockResolvedValue([]);
  mocks.politicianCount.mockResolvedValue(0);
  mocks.partyFindMany.mockResolvedValue([]);
  mocks.queryRaw.mockResolvedValue([
    {
      with_conviction: BigInt(0),
      total_affairs: BigInt(0),
      deputes: BigInt(0),
      senateurs: BigInt(0),
      gouvernement: BigInt(0),
      dirigeants: BigInt(0),
      maires: BigInt(0),
    },
  ]);
});

describe("/politiques : le classement de dissidence échoue", () => {
  it("signale l'échec à Sentry plutôt que de l'avaler", async () => {
    const boom = statementTimeout();
    mocks.getPoliticianDissidenceRanking.mockRejectedValue(boom);

    await render({ sort: "dissidence" });

    expect(mocks.captureException).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ tags: { feature: "dissidence-ranking" } })
    );
  });

  it("laisse remonter une panne qui n'est pas le classement", async () => {
    // Un échec du listing lui-même ne doit pas être maquillé en liste vide.
    mocks.getPoliticianDissidenceRanking.mockResolvedValue({ politicianIds: ["p1"], total: 1 });
    mocks.politicianFindMany.mockRejectedValue(new Error("connection terminated"));

    await expect(render({ sort: "dissidence" })).rejects.toThrow("connection terminated");
  });

  it("rend la page malgré un statement timeout sur le classement", async () => {
    mocks.getPoliticianDissidenceRanking.mockRejectedValue(statementTimeout());

    await expect(render({ sort: "dissidence" })).resolves.toBeDefined();
    expect(mocks.getPoliticianDissidenceRanking).toHaveBeenCalled();
  });

  it("rend la page quelle que soit la panne du classement", async () => {
    mocks.getPoliticianDissidenceRanking.mockRejectedValue(new Error("connection terminated"));

    await expect(render({ sort: "dissidence" })).resolves.toBeDefined();
  });

  it("n'interroge pas les fiches quand le classement a échoué", async () => {
    mocks.getPoliticianDissidenceRanking.mockRejectedValue(statementTimeout());

    await render({ sort: "dissidence" });

    // Un classement vide ne doit pas déclencher un findMany sur `id: { in: [] }`.
    const dissidenceLookups = mocks.politicianFindMany.mock.calls.filter(
      (c) => (c[0] as { where?: { id?: unknown } })?.where?.id !== undefined
    );
    expect(dissidenceLookups).toHaveLength(0);
  });

  it("laisse passer un classement qui fonctionne", async () => {
    mocks.getPoliticianDissidenceRanking.mockResolvedValue({
      politicianIds: ["p1", "p2"],
      total: 2,
    });

    await expect(render({ sort: "dissidence" })).resolves.toBeDefined();
    expect(mocks.politicianFindMany).toHaveBeenCalled();
  });

  it("ne touche pas au classement pour les autres tris", async () => {
    await render({ sort: "prominence" });
    expect(mocks.getPoliticianDissidenceRanking).not.toHaveBeenCalled();
  });
});
