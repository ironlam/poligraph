import { describe, it, expect, beforeAll, afterAll } from "vitest";

// DB-integration suite: gated behind DATABASE_URL (skipped in plain `npm test`).
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const PFX = "TEST_AUTO_";

let db: typeof import("@/lib/db").db;
let autoApproveBatchEligible: typeof import("../approval").autoApproveBatchEligible;
let CRON_ACTOR: string;
let toPublicTitleView: typeof import("@/lib/votes/to-public-title-view").toPublicTitleView;
let buildInputHashInput: typeof import("@/services/scrutin-policy-title").buildInputHashInput;
let computeInputHash: typeof import("@/services/scrutin-policy-title/input-hash").computeInputHash;
let resolveSubstanceSources: typeof import("@/services/scrutin-policy-title/substance-resolver").resolveSubstanceSources;

// Grounded summary: the title quotes appear here verbatim so EvidenceGrounding passes.
const SUMMARY =
  "Le sous-amendement supprime une dérogation aux seuils de qualité de l'eau imposés aux exploitations agricoles.";
const CLEAN_TITLE = "Supprimer une dérogation aux seuils de qualité de l'eau";
const CLEAN_QUOTE = "supprime une dérogation aux seuils de qualité de l'eau";

const PUBLIC_SELECT = {
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
} as const;

interface SeedOpts {
  suffix: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  status?: "DRAFT" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED" | "STALE";
  generationSource?: "DETERMINISTIC" | "LLM" | "MANUAL" | "FALLBACK";
  /** Hours in the past for generatedAt. Default 48 (clears the 24h age gate). */
  ageHours?: number;
  title?: string;
}

interface Seeded {
  scrutinId: string;
  amendmentId: string;
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
      title: opts.title ?? "Sous-amendement n° 100 sur la qualité de l'eau",
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

  const ageHours = opts.ageHours ?? 48;
  await db.scrutinPolicyTitle.create({
    data: {
      scrutinId: scrutin.id,
      officialTitleSnapshot: scrutin.title,
      officialSourceUrl: scrutin.sourceUrl,
      inputHash: correctHash,
      policyTitle: CLEAN_TITLE,
      policySubtitle: null,
      proceduralLabel: label,
      confidence: opts.confidence ?? "HIGH",
      generationSource: opts.generationSource ?? "LLM",
      status: opts.status ?? "DRAFT",
      qualitySignals: { substanceDepth: "subAmendment", evidenceCoverage: 0.6 },
      evidenceQuotes: [
        {
          sourceType: "subAmendment",
          sourceId: amendment.id,
          field: "Amendment.summary",
          quote: CLEAN_QUOTE,
        },
      ],
      generationWarnings: [],
      currentWarnings: [],
      generatedAt: new Date(Date.now() - ageHours * 60 * 60 * 1000),
    },
  });

  return { scrutinId: scrutin.id, amendmentId: amendment.id };
}

