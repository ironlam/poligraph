import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma";
import {
  hashSerializedDocument,
  serializeProfileDocument,
  type PoliticianProfileDocument,
} from "@/lib/politicians/profile-snapshot/document";
import {
  compareSnapshot,
  firstDiffPath,
  parseArgs,
  splitEvenly,
} from "../audit-profile-snapshot-equivalence";

// Fictitious fixture carrying only the fields these tests exercise.
function sampleDocument(): PoliticianProfileDocument {
  return {
    identity: {
      id: "pol_1",
      slug: "jeanne-exemple",
      fullName: "Jeanne Exemple",
      updatedAt: new Date("2026-09-01T10:00:00.000Z"),
      mandates: [{ id: "m1", updatedAt: new Date("2026-09-01T10:00:00.000Z") }],
      declarations: [{ id: "d1", totalNet: new Prisma.Decimal("1200.25") }],
    },
    dossier: { affairs: [] },
    voteStats: null,
    mandateType: "DEPUTE",
  } as unknown as PoliticianProfileDocument;
}

/** The row `writeProfileSnapshot` would store for `doc`. */
function storedRow(doc: PoliticianProfileDocument) {
  const data = serializeProfileDocument(doc);
  return {
    data: JSON.parse(JSON.stringify(data)) as Prisma.JsonValue,
    contentHash: hashSerializedDocument(data),
  };
}

describe("audit-profile-snapshot-equivalence", () => {
  it("reste en lecture seule : aucune écriture ni revalidation dans le source", () => {
    const source = readFileSync(
      join(__dirname, "..", "audit-profile-snapshot-equivalence.ts"),
      "utf8"
    );
    // Strip comments so the header may name what is forbidden.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of [
      "writeProfileSnapshot",
      "refreshPoliticianProfile",
      "revalidate",
      "$executeRaw",
      "$transaction",
      "create(",
      "update(",
      "upsert(",
      "delete(",
      // createMany, updateMany, deleteMany, and findMany too: the audit reads row by row.
      "Many(",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }

    const sqlTexts = [...code.matchAll(/Prisma\.sql`([\s\S]*?)`/g)].map((m) => m[1]!);
    // Guards the extraction itself: no SQL found would make the check below pass on nothing.
    expect(sqlTexts.length).toBeGreaterThan(2);
    for (const sql of sqlTexts) {
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    }
  });

  it("n'imprime que le message d'une erreur fatale", () => {
    const source = readFileSync(
      join(__dirname, "..", "audit-profile-snapshot-equivalence.ts"),
      "utf8"
    );
    const handler = source.slice(source.lastIndexOf(".catch("));
    expect(handler).toContain("error instanceof Error ? error.message : String(error)");
    expect(handler).not.toMatch(/console\.error\(\s*error\s*\)/);
  });

  it("déclare identique un document stocké fidèlement, Decimal compris", () => {
    const doc = sampleDocument();
    expect(compareSnapshot(doc, storedRow(doc))).toEqual({ kind: "match" });
  });

  it("signale une information perdue à la sérialisation que l'empreinte ne voit pas", () => {
    const doc = sampleDocument();
    // A Map serializes to {}: both hashes agree, only the deep comparison sees the loss.
    (doc.identity as unknown as Record<string, unknown>).extra = new Map([["k", "v"]]);
    const row = storedRow(doc);
    expect(hashSerializedDocument(serializeProfileDocument(doc))).toBe(row.contentHash);
    expect(compareSnapshot(doc, row)).toEqual({ kind: "mismatch", path: "identity.extra" });
  });

  it("classe à part un écart d'horodatage seul, sans échec", () => {
    const stored = storedRow(sampleDocument());
    const rebuilt = sampleDocument();
    (rebuilt.identity.mandates[0] as unknown as { updatedAt: Date }).updatedAt = new Date(
      "2026-10-02T04:00:00.000Z"
    );
    expect(compareSnapshot(rebuilt, stored)).toEqual({
      kind: "timestamps",
      path: "identity.mandates[0].updatedAt",
    });
  });

  it("classe aussi lastConfirmedAt et …CheckedAt en horodatage seul", () => {
    const stored = storedRow(sampleDocument());
    const rebuilt = sampleDocument();
    (rebuilt.identity.mandates[0] as unknown as Record<string, unknown>).lastConfirmedAt = new Date(
      "2026-10-02T04:00:00.000Z"
    );
    (rebuilt.identity as unknown as Record<string, unknown>).photoCheckedAt = new Date(
      "2026-10-02T04:00:00.000Z"
    );
    expect(compareSnapshot(rebuilt, stored).kind).toBe("timestamps");
  });

  it("signale un champ affiché divergent par son chemin, sans sa valeur", () => {
    const stored = storedRow(sampleDocument());
    const rebuilt = sampleDocument();
    rebuilt.identity.fullName = "Jeanne Autre";
    rebuilt.identity.updatedAt = new Date("2026-09-01T11:00:00.000Z");
    expect(compareSnapshot(rebuilt, stored)).toEqual({
      kind: "mismatch",
      path: "identity.fullName",
    });
  });

  it("signale une colonne data qui ne correspond plus à l'empreinte stockée", () => {
    const doc = sampleDocument();
    const row = storedRow(doc);
    row.contentHash = "0".repeat(64);
    expect(compareSnapshot(doc, row)).toEqual({ kind: "mismatch", path: "(contentHash)" });
  });

  it("donne le chemin du premier écart sans jamais exposer de valeur", () => {
    const a = { dossier: { affairs: [{ title: "secret-a" }, { title: "x" }] } };
    const b = { dossier: { affairs: [{ title: "secret-a" }, { title: "y" }] } };
    expect(firstDiffPath(a, b)).toBe("dossier.affairs[1].title");
    expect(firstDiffPath(a, a)).toBeNull();
  });

  it("repère une clé ou un élément manquant", () => {
    expect(firstDiffPath({ a: 1 }, { a: 1, b: 2 })).toBe("b");
    expect(firstDiffPath({ l: [1] }, { l: [1, 2] })).toBe("l[1]");
  });

  it("répartit l'échantillon à parts égales", () => {
    expect(splitEvenly(300, 6)).toEqual([50, 50, 50, 50, 50, 50]);
    expect(splitEvenly(8, 6)).toEqual([2, 2, 1, 1, 1, 1]);
  });

  it("valide --sample", () => {
    expect(parseArgs(["--sample", "40"])).toEqual({ sample: 40 });
    expect(parseArgs([])).toEqual({ sample: 300 });
    expect(() => parseArgs(["--sample", "0"])).toThrow();
    expect(() => parseArgs(["--bogus"])).toThrow();
  });
});
