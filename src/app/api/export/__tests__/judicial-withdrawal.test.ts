import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getAffairs } from "../affaires/route";
import { GET as getPoliticians } from "../politiques/route";
import { invalidateEntity } from "@/lib/cache";

const h = vi.hoisted(() => ({
  affairs: vi.fn(),
  politicians: vi.fn(),
  affairsBySeverity: vi.fn(),
  recentPress: vi.fn().mockResolvedValue([]),
  purge: vi.fn(),
  report: vi.fn(),
  pending: [] as Array<() => Promise<void>>,
}));

vi.mock("@/lib/db", () => ({
  db: {
    affair: { findMany: h.affairs, groupBy: h.affairsBySeverity },
    politician: { findMany: h.politicians },
    pressArticleMention: { groupBy: h.recentPress },
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => Promise<void>) => h.pending.push(callback),
}));
vi.mock("@vercel/functions", () => ({ dangerouslyDeleteByTag: h.purge }));
vi.mock("@sentry/nextjs", () => ({ captureException: h.report }));

const person = {
  id: "p-fiction",
  publicId: "PG900001",
  slug: "personne-fictive",
  firstName: "Personne",
  lastName: "Fictive",
  fullName: "Personne Fictive",
  currentParty: null,
  mandates: [],
  partyHistory: [],
  externalIds: [],
  prominenceScore: 9, // The persisted value is deliberately never updated.
};
const affair = {
  publicId: "PG900002",
  slug: "affaire-fictive",
  title: "Affaire de test",
  status: "CONDAMNATION_DEFINITIVE",
  category: "AUTRE",
  severity: "SIGNIFICATIF",
  involvement: "DIRECT",
  jurisdictionOrder: "PENAL",
  politician: person,
  fineAmount: null,
  sources: [],
  courtDecisions: [],
  _count: { sources: 0 },
};
const otherAffair = {
  ...affair,
  publicId: "PG900003",
  slug: "autre-affaire-fictive",
  title: "Autre affaire fictive",
  politician: { ...person, id: "other-person", publicId: "PG900004", slug: "autre-personne" },
};

const routes = [
  ["affaires", getAffairs, "Affaire de test"],
  ["politiques?hasAffairs=true", getPoliticians, "Personne Fictive"],
  ["politiques", getPoliticians, "Personne Fictive"],
] as const;

/** Model only storage and reuse of a fresh response. No real CDN or database. */
function sharedCache(get: typeof getAffairs, url: string) {
  let stored: Response | undefined;
  return async () => {
    if (stored) return stored.clone();
    const response = await get(new NextRequest(url), { params: Promise.resolve({}) });
    const policy =
      response.headers.get("Vercel-CDN-Cache-Control") ?? response.headers.get("Cache-Control");
    if (response.ok && policy?.includes("s-maxage=")) stored = response.clone();
    return response;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL", "1");
  h.pending.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("SEC-08 retrait des données judiciaires des exports CSV", () => {
  it("conserve les mêmes colonnes après le retrait de la dernière ligne", async () => {
    h.affairs.mockResolvedValueOnce([affair]).mockResolvedValueOnce([]);
    const read = sharedCache(getAffairs, "https://example.test/api/export/affaires");
    const before = await read();
    const [header] = (await before.text()).split("\n");
    const after = await read();
    expect(after.status).toBe(200);
    expect(await after.text()).toBe(header);
  });

  it.each(routes)(
    "actualise %s dès la lecture suivante malgré une erreur de purge",
    async (path, get, marker) => {
      let published = true;
      h.affairs.mockImplementation(async () => (published ? [affair, otherAffair] : [otherAffair]));
      h.politicians.mockImplementation(async ({ where, select }) =>
        select || published || !where.affairs
          ? [
              {
                ...person,
                _count: {
                  affairs: Number(published),
                  factCheckMentions: 0,
                  votes: 8,
                  pressMentions: 0,
                },
              },
            ]
          : []
      );
      h.affairsBySeverity.mockImplementation(async () =>
        published ? [{ politicianId: person.id, severity: affair.severity, _count: 1 }] : []
      );
      const read = sharedCache(get, `https://example.test/api/export/${path}`);
      const before = await read();
      expect(before.status).toBe(200);
      const beforeCSV = await before.text();
      expect(beforeCSV).toContain(marker);

      const unavailable = new Error("Purge indisponible dans le test");
      h.purge.mockRejectedValue(unavailable);
      published = false; // Commit simulé. L'ordre du vrai handler est testé séparément.
      invalidateEntity("affair", affair.slug);
      for (const callback of h.pending) await callback();
      expect(h.report).toHaveBeenCalledWith(unavailable, expect.anything());

      const after = await read();
      expect(after.status).toBe(200);
      const [header, row] = (await after.text()).split("\n");
      expect(header).toBe(beforeCSV.split("\n")[0]);
      if (path === "politiques") {
        const columns = header!.split(",");
        const countColumn = columns.indexOf("Nombre d'affaires");
        const scoreColumn = columns.indexOf("Score de prominence");
        const beforeRow = beforeCSV.split("\n")[1]?.split(",");
        expect(beforeRow?.[countColumn]).toBe("1");
        expect(beforeRow?.[scoreColumn]).toBe("9");
        expect(row).toContain(marker);
        expect(row?.split(",")[countColumn]).toBe("0");
        expect(row?.split(",")[scoreColumn]).toBe("4");
        expect(h.affairsBySeverity).toHaveBeenLastCalledWith({
          by: ["politicianId", "severity"],
          where: {
            politicianId: { in: [person.id] },
            publicationStatus: "PUBLISHED",
            involvement: "DIRECT",
          },
          _count: true,
        });
      } else if (path === "affaires") {
        expect(row).toContain(otherAffair.title);
        expect(row).not.toContain(marker);
        expect(h.affairs).toHaveBeenLastCalledWith(
          expect.objectContaining({
            where: {
              publicationStatus: "PUBLISHED",
              politician: { publicationStatus: "PUBLISHED" },
            },
          })
        );
      } else {
        expect(row).toBeUndefined();
        expect(h.politicians).toHaveBeenLastCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              publicationStatus: "PUBLISHED",
              affairs: { some: { publicationStatus: "PUBLISHED" } },
            }),
          })
        );
      }
      expect(after.headers.get("Cache-Control")).toBe("no-store");
      expect(after.headers.get("Vercel-CDN-Cache-Control")).toBe("no-store");
    }
  );
});
