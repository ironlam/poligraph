import { describe, it, expect } from "vitest";
import { parseArgs, planRepair, type FactCheckRow } from "../backfill-factcheck-sources";

function row(overrides: Partial<FactCheckRow> = {}): FactCheckRow {
  return {
    id: "fc-1",
    slug: "2026-06-13-vrai-ou-faux",
    source: "franceinfo",
    publicationStatus: "DRAFT",
    publishedAt: new Date("2026-06-13T00:00:00Z"),
    ...overrides,
  };
}

const NONE = new Set<string>();

describe("parseArgs", () => {
  it("defaults to report-only", () => {
    expect(parseArgs([]).apply).toBe(false);
  });

  it("requires --confirm-production alongside --apply", () => {
    expect(() => parseArgs(["--apply"])).toThrow(/confirm-production/);
    expect(parseArgs(["--apply", "--confirm-production"]).apply).toBe(true);
  });

  it("parses --batch and --show-rows", () => {
    expect(parseArgs(["--batch=50", "--show-rows=3"])).toMatchObject({ batch: 50, showRows: 3 });
  });

  it("rejects a non-positive batch", () => {
    expect(() => parseArgs(["--batch=0"])).toThrow(/--batch/);
  });
});

describe("planRepair", () => {
  it("renames a variant spelling and publishes it", () => {
    const plan = planRepair(row(), NONE);
    expect(plan).toMatchObject({
      source: { from: "franceinfo", to: "Franceinfo" },
      publicationStatus: "PUBLISHED",
      publish: true,
    });
  });

  it("leaves a row whose source is already canonical alone", () => {
    expect(planRepair(row({ source: "Franceinfo" }), NONE)).toBeNull();
    expect(planRepair(row({ source: "Snopes" }), NONE)).toBeNull();
  });

  it("renames an already published row without touching its status", () => {
    const plan = planRepair(row({ source: "De Facto", publicationStatus: "PUBLISHED" }), NONE);
    expect(plan).toMatchObject({
      source: { to: "DE FACTO" },
      publicationStatus: "PUBLISHED",
      publish: false,
    });
  });

  it("respects a moderator who unpublished the row", () => {
    const plan = planRepair(row(), new Set(["fc-1"]));
    expect(plan).toMatchObject({
      source: { to: "Franceinfo" },
      publicationStatus: "DRAFT",
      publish: false,
    });
  });

  it("renames towards a non-allow-listed label without publishing it", () => {
    // Whitespace tidying alone can change the stored string; that is a rename,
    // not a licence to publish an outlet the allow-list never accepted.
    const plan = planRepair(row({ source: "  Snopes  " }), NONE);
    expect(plan).toMatchObject({
      source: { from: "  Snopes  ", to: "Snopes" },
      publicationStatus: "DRAFT",
      publish: false,
    });
  });

  it("folds the reversed AFP spelling onto the French desk", () => {
    const plan = planRepair(row({ source: "Factuel AFP" }), NONE);
    expect(plan).toMatchObject({
      source: { to: "AFP Factuel" },
      publicationStatus: "PUBLISHED",
      publish: true,
    });
  });

  it("does not publish AFP's English desk", () => {
    expect(planRepair(row({ source: "AFP Fact Check" }), NONE)).toBeNull();
  });
});
