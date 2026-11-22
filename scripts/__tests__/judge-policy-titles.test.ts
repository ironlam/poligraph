import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestProfileRefresh } = vi.hoisted(() => ({ requestProfileRefresh: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { $disconnect: vi.fn() } }));
vi.mock("@/lib/api/anthropic", () => ({ callAnthropic: vi.fn(), extractToolUse: vi.fn() }));
vi.mock("@/services/scrutin-policy-title/substance-resolver", () => ({
  resolveSubstanceSources: vi.fn(),
}));
vi.mock("@/services/scrutin-policy-title/approval", () => ({}));
vi.mock("@/app/admin/policy-titles/approve-guard", () => ({}));
vi.mock("@/services/scrutin-policy-title/fallback-recovery", () => ({ LLM_OUTAGE_WINDOW: {} }));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({ requestProfileRefresh }));

import { refreshProfilesAfterApply, resolveActor } from "../judge-policy-titles";

const DEFAULT = "llm-judge:claude-sonnet-4-5";

describe("resolveActor", () => {
  it("garde l'acteur par défaut sans --actor", () => {
    expect(resolveActor(undefined, DEFAULT)).toBe(DEFAULT);
  });

  it("accepte un acteur préfixé par son type", () => {
    expect(resolveActor("cloud-routine:judge-script", DEFAULT)).toBe("cloud-routine:judge-script");
  });

  it("refuse un acteur vide", () => {
    expect(() => resolveActor("", DEFAULT)).toThrow("vide");
    expect(() => resolveActor("   ", DEFAULT)).toThrow("vide");
  });

  it("refuse un acteur sans préfixe « type: »", () => {
    expect(() => resolveActor("judge-script", DEFAULT)).toThrow("préfixe");
    expect(() => resolveActor(":judge-script", DEFAULT)).toThrow("préfixe");
    expect(() => resolveActor("cloud-routine:", DEFAULT)).toThrow("préfixe");
    // `--actor --dry-run` reads the next flag as the value.
    expect(() => resolveActor("--dry-run", DEFAULT)).toThrow("préfixe");
  });
});

describe("refreshProfilesAfterApply", () => {
  beforeEach(() => vi.clearAllMocks());

  const detail = [
    { scrutinId: "s1", outcome: "approved" },
    { scrutinId: "s2", outcome: "edited+approved" },
    { scrutinId: "s3", outcome: "rejected:was-approved" },
    { scrutinId: "s4", outcome: "rejected" },
    { scrutinId: "s5", outcome: "kept" },
    { scrutinId: "s6", outcome: "skip:INPUT_HASH_DRIFT" },
    { scrutinId: "s7", outcome: "edited+skip:GUARD" },
    { scrutinId: "s8", outcome: "error:boom" },
  ];

  it("demande un seul recalcul pour les titres apparus ou retirés", async () => {
    await refreshProfilesAfterApply(detail, false, requestProfileRefresh);
    expect(requestProfileRefresh).toHaveBeenCalledTimes(1);
    expect(requestProfileRefresh).toHaveBeenCalledWith(
      { scrutinIds: ["s1", "s2", "s3"] },
      "script:judge-policy-titles"
    );
  });

  it("passe par requestProfileRefresh par défaut", async () => {
    await refreshProfilesAfterApply([{ scrutinId: "s1", outcome: "approved" }], false);
    expect(requestProfileRefresh).toHaveBeenCalledTimes(1);
  });

  it("ne demande rien en dry-run", async () => {
    const dry = detail.map((d) => ({ ...d, outcome: "would:approve" }));
    expect(await refreshProfilesAfterApply(dry, true, requestProfileRefresh)).toEqual([]);
    expect(await refreshProfilesAfterApply(detail, true, requestProfileRefresh)).toEqual([]);
    expect(requestProfileRefresh).not.toHaveBeenCalled();
  });

  it("ne demande rien sans approbation", async () => {
    const none = detail.filter((d) => !["s1", "s2", "s3"].includes(d.scrutinId));
    expect(await refreshProfilesAfterApply(none, false, requestProfileRefresh)).toEqual([]);
    expect(requestProfileRefresh).not.toHaveBeenCalled();
  });
});
