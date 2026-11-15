import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: h.queryRaw } }));

import { getScrutinVotesParDepartement } from "@/lib/data/scrutin-departements";

beforeEach(() => vi.clearAllMocks());

describe("getScrutinVotesParDepartement", () => {
  it("rattache un vote au mandat qui couvre la date du scrutin, pas au mandat courant", async () => {
    h.queryRaw.mockResolvedValueOnce([]);
    await getScrutinVotesParDepartement("s1");
    const sql = h.queryRaw.mock.calls[0]?.[0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain(`m."startDate" <= s."votingDate"`);
    expect(sql.sql).toContain(`m."endDate" IS NULL OR m."endDate" >= s."votingDate"`);
    expect(sql.sql).not.toContain("isCurrent");
    expect(sql.values).toEqual(["s1"]);
  });

  // Régression : deux mandats qui se chevauchent doublaient le vote dans les totaux.
  it("compte un vote une seule fois et écarte un votant à départements ambigus", async () => {
    h.queryRaw.mockResolvedValueOnce([]);
    await getScrutinVotesParDepartement("s1");
    const sql = (h.queryRaw.mock.calls[0]?.[0] as { sql: string }).sql;
    expect(sql).toContain("GROUP BY v.id, v.position");
    expect(sql).toContain(`HAVING count(DISTINCT m."departmentCode") = 1`);
  });

  it("regroupe par département, dans l'ordre des codes, avec le lien de la page", async () => {
    h.queryRaw.mockResolvedValueOnce([
      { code: "29", position: "CONTRE", n: 6 },
      { code: "2A", position: "POUR", n: 1 },
      { code: "29", position: "ABSTENTION", n: 1 },
      { code: "01", position: "POUR", n: 3 },
      { code: "01", position: "NON_VOTANT", n: 1 },
    ]);
    const rows = await getScrutinVotesParDepartement("s1");
    expect(rows.map((r) => r.code)).toEqual(["01", "2A", "29"]);
    expect(rows[2]).toEqual({
      code: "29",
      name: "Finistère",
      slug: "finistere",
      pour: 0,
      contre: 6,
      abstention: 1,
      nonVotant: 0,
    });
    expect(rows[0]).toMatchObject({ pour: 3, nonVotant: 1 });
  });

  // Régression : un tri alphanumérique rangeait la Corse-du-Sud juste après l'Aisne.
  it("range 2A et 2B entre 19 et 21, et l'outre-mer à la fin", async () => {
    h.queryRaw.mockResolvedValueOnce(
      ["971", "21", "2B", "02", "2A", "19", "95"].map((code) => ({ code, position: "POUR", n: 1 }))
    );
    const rows = await getScrutinVotesParDepartement("s1");
    expect(rows.map((r) => r.code)).toEqual(["02", "19", "2A", "2B", "21", "95", "971"]);
  });

  it("écarte un code qui n'est pas un département", async () => {
    h.queryRaw.mockResolvedValueOnce([{ code: "ZZ9", position: "POUR", n: 2 }]);
    expect(await getScrutinVotesParDepartement("s1")).toEqual([]);
  });
});
