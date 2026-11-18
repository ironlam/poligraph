import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: vi.fn(),
  count: vi.fn(),
  mandates: vi.fn(),
  resolveBatch: vi.fn(),
  createMany: vi.fn(),
  executeRaw: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/identity", () => ({ resolveBatch: h.resolveBatch }));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({ requestProfileRefresh: h.refresh }));
vi.mock("@/lib/db", () => {
  const tx = { identityDecision: { createMany: h.createMany }, $executeRaw: h.executeRaw };
  return {
    db: {
      parrainage: { findMany: h.rows, count: h.count },
      mandate: { findMany: h.mandates },
      $transaction: (run: (client: typeof tx) => Promise<void>) => run(tx),
    },
  };
});

import { linkParrainagesElus, parrainageSourceId } from "../parrainages-elus-link";

const SLUG = "presidentielle-2022";
const row = (over: Record<string, unknown> = {}) => ({
  id: "pa-1",
  dedupeKey: "k1",
  civility: "Mme",
  lastName: "MARTIN",
  firstName: "Claire",
  mandateLabel: "Maire",
  communeCode: "29019",
  departmentCode: "29",
  publishedOn: new Date("2022-02-08T00:00:00Z"),
  ...over,
});
const mandate = (over: Record<string, unknown> = {}) => ({
  politicianId: "p-martin",
  type: "MAIRE",
  departmentCode: "29",
  startDate: new Date("2020-05-28T00:00:00Z"),
  endDate: null,
  localData: { communeId: "29019" },
  politician: { firstName: "Claire", lastName: "Martin" },
  ...over,
});
const same = (dedupeKey: string, politicianId: string) => ({
  sourceId: parrainageSourceId(dedupeKey),
  politicianId,
  decision: "SAME",
  confidence: 0.97,
  method: "DEPARTMENT",
});

beforeEach(() => {
  vi.clearAllMocks();
  h.count.mockResolvedValue(0);
  h.rows.mockResolvedValue([
    row(),
    // Same name, but the base knows no mayor of this commune in 2022.
    row({ id: "pa-2", dedupeKey: "k2", communeCode: "35238" }),
    // A mandate the base does not store as a dated mandate.
    row({ id: "pa-3", dedupeKey: "k3", mandateLabel: "Conseillère régionale" }),
    // Holder found, resolver silent.
    row({
      id: "pa-4",
      dedupeKey: "k4",
      lastName: "DURAND",
      firstName: "Paul",
      communeCode: "29232",
    }),
  ]);
  h.mandates.mockResolvedValue([
    mandate(),
    mandate({
      politicianId: "p-durand",
      localData: { communeId: "29232" },
      politician: { firstName: "Paul", lastName: "Durand" },
    }),
  ]);
  h.resolveBatch.mockResolvedValue({
    results: [same("k1", "p-martin"), same("k2", "p-martin"), same("k3", "p-martin")],
  });
});

describe("linkParrainagesElus", () => {
  it("donne les verdicts sans rien écrire en aperçu", async () => {
    const report = await linkParrainagesElus(SLUG, { write: false });
    expect(report).toMatchObject({ examined: 4, alreadyLinked: 0, politicians: 1, written: 0 });
    expect(report.byMandat.MAIRE).toEqual({
      LINK: 1,
      REVIEW: 1,
      AUTRE_TITULAIRE: 0,
      SANS_MANDAT: 1,
      HORS_PERIMETRE: 0,
    });
    expect(report.byMandat.CONSEILLER_REGIONAL?.HORS_PERIMETRE).toBe(1);
    expect(h.resolveBatch.mock.calls[0]?.[0]).toMatchObject({
      persist: false,
      sourceType: "CONSEIL_CONSTITUTIONNEL",
    });
    expect(h.createMany).not.toHaveBeenCalled();
    expect(h.executeRaw).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("n'écrit que les liens établis, avec leur décision d'identité, puis demande le rafraîchissement", async () => {
    const report = await linkParrainagesElus(SLUG, { write: true });
    expect(report.written).toBe(1);
    expect(h.createMany).toHaveBeenCalledTimes(1);
    expect(h.createMany.mock.calls[0]?.[0].data).toEqual([
      {
        sourceType: "CONSEIL_CONSTITUTIONNEL",
        sourceId: "parrainage:k1",
        politicianId: "p-martin",
        judgement: "SAME",
        confidence: 0.97,
        method: "DEPARTMENT",
        evidence: { rule: "mandate-territory-date-name", mandat: "MAIRE", electionSlug: SLUG },
        decidedBy: "system:sync-parrainages-elus",
      },
    ]);
    expect(h.executeRaw).toHaveBeenCalledTimes(1);
    expect(h.refresh).toHaveBeenCalledWith(
      { politicianIds: ["p-martin"] },
      "sync:parrainages-elus"
    );
  });

  it("ne relit que les présentations sans lien et ne demande rien quand il n'y en a pas", async () => {
    h.rows.mockResolvedValue([]);
    h.count.mockResolvedValue(3776);
    const report = await linkParrainagesElus(SLUG, { write: true });
    expect(report).toMatchObject({ examined: 0, alreadyLinked: 3776, written: 0 });
    expect(h.rows.mock.calls[0]?.[0].where).toEqual({
      election: { slug: SLUG },
      politicianId: null,
    });
    expect(h.resolveBatch).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("ne demande aucun rafraîchissement quand aucun lien n'est établi", async () => {
    h.resolveBatch.mockResolvedValue({ results: [] });
    const report = await linkParrainagesElus(SLUG, { write: true });
    expect(report.written).toBe(0);
    expect(h.createMany).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
