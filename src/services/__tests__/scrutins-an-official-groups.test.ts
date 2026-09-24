import { Readable } from "stream";
import { createHash } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  externalId: { findMany: vi.fn() },
  scrutin: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  scrutinOfficialGroupCount: { deleteMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
}));

const transactionMock = vi.hoisted(() => ({
  scrutinOfficialGroupCount: { deleteMany: vi.fn(), createMany: vi.fn() },
  scrutin: { update: vi.fn() },
}));

const syncMock = vi.hoisted(() => ({
  syncMetadata: { get: vi.fn(), markCompleted: vi.fn() },
  hashFile: vi.fn(),
  hashVotes: vi.fn(),
  ProgressTracker: vi.fn(),
}));

const httpsMock = vi.hoisted(() => ({ get: vi.fn() }));
const extractZipMock = vi.hoisted(() => vi.fn());
const writeVotesMock = vi.hoisted(() => vi.fn());
const computeGroupPositionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/sync", () => syncMock);
vi.mock("@/services/sync/compute-group-positions", () => ({
  computeGroupPositionsForScrutin: computeGroupPositionsMock,
}));
vi.mock("@/services/sync/scrutins-vote-writer", () => ({
  writeVotesForScrutin: writeVotesMock,
}));
vi.mock("@/lib/parsing/unzip", () => ({ extractZip: extractZipMock }));
vi.mock("https", () => httpsMock);

import { buildOfficialGroupSnapshot, syncScrutinsAN } from "@/services/sync/scrutins-an";

const rawScrutin = {
  scrutin: {
    uid: "VTANR5L17V9000",
    numero: "9000",
    legislature: "17",
    dateScrutin: "2025-01-01",
    titre: "sur un projet de loi",
    typeVote: {
      codeTypeVote: "SPS",
      libelleTypeVote: "scrutin public solennel",
    },
    sort: { code: "adopté", libelle: "Adopté" },
    syntheseVote: {
      nombreVotants: "1",
      suffragesExprimes: "1",
      decompte: { pour: "1", contre: "0", abstentions: "0", nonVotants: "0" },
    },
    ventilationVotes: {
      organe: {
        groupes: {
          groupe: [
            {
              organeRef: "PO845401",
              nombreMembresGroupe: "1",
              vote: {
                positionMajoritaire: "pour",
                decompteVoix: {
                  pour: "1",
                  contre: "0",
                  abstentions: "0",
                  nonVotants: "0",
                  nonVotantsVolontaires: "0",
                },
                decompteNominatif: {
                  pours: { votant: { acteurRef: "PA1", mandatRef: "PM1" } },
                  contres: null,
                  abstentions: null,
                  nonVotants: null,
                },
              },
            },
          ],
        },
      },
    },
  },
};

function configureArchiveFixture() {
  extractZipMock.mockImplementation((_zipPath: string, destination: string) => {
    const jsonDir = join(destination, "json");
    mkdirSync(jsonDir, { recursive: true });
    writeFileSync(join(jsonDir, "VTANR5L17V9000.json"), JSON.stringify(rawScrutin));
  });

  httpsMock.get.mockImplementation(
    (
      _options: unknown,
      callback: (
        response: Readable & { statusCode: number; headers: Record<string, string> }
      ) => void
    ) => {
      const response = Object.assign(Readable.from([Buffer.from("not-a-real-zip")]), {
        statusCode: 200,
        headers: { etag: "archive-etag" },
      });
      callback(response);
      return { on: vi.fn().mockReturnThis() };
    }
  );

  syncMock.hashFile.mockResolvedValue("archive-hash");
  syncMock.hashVotes.mockReturnValue("same-votes-hash");
  syncMock.syncMetadata.get.mockResolvedValue(null);
  syncMock.syncMetadata.markCompleted.mockResolvedValue(undefined);
  syncMock.ProgressTracker.mockImplementation(function () {
    return {
      tick: vi.fn(),
      update: vi.fn(),
      finish: vi.fn(),
    };
  });
  dbMock.$transaction.mockImplementation(
    async (callback: (transaction: typeof transactionMock) => Promise<unknown>) =>
      callback(transactionMock)
  );
  dbMock.externalId.findMany.mockResolvedValue([
    { externalId: "PA1", politicianId: "politician-1" },
  ]);
  transactionMock.scrutinOfficialGroupCount.deleteMany.mockResolvedValue({ count: 0 });
  transactionMock.scrutinOfficialGroupCount.createMany.mockResolvedValue({ count: 1 });
  transactionMock.scrutin.update.mockResolvedValue({});
}

