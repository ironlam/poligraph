import { it, expect, afterAll, beforeAll, beforeEach, vi } from "vitest";

// Mock BEFORE importing the orchestrator.
const mockCall = vi.fn();
vi.mock("@/lib/api/mistral", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/mistral")>();
  return { ...actual, callMistral: (...a: unknown[]) => mockCall(...a) };
});

import { describeIfLocalDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let generateScrutinPolicyTitle: typeof import("@/services/scrutin-policy-title").generateScrutinPolicyTitle;

const PFX = "TEST_PT9_";
let linkedScrutinId: string;
let emptyScrutinId: string;
let unlinkedScrutinId: string;
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

describeIfLocalDb("generateScrutinPolicyTitle", () => {
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
        title: "Test dossier agricole",
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
        sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/scrutins/test-pt9-s1",
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

    const emptyAmd = await db.amendment.create({
      data: {
        externalId: `${PFX}EMPTY`,
        number: "9",
        dossierId: dossier.id,
        status: "DEPOSE",
        legislature: 17,
        chamber: "AN",
        content: null,
        summary: null,
      },
    });
    const emptyScrutin = await db.scrutin.create({
      data: {
        externalId: `${PFX}S2`,
        title: "l'amendement n° 9 ...",
        sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/scrutins/test-pt9-s2",
        votingDate: new Date(),
        legislature: 17,
        chamber: "AN",
        votesFor: 1,
        votesAgainst: 0,
        votesAbstain: 0,
        result: "ADOPTED",
        dossierLegislatifId: dossier.id,
        amendmentLinks: {
          create: [{ amendmentId: emptyAmd.id, role: "PRINCIPAL", source: "TITLE_REGEX" }],
        },
      },
    });
    emptyScrutinId = emptyScrutin.id;

    const unlinkedScrutin = await db.scrutin.create({
      data: {
        externalId: `${PFX}S3`,
        title: "le projet de loi agricole ...",
        sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/scrutins/test-pt9-s3",
        votingDate: new Date(),
        legislature: 17,
        chamber: "AN",
        votesFor: 1,
        votesAgainst: 0,
        votesAbstain: 0,
        result: "ADOPTED",
        dossierLegislatifId: dossier.id,
      },
    });
    unlinkedScrutinId = unlinkedScrutin.id;
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

  beforeEach(() => {
    mockCall.mockReset();
  });

  it("happy path → DRAFT row, generationSource LLM, grounded title", async () => {
    mockCall.mockResolvedValue(
      mistralResponse(goodLlmJson.replace("WILL_REPLACE", subAmendmentId))
    );
    const r = await generateScrutinPolicyTitle(linkedScrutinId, { modelVersionDate: "2026-06-03" });
    expect(r.outcome).toBe("generated");
    expect(r.status).toBe("DRAFT");
    expect(r.written).toBe(true);
    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId: linkedScrutinId } });
    expect(row?.status).toBe("DRAFT");
    expect(row?.generationSource).toBe("LLM");
    expect(row?.policyTitle).toContain("Limiter");
    expect(row?.officialTitleSnapshot).toBeTruthy();
    expect(row?.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.modelVersion).toContain("mistral-large-latest@2026-06-03");
  });

  it("ARTICLE_ONLY title from LLM → NEEDS_REVIEW with a blocker", async () => {
    mockCall.mockResolvedValue(
      mistralResponse(
        JSON.stringify({
          policyTitle: "Rétablir l'article 8 du projet de loi agricole",
          policySubtitle: null,
          evidenceQuotes: [
            {
              sourceType: "subAmendment",
              sourceId: subAmendmentId,
              field: "Amendment.summary",
              quote: "Le présent sous-amendement supprime une exonération.",
            },
          ],
          selfConfidence: "HIGH",
          rationale: "x",
        })
      )
    );
    const r = await generateScrutinPolicyTitle(linkedScrutinId, {
      force: true,
      modelVersionDate: "2026-06-03",
    });
    expect(r.status).toBe("NEEDS_REVIEW");
    expect(r.warnings.some((w) => w.severity === "blocker")).toBe(true);
  });

  it("no-substance scrutin → FALLBACK row, NO LLM call", async () => {
    const r = await generateScrutinPolicyTitle(emptyScrutinId, { modelVersionDate: "2026-06-03" });
    expect(r.outcome).toBe("fallback");
    expect(r.status).toBe("NEEDS_REVIEW");
    expect(r.policyTitle).toBeNull();
    expect(mockCall).not.toHaveBeenCalled();
    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId: emptyScrutinId } });
    expect(row?.generationSource).toBe("FALLBACK");
    expect(row?.policyTitle).toBeNull();
  });

  it("invalid LLM JSON → FALLBACK row (LLM_OUTPUT_INVALID)", async () => {
    mockCall.mockResolvedValue(mistralResponse("pas du json"));
    const r = await generateScrutinPolicyTitle(linkedScrutinId, {
      force: true,
      modelVersionDate: "2026-06-03",
    });
    expect(r.outcome).toBe("fallback");
    expect(r.warnings.some((w) => w.code === "LLM_OUTPUT_INVALID")).toBe(true);
  });

  it("unlinked scrutin → skipped NO_LINKED_AMENDMENT (default), no row, no LLM", async () => {
    const r = await generateScrutinPolicyTitle(unlinkedScrutinId, {
      modelVersionDate: "2026-06-03",
    });
    expect(r.outcome).toBe("skipped");
    expect(r.skipReason).toBe("NO_LINKED_AMENDMENT");
    expect(mockCall).not.toHaveBeenCalled();
    expect(
      await db.scrutinPolicyTitle.findUnique({ where: { scrutinId: unlinkedScrutinId } })
    ).toBeNull();
  });

  it("dryRun → derives status, written=false, no row persisted", async () => {
    mockCall.mockResolvedValue(
      mistralResponse(goodLlmJson.replace("WILL_REPLACE", subAmendmentId))
    );
    await db.scrutinPolicyTitle.deleteMany({ where: { scrutinId: linkedScrutinId } });
    const r = await generateScrutinPolicyTitle(linkedScrutinId, {
      dryRun: true,
      modelVersionDate: "2026-06-03",
    });
    expect(r.written).toBe(false);
    expect(r.status).toBe("DRAFT");
    expect(
      await db.scrutinPolicyTitle.findUnique({ where: { scrutinId: linkedScrutinId } })
    ).toBeNull();
  });

  it("existing row + no force → skipped ROW_EXISTS", async () => {
    mockCall.mockResolvedValue(
      mistralResponse(goodLlmJson.replace("WILL_REPLACE", subAmendmentId))
    );
    await generateScrutinPolicyTitle(linkedScrutinId, {
      force: true,
      modelVersionDate: "2026-06-03",
    });
    const r = await generateScrutinPolicyTitle(linkedScrutinId, { modelVersionDate: "2026-06-03" });
    expect(r.outcome).toBe("skipped");
    expect(r.skipReason).toBe("ROW_EXISTS");
  });

  it("force overwrites in place + writes a 'regenerated' revision", async () => {
    mockCall.mockResolvedValue(
      mistralResponse(goodLlmJson.replace("WILL_REPLACE", subAmendmentId))
    );
    const before = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { scrutinId: linkedScrutinId },
    });
    await generateScrutinPolicyTitle(linkedScrutinId, {
      force: true,
      modelVersionDate: "2026-06-03",
    });
    const after = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { scrutinId: linkedScrutinId },
    });
    expect(after.id).toBe(before.id);
    const revs = await db.scrutinPolicyTitleRevision.findMany({
      where: { policyTitleId: before.id, action: "regenerated" },
    });
    expect(revs.length).toBeGreaterThanOrEqual(1);
  });
});

describeIfLocalDb("assertNotApprovedByGenerator", () => {
  it("throws if status APPROVED", async () => {
    const { assertNotApprovedByGenerator } = await import("@/services/scrutin-policy-title");
    expect(() => assertNotApprovedByGenerator("APPROVED")).toThrow();
    expect(() => assertNotApprovedByGenerator("DRAFT")).not.toThrow();
  });
});
