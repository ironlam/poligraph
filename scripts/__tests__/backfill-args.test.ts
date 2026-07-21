import { describe, it, expect } from "vitest";
import {
  parseBackfillArgs,
  selectBackfillScope,
  resolveRegenScope,
  resolveRegenBatchSize,
} from "../backfill-scrutin-dossier-477";
import type { ScrutinDossierTransition } from "@/services/sync/reconcile-scrutin-dossier/types";

describe("parseBackfillArgs", () => {
  it("defaults to dry-run", () => {
    expect(parseBackfillArgs([]).apply).toBe(false);
  });
  it("requires --confirm-production alongside --apply", () => {
    expect(() => parseBackfillArgs(["--apply"])).toThrow(/confirm-production/);
  });
  it("parses expectations and flags", () => {
    const a = parseBackfillArgs([
      "--apply",
      "--confirm-production",
      "--apply-clears",
      "--regenerate",
      "--expected-repoints=1080",
    ]);
    expect(a).toMatchObject({
      apply: true,
      applyClears: true,
      regenerate: true,
      expectedRepoints: 1080,
    });
  });
  it("parses --only-external-ids into a trimmed array", () => {
    const a = parseBackfillArgs(["--only-external-ids=a,b,c"]);
    expect(a.onlyExternalIds).toEqual(["a", "b", "c"]);
  });
  it("leaves onlyExternalIds undefined when the flag is absent", () => {
    expect(parseBackfillArgs([]).onlyExternalIds).toBeUndefined();
  });
  it("parses --limit", () => {
    expect(parseBackfillArgs(["--limit=4"]).limit).toBe(4);
  });
  it("defaults regenOnly to false and fromReport to undefined", () => {
    const a = parseBackfillArgs([]);
    expect(a.regenOnly).toBe(false);
    expect(a.fromReport).toBeUndefined();
  });
  it("parses --regen-only", () => {
    expect(parseBackfillArgs(["--regen-only"]).regenOnly).toBe(true);
  });
  it("parses --from-report=<path>", () => {
    expect(parseBackfillArgs(["--from-report=scripts/.local/report.json"]).fromReport).toBe(
      "scripts/.local/report.json"
    );
  });
  it("--regen-only with --apply still requires --confirm-production", () => {
    expect(() => parseBackfillArgs(["--regen-only", "--apply"])).toThrow(/confirm-production/);
  });
});

describe("resolveRegenScope", () => {
  it("errors when neither scope source is given", () => {
    const { errors } = resolveRegenScope({});
    expect(errors.some((e) => e.includes("scope source"))).toBe(true);
  });
  it("errors when both scope sources are given", () => {
    const { errors } = resolveRegenScope({
      onlyExternalIds: ["a"],
      fromReportTransitions: ["scrutin-1"],
    });
    expect(errors.some((e) => e.includes("mutually exclusive"))).toBe(true);
  });
  it("accepts onlyExternalIds alone", () => {
    const { errors } = resolveRegenScope({ onlyExternalIds: ["a", "b"] });
    expect(errors).toEqual([]);
  });
  it("accepts fromReportTransitions alone", () => {
    const { errors } = resolveRegenScope({ fromReportTransitions: ["scrutin-1"] });
    expect(errors).toEqual([]);
  });
  it("errors on an empty onlyExternalIds scope", () => {
    const { errors } = resolveRegenScope({ onlyExternalIds: [] });
    expect(errors.some((e) => e.includes("empty"))).toBe(true);
  });
  it("errors on an empty fromReportTransitions scope", () => {
    const { errors } = resolveRegenScope({ fromReportTransitions: [] });
    expect(errors.some((e) => e.includes("empty"))).toBe(true);
  });
});

describe("resolveRegenBatchSize", () => {
  it("prefers an explicit --regen-batch over --limit", () => {
    expect(resolveRegenBatchSize(["--regen-batch=25", "--limit=20"], 20)).toBe(25);
  });
  it("falls back to --limit when --regen-batch is absent", () => {
    expect(resolveRegenBatchSize(["--limit=20"], 20)).toBe(20);
  });
  it("defaults to 25 when neither is given", () => {
    expect(resolveRegenBatchSize([], undefined)).toBe(25);
  });
});

/** Minimal fake transition, only the fields selectBackfillScope reads. */
function fakeTransition(
  externalId: string,
  action: ScrutinDossierTransition["action"] = "REPOINT"
): ScrutinDossierTransition {
  return {
    scrutinId: `scrutin-${externalId}`,
    externalId,
    previousDossierId: "old-dossier",
    resolvedDossierId: "new-dossier",
    resolution: "SINGLE_SESSION",
    appliedDossierId: "new-dossier",
    action,
    candidateExternalIds: [],
  };
}

describe("selectBackfillScope", () => {
  it("happy path: scopes to a subset of applied transitions", () => {
    const decisions = [
      fakeTransition("a"),
      fakeTransition("b"),
      fakeTransition("c"),
      fakeTransition("d", "NOOP"),
    ];
    const applied = decisions.filter((d) => d.action !== "NOOP");
    const { scoped, excluded, errors } = selectBackfillScope(decisions, applied, {
      onlyExternalIds: ["a", "b"],
    });
    expect(errors).toEqual([]);
    expect(scoped.map((t) => t.externalId)).toEqual(["a", "b"]);
    expect(excluded.map((t) => t.externalId)).toEqual(["c"]);
  });

  it("errors on an unknown externalId not among evaluated scrutins", () => {
    const decisions = [fakeTransition("a"), fakeTransition("b")];
    const applied = decisions;
    const { errors } = selectBackfillScope(decisions, applied, {
      onlyExternalIds: ["a", "does-not-exist"],
    });
    expect(errors.some((e) => e.includes("does-not-exist"))).toBe(true);
  });

  it("errors when --only-external-ids resolves to an empty scope", () => {
    // "c" was evaluated (present in decisions) but never applied (e.g. it was
    // KEEP/NOOP), so it is known but resolves to zero applied transitions.
    const decisions = [fakeTransition("a"), fakeTransition("c", "NOOP")];
    const applied = [fakeTransition("a")];
    const { scoped, errors } = selectBackfillScope(decisions, applied, {
      onlyExternalIds: ["c"],
    });
    expect(scoped).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("errors when the in-scope count exceeds --limit", () => {
    const decisions = [fakeTransition("a"), fakeTransition("b"), fakeTransition("c")];
    const applied = decisions;
    const { errors } = selectBackfillScope(decisions, applied, { limit: 2 });
    expect(errors.some((e) => e.includes("--limit"))).toBe(true);
  });

  it("unscoped (no onlyExternalIds) passes everything through with excluded=[]", () => {
    const decisions = [fakeTransition("a"), fakeTransition("b")];
    const applied = decisions;
    const { scoped, excluded, errors } = selectBackfillScope(decisions, applied, {});
    expect(scoped).toBe(applied);
    expect(excluded).toEqual([]);
    expect(errors).toEqual([]);
  });
});
