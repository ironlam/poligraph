import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A record cannot be its own candidate.
 *
 * The RNE sync creates a profile in phase 1, then asks the resolver in phase 2 whether that
 * profile duplicates someone we already knew. The resolver screens against every politician in
 * the database, and by then the freshly created one is in there: it matched itself, at 0.94 to
 * 0.98, and outranked the national politician it was supposed to be folded into.
 *
 * Measured on the first real run, 2026-09-27: 77 of 78 decisions pointed at the very record
 * being resolved. Phase 2 reported 78 matches and merged nothing, and the profiles that should
 * have been held back as possible duplicates stayed published.
 */
const h = vi.hoisted(() => ({
  findPoliticians: vi.fn(),
  findDecisions: vi.fn(),
  createDecisions: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findMany: h.findPoliticians },
    identityDecision: { findMany: h.findDecisions, createMany: h.createDecisions, create: vi.fn() },
    $queryRaw: h.queryRaw,
  },
}));

import { resolveBatch } from "@/lib/identity/resolver";
import { DataSource, Judgement } from "@/generated/prisma";

const NATIONAL = {
  id: "national-1",
  firstName: "Alice",
  lastName: "Martin",
  birthDate: new Date("1970-04-02"),
  civility: "Mme",
  prominenceScore: 0,
  mandates: [],
};

/** The profile phase 1 just created for the same person, indistinguishable by name. */
const STUB = { ...NATIONAL, id: "stub-1" };

const INPUT = {
  firstName: "Alice",
  lastName: "Martin",
  birthDate: new Date("1970-04-02"),
  source: DataSource.RNE,
  sourceId: "01001",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.findDecisions.mockResolvedValue([]);
  h.createDecisions.mockResolvedValue({ count: 0 });
  h.queryRaw.mockResolvedValue([]);
});

describe("resolveBatch, exclusion de candidats", () => {
  it("apparie la fiche nationale quand rien n'est exclu", async () => {
    h.findPoliticians.mockResolvedValue([NATIONAL]);

    const { results } = await resolveBatch({ sourceType: DataSource.RNE, inputs: [INPUT] });

    expect(results[0]?.politicianId).toBe("national-1");
    expect(results[0]?.decision).toBe(Judgement.SAME);
  });

  it("ne retient jamais un candidat exclu, même s'il est le mieux noté", async () => {
    // L'ébauche et la fiche nationale sont identiques : sans exclusion, l'ordre entre les deux
    // est arbitraire et l'ébauche peut gagner, auquel cas la fusion ne se fait pas.
    h.findPoliticians.mockResolvedValue([STUB, NATIONAL]);

    const { results } = await resolveBatch({
      sourceType: DataSource.RNE,
      inputs: [INPUT],
      excludePoliticianIds: new Set(["stub-1"]),
    });

    expect(results[0]?.politicianId).toBe("national-1");
  });

  it("ne trouve personne quand le seul candidat est exclu", async () => {
    h.findPoliticians.mockResolvedValue([STUB]);

    const { results, stats } = await resolveBatch({
      sourceType: DataSource.RNE,
      inputs: [INPUT],
      excludePoliticianIds: new Set(["stub-1"]),
    });

    expect(results).toHaveLength(0);
    expect(stats.notFound).toBe(1);
  });

  it("n'écrit aucune décision pointant sur un candidat exclu", async () => {
    h.findPoliticians.mockResolvedValue([STUB]);

    await resolveBatch({
      sourceType: DataSource.RNE,
      inputs: [INPUT],
      excludePoliticianIds: new Set(["stub-1"]),
    });

    const written = h.createDecisions.mock.calls.flatMap((call) => call[0].data);
    expect(written).toEqual([]);
  });

  it("ignore une décision antérieure qui pointe sur un candidat exclu", async () => {
    // 77 décisions de cette forme ont été écrites avant le correctif. Sans cette garde, elles
    // court-circuiteraient la résolution à chaque run et le défaut survivrait à son correctif.
    h.findPoliticians.mockResolvedValue([STUB, NATIONAL]);
    h.findDecisions.mockResolvedValue([
      {
        sourceId: "01001",
        politicianId: "stub-1",
        judgement: Judgement.SAME,
        confidence: 0.98,
        method: "BIRTHDATE",
        decidedAt: new Date(),
      },
    ]);

    const { results } = await resolveBatch({
      sourceType: DataSource.RNE,
      inputs: [INPUT],
      excludePoliticianIds: new Set(["stub-1"]),
    });

    expect(results[0]?.politicianId).toBe("national-1");
  });
});
