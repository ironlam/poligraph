import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  communeFindMany: vi.fn(),
  repereCount: vi.fn(),
  repereCreateMany: vi.fn(),
  sourceFindFirst: vi.fn(),
  sourceCreate: vi.fn(),
  importDeleteMany: vi.fn(),
  importCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    commune: { findMany: h.communeFindMany },
    territoireRepere: { count: h.repereCount, createMany: h.repereCreateMany },
    repereSource: { findFirst: h.sourceFindFirst, create: h.sourceCreate },
    repereImport: { deleteMany: h.importDeleteMany, create: h.importCreate },
  },
}));

import { syncReperesEau } from "@/services/sync/reperes-eau";

const PLV_HEADER =
  "cddept,cdreseau,inseecommuneprinc,nomcommuneprinc,referenceprel,dateprel,cdreseauamont,pourcentdebit";
const RES_HEADER =
  "cddept,referenceprel,cdparametresiseeaux,cdparametre,rqana,cdunitereference,limitequal,valtraduite";
const UDI_HEADER = "inseecommune,nomcommune,quartier,cdreseau,nomreseau,debutalim";

const plv = (ref: string, udi: string, date: string, amont = "", part = "") =>
  `"035","${udi}","35238","RENNES","${ref}","${date}","${amont}","${part}"`;
const res = (ref: string, p: string, v: string, limit = "<=50 mg/L") =>
  `"035","${ref}","${p}","1340","${v}","162","${limit}","0"`;

function zipOf(year: number, plvRows: string[], resRows: string[], udiRows: string[] = []) {
  const z = new AdmZip();
  z.addFile(`DIS_PLV_${year}.txt`, Buffer.from([PLV_HEADER, ...plvRows].join("\n")));
  z.addFile(`DIS_RESULT_${year}.txt`, Buffer.from([RES_HEADER, ...resRows].join("\n")));
  z.addFile(`DIS_COM_UDI_${year}.txt`, Buffer.from([UDI_HEADER, ...udiRows].join("\n")));
  return z.toBuffer();
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "eau-"));
  // 2026 holds the latest sampling (31 August) ; 2025 holds the start of the window and an old one.
  writeFileSync(
    join(dir, "dis-2026.zip"),
    zipOf(
      2026,
      [plv("A1", "U1", "2026-08-31"), plv("A2", "U1", "2026-03-01"), plv("B1", "U2", "2026-02-01")],
      [
        res("A1", "NO3", "14"),
        res("A2", "NO3", "63"),
        res("B1", "NO3", "<1"),
        res("A1", "PH", "7"),
        res("A1", "NO3", "5", "<=10 mg/L"),
      ],
      [
        '"35238","RENNES","-","U1","RESEAU NORD","2010-01-01"',
        '"35238","RENNES","-","U1","RESEAU NORD","2010-01-01"',
        '"35238","RENNES","autre","U2","RESEAU SUD","2010-01-01"',
        '"99999","AILLEURS","-","U1","RESEAU NORD","2010-01-01"',
      ]
    )
  );
  writeFileSync(
    join(dir, "dis-2025.zip"),
    zipOf(
      2025,
      [plv("C1", "U1", "2025-09-01"), plv("C2", "U1", "2025-12-10"), plv("D1", "U1", "2025-08-31")],
      [res("C1", "NO3", "20"), res("C2", "NO3", "3,2"), res("D1", "NO3", "99")]
    )
  );
  return dir;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        resources: [
          { title: "dis-2026.zip", url: "https://example.test/2026" },
          { title: "dis-2025.zip", url: "https://example.test/2025" },
          { title: "dis-2026-dept.zip", url: "https://example.test/x" },
        ],
      }),
    }))
  );
  h.communeFindMany.mockResolvedValue([{ id: "35238" }]);
  h.repereCount.mockResolvedValue(0);
  h.sourceFindFirst.mockResolvedValue(null);
  h.sourceCreate.mockResolvedValue({ id: "src1" });
  h.importDeleteMany.mockResolvedValue({ count: 0 });
  h.importCreate.mockResolvedValue({ id: "imp1" });
  h.repereCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));
});

