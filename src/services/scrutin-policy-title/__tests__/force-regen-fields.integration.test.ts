import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from "vitest";

// Mock BEFORE importing the orchestrator.
const mockCall = vi.fn();
vi.mock("@/lib/api/mistral", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/mistral")>();
  return { ...actual, callMistral: (...a: unknown[]) => mockCall(...a) };
});

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

let db: typeof import("@/lib/db").db;
let generateScrutinPolicyTitle: typeof import("@/services/scrutin-policy-title").generateScrutinPolicyTitle;

const PFX = "TEST_PT_FRF_";
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

let linkedScrutinId: string;
let subAmendmentId: string;

const goodLlmJson = JSON.stringify({
  policyTitle: "Limiter les dérogations aux seuils de qualité de l'eau",
  policySubtitle: "Ce sous-amendement supprime une exonération.",
  evidenceQuotes: [
    {
      sourceType: "subAmendment",
      sourceId: "WILL_REPLACE",
      field: "Amendment.summary",
      quote: "Le présent sous-amendement supprime une exonération.",
    },
  ],
  selfConfidence: "HIGH",
  rationale: "Dispositif explicite.",
});

function mistralResponse(content: string) {
  return { choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] };
}

/**
 * Seeds (or re-seeds) the scrutin's ScrutinPolicyTitle row as an old, human-reviewed
 * APPROVED title: generatedAt 60 days ago, reviewedAt/reviewedBy set, edited by a
 * human, and left mid-flight by a previous failed regeneration attempt. This is the
 * exact shape of the ~1,080 rows the #477 remediation force-regenerates.
 */
async function seedOldApprovedTitle(): Promise<string> {
  await db.scrutinPolicyTitle.deleteMany({ where: { scrutinId: linkedScrutinId } });
  const row = await db.scrutinPolicyTitle.create({
    data: {
      scrutinId: linkedScrutinId,
      officialTitleSnapshot: "le sous-amendement n° 2368 ...",
      officialSourceUrl: "https://www.assemblee-nationale.fr/dyn/17/scrutins/test-pt-frf-s1",
      inputHash: "0".repeat(64),
      policyTitle: "Ancien titre déjà approuvé",
      policySubtitle: "Ancien sous-titre.",
      proceduralLabel: "Sous-amendement n°2368",
      confidence: "HIGH",
      qualitySignals: {},
      generationSource: "LLM",
      modelVersion: "mistral-large-latest@2026-05-01",
      promptVersion: "policy-title-v1",
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedBy: "moderator@poligraph.fr",
      editedFromGenerated: true,
      regenerationStatus: "failed",
      regenerationError: "previous regeneration attempt crashed",
      generatedAt: new Date(Date.now() - SIXTY_DAYS_MS),
    },
  });
  return row.id;
}

