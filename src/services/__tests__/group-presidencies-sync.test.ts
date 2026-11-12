import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  externalId: { findMany: vi.fn() },
  parliamentaryGroup: { findMany: vi.fn() },
  parliamentaryGroupPresidency: { upsert: vi.fn(), updateMany: vi.fn() },
}));
const extractZipMock = vi.hoisted(() => vi.fn());
const getBufferMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/parsing/unzip", () => ({ extractZip: extractZipMock }));
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getBuffer = getBufferMock;
  },
}));

import {
  syncAnGroupPresidencies,
  syncSenateGroupPresidencies,
} from "@/services/sync/group-presidencies";
import {
  AN_GROUP_PRESIDENCIES_SOURCE_URL,
  SENATE_GROUP_PRESIDENCIES_SOURCE_URL,
} from "@/lib/parlement/group-presidencies";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const HEADER =
  "Matricule,Id appartenance,Id fonction occupée,Nom,Prénom,Code du groupe politique,Nom court du groupe politique,Date de début d'appartenance,Date de fin d'appartenance,Nom court fonction,Date de début de la fonction,Date de fin de la fonction";

function senateFile(...rows: string[]) {
  getBufferMock.mockResolvedValue({
    data: Buffer.from(["% Requête", HEADER, ...rows].join("\r\n"), "latin1"),
  });
}

const OPEN_ROW =
  "00001A,1,4523,Exemple,Alix,GEX,Groupe d'exemple,2026-10-05 00:00:00.0,,Président,2026-10-05 00:00:00.0,";
const ENDED_ROW =
  "00001A,2,3900,Exemple,Alix,GEX,Groupe d'exemple,2023-10-03 00:00:00.0,2026-09-30 00:00:00.0,Président,2023-10-03 00:00:00.0,2026-09-30 00:00:00.0";

describe("syncSenateGroupPresidencies", () => {
  const groups = new Map([["GEX", "group-1"]]);

  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.externalId.findMany.mockResolvedValue([
      { externalId: "00001A", politicianId: "politician-1" },
    ]);
    dbMock.parliamentaryGroupPresidency.updateMany.mockResolvedValue({ count: 0 });
  });

  it("writes each period under the chamber's own identifier, with its source", async () => {
    senateFile(OPEN_ROW, ENDED_ROW);
    const stats = await syncSenateGroupPresidencies(groups);

    expect(stats).toMatchObject({ periodsFound: 2, written: 2, errors: [] });
    const [open] = dbMock.parliamentaryGroupPresidency.upsert.mock.calls[0]!;
    expect(open.where).toEqual({ source_externalId: { source: "SENAT", externalId: "4523" } });
    expect(open.create).toMatchObject({
      parliamentaryGroupId: "group-1",
      politicianId: "politician-1",
      startDate: day("2026-10-05"),
      endDate: null,
      source: "SENAT",
      sourceUrl: SENATE_GROUP_PRESIDENCIES_SOURCE_URL,
    });
  });

  it("resolves people on the Sénat matricule only", async () => {
    senateFile(OPEN_ROW);
    await syncSenateGroupPresidencies(groups);
    expect(dbMock.externalId.findMany.mock.calls[0]![0].where).toMatchObject({
      source: "SENAT",
      externalId: { in: ["00001A"] },
    });
  });

  it("decodes the accents of the single-byte export", async () => {
    senateFile(OPEN_ROW);
    const stats = await syncSenateGroupPresidencies(groups);
    // The header itself holds accents ("Id fonction occupée"): a wrong decoding throws on it.
    expect(stats.errors).toEqual([]);
  });

  it("closes the open periods the source no longer lists, and only those", async () => {
    senateFile(OPEN_ROW);
    dbMock.parliamentaryGroupPresidency.updateMany.mockResolvedValue({ count: 1 });
    const stats = await syncSenateGroupPresidencies(groups);

    expect(stats.closed).toBe(1);
    const { where, data } = dbMock.parliamentaryGroupPresidency.updateMany.mock.calls[0]![0];
    expect(where).toEqual({ source: "SENAT", endDate: null, externalId: { notIn: ["4523"] } });
    expect(data.endDate).toBeInstanceOf(Date);
  });

  it("closes nothing while a row of the source is unreadable", async () => {
    // A sitting president whose start date went missing: the parser drops the row, and the base
    // still holds it as open. Closing "what the source no longer lists" would erase them.
    senateFile(
      OPEN_ROW,
      "00001A,5,4700,Exemple,Alix,GEX,Groupe d'exemple,2026-10-05 00:00:00.0,,Président,,"
    );
    const stats = await syncSenateGroupPresidencies(groups);

    expect(stats.written).toBe(1);
    expect(stats.closed).toBe(0);
    expect(stats.errors).toEqual([
      "Présidence Sénat illisible : 00001A / 4700",
      expect.stringMatching(/1 ligne\(s\) illisible\(s\).*fermetures ignorées/),
    ]);
    expect(dbMock.parliamentaryGroupPresidency.updateMany).not.toHaveBeenCalled();
  });

  it("writes nothing when the source names no sitting president", async () => {
    senateFile(ENDED_ROW);
    const stats = await syncSenateGroupPresidencies(groups);

    expect(stats.written).toBe(0);
    expect(stats.errors[0]).toMatch(/Aucune présidence en cours/);
    expect(dbMock.parliamentaryGroupPresidency.upsert).not.toHaveBeenCalled();
    expect(dbMock.parliamentaryGroupPresidency.updateMany).not.toHaveBeenCalled();
  });

  it("reports a sitting president it cannot attach, and never guesses", async () => {
    senateFile(
      OPEN_ROW,
      "00009Z,3,4600,Inconnu,Camille,GEX,Groupe d'exemple,2026-10-05 00:00:00.0,,Président,2026-10-05 00:00:00.0,",
      "00001A,4,4601,Exemple,Alix,ZZZ,Groupe absent,2026-10-05 00:00:00.0,,Président,2026-10-05 00:00:00.0,"
    );
    const stats = await syncSenateGroupPresidencies(groups);

    expect(stats.written).toBe(1);
    expect(stats.errors).toEqual([
      "Présidence en cours non rattachée (personne 00009Z inconnu en base)",
      "Présidence en cours non rattachée (groupe ZZZ inconnu en base)",
    ]);
  });

  it("skips in silence the history the base does not hold", async () => {
    senateFile(
      OPEN_ROW,
      "00009Z,3,100,Ancien,Dominique,GEX,Groupe d'exemple,1998-10-01 00:00:00.0,2004-09-30 00:00:00.0,Président,1998-10-01 00:00:00.0,2004-09-30 00:00:00.0"
    );
    const stats = await syncSenateGroupPresidencies(groups);
    expect(stats).toMatchObject({ periodsFound: 2, written: 1, errors: [] });
  });

  it("reports a failed download without touching the base", async () => {
    getBufferMock.mockRejectedValue(new Error("HTTP 503"));
    const stats = await syncSenateGroupPresidencies(groups);
    expect(stats.errors[0]).toMatch(/HTTP 503/);
    expect(dbMock.parliamentaryGroupPresidency.updateMany).not.toHaveBeenCalled();
  });
});

