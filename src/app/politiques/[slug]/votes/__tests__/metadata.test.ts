import { describe, it, expect, vi, beforeEach } from "vitest";

// generateMetadata only reads the politician row and the index signals; the
// listing queries below it never run here. Stub the Prisma client so the module
// imports with no DATABASE_URL, and the signals loader so no cache primitive
// runs outside a Next request.
const findUnique = vi.fn();
const getPoliticianVoteChamberCoverage = vi.fn();
vi.mock("@/lib/db", () => ({ db: { politician: { findUnique: () => findUnique() } } }));
vi.mock("@/services/voteStats", () => ({
  getPoliticianVoteChamberCoverage: (politicianId: string) =>
    getPoliticianVoteChamberCoverage(politicianId),
  getPoliticianVotingStats: vi.fn(),
  getPoliticianVoteTabCounts: vi.fn(),
}));
vi.mock("@/lib/seo/politician-index-signals", () => ({
  getPoliticianIndexSignals: vi.fn(async () => null),
}));

import { generateMetadata } from "@/app/politiques/[slug]/votes/page";

type Mandate = { type: string; isCurrent: boolean; role: string | null };

const metadataFor = (fullName: string, mandates: Mandate[], chambers: Array<"AN" | "SENAT">) => {
  findUnique.mockResolvedValue({
    id: "p1",
    slug: "jean-dupont",
    fullName,
    firstName: "Jean",
    lastName: "Dupont",
    photoUrl: null,
    civility: "M.",
    currentParty: null,
    mandates,
  });
  getPoliticianVoteChamberCoverage.mockResolvedValue(chambers);
  return generateMetadata({
    params: Promise.resolve({ slug: "jean-dupont" }),
    searchParams: Promise.resolve({}),
  });
};

beforeEach(() => {
  findUnique.mockReset();
  getPoliticianVoteChamberCoverage.mockReset();
});

describe("/politiques/[slug]/votes metadata", () => {
  it("a sitting deputy gets the Assemblée nationale", async () => {
    const m = await metadataFor(
      "Jean Dupont",
      [{ type: "DEPUTE", isCurrent: true, role: null }],
      ["AN"]
    );
    expect(m.title).toBe("Votes de Jean Dupont à l'Assemblée nationale");
    expect(m.description).toContain("à l'Assemblée nationale");
    expect(m.alternates?.canonical).toBe("/politiques/jean-dupont/votes");
  });

  it("a sitting senator gets the Sénat, never the Assemblée nationale", async () => {
    const m = await metadataFor(
      "Marie Martin",
      [{ type: "SENATEUR", isCurrent: true, role: null }],
      ["SENAT"]
    );
    expect(m.title).toBe("Votes de Marie Martin au Sénat");
    expect(m.title).not.toContain("Assemblée nationale");
    expect(String(m.description)).not.toContain("Assemblée nationale");
  });

  it("an undetermined chamber falls back to a neutral wording", async () => {
    const m = await metadataFor(
      "Camille Durand",
      [{ type: "MINISTRE", isCurrent: true, role: null }],
      []
    );
    expect(m.title).toBe("Votes parlementaires de Camille Durand");
    expect(String(m.description)).not.toContain("Assemblée nationale");
    expect(String(m.description)).not.toContain("Sénat");
  });

  it("a mixed vote corpus claims no chamber at all", async () => {
    const m = await metadataFor("Camille Durand", [], ["AN", "SENAT"]);
    expect(m.title).toBe("Votes parlementaires de Camille Durand");
  });

  it("does not let a current Senate mandate override a mixed vote corpus", async () => {
    const m = await metadataFor(
      "Marie Martin",
      [
        { type: "DEPUTE", isCurrent: false, role: null },
        { type: "SENATEUR", isCurrent: true, role: null },
      ],
      ["AN", "SENAT"]
    );
    expect(m.title).toBe("Votes parlementaires de Marie Martin");
    expect(String(m.description)).not.toContain("Sénat");
    expect(String(m.description)).not.toContain("Assemblée nationale");
  });

  it("does not let a current AN mandate override a mixed vote corpus", async () => {
    const m = await metadataFor(
      "Jean Dupont",
      [
        { type: "SENATEUR", isCurrent: false, role: null },
        { type: "DEPUTE", isCurrent: true, role: null },
      ],
      ["AN", "SENAT"]
    );
    expect(m.title).toBe("Votes parlementaires de Jean Dupont");
    expect(String(m.description)).not.toContain("Sénat");
    expect(String(m.description)).not.toContain("Assemblée nationale");
  });

  it("keeps the canonical of an unknown politician untouched", async () => {
    findUnique.mockResolvedValue(null);
    const m = await generateMetadata({
      params: Promise.resolve({ slug: "inconnu" }),
      searchParams: Promise.resolve({}),
    });
    expect(m.title).toBe("Politicien non trouvé");
  });

  it("noindexes an unknown politician instead of inviting indexation", async () => {
    findUnique.mockResolvedValue(null);
    const m = await generateMetadata({
      params: Promise.resolve({ slug: "inconnu" }),
      searchParams: Promise.resolve({}),
    });
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("leaves an existing politician's metadata untouched", async () => {
    const m = await metadataFor(
      "Jean Dupont",
      [{ type: "DEPUTE", isCurrent: true, role: null }],
      ["AN"]
    );
    expect(m.robots).toBeUndefined();
  });
});
