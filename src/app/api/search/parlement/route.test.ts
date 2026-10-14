import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: queryRaw } }));

import { GET } from "./route";

const context = { params: Promise.resolve({}) };
const get = (q: string) =>
  GET(
    new NextRequest(`https://poligraph.fr/api/search/parlement?q=${encodeURIComponent(q)}`),
    context
  );

function sqlOf(call: unknown[]): Prisma.Sql {
  const [first, ...rest] = call;
  return Array.isArray(first)
    ? Prisma.sql(first as unknown as TemplateStringsArray, ...rest)
    : (first as Prisma.Sql);
}

describe("GET recherche du Parlement", () => {
  beforeEach(() => queryRaw.mockReset().mockResolvedValue([]));

  it("ne lance aucune requête sous deux caractères", async () => {
    const body = await (await get("a")).json();
    expect(queryRaw).not.toHaveBeenCalled();
    expect(body).toEqual({ parlementaires: [], groupes: [], scrutins: [], dossiers: [] });
  });

  it("ne propose que des parlementaires publiés en exercice, et ne se met pas en cache", async () => {
    const response = await get("ciotti");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const politicians = queryRaw.mock.calls.map(sqlOf).find((s) => s.sql.includes('"Politician"'));
    expect(politicians?.sql).toContain(`"publicationStatus" = 'PUBLISHED'`);
    expect(politicians?.sql).toContain(`"isCurrent" = true AND m."type" IN ('DEPUTE', 'SENATEUR')`);
    expect(politicians?.values).toEqual(["ciotti%", "% ciotti%", "%-ciotti%", 4]);
  });

  it("cherche chaque mot du scrutin, accents compris, et lie un scrutin sans slug par son id", async () => {
    queryRaw.mockImplementation((...call: unknown[]) => {
      if (!sqlOf(call)?.sql.includes('FROM "Scrutin"')) return Promise.resolve([]);
      return Promise.resolve([
        { id: "c1", slug: null, title: "Sécurité", votingDate: new Date("2026-01-01") },
      ]);
    });
    const body = (await (await get("securite globale")).json()) as {
      scrutins: { slug: string }[];
    };
    const scrutin = queryRaw.mock.calls.map(sqlOf).find((s) => s?.sql.includes('FROM "Scrutin"'));
    expect(scrutin?.values).toEqual(
      expect.arrayContaining(["s[eéèêëEÉÈÊË][cçCÇ][uùûüUÙÛÜ]r[iîïIÎÏ]t[eéèêëEÉÈÊË]"])
    );
    expect(scrutin?.values.length).toBeGreaterThanOrEqual(2);
    expect(body.scrutins[0]?.slug).toBe("c1");
  });
});