function acteurFile(acteurRef: string, mandatUid: string, organeRef: string, quality: string) {
  return JSON.stringify({
    acteur: {
      uid: { "#text": acteurRef },
      mandats: {
        mandat: [
          { uid: `${mandatUid}-AN`, typeOrgane: "ASSEMBLEE", dateDebut: "2024-07-08" },
          {
            uid: mandatUid,
            typeOrgane: "GP",
            dateDebut: "2024-07-19",
            dateFin: null,
            infosQualite: { codeQualite: quality },
            organes: { organeRef },
          },
        ],
      },
    },
  });
}

describe("syncAnGroupPresidencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBufferMock.mockResolvedValue({ data: Buffer.from("zip") });
    extractZipMock.mockImplementation((_zip: string, outputDir: string) => {
      const dir = path.join(outputDir, "json", "acteur");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "PA1.json"), acteurFile("PA1", "PM1", "PO845419", "Président"));
      writeFileSync(path.join(dir, "PA2.json"), acteurFile("PA2", "PM2", "PO845419", "Membre"));
    });
    dbMock.parliamentaryGroup.findMany.mockResolvedValue([
      { id: "group-soc-17", code: "SOC", legislature: 17 },
    ]);
    dbMock.externalId.findMany.mockResolvedValue([
      { externalId: "PA1", politicianId: "politician-1" },
    ]);
    dbMock.parliamentaryGroupPresidency.updateMany.mockResolvedValue({ count: 0 });
  });

  it("links the president to the group through the official organ identifier", async () => {
    const stats = await syncAnGroupPresidencies();

    expect(stats).toMatchObject({ periodsFound: 1, written: 1, errors: [] });
    expect(dbMock.externalId.findMany.mock.calls[0]![0].where).toMatchObject({
      source: "ASSEMBLEE_NATIONALE",
      externalId: { in: ["PA1"] },
    });
    const [call] = dbMock.parliamentaryGroupPresidency.upsert.mock.calls[0]!;
    expect(call.where).toEqual({
      source_externalId: { source: "ASSEMBLEE_NATIONALE", externalId: "PM1" },
    });
    expect(call.create).toMatchObject({
      parliamentaryGroupId: "group-soc-17",
      politicianId: "politician-1",
      startDate: day("2024-07-19"),
      endDate: null,
      sourceUrl: AN_GROUP_PRESIDENCIES_SOURCE_URL,
    });
  });

  it("does not attach a president to a group of another legislature", async () => {
    dbMock.parliamentaryGroup.findMany.mockResolvedValue([
      { id: "group-soc-16", code: "SOC", legislature: 16 },
    ]);
    const stats = await syncAnGroupPresidencies();

    expect(stats.written).toBe(0);
    expect(stats.errors).toEqual([
      "Présidence en cours non rattachée (groupe PO845419 inconnu en base)",
    ]);
  });
});