describeIfDb("forced regeneration resets age/review fields", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ generateScrutinPolicyTitle } = await import("@/services/scrutin-policy-title"));
    await db.scrutinAmendment.deleteMany({
      where: { amendment: { externalId: { startsWith: PFX } } },
    });
    await db.scrutinPolicyTitle.deleteMany({
      where: { scrutin: { externalId: { startsWith: PFX } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.legislativeDossier.deleteMany({ where: { externalId: `${PFX}DLR` } });

    const dossier = await db.legislativeDossier.create({
      data: {
        externalId: `${PFX}DLR`,
        slug: `${PFX}dossier`,
        title: "Test dossier agricole (force regen)",
        status: "EN_COURS",
      },
    });

    const parent = await db.amendment.create({
      data: {
        externalId: `${PFX}2058`,
        number: "2058",
        dossierId: dossier.id,
        status: "ADOPTE",
        legislature: 17,
        chamber: "AN",
        content: "<p>Contenu du parent 2058.</p>",
        summary: "<p>Expos&#xE9; du parent.</p>",
      },
    });
    const sub = await db.amendment.create({
      data: {
        externalId: `${PFX}2368`,
        number: "2368",
        dossierId: dossier.id,
        status: "ADOPTE",
        legislature: 17,
        chamber: "AN",
        content: "<p>Supprime la d&#xE9;rogation aux seuils de qualit&#xE9; de l'eau.</p>",
        summary: "<p>Le pr&#xE9;sent sous-amendement supprime une exon&#xE9;ration.</p>",
        parentAmendmentId: parent.id,
      },
    });
    subAmendmentId = sub.id;

    const linkedScrutin = await db.scrutin.create({
      data: {
        externalId: `${PFX}S1`,
        title: "le sous-amendement n° 2368 ...",
        sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/scrutins/test-pt-frf-s1",
        votingDate: new Date(),
        legislature: 17,
        chamber: "AN",
        votesFor: 1,
        votesAgainst: 0,
        votesAbstain: 0,
        result: "ADOPTED",
        dossierLegislatifId: dossier.id,
        amendmentLinks: {
          create: [
            { amendmentId: sub.id, role: "SUB_AMENDMENT", source: "TITLE_REGEX" },
            { amendmentId: parent.id, role: "PARENT_AMENDMENT", source: "TITLE_REGEX" },
          ],
        },
      },
    });
    linkedScrutinId = linkedScrutin.id;
  });

  afterAll(async () => {
    await db.scrutinAmendment.deleteMany({
      where: { amendment: { externalId: { startsWith: PFX } } },
    });
    await db.scrutinPolicyTitle.deleteMany({
      where: { scrutin: { externalId: { startsWith: PFX } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.legislativeDossier.deleteMany({ where: { externalId: `${PFX}DLR` } });
  });

  beforeEach(async () => {
    mockCall.mockReset();
    await seedOldApprovedTitle();
  });

  it("resets generatedAt so an old regenerated DRAFT is not immediately auto-approvable", async () => {
    const before = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { scrutinId: linkedScrutinId },
    });
    expect(before.status).toBe("APPROVED");
    expect(before.generatedAt.getTime()).toBeLessThan(Date.now() - SIXTY_DAYS_MS + 60_000);

    mockCall.mockResolvedValue(
      mistralResponse(goodLlmJson.replace("WILL_REPLACE", subAmendmentId))
    );
    const r = await generateScrutinPolicyTitle(linkedScrutinId, {
      force: true,
      modelVersionDate: "2026-07-21",
    });
    expect(r.written).toBe(true);

    const after = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { scrutinId: linkedScrutinId },
    });
    expect(after.id).toBe(before.id); // overwritten in place, not a new row
    expect(after.status).toBe("DRAFT"); // generator never re-writes APPROVED
    expect(after.generatedAt.getTime()).toBeGreaterThan(Date.now() - 3600_000);
    expect(after.reviewedAt).toBeNull();
    expect(after.reviewedBy).toBeNull();
    expect(after.editedFromGenerated).toBe(false);
    expect(after.regenerationStatus).toBe("idle");
    expect(after.regenerationError).toBeNull();
  });

  it("createRevision default true → writes a 'regenerated' revision snapshotting the prior APPROVED state", async () => {
    const before = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { scrutinId: linkedScrutinId },
    });

    mockCall.mockResolvedValue(
      mistralResponse(goodLlmJson.replace("WILL_REPLACE", subAmendmentId))
    );
    await generateScrutinPolicyTitle(linkedScrutinId, {
      force: true,
      modelVersionDate: "2026-07-21",
    });

    const revisions = await db.scrutinPolicyTitleRevision.findMany({
      where: { policyTitleId: before.id, action: "regenerated" },
    });
    expect(revisions).toHaveLength(1);
    const snapshot = revisions[0]!.snapshot as { status?: string; policyTitle?: string | null };
    expect(snapshot.status).toBe("APPROVED");
    expect(snapshot.policyTitle).toBe("Ancien titre déjà approuvé");
  });

  it("createRevision: false → forced overwrite skips the revision snapshot (caller already recorded it)", async () => {
    const before = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { scrutinId: linkedScrutinId },
    });

    mockCall.mockResolvedValue(
      mistralResponse(goodLlmJson.replace("WILL_REPLACE", subAmendmentId))
    );
    const r = await generateScrutinPolicyTitle(linkedScrutinId, {
      force: true,
      createRevision: false,
      modelVersionDate: "2026-07-21",
    });
    expect(r.written).toBe(true);

    const revisions = await db.scrutinPolicyTitleRevision.findMany({
      where: { policyTitleId: before.id },
    });
    expect(revisions).toHaveLength(0);

    // The field resets still apply; only the revision snapshot is skipped.
    const after = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { scrutinId: linkedScrutinId },
    });
    expect(after.status).toBe("DRAFT");
    expect(after.generatedAt.getTime()).toBeGreaterThan(Date.now() - 3600_000);
    expect(after.reviewedAt).toBeNull();
  });
});