describe("syncScrutinsAN official group metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureArchiveFixture();
  });

  it("keeps the regular sync free of official-group backfill transactions", async () => {
    const existing = {
      id: "scrutin-1",
      slug: "scrutin-1",
      chamber: "AN",
      type: null,
      votingDate: new Date("2025-01-01"),
      votesHash: "same-votes-hash",
      officialGroupsHash: null,
      officialGroupsSourceHash: null,
      officialGroupsSourceUrl: null,
      codeTypeVote: null,
      libelleTypeVote: null,
    };
    dbMock.scrutin.findUnique.mockResolvedValue(existing);
    dbMock.scrutin.update.mockResolvedValue(existing);

    const result = await syncScrutinsAN(17, false, false, true);

    expect(result.errors).toEqual([]);
    expect(writeVotesMock).not.toHaveBeenCalled();
    expect(computeGroupPositionsMock).not.toHaveBeenCalled();
    expect(transactionMock.scrutinOfficialGroupCount.createMany).not.toHaveBeenCalled();
    expect(transactionMock.scrutin.update).not.toHaveBeenCalled();
  });

  it("imports official counts atomically in official-groups-only mode", async () => {
    const existing = {
      id: "scrutin-1",
      slug: "scrutin-1",
      chamber: "AN",
      type: null,
      votingDate: new Date("2025-01-01"),
      votesHash: "same-votes-hash",
      officialGroupsHash: null,
      officialGroupsSourceHash: null,
      officialGroupsSourceUrl: null,
      codeTypeVote: null,
      libelleTypeVote: null,
    };
    dbMock.scrutin.findUnique.mockResolvedValue(existing);

    const result = await syncScrutinsAN(17, false, false, false, true);

    expect(result.errors).toEqual([]);
    expect(transactionMock.scrutinOfficialGroupCount.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          scrutinId: "scrutin-1",
          sourceIndex: 0,
          organeRef: "PO845401",
          forCount: 1,
        }),
      ],
    });
    expect(transactionMock.scrutin.update).toHaveBeenCalledWith({
      where: { id: "scrutin-1" },
      data: expect.objectContaining({
        officialGroupsHash: expect.any(String),
        officialGroupsSourceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        officialGroupsSourceUrl:
          "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip",
        codeTypeVote: "SPS",
        libelleTypeVote: "scrutin public solennel",
        officialGroupsIssues: [],
      }),
    });
  });

  it("preserves every source block when organeRef is duplicated", async () => {
    const duplicateRef = structuredClone(rawScrutin);
    duplicateRef.scrutin.ventilationVotes.organe.groupes.groupe.push({
      ...structuredClone(duplicateRef.scrutin.ventilationVotes.organe.groupes.groupe[0]!),
      nombreMembresGroupe: "2",
      vote: {
        ...structuredClone(duplicateRef.scrutin.ventilationVotes.organe.groupes.groupe[0]!.vote),
        decompteVoix: {
          pour: "0",
          contre: "2",
          abstentions: "0",
          nonVotants: "0",
          nonVotantsVolontaires: "0",
        },
      },
    });
    extractZipMock.mockImplementation((_zipPath: string, destination: string) => {
      const jsonDir = join(destination, "json");
      mkdirSync(jsonDir, { recursive: true });
      writeFileSync(join(jsonDir, "VTANR5L17V9000.json"), JSON.stringify(duplicateRef));
    });
    dbMock.scrutin.findUnique.mockResolvedValue({
      id: "scrutin-1",
      officialGroupsHash: null,
      officialGroupsSourceHash: null,
      officialGroupsSourceUrl: null,
      codeTypeVote: null,
      libelleTypeVote: null,
    });

    const result = await syncScrutinsAN(17, false, false, false, true);

    expect(result.errors).toEqual([]);
    const rows = transactionMock.scrutinOfficialGroupCount.createMany.mock.calls[0]![0].data;
    expect(rows).toHaveLength(2);
    expect(rows.map((row: { sourceIndex: number }) => row.sourceIndex)).toEqual([0, 1]);
    expect(rows.every((row: { organeRef: string }) => row.organeRef === "PO845401")).toBe(true);
  });

  it("propagates force to rebuild rows even when both hashes match", async () => {
    const content = JSON.stringify(rawScrutin);
    const sourceHash = createHash("sha256").update(content).digest("hex");
    const snapshot = buildOfficialGroupSnapshot(rawScrutin, sourceHash, "source", new Date());
    dbMock.scrutin.findUnique.mockResolvedValue({
      id: "scrutin-1",
      officialGroupsHash: snapshot.hash,
      officialGroupsSourceHash: sourceHash,
      officialGroupsSourceUrl:
        "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip",
      codeTypeVote: "SPS",
      libelleTypeVote: "scrutin public solennel",
    });

    await syncScrutinsAN(17, false, false, true, true);

    expect(transactionMock.scrutinOfficialGroupCount.deleteMany).toHaveBeenCalled();
    expect(transactionMock.scrutinOfficialGroupCount.createMany).toHaveBeenCalled();
  });

  it("does not write a stable snapshot when force is false", async () => {
    const content = JSON.stringify(rawScrutin);
    const sourceHash = createHash("sha256").update(content).digest("hex");
    const snapshot = buildOfficialGroupSnapshot(rawScrutin, sourceHash, "source", new Date());
    dbMock.scrutin.findUnique.mockResolvedValue({
      id: "scrutin-1",
      officialGroupsHash: snapshot.hash,
      officialGroupsSourceHash: sourceHash,
      officialGroupsSourceUrl:
        "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip",
      codeTypeVote: "SPS",
      libelleTypeVote: "scrutin public solennel",
    });

    const result = await syncScrutinsAN(17, false, false, false, true);

    expect(result.errors).toEqual([]);
    expect(result.scrutinsSkipped).toBe(1);
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("updates source provenance without rebuilding unchanged rows", async () => {
    const content = JSON.stringify(rawScrutin);
    const sourceHash = createHash("sha256").update(content).digest("hex");
    const snapshot = buildOfficialGroupSnapshot(rawScrutin, sourceHash, "source", new Date());
    dbMock.scrutin.findUnique.mockResolvedValue({
      id: "scrutin-1",
      officialGroupsHash: snapshot.hash,
      officialGroupsSourceHash: "older-source-hash",
      officialGroupsSourceUrl:
        "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip",
      codeTypeVote: "SPS",
      libelleTypeVote: "scrutin public solennel",
    });

    const result = await syncScrutinsAN(17, false, false, false, true);

    expect(result.errors).toEqual([]);
    expect(transactionMock.scrutinOfficialGroupCount.deleteMany).not.toHaveBeenCalled();
    expect(transactionMock.scrutinOfficialGroupCount.createMany).not.toHaveBeenCalled();
    expect(transactionMock.scrutin.update).toHaveBeenCalledWith({
      where: { id: "scrutin-1" },
      data: expect.objectContaining({
        officialGroupsHash: snapshot.hash,
        officialGroupsSourceHash: sourceHash,
        officialGroupsSourceFetchedAt: expect.any(Date),
      }),
    });
  });

  it("checkpoints a regular archive even when one file is rejected", async () => {
    extractZipMock.mockImplementation((_zipPath: string, destination: string) => {
      const jsonDir = join(destination, "json");
      mkdirSync(jsonDir, { recursive: true });
      writeFileSync(join(jsonDir, "VTANR5L17V9000.json"), JSON.stringify(rawScrutin));
      writeFileSync(join(jsonDir, "broken.json"), "{");
    });
    dbMock.scrutin.findUnique.mockResolvedValue({
      id: "scrutin-1",
      slug: "scrutin-1",
      chamber: "AN",
      type: null,
      votingDate: new Date("2025-01-01"),
      votesHash: "same-votes-hash",
    });
    dbMock.scrutin.update.mockImplementation(async ({ data }: { data: unknown }) => ({
      id: "scrutin-1",
      slug: "scrutin-1",
      chamber: "AN",
      type: null,
      votingDate: new Date("2025-01-01"),
      votesHash: "same-votes-hash",
      ...(data as object),
    }));

    const result = await syncScrutinsAN(17, false, false, true);

    expect(result.errors).toHaveLength(1);
    expect(syncMock.syncMetadata.markCompleted).toHaveBeenCalledWith(
      "votes-an-zip:17",
      expect.objectContaining({ contentHash: "archive-hash", itemCount: 1 })
    );
  });

  it("does not checkpoint a partial official-groups backfill", async () => {
    extractZipMock.mockImplementation((_zipPath: string, destination: string) => {
      const jsonDir = join(destination, "json");
      mkdirSync(jsonDir, { recursive: true });
      writeFileSync(join(jsonDir, "VTANR5L17V9000.json"), JSON.stringify(rawScrutin));
      writeFileSync(join(jsonDir, "broken.json"), "{");
    });
    dbMock.scrutin.findUnique.mockResolvedValue({
      id: "scrutin-1",
      officialGroupsHash: null,
      officialGroupsSourceHash: null,
      officialGroupsSourceUrl: null,
      codeTypeVote: null,
      libelleTypeVote: null,
    });

    const result = await syncScrutinsAN(17, false, false, false, true);

    expect(result.errors).toHaveLength(1);
    expect(syncMock.syncMetadata.markCompleted).not.toHaveBeenCalled();
  });

  it.each([
    { dryRun: false, checkpoints: true },
    { dryRun: true, checkpoints: false },
  ])("handles an HTTP 304 with dryRun=$dryRun", async ({ dryRun, checkpoints }) => {
    httpsMock.get.mockImplementation(
      (
        _options: unknown,
        callback: (
          response: Readable & { statusCode: number; headers: Record<string, string> }
        ) => void
      ) => {
        const response = Object.assign(Readable.from([]), {
          statusCode: 304,
          headers: { etag: "archive-etag" },
        });
        callback(response);
        return { on: vi.fn().mockReturnThis() };
      }
    );
    syncMock.syncMetadata.get.mockResolvedValue({ etag: "archive-etag" });

    const result = await syncScrutinsAN(17, dryRun);

    expect(result.errors).toEqual([]);
    expect(syncMock.syncMetadata.markCompleted).toHaveBeenCalledTimes(checkpoints ? 1 : 0);
    expect(extractZipMock).not.toHaveBeenCalled();
  });

  it.each([
    { dryRun: false, checkpoints: true },
    { dryRun: true, checkpoints: false },
  ])("handles an unchanged archive hash with dryRun=$dryRun", async ({ dryRun, checkpoints }) => {
    syncMock.syncMetadata.get.mockResolvedValue({ contentHash: "archive-hash" });

    const result = await syncScrutinsAN(17, dryRun);

    expect(result.errors).toEqual([]);
    expect(syncMock.syncMetadata.markCompleted).toHaveBeenCalledTimes(checkpoints ? 1 : 0);
    expect(extractZipMock).not.toHaveBeenCalled();
  });

  it("keeps official-groups-only dry-run read-only", async () => {
    dbMock.scrutin.findUnique.mockResolvedValue({
      id: "scrutin-1",
      officialGroupsHash: null,
    });

    const result = await syncScrutinsAN(17, true, false, true, true);

    expect(result.errors).toEqual([]);
    expect(result.scrutinsUpdated).toBe(1);
    expect(dbMock.scrutin.update).not.toHaveBeenCalled();
    expect(dbMock.scrutinOfficialGroupCount.deleteMany).not.toHaveBeenCalled();
    expect(dbMock.scrutinOfficialGroupCount.createMany).not.toHaveBeenCalled();
    expect(transactionMock.scrutin.update).not.toHaveBeenCalled();
    expect(syncMock.syncMetadata.markCompleted).not.toHaveBeenCalled();
    expect(writeVotesMock).not.toHaveBeenCalled();
  });
});
