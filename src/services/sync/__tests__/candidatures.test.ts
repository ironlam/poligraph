// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db, getBuffer, resolveBatch } = vi.hoisted(() => ({
  db: {
    election: { findUnique: vi.fn(), update: vi.fn() },
    commune: { findMany: vi.fn() },
    candidacy: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    candidate: { findMany: vi.fn(), createMany: vi.fn() },
    party: { findFirst: vi.fn() },
    mandate: { findMany: vi.fn() },
    $executeRaw: vi.fn(),
  },
  getBuffer: vi.fn(),
  resolveBatch: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/identity", () => ({ resolveBatch }));
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getBuffer = getBuffer;
  },
}));

import { syncCandidaturesMunicipales } from "../candidatures";

function csv(count = 1) {
  const header =
    '"Code département";"Code circonscription";"Circonscription";"Libellé de la liste";' +
    '"Code nuance de liste";"Ordre";"Sexe";"Nom sur le bulletin de vote";' +
    '"Prénom sur le bulletin de vote";"Nationalité"';
  const rows = Array.from(
    { length: count },
    (_, i) =>
      `"01";"01001";"Commune test";"Liste test";"";"${i + 1}";"F";"TEST${i}";"Élodie";"Française"`
  );
  return Buffer.from(`\uFEFF${[header, ...rows].join("\r\n")}`, "utf8");
}

describe("candidatures source and batch boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    db.election.findUnique.mockResolvedValue({ id: "election", slug: "municipales-2026" });
    db.commune.findMany.mockResolvedValue([{ id: "01001" }]);
    db.candidacy.findMany.mockResolvedValue([]);
    db.party.findFirst.mockResolvedValue(null);
    db.mandate.findMany.mockResolvedValue([]);
    db.candidate.createMany.mockResolvedValue({ count: 0 });
    db.candidate.findMany.mockResolvedValue([]);
    resolveBatch.mockResolvedValue({ results: [], stats: {} });
    getBuffer.mockResolvedValue({ data: csv() });
  });

  afterEach(() => vi.restoreAllMocks());

  it("downloads the stable national round-1 resource once and parses UTF-8 CSV", async () => {
    const result = await syncCandidaturesMunicipales({ dryRun: true });

    expect(getBuffer).toHaveBeenCalledExactlyOnceWith(
      "https://www.data.gouv.fr/api/1/datasets/r/b929c2a4-18ec-4e8b-bc37-2ff346a867cd"
    );
    expect(result).toMatchObject({ success: true, candidaciesWithCommune: 1, errors: [] });
    expect(db.candidate.createMany).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("uses an explicit URL without requesting the default source", async () => {
    await syncCandidaturesMunicipales({
      url: "https://example.test/candidatures.csv",
      dryRun: true,
    });

    expect(getBuffer).toHaveBeenCalledExactlyOnceWith("https://example.test/candidatures.csv");
  });

  it("stops on download failure before loading reference tables or writing", async () => {
    getBuffer.mockRejectedValue(new Error("HTTP 404"));

    await expect(syncCandidaturesMunicipales()).rejects.toThrow("HTTP 404");

    expect(db.commune.findMany).not.toHaveBeenCalled();
    expect(db.candidacy.findMany).not.toHaveBeenCalled();
    expect(db.party.findFirst).not.toHaveBeenCalled();
    expect(db.mandate.findMany).not.toHaveBeenCalled();
    expect(resolveBatch).not.toHaveBeenCalled();
    expect(db.candidate.createMany).not.toHaveBeenCalled();
    expect(db.candidacy.createMany).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(db.election.update).not.toHaveBeenCalled();
  });

  it("downloads once across multiple chunks and keeps updates batched by 500", async () => {
    getBuffer.mockResolvedValue({ data: csv(501) });
    db.candidacy.findMany.mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => ({
        id: `candidacy-${i}`,
        candidateName: `Élodie TEST${i}`,
        constituencyCode: "01001",
      }))
    );
    db.$executeRaw.mockResolvedValueOnce(500).mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const result = await syncCandidaturesMunicipales();

    expect(result).toMatchObject({ success: true, candidaciesUpdated: 501, errors: [] });
    expect(getBuffer).toHaveBeenCalledTimes(1);
    expect(db.candidacy.findMany).toHaveBeenCalledTimes(1);
    expect(db.candidate.createMany.mock.calls.map(([args]) => args.data.length)).toEqual([500, 1]);
    expect(db.candidacy.update).not.toHaveBeenCalled();
    expect(db.$executeRaw.mock.calls.map(([sql]) => sql.text.trim().split(/\s/)[0])).toEqual([
      "UPDATE",
      "UPDATE",
      "VACUUM",
    ]);
  });
});
