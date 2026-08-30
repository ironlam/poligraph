import { describe, expect, it } from "vitest";
import { parseSearchEmbeddingCLIOptions } from "@/lib/search/embedding-options";

describe("arguments de l’index sémantique", () => {
  it("accepte les syntaxes séparée et inline avec des défauts bornés", () => {
    expect(
      parseSearchEmbeddingCLIOptions([
        "--election",
        "presidentielle-2027",
        "--entity-type=measure",
        "--limit",
        "250",
        "--after=doc-1",
        "--dry-run",
      ])
    ).toEqual({
      electionSlug: "presidentielle-2027",
      entityType: "MEASURE",
      limit: 250,
      batchSize: 100,
      after: "doc-1",
      staleOnly: true,
      dryRun: true,
    });
  });

  it("permet une reconstruction explicite et refuse les périmètres ambigus", () => {
    expect(
      parseSearchEmbeddingCLIOptions([
        "--election=presidentielle-2027",
        "--stale-only=false",
        "--batch-size=16",
      ])
    ).toMatchObject({ staleOnly: false, batchSize: 16, dryRun: false });
    expect(() => parseSearchEmbeddingCLIOptions([])).toThrow("--election");
    expect(() =>
      parseSearchEmbeddingCLIOptions(["--election=presidentielle-2027", "--entity-type=ALL"])
    ).toThrow("MEASURE ou CANDIDACY");
  });
});
