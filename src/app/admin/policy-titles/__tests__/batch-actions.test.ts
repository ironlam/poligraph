import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const PFX = "TEST_BAT_";

// Auth: actions call isAuthenticated() — force true for the whole suite.
vi.mock("@/lib/auth", () => ({
  isAuthenticated: () => Promise.resolve(true),
}));

// revalidatePath throws outside a Next request context; no-op it under vitest.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
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

const CLEAN_TITLE = "Supprimer une dérogation aux seuils de qualité de l'eau";
const CLEAN_QUOTE = "supprime une dérogation aux seuils de qualité de l'eau";

interface SeedOpts {
  suffix: string;
  policyTitle: string | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  status?: "DRAFT" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED" | "STALE";
  generationSource?: "DETERMINISTIC" | "LLM" | "MANUAL" | "FALLBACK";
  generationWarnings?: { code: string; severity: "info" | "warn" | "blocker"; message: string }[];
  // When false, seed with NO evidence quote → a sub-amendment row produces a
  // SUB_TARGET_NOT_CITED blocker in the freshly recomputed currentWarnings.
  withEvidence?: boolean;
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

  const evidenceQuotes =
    opts.withEvidence === false
      ? []
      : [
          {
            sourceType: "subAmendment",
            sourceId: amendment.id,
            field: "Amendment.summary",
            quote: CLEAN_QUOTE,
          },
        ];

