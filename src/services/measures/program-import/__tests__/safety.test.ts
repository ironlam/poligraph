import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/import-presidential-programs.ts", "utf8");
const pipeline = readFileSync("src/services/measures/program-import/pipeline.ts", "utf8");

describe("sécurité de l'import", () => {
  it("reste en dry-run sans option apply explicite", () => {
    expect(script).toContain('process.argv.includes("--apply")');
    expect(pipeline).toContain("if (options.apply)");
  });

  it("utilise la transition métier et ne publie ni ne relit", () => {
    expect(pipeline).toContain("createMeasure(");
    expect(pipeline).not.toContain("publishMeasureRevision");
    expect(pipeline).not.toContain("reviewMeasureRevision");
    expect(pipeline).not.toContain("reviewedAt");
    expect(pipeline).not.toContain("reviewedBy");
  });

  it("attache chaque création à une source", () => {
    expect(pipeline).toContain('"PROGRAMME_CANDIDAT"');
    expect(pipeline).toContain('"PROPOSITIONS_CANDIDAT"');
    expect(pipeline).toContain('tier: "PRIMARY"');
  });
});
