import { describe, it, expect } from "vitest";
import {
  parseArgs,
  planRewrite,
  firstChangedLine,
  type ImpactRow,
} from "../backfill-citizen-impact-reader-role";

function row(overrides: Partial<ImpactRow> = {}): ImpactRow {
  return {
    id: "scrutin-1",
    slug: "vote-1",
    chamber: "AN",
    citizenImpact: "**De quoi s'agit-il ?**\n\nVous votez sur une loi d'urgence agricole.",
    ...overrides,
  };
}

describe("parseArgs", () => {
  it("defaults to report-only", () => {
    expect(parseArgs([]).apply).toBe(false);
  });

  it("requires --confirm-production alongside --apply", () => {
    expect(() => parseArgs(["--apply"])).toThrow(/confirm-production/);
    expect(parseArgs(["--apply", "--confirm-production"]).apply).toBe(true);
  });

  it("parses --limit, --batch and --show-diff", () => {
    expect(parseArgs(["--limit=10", "--batch=50", "--show-diff=20"])).toMatchObject({
      limit: 10,
      batch: 50,
      showDiff: 20,
    });
  });

  it("defaults batch and show-diff, leaves limit undefined", () => {
    const a = parseArgs([]);
    expect(a.batch).toBe(500);
    expect(a.showDiff).toBe(5);
    expect(a.limit).toBeUndefined();
  });

  it("rejects non-positive numeric flags", () => {
    expect(() => parseArgs(["--limit=0"])).toThrow(/--limit/);
    expect(() => parseArgs(["--batch=-1"])).toThrow(/--batch/);
    expect(() => parseArgs(["--show-diff=x"])).toThrow(/--show-diff/);
  });

  it("accepts --show-diff=0 (counts only, no samples)", () => {
    expect(parseArgs(["--show-diff=0"]).showDiff).toBe(0);
  });
});

describe("planRewrite", () => {
  it("plans a rewrite for the shipped reader-as-voter opener", () => {
    const plan = planRewrite(row());
    expect(plan).not.toBeNull();
    expect(plan!.after).toContain("Les députés ont voté sur une loi d'urgence agricole.");
    expect(plan!.after).not.toContain("Vous votez");
  });

  it("uses the row's chamber", () => {
    const plan = planRewrite(row({ chamber: "SENAT" }));
    expect(plan!.after).toContain("Les sénateurs ont voté sur");
  });

  it("returns null when the rewriter changes nothing (prefilter false positive)", () => {
    const untouched = row({
      citizenImpact: "Si vous êtes locataire, cette mesure change le calcul de votre loyer.",
    });
    expect(planRewrite(untouched)).toBeNull();
  });

  it("preserves everything outside the offending clause", () => {
    const plan = planRewrite(
      row({
        citizenImpact:
          "**Ce qui était proposé**\n\nVous votez sur un texte. **Interdire les néonicotinoïdes.**",
      })
    );
    expect(plan!.after).toContain("**Ce qui était proposé**");
    expect(plan!.after).toContain("**Interdire les néonicotinoïdes.**");
  });
});

describe("firstChangedLine", () => {
  it("reports the first differing line as a before/after pair", () => {
    const plan = planRewrite(row())!;
    expect(firstChangedLine(plan)).toEqual({
      before: "Vous votez sur une loi d'urgence agricole.",
      after: "Les députés ont voté sur une loi d'urgence agricole.",
    });
  });

  it("returns null when the two texts are identical", () => {
    expect(firstChangedLine({ id: "a", slug: null, before: "same", after: "same" })).toBeNull();
  });
});