  const row = await db.scrutinPolicyTitle.create({
    data: {
      scrutinId: scrutin.id,
      officialTitleSnapshot: scrutin.title,
      officialSourceUrl: scrutin.sourceUrl,
      inputHash: correctHash,
      policyTitle: opts.policyTitle,
      policySubtitle: null,
      proceduralLabel: label,
      confidence: opts.confidence ?? "HIGH",
      generationSource: opts.generationSource ?? "LLM",
      status: opts.status ?? "DRAFT",
      qualitySignals: { substanceDepth: "subAmendment", evidenceCoverage: 0.6 },
      evidenceQuotes,
      generationWarnings: opts.generationWarnings ?? [],
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

describeIfDb("policy-title batch actions", () => {
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

  // ── batchApprove ──────────────────────────────────────────────────────────

  it("approves an all-clean HIGH set", async () => {
    const a = await seedRow({ suffix: "OK_A", policyTitle: CLEAN_TITLE });
    const b = await seedRow({ suffix: "OK_B", policyTitle: CLEAN_TITLE });

    const result = await actions.batchApprove([a.scrutinId, b.scrutinId]);

    expect(result.approved).toBe(2);
    expect(result.failures).toEqual([]);

    for (const { scrutinId } of [a, b]) {
      const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
      expect(row?.status).toBe("APPROVED");
      expect(row?.reviewedBy).toBe("admin");
      expect(row?.reviewedAt).not.toBeNull();
    }
  });

  it("approves NONE when one row has generationWarnings (all-or-nothing)", async () => {
    const clean = await seedRow({ suffix: "GW_CLEAN", policyTitle: CLEAN_TITLE });
    const dirty = await seedRow({
      suffix: "GW_DIRTY",
      policyTitle: CLEAN_TITLE,
      generationWarnings: [{ code: "SOME_GEN_WARN", severity: "warn", message: "x" }],
    });

    const result = await actions.batchApprove([clean.scrutinId, dirty.scrutinId]);

    expect(result.approved).toBe(0);
    expect(result.failures.some((f) => f.scrutinId === dirty.scrutinId)).toBe(true);
    const dirtyFail = result.failures.find((f) => f.scrutinId === dirty.scrutinId);
    expect(dirtyFail?.reasons).toContain("GENERATION_WARNINGS");

    // The clean row was NOT approved (all-or-nothing).
    const cleanRow = await db.scrutinPolicyTitle.findUnique({
      where: { scrutinId: clean.scrutinId },
    });
    expect(cleanRow?.status).not.toBe("APPROVED");
  });

  it("approves NONE when one row is FALLBACK", async () => {
    const clean = await seedRow({ suffix: "FB_CLEAN", policyTitle: CLEAN_TITLE });
    const fallback = await seedRow({
      suffix: "FB_BAD",
      policyTitle: CLEAN_TITLE,
      generationSource: "FALLBACK",
    });

    const result = await actions.batchApprove([clean.scrutinId, fallback.scrutinId]);

    expect(result.approved).toBe(0);
    const fail = result.failures.find((f) => f.scrutinId === fallback.scrutinId);
    expect(fail?.reasons).toContain("FALLBACK_ROW");

    const cleanRow = await db.scrutinPolicyTitle.findUnique({
      where: { scrutinId: clean.scrutinId },
    });
    expect(cleanRow?.status).not.toBe("APPROVED");
  });

  it("approves NONE when a sub-amendment row has SUB_TARGET_NOT_CITED in currentWarnings", async () => {
    const clean = await seedRow({ suffix: "SUB_CLEAN", policyTitle: CLEAN_TITLE });
    // No evidence → sub-amendment block uncited → SUB_TARGET_NOT_CITED blocker.
    const subBad = await seedRow({
      suffix: "SUB_BAD",
      policyTitle: CLEAN_TITLE,
      withEvidence: false,
    });

    const result = await actions.batchApprove([clean.scrutinId, subBad.scrutinId]);

    expect(result.approved).toBe(0);
    const fail = result.failures.find((f) => f.scrutinId === subBad.scrutinId);
    expect(fail?.reasons).toContain("VALIDATION_BLOCKER");

    const cleanRow = await db.scrutinPolicyTitle.findUnique({
      where: { scrutinId: clean.scrutinId },
    });
    expect(cleanRow?.status).not.toBe("APPROVED");
  });

  it("approves NONE when one row has input drift", async () => {
    const clean = await seedRow({ suffix: "DRIFT_CLEAN", policyTitle: CLEAN_TITLE });
    const drift = await seedRow({ suffix: "DRIFT_BAD", policyTitle: CLEAN_TITLE });
    // Mutate the amendment so the recomputed input hash no longer matches.
    await db.amendment.update({
      where: { id: drift.amendmentId },
      data: { summary: "Texte totalement différent et sans aucun rapport." },
    });

    const result = await actions.batchApprove([clean.scrutinId, drift.scrutinId]);

    expect(result.approved).toBe(0);
    const fail = result.failures.find((f) => f.scrutinId === drift.scrutinId);
    expect(fail?.reasons).toContain("INPUT_DRIFT");

    const cleanRow = await db.scrutinPolicyTitle.findUnique({
      where: { scrutinId: clean.scrutinId },
    });
    expect(cleanRow?.status).not.toBe("APPROVED");
  });

  it("never approves a non-eligible row (MEDIUM confidence)", async () => {
    const medium = await seedRow({
      suffix: "MEDIUM",
      policyTitle: CLEAN_TITLE,
      confidence: "MEDIUM",
    });

    const result = await actions.batchApprove([medium.scrutinId]);
    expect(result.approved).toBe(0);

    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId: medium.scrutinId } });
    expect(row?.status).not.toBe("APPROVED");
  });

  // ── batchRegenerate ─────────────────────────────────────────────────────

  it("runs inline at or below the cap (ran=N, queued=0, never APPROVED)", async () => {
    mockGenerate.mockResolvedValue({ outcome: "generated", written: true });
    const seeds: Seeded[] = [];
    for (let i = 0; i < 3; i++) {
      seeds.push(await seedRow({ suffix: `REGEN_S_${i}`, policyTitle: CLEAN_TITLE }));
    }

    const result = await actions.batchRegenerate(seeds.map((s) => s.scrutinId));

    expect(result.ran).toBe(3);
    expect(result.queued).toBe(0);
    expect(mockGenerate).toHaveBeenCalledTimes(3);
    for (const { scrutinId } of seeds) {
      const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
      expect(row?.status).not.toBe("APPROVED");
    }
  });

  it("queues above the cap (ran=0, queued=N, marks regenerationStatus, no generator calls)", async () => {
    mockGenerate.mockResolvedValue({ outcome: "generated", written: true });
    const seeds: Seeded[] = [];
    for (let i = 0; i < 11; i++) {
      seeds.push(await seedRow({ suffix: `REGEN_Q_${i}`, policyTitle: CLEAN_TITLE }));
    }

    const result = await actions.batchRegenerate(seeds.map((s) => s.scrutinId));

    expect(result.ran).toBe(0);
    expect(result.queued).toBe(11);
    expect(result.note).toContain("generateScrutinPolicyTitles");
    expect(mockGenerate).not.toHaveBeenCalled();
    for (const { scrutinId } of seeds) {
      const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
      expect(row?.regenerationStatus).toBe("queued");
      expect(row?.status).not.toBe("APPROVED");
    }
  });

  // ── CSV export ────────────────────────────────────────────────────────────

  it("lean CSV has the lean header, excludes evidenceQuotes and source text, includes rows", async () => {
    // Embed a unique marker in the policyTitle so the `q` filter (which searches
    // policyTitle / officialTitleSnapshot, not externalId) isolates this row.
    const marker = `${PFX}CSV_A`;
    await seedRow({ suffix: "CSV_A", policyTitle: `${CLEAN_TITLE} ${marker}` });

    const csv = await actions.exportPolicyTitlesCsv({ q: marker });
    const [header, ...dataLines] = csv.split("\n");

    expect(header).toBe(
      "scrutinId,votingDate,proceduralLabel,officialTitleSnapshot,policyTitle,policySubtitle,status,confidence,warningCodes,substanceDepth,evidenceCoverage"
    );
    expect(header).not.toContain("evidenceQuotes");
    // The grounded summary text must never leak into the lean export.
    expect(csv).not.toContain(SUMMARY);
    expect(csv).not.toContain(CLEAN_QUOTE);
    expect(dataLines.length).toBeGreaterThan(0);
    expect(csv).toContain(CLEAN_TITLE);
  });

  it("full CSV throws without confirmed, includes evidenceQuotes column with confirmed", async () => {
    const marker = `${PFX}CSVF_A`;
    await seedRow({ suffix: "CSVF_A", policyTitle: `${CLEAN_TITLE} ${marker}` });

    await expect(
      actions.exportPolicyTitlesCsvFull({ q: marker }, { confirmed: false })
    ).rejects.toThrow();

    const csv = await actions.exportPolicyTitlesCsvFull({ q: marker }, { confirmed: true });
    const header = csv.split("\n")[0] ?? "";
    expect(header.endsWith(",evidenceQuotes")).toBe(true);
    expect(csv).toContain(CLEAN_QUOTE);
  });
});
