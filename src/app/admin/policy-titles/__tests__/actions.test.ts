import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { toPublicTitleView } from "@/lib/votes/to-public-title-view";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const PFX = "TEST_ACT_";

// Auth: actions call isAuthenticated() — force true for the whole suite.
vi.mock("@/lib/auth", () => ({
  isAuthenticated: () => Promise.resolve(true),
}));

// revalidatePath throws outside a Next request context; spy it under vitest so we
// can assert public revalidation (Plan 6).
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

// Mock ONLY generateScrutinPolicyTitle; keep buildInputHashInput real (actions
// and seeding both need the genuine hash builder).
const mockGenerate = vi.fn();
vi.mock("@/services/scrutin-policy-title", async (orig) => {
  const actual = (await orig()) as typeof import("@/services/scrutin-policy-title");
  return {
    ...actual,
    generateScrutinPolicyTitle: (...a: unknown[]) => mockGenerate(...a),
  };
});

let db: typeof import("@/lib/db").db;
let actions: typeof import("../actions");
let buildInputHashInput: typeof import("@/services/scrutin-policy-title").buildInputHashInput;
let computeInputHash: typeof import("@/services/scrutin-policy-title/input-hash").computeInputHash;
let resolveSubstanceSources: typeof import("@/services/scrutin-policy-title/substance-resolver").resolveSubstanceSources;

// Grounded summary: title quotes appear here verbatim so EvidenceGrounding passes.
const SUMMARY =
  "Le sous-amendement supprime une dérogation aux seuils de qualité de l'eau imposés aux exploitations agricoles.";

interface SeedOpts {
  suffix: string;
  policyTitle: string | null;
  policySubtitle?: string | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  status?: "DRAFT" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED" | "STALE";
  evidenceQuote?: string;
}

interface Seeded {
  scrutinId: string;
  amendmentId: string;
  policyTitleId: string;
}

async function seedRow(opts: SeedOpts): Promise<Seeded> {
  const ext = `${PFX}${opts.suffix}`;
  const amendment = await db.amendment.create({
    data: {
      externalId: `${ext}_AMD`,
      number: "100",
      status: "ADOPTE",
      legislature: 17,
      chamber: "AN",
      summary: SUMMARY,
    },
  });

  const scrutin = await db.scrutin.create({
    data: {
      externalId: `${ext}_S`,
      title: "Sous-amendement n° 100 sur la qualité de l'eau",
      votingDate: new Date("2026-03-10T00:00:00Z"),
      legislature: 17,
      chamber: "AN",
      votesFor: 50,
      votesAgainst: 20,
      votesAbstain: 5,
      result: "ADOPTED",
      sourceUrl: "https://www.assemblee-nationale.fr/test",
      amendmentLinks: {
        create: [{ amendmentId: amendment.id, role: "SUB_AMENDMENT", source: "TITLE_REGEX" }],
      },
    },
  });

  const label = "Sous-amendement n°100";
  const resolved = await resolveSubstanceSources(scrutin.id);
  const correctHash = computeInputHash(
    buildInputHashInput(
      {
        title: scrutin.title,
        sourceUrl: scrutin.sourceUrl,
        amendmentLinks: [{ role: "SUB_AMENDMENT", amendment: { id: amendment.id, number: "100" } }],
      },
      label,
      resolved.blocks
    )
  );

  const row = await db.scrutinPolicyTitle.create({
    data: {
      scrutinId: scrutin.id,
      officialTitleSnapshot: scrutin.title,
      officialSourceUrl: scrutin.sourceUrl,
      inputHash: correctHash,
      policyTitle: opts.policyTitle,
      policySubtitle: opts.policySubtitle ?? null,
      proceduralLabel: label,
      confidence: opts.confidence ?? "HIGH",
      generationSource: "LLM",
      status: opts.status ?? "DRAFT",
      qualitySignals: { substanceDepth: "subAmendment", evidenceCoverage: 0.6 },
      evidenceQuotes: [
        {
          sourceType: "subAmendment",
          sourceId: amendment.id,
          field: "Amendment.summary",
          quote: opts.evidenceQuote ?? "supprime une dérogation aux seuils de qualité de l'eau",
        },
      ],
      generationWarnings: [],
      currentWarnings: [],
    },
  });

  return { scrutinId: scrutin.id, amendmentId: amendment.id, policyTitleId: row.id };
}

