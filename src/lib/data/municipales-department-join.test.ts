import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  electionFindUnique: vi.fn(),
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
    $queryRaw: mocks.queryRaw,
  },
}));

import { getDepartmentMunicipales } from "./municipales";

/** Strip `-- ...` comments: the query names GROUP BY and p."fullName" in prose. */
function rawSqlText(query: unknown): string {
  return (query as { sql: string }).sql.replace(/--[^\n]*/g, "");
}

/**
 * The communes query used to join "Mandate" with no key back to "Commune", which
 * multiplied every commune by every current MAIRE mandate in the country: statement
 * timeout, and a commune returned once per mayor rather than once.
 */
describe("getDepartmentMunicipales, jointure du maire", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.electionFindUnique.mockResolvedValue({ id: "election-1" });
    mocks.queryRaw.mockResolvedValue([{ total: 0 }]);
  });

  const communesQuery = async () => {
    await getDepartmentMunicipales("69");
    const call = mocks.queryRaw.mock.calls.find(([q]) => rawSqlText(q).includes('"listCount"'));
    expect(call, "la requête des communes n'a pas été émise").toBeTruthy();
    return rawSqlText(call![0]);
  };

  it("rattache le mandat de maire à la commune, sans produit cartésien", async () => {
    const sql = await communesQuery();

    // The mandate must be reached through MandateLocal, keyed on the commune.
    expect(sql).toContain('ml."communeId" = co.id');
    expect(sql).toMatch(/JOIN LATERAL/);
    // And never joined on its own flags alone.
    expect(sql).not.toMatch(/JOIN "Mandate" m ON m\."isCurrent"/);
  });

  it("ne groupe plus sur le nom du maire issu d'une jointure non contrainte", async () => {
    const sql = await communesQuery();
    const groupBy = sql.slice(sql.indexOf("GROUP BY"));

    expect(groupBy).not.toContain('p."fullName"');
    expect(groupBy).not.toContain("p.civility");
  });

  it("borne le maire à une ligne par commune, de façon déterministe", async () => {
    const sql = await communesQuery();
    const lateral = sql.slice(sql.indexOf("JOIN LATERAL"), sql.indexOf("WHERE co."));

    // A commune can carry several isCurrent MAIRE mandates (known data backlog),
    // so the subquery must both cap and order, otherwise the row is arbitrary.
    expect(lateral).toContain("LIMIT 1");
    expect(lateral).toMatch(/ORDER BY[\s\S]*startDate/);
  });
});
