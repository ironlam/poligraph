import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/import-presidential-programs.ts", "utf8");
const pipeline = readFileSync("src/services/measures/program-import/pipeline.ts", "utf8");
const shadowV6 = readFileSync("src/services/measures/program-import/shadow-v6.ts", "utf8");
const draftV6 = readFileSync("src/services/measures/program-import/draft-import-v6.ts", "utf8");

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

  it("isole V6 dans un pipeline shadow sans transition de mutation", () => {
    expect(script).toContain("assertV6ShadowReadOnly");
    expect(shadowV6).toContain('mode: "v6-shadow-read-only"');
    expect(shadowV6).not.toContain("createMeasure");
    expect(shadowV6).not.toContain("draftMeasureRevision");
    expect(shadowV6).not.toContain("publishMeasureRevision");
  });

  it("limite l'apply V6 à des créations DRAFT doublement confirmées", () => {
    expect(script).toContain("--confirm-draft-write");
    expect(draftV6).toContain("createMeasure(");
    expect(draftV6).not.toContain("publishMeasureRevision");
    expect(draftV6).not.toContain("reviewMeasureRevision");
    expect(draftV6).not.toContain("publicationStatus");
    expect(draftV6).not.toContain("updateMany");
    expect(draftV6).not.toContain("deleteMany");
  });
});
