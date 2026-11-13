import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    affair: { findMany: vi.fn() },
    politician: { findMany: vi.fn() },
  },
}));

vi.mock("@/services/affair-moderation", () => ({
  moderateAffair: vi.fn(),
  getAIRateLimitMs: vi.fn(() => 0),
}));

vi.mock("@/services/affairs/reconciliation", () => ({
  findPotentialDuplicates: vi.fn(),
}));

import { runPreflight } from "./index";
import { db } from "@/lib/db";
import { moderateAffair } from "@/services/affair-moderation";
import { findPotentialDuplicates } from "@/services/affairs/reconciliation";

describe("runPreflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty report when no DRAFT affairs exist", async () => {
    (db.affair.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.politician.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (findPotentialDuplicates as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const report = await runPreflight({ source: "manual" });

    expect(report.stats.totalDrafts).toBe(0);
    expect(report.drafts).toEqual([]);
    expect(report.duplicateGroups).toEqual([]);
    expect(report.source).toBe("manual");
    expect(report.ttlHours).toBe(24);
  });

  it("aggregates moderation, attribution, and duplicates per draft", async () => {
    const draftRow = {
      id: "a1",
      title: "Affaire François Fillon",
      description: "Le député François Fillon...",
      publicationStatus: "DRAFT",
      createdAt: new Date("2026-05-13T08:00:00Z"),
      category: "EMPLOI_FICTIF",
      status: "INSTRUCTION",
      involvement: "DIRECT",
      factsDate: null,
      startDate: null,
      verdictDate: null,
      court: null,
      sentence: null,
      politicianId: "p1",
      politician: {
        id: "p1",
        slug: "francois-fillon",
        fullName: "François Fillon",
        normalizedLastName: "fillon",
      },
      sources: [],
      events: [],
    };
    // First call loads DRAFT affairs, second call loads PUBLISHED titles
    (db.affair.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: { where?: { publicationStatus?: string } }) =>
        args?.where?.publicationStatus === "PUBLISHED"
          ? [{ politicianId: "p1", title: "Affaire déjà publiée" }]
          : [draftRow]
    );
    (db.politician.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "p1", fullName: "François Fillon", normalizedLastName: "fillon" },
    ]);
    (moderateAffair as ReturnType<typeof vi.fn>).mockResolvedValue({
      recommendation: "PUBLISH",
      issues: [],
      confidence: 90,
      correctedInvolvement: "VICTIM",
    });
    (findPotentialDuplicates as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const report = await runPreflight({ source: "manual" });

    expect(report.stats.totalDrafts).toBe(1);
    expect(report.drafts[0]!.id).toBe("a1");
    expect(report.drafts[0]!.preflight.moderationRecommendation).toBe("PUBLISH");
    expect(report.drafts[0]!.preflight.attribution.confidence).toBe("STRONG");
    expect(report.drafts[0]!.preflight.duplicateOf).toEqual([]);
    expect(report.stats.autoPublishCandidates).toBe(1);

    // Published titles of the same politician are passed for duplicate detection
    expect(moderateAffair).toHaveBeenCalledWith(
      expect.objectContaining({ existingAffairTitles: ["Affaire déjà publiée"] })
    );
    // The suggested involvement surfaces in the report
    expect(report.drafts[0]!.preflight.correctedInvolvement).toBe("VICTIM");
  });

  it("links duplicates from findPotentialDuplicates into per-draft duplicateOf", async () => {
    (db.affair.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "a1",
        title: "X",
        description: "",
        publicationStatus: "DRAFT",
        createdAt: new Date(),
        category: "AUTRE",
        status: "INSTRUCTION",
        involvement: "DIRECT",
        factsDate: null,
        startDate: null,
        verdictDate: null,
        court: null,
        sentence: null,
        politician: { id: "p1", slug: "x", fullName: "X Y", normalizedLastName: "y" },
        sources: [],
        events: [],
      },
      {
        id: "a2",
        title: "X",
        description: "",
        publicationStatus: "DRAFT",
        createdAt: new Date(),
        category: "AUTRE",
        status: "INSTRUCTION",
        involvement: "DIRECT",
        factsDate: null,
        startDate: null,
        verdictDate: null,
        court: null,
        sentence: null,
        politician: { id: "p1", slug: "x", fullName: "X Y", normalizedLastName: "y" },
        sources: [],
        events: [],
      },
    ]);
    (db.politician.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "p1", fullName: "X Y", normalizedLastName: "y" },
    ]);
    (moderateAffair as ReturnType<typeof vi.fn>).mockResolvedValue({
      recommendation: "NEEDS_REVIEW",
      issues: [],
      confidence: 50,
    });
    (findPotentialDuplicates as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        affairA: { id: "a1", title: "X", sources: [] },
        affairB: { id: "a2", title: "X", sources: [] },
        confidence: "HIGH",
        matchedBy: "title",
        score: 0.96,
      },
    ]);

    const report = await runPreflight({ source: "manual" });

    expect(report.drafts.find((d) => d.id === "a1")?.preflight.duplicateOf).toEqual(["a2"]);
    expect(report.drafts.find((d) => d.id === "a2")?.preflight.duplicateOf).toEqual(["a1"]);
    expect(report.duplicateGroups).toHaveLength(1);
    expect(report.duplicateGroups[0]!.affairIds.sort()).toEqual(["a1", "a2"]);
    expect(report.duplicateGroups[0]!.autoMergeEligible).toBe(true);
  });

  it("isolates moderateAffair failures and continues the batch", async () => {
    (db.affair.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "a1",
        title: "X",
        description: "",
        publicationStatus: "DRAFT",
        createdAt: new Date(),
        category: "AUTRE",
        status: "INSTRUCTION",
        involvement: "DIRECT",
        factsDate: null,
        startDate: null,
        verdictDate: null,
        court: null,
        sentence: null,
        politician: { id: "p1", slug: "x", fullName: "X Y", normalizedLastName: "y" },
        sources: [],
        events: [],
      },
    ]);
    (db.politician.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "p1", fullName: "X Y", normalizedLastName: "y" },
    ]);
    (moderateAffair as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Rate limit"));
    (findPotentialDuplicates as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const report = await runPreflight({ source: "manual" });

    expect(report.drafts).toHaveLength(1);
    expect(report.drafts[0]!.preflight.moderationRecommendation).toBe("NEEDS_REVIEW");
    expect(report.drafts[0]!.preflight.moderationIssues).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("skipModeration : aucun appel au modèle, aucun bruit, chaque brouillon en NEEDS_REVIEW", async () => {
    // With the provider out of credit, the nightly run logged one failure per draft for a
    // report whose AI column could only ever be the safe default anyway.
    (db.affair.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "a1",
        title: "X",
        description: "",
        publicationStatus: "DRAFT",
        createdAt: new Date(),
        category: "AUTRE",
        status: "INSTRUCTION",
        involvement: "DIRECT",
        factsDate: null,
        startDate: null,
        verdictDate: null,
        court: null,
        sentence: null,
        politician: { id: "p1", slug: "x", fullName: "X Y", normalizedLastName: "y" },
        sources: [],
        events: [],
      },
    ]);
    (db.politician.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "p1", fullName: "X Y", normalizedLastName: "y" },
    ]);
    (findPotentialDuplicates as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const report = await runPreflight({ source: "cron", skipModeration: true });

    expect(moderateAffair).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    expect(report.drafts).toHaveLength(1);
    expect(report.drafts[0]!.preflight.moderationRecommendation).toBe("NEEDS_REVIEW");
    expect(report.stats.autoPublishCandidates).toBe(0);
    // The checks that need no model still run.
    expect(findPotentialDuplicates).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