describe("import des nitrates", () => {
  it("compte sur douze mois jusqu'à la dernière date de la source, sur deux années", async () => {
    const r = await syncReperesEau({ dryRun: true, cacheDir: setup() });
    expect(r.report.window).toEqual({ start: "2025-09-01", end: "2026-08-31" });
    expect(r.report.years).toEqual([2025, 2026]);
    const u1 = r.report.rows.find((x) => x.scopeId === "U1");
    // 2026: 14 and 63 ; 2025: 20 and 3,2 ; the 31 August 2025 result (99) is outside the window.
    expect(u1).toMatchObject({ sampleSize: 4, state: "ETABLI", value: 1 });
    expect(r.importId).toBeNull();
    expect(h.importCreate).not.toHaveBeenCalled();
  });

  it("attribue un prélèvement à chacune des unités qu'il concerne", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eau-"));
    const rows = ["S1", "S2", "S3", "S4"].flatMap((ref, i) => [
      plv(ref, "UA", `2026-0${i + 1}-10`),
      plv(ref, "UB", `2026-0${i + 1}-10`, "UA", "100 %"),
    ]);
    writeFileSync(
      join(dir, "dis-2026.zip"),
      zipOf(
        2026,
        [...rows, plv("LAST", "UA", "2026-08-31")],
        ["S1", "S2", "S3", "S4"].map((r) => res(r, "NO3", "10")),
        ['"35238","RENNES","-","UA","A","x"', '"35238","RENNES","-","UB","B","x"']
      )
    );
    writeFileSync(join(dir, "dis-2025.zip"), zipOf(2025, [], []));
    const r = await syncReperesEau({ dryRun: true, cacheDir: dir });
    expect(r.report.rows.map((x) => [x.scopeId, x.sampleSize, x.state])).toEqual([
      ["UA", 4, "ETABLI"],
      ["UB", 4, "ETABLI"],
    ]);
  });

  it("écarte les lignes dont l'installation amont fournit 0 % de l'unité", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eau-"));
    const rows = ["S1", "S2", "S3", "S4"].flatMap((ref, i) => [
      plv(ref, "UA", `2026-0${i + 1}-10`, "UX", "0 %"),
    ]);
    writeFileSync(
      join(dir, "dis-2026.zip"),
      zipOf(
        2026,
        [...rows, plv("LAST", "UA", "2026-08-31")],
        ["S1", "S2", "S3", "S4"].map((r) => res(r, "NO3", "10")),
        ['"35238","RENNES","-","UA","A","x"']
      )
    );
    writeFileSync(join(dir, "dis-2025.zip"), zipOf(2025, [], []));
    const def = await syncReperesEau({ dryRun: true, cacheDir: dir });
    expect(def.report.rows[0]).toMatchObject({ sampleSize: 0, state: "NON_ETABLI" });
    expect(def.report.droppedLines).toBe(4);
    const all = await syncReperesEau({ dryRun: true, cacheDir: dir, policy: "TOUS" });
    expect(all.report.rows[0]).toMatchObject({ sampleSize: 4, state: "ETABLI" });
  });

  it("écarte les autres paramètres et les autres limites, et les déclare", async () => {
    const r = await syncReperesEau({ dryRun: true, cacheDir: setup() });
    expect(r.report.otherLimit).toBe(1);
  });

  it("laisse une unité à une seule analyse non établie, avec son compte", async () => {
    const r = await syncReperesEau({ dryRun: true, cacheDir: setup() });
    expect(r.report.rows.find((x) => x.scopeId === "U2")).toMatchObject({
      state: "NON_ETABLI",
      value: null,
      sampleSize: 1,
      reason: "SEUIL_ANALYSES",
    });
  });

  it("une ligne par commune et unité, sans doublon de quartier ni commune inconnue", async () => {
    const r = await syncReperesEau({ dryRun: true, cacheDir: setup() });
    expect(r.report.rows.map((x) => `${x.territoryCode}/${x.scopeId}`)).toEqual([
      "35238/U1",
      "35238/U2",
    ]);
  });

  it("écrit un brouillon par unité, jamais un lot publié", async () => {
    const r = await syncReperesEau({ dryRun: false, cacheDir: setup() });
    expect(h.importCreate.mock.calls[0]?.[0].data.status).toBe("DRAFT");
    const data = h.repereCreateMany.mock.calls[0]?.[0].data as Record<string, unknown>[];
    expect(data[0]).toMatchObject({
      scopeKind: "UDI",
      unit: "analyses",
      indicatorKey: "eau_nitrates",
    });
    expect(r.rowsWritten).toBe(2);
  });

  it("s'arrête si un lot relu ou publié couvre déjà la période", async () => {
    h.repereCount.mockResolvedValueOnce(5);
    await expect(syncReperesEau({ dryRun: false, cacheDir: setup() })).rejects.toThrow(/déjà/);
    expect(h.importCreate).not.toHaveBeenCalled();
  });
});
