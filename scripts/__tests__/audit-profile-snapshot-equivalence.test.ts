import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { firstDiffPath, parseArgs, splitEvenly } from "../audit-profile-snapshot-equivalence";

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
      "revalidateTag",
      "$executeRaw",
      "create(",
      "update(",
      "upsert(",
      "delete(",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
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
