import { describe, it, expect } from "vitest";
import { parseBackfillArgs, selectBackfillScope } from "../backfill-scrutin-dossier-477";
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