async function statusOf(scrutinId: string): Promise<string | undefined> {
  const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
  return row?.status;
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

describeIfDb("autoApproveBatchEligible", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ autoApproveBatchEligible, CRON_ACTOR } = await import("../approval"));
    ({ toPublicTitleView } = await import("@/lib/votes/to-public-title-view"));
    ({ buildInputHashInput } = await import("@/services/scrutin-policy-title"));
    ({ computeInputHash } = await import("@/services/scrutin-policy-title/input-hash"));
    ({ resolveSubstanceSources } =
      await import("@/services/scrutin-policy-title/substance-resolver"));
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("approves an eligible HIGH DRAFT title older than 24h, attributed to the cron actor", async () => {
    const { scrutinId } = await seedRow({ suffix: "OK", ageHours: 48 });

    const stats = await autoApproveBatchEligible({ scrutinIds: [scrutinId] });

    expect(stats.approved).toBe(1);
    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(row?.status).toBe("APPROVED");
    expect(row?.reviewedBy).toBe(CRON_ACTOR);
    expect(row?.reviewedAt).not.toBeNull();

    const rev = await db.scrutinPolicyTitleRevision.findFirst({
      where: { policyTitleId: row!.id, action: "approved" },
    });
    expect(rev?.actorId).toBe(CRON_ACTOR);
  });

  it("skips a HIGH DRAFT title younger than 24h (age gate)", async () => {
    const { scrutinId } = await seedRow({ suffix: "YOUNG", ageHours: 1 });

    const stats = await autoApproveBatchEligible({ scrutinIds: [scrutinId] });

    expect(stats.approved).toBe(0);
    expect(stats.scanned).toBe(0); // excluded by the age filter, never scanned
    expect(await statusOf(scrutinId)).toBe("DRAFT");
  });

  it("never approves NEEDS_REVIEW, even when HIGH and old", async () => {
    const { scrutinId } = await seedRow({ suffix: "NR", status: "NEEDS_REVIEW", ageHours: 48 });

    const stats = await autoApproveBatchEligible({ scrutinIds: [scrutinId] });

    expect(stats.approved).toBe(0);
    expect(await statusOf(scrutinId)).toBe("NEEDS_REVIEW");
  });

  it("skips MEDIUM and LOW confidence rows", async () => {
    const med = await seedRow({ suffix: "MED", confidence: "MEDIUM", ageHours: 48 });
    const low = await seedRow({ suffix: "LOW", confidence: "LOW", ageHours: 48 });

    const stats = await autoApproveBatchEligible({
      scrutinIds: [med.scrutinId, low.scrutinId],
    });

    expect(stats.approved).toBe(0);
    expect(await statusOf(med.scrutinId)).toBe("DRAFT");
    expect(await statusOf(low.scrutinId)).toBe("DRAFT");
  });

  it("skips FALLBACK rows", async () => {
    const { scrutinId } = await seedRow({
      suffix: "FB",
      generationSource: "FALLBACK",
      ageHours: 48,
    });

    const stats = await autoApproveBatchEligible({ scrutinIds: [scrutinId] });

    expect(stats.approved).toBe(0);
    expect(await statusOf(scrutinId)).toBe("DRAFT");
  });

  it("reuses the approval guard: skips a drifted row (INPUT_DRIFT)", async () => {
    const { scrutinId, amendmentId } = await seedRow({ suffix: "DRIFT", ageHours: 48 });
    // Mutate the amendment so the recomputed input hash no longer matches.
    await db.amendment.update({
      where: { id: amendmentId },
      data: { summary: "Texte totalement différent et sans aucun rapport." },
    });

    const stats = await autoApproveBatchEligible({ scrutinIds: [scrutinId] });

    expect(stats.approved).toBe(0);
    expect(stats.byReason.INPUT_DRIFT).toBeGreaterThanOrEqual(1);
    expect(await statusOf(scrutinId)).toBe("DRAFT");
  });

  it("accepts a source-side fix of the relatif/relative agreement in the official title", async () => {
    const before = "Sous-amendement n° 100 au projet de loi relative à la qualité de l'eau";
    const after = "Sous-amendement n° 100 au projet de loi relatif à la qualité de l'eau";
    const { scrutinId } = await seedRow({ suffix: "AGREE", ageHours: 48, title: before });
    await db.scrutin.update({ where: { id: scrutinId }, data: { title: after } });

    const stats = await autoApproveBatchEligible({ scrutinIds: [scrutinId] });

    expect(stats.approved).toBe(1);
    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(row?.status).toBe("APPROVED");
    expect(row?.officialTitleSnapshot).toBe(after);
    const rev = await db.scrutinPolicyTitleRevision.findFirst({
      where: { policyTitleId: row!.id, action: "official_title_refreshed" },
    });
    expect((rev?.snapshot as { officialTitleSnapshot?: string }).officialTitleSnapshot).toBe(
      before
    );
  });

  it("still reports INPUT_DRIFT when the official title changes on substance", async () => {
    const { scrutinId } = await seedRow({
      suffix: "TITLE_DRIFT",
      ageHours: 48,
      title: "Sous-amendement n° 100 au projet de loi relative à la qualité de l'eau",
    });
    await db.scrutin.update({
      where: { id: scrutinId },
      data: { title: "Sous-amendement n° 1100 au projet de loi relatif à la qualité de l'eau" },
    });

    const stats = await autoApproveBatchEligible({ scrutinIds: [scrutinId] });

    expect(stats.approved).toBe(0);
    expect(stats.byReason.INPUT_DRIFT).toBe(1);
    const row = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    expect(row?.officialTitleSnapshot).toContain("relative");
  });

  it("public view: approved → policy title, unapproved → official title (no leak)", async () => {
    const approved = await seedRow({ suffix: "PUB_OK", ageHours: 48 });
    const young = await seedRow({ suffix: "PUB_YOUNG", ageHours: 1 });

    await autoApproveBatchEligible({ scrutinIds: [approved.scrutinId, young.scrutinId] });

    const approvedRow = await db.scrutin.findUnique({
      where: { id: approved.scrutinId },
      select: PUBLIC_SELECT,
    });
    const youngRow = await db.scrutin.findUnique({
      where: { id: young.scrutinId },
      select: PUBLIC_SELECT,
    });

    expect(toPublicTitleView(approvedRow!).mode).toBe("policy");
    // The unapproved (young) row must still render its official title publicly.
    const youngView = toPublicTitleView(youngRow!);
    expect(youngView.mode).toBe("official");
    expect(youngView.mode === "official" && youngView.officialTitle).toContain("Sous-amendement");
  });
});