async function cleanup() {
  await db.scrutinAmendment.deleteMany({
    where: { scrutin: { externalId: { startsWith: PFX } } },
  });
  await db.scrutinPolicyTitleRevision.deleteMany({
    where: { policyTitle: { scrutin: { externalId: { startsWith: PFX } } } },
  });
  await db.scrutinPolicyTitle.deleteMany({
    where: { scrutin: { externalId: { startsWith: PFX } } },
  });
  await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX } } });
  await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX } } });
}

describeIfDb("policy-title server actions", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    actions = await import("../actions");
    ({ buildInputHashInput } = await import("@/services/scrutin-policy-title"));
    ({ computeInputHash } = await import("@/services/scrutin-policy-title/input-hash"));
    ({ resolveSubstanceSources } =
      await import("@/services/scrutin-policy-title/substance-resolver"));
    await cleanup();
  });

  beforeEach(() => {
    mockGenerate.mockReset();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("approves a clean DRAFT/HIGH row with matching evidence", async () => {
    const { scrutinId, policyTitleId } = await seedRow({
      suffix: "CLEAN",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
    });

    await actions.approveScrutinPolicyTitle(scrutinId);

    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(row?.status).toBe("APPROVED");
    expect(row?.reviewedBy).toBe("admin");
    expect(row?.reviewedAt).not.toBeNull();

    const rev = await db.scrutinPolicyTitleRevision.findFirst({
      where: { policyTitleId, action: "approved" },
    });
    expect(rev).not.toBeNull();
  });

  it("blocks approval on an overridable warning, then approves with override", async () => {
    // A long (>=91 char, <=140) title produces a LENGTH warn (no blocker).
    const longTitle =
      "Supprimer une dérogation aux seuils de qualité de l'eau imposés aux exploitations agricoles concernées";
    const { scrutinId, policyTitleId } = await seedRow({
      suffix: "WARN",
      policyTitle: longTitle,
    });

    await expect(actions.approveScrutinPolicyTitle(scrutinId)).rejects.toMatchObject({
      name: "ApproveBlockedError",
      codes: ["WARNINGS_REQUIRE_OVERRIDE"],
    });

    let row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(row?.status).not.toBe("APPROVED");

    await actions.approveWithOverrideScrutinPolicyTitle(scrutinId, "Titre long mais clair");

    row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(row?.status).toBe("APPROVED");

    const rev = await db.scrutinPolicyTitleRevision.findFirst({
      where: { policyTitleId, action: "approved" },
      orderBy: { createdAt: "desc" },
    });
    const snap = rev?.snapshot as { approvalOverride?: { reason?: string } } | null;
    expect(snap?.approvalOverride?.reason).toBe("Titre long mais clair");
  });

  it("rejects approveWithOverride when reason is empty", async () => {
    const { scrutinId } = await seedRow({
      suffix: "EMPTYREASON",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
    });
    await expect(actions.approveWithOverrideScrutinPolicyTitle(scrutinId, "   ")).rejects.toThrow();
  });

  it("blocks a VALIDATION_BLOCKER title (ARTICLE_ONLY) even with override", async () => {
    const { scrutinId } = await seedRow({
      suffix: "ARTICLE",
      policyTitle: "Initial",
    });
    // Edit to the article-only title (hard validation blocker).
    await actions.editScrutinPolicyTitle(scrutinId, {
      policyTitle: "Rétablir l'article 8 du projet de loi agricole",
      policySubtitle: null,
    });

    await expect(actions.approveScrutinPolicyTitle(scrutinId)).rejects.toMatchObject({
      codes: ["VALIDATION_BLOCKER"],
    });
    await expect(
      actions.approveWithOverrideScrutinPolicyTitle(scrutinId, "je force")
    ).rejects.toMatchObject({ codes: ["VALIDATION_BLOCKER"] });

    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(row?.status).not.toBe("APPROVED");
  });

  it("blocks EMPTY_OR_NULL_TITLE even with override", async () => {
    const { scrutinId } = await seedRow({
      suffix: "NULLTITLE",
      policyTitle: null,
    });
    await expect(actions.approveScrutinPolicyTitle(scrutinId)).rejects.toMatchObject({
      codes: expect.arrayContaining(["EMPTY_OR_NULL_TITLE"]),
    });
    await expect(
      actions.approveWithOverrideScrutinPolicyTitle(scrutinId, "force")
    ).rejects.toMatchObject({ codes: expect.arrayContaining(["EMPTY_OR_NULL_TITLE"]) });
  });

  it("flips to STALE and throws INPUT_DRIFT when the source changes after seeding", async () => {
    const { scrutinId, amendmentId } = await seedRow({
      suffix: "DRIFT",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
    });
    // Mutate the amendment so the recomputed input hash no longer matches.
    await db.amendment.update({
      where: { id: amendmentId },
      data: { summary: "Texte totalement différent et sans aucun rapport." },
    });

    await expect(actions.approveScrutinPolicyTitle(scrutinId)).rejects.toMatchObject({
      codes: expect.arrayContaining(["INPUT_DRIFT"]),
    });

    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(row?.status).toBe("STALE");
  });

  it("rejects a HIGH row without reason, accepts with reason", async () => {
    const { scrutinId, policyTitleId } = await seedRow({
      suffix: "REJECT",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
      confidence: "HIGH",
    });

    await expect(actions.rejectScrutinPolicyTitle(scrutinId, "")).rejects.toThrow();

    await actions.rejectScrutinPolicyTitle(scrutinId, "Hors sujet");
    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(row?.status).toBe("REJECTED");

    const rev = await db.scrutinPolicyTitleRevision.findFirst({
      where: { policyTitleId, action: "rejected" },
      orderBy: { createdAt: "desc" },
    });
    const snap = rev?.snapshot as { reason?: string } | null;
    expect(snap?.reason).toBe("Hors sujet");
  });

  it("blocks REJECTED_NOT_REVISED, clears after an edit", async () => {
    const { scrutinId } = await seedRow({
      suffix: "REJREVISED",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
      confidence: "HIGH",
    });

    await actions.rejectScrutinPolicyTitle(scrutinId, "Hors sujet");

    await expect(actions.approveScrutinPolicyTitle(scrutinId)).rejects.toMatchObject({
      codes: ["REJECTED_NOT_REVISED"],
    });

    // An edit writes a newer "edited" revision; REJECTED_NOT_REVISED no longer fires.
    await actions.editScrutinPolicyTitle(scrutinId, {
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
      policySubtitle: null,
    });

    // status is still REJECTED but the latest revision is "edited" → guard runs
    // and the row approves cleanly.
    await expect(actions.approveScrutinPolicyTitle(scrutinId)).resolves.toBeUndefined();
  });

  it("edit sets editedFromGenerated, writes 'edited' revision, recomputes warnings, keeps status", async () => {
    const { scrutinId, policyTitleId } = await seedRow({
      suffix: "EDIT",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
    });

    const before = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(before?.editedFromGenerated).toBe(false);

    await actions.editScrutinPolicyTitle(scrutinId, {
      policyTitle:
        "Supprimer une dérogation aux seuils de qualité de l'eau imposés aux exploitations agricoles concernées",
      policySubtitle: "Un sous-titre",
    });

    const after = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(after?.editedFromGenerated).toBe(true);
    expect(after?.status).toBe(before?.status);
    // The long edited title produces a LENGTH warn now stored.
    const warnings = (after?.currentWarnings ?? []) as { code: string }[];
    expect(warnings.some((w) => w.code === "LENGTH")).toBe(true);

    const rev = await db.scrutinPolicyTitleRevision.findFirst({
      where: { policyTitleId, action: "edited" },
      orderBy: { createdAt: "desc" },
    });
    const snap = rev?.snapshot as { previousPolicyTitle?: string } | null;
    expect(snap?.previousPolicyTitle).toBe(
      "Supprimer une dérogation aux seuils de qualité de l'eau"
    );
  });

  it("regenerate: success path ends idle, writes regenerate_requested, never APPROVED", async () => {
    const { scrutinId, policyTitleId } = await seedRow({
      suffix: "REGEN_OK",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
    });
    mockGenerate.mockResolvedValue({ outcome: "generated", written: true });

    await actions.regenerateScrutinPolicyTitle(scrutinId);

    expect(mockGenerate).toHaveBeenCalledWith(scrutinId, expect.objectContaining({ force: true }));
    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(row?.regenerationStatus).toBe("idle");
    expect(row?.status).not.toBe("APPROVED");

    const rev = await db.scrutinPolicyTitleRevision.findFirst({
      where: { policyTitleId, action: "regenerate_requested" },
    });
    expect(rev).not.toBeNull();
  });

  it("regenerate: throwing generator ends failed with the error captured", async () => {
    const { scrutinId } = await seedRow({
      suffix: "REGEN_FAIL",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
    });
    mockGenerate.mockRejectedValue(new Error("boom"));

    await actions.regenerateScrutinPolicyTitle(scrutinId);

    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(row?.regenerationStatus).toBe("failed");
    expect(row?.regenerationError).toContain("boom");
    expect(row?.status).not.toBe("APPROVED");
  });

  it("only edit/reject/regenerate (non-approve) actions NEVER set APPROVED", async () => {
    const { scrutinId } = await seedRow({
      suffix: "NOAPPROVE",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
    });
    mockGenerate.mockResolvedValue({ outcome: "generated", written: true });

    await actions.editScrutinPolicyTitle(scrutinId, {
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
      policySubtitle: null,
    });
    expect((await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } }))?.status).not.toBe(
      "APPROVED"
    );

    await actions.regenerateScrutinPolicyTitle(scrutinId);
    expect((await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } }))?.status).not.toBe(
      "APPROVED"
    );

    await actions.rejectScrutinPolicyTitle(scrutinId, "raison");
    expect((await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } }))?.status).toBe(
      "REJECTED"
    );
  });

  // ── Public revalidation + visibility transitions (Plan 6.8) ───────────────
  async function publicMode(scrutinId: string): Promise<"policy" | "official"> {
    const s = await db.scrutin.findUnique({
      where: { id: scrutinId },
      select: {
        title: true,
        votingDate: true,
        result: true,
        chamber: true,
        sourceUrl: true,
        policyTitle: {
          select: {
            status: true,
            policyTitle: true,
            policySubtitle: true,
            officialSourceUrl: true,
            proceduralLabel: true,
          },
        },
      },
    });
    return toPublicTitleView(s!).mode;
  }

  async function revalidateSpy() {
    return vi.mocked((await import("next/cache")).revalidatePath);
  }

  it("DRAFT → APPROVED triggers public revalidation and resolves to policy mode", async () => {
    const { scrutinId } = await seedRow({
      suffix: "PUB_APPROVE",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
    });
    const spy = await revalidateSpy();
    spy.mockClear();
    await actions.approveScrutinPolicyTitle(scrutinId);
    expect(spy).toHaveBeenCalledWith("/parlement/votes");
    expect(await publicMode(scrutinId)).toBe("policy");
  });

  it("APPROVED → REJECTED triggers public revalidation and reverts to official (hide)", async () => {
    const { scrutinId } = await seedRow({
      suffix: "PUB_REJECT",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
      status: "APPROVED",
    });
    const spy = await revalidateSpy();
    spy.mockClear();
    await actions.rejectScrutinPolicyTitle(scrutinId, "raison");
    expect(spy).toHaveBeenCalledWith("/parlement/votes");
    expect(await publicMode(scrutinId)).toBe("official");
  });

  it("APPROVED → edited title triggers public revalidation (stays policy with new text)", async () => {
    const { scrutinId } = await seedRow({
      suffix: "PUB_EDIT",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
      status: "APPROVED",
    });
    const spy = await revalidateSpy();
    spy.mockClear();
    await actions.editScrutinPolicyTitle(scrutinId, {
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau (révisé)",
      policySubtitle: null,
    });
    expect(spy).toHaveBeenCalledWith("/parlement/votes");
    expect(await publicMode(scrutinId)).toBe("policy");
  });

  it("APPROVED → regenerate triggers public revalidation and hides (no longer policy)", async () => {
    const { scrutinId } = await seedRow({
      suffix: "PUB_REGEN",
      policyTitle: "Supprimer une dérogation aux seuils de qualité de l'eau",
      status: "APPROVED",
    });
    // Generator mocked: it does not re-write the row, but the action must still
    // revalidate the public surfaces because the row WAS approved.
    mockGenerate.mockResolvedValue({ outcome: "generated", written: true });
    const spy = await revalidateSpy();
    spy.mockClear();
    await actions.regenerateScrutinPolicyTitle(scrutinId);
    expect(spy).toHaveBeenCalledWith("/parlement/votes");
  });
});
