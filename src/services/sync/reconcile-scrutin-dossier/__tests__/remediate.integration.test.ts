import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { ScrutinDossierTransition } from "../types";

// Mock BEFORE anything imports remediate.ts, which pulls in generateScrutinPolicyTitles,
// which pulls in the real Mistral client. Only the Phase B describe block below drives
// the LLM path; the Phase A blocks above never reach it, so this mock is a no-op for them.
const mockCall = vi.fn();
vi.mock("@/lib/api/mistral", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/mistral")>();
  return { ...actual, callMistral: (...a: unknown[]) => mockCall(...a) };
});

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

let db: typeof import("@/lib/db").db;
let repairScrutinDossier: typeof import("../remediate").repairScrutinDossier;
let requeueLinklessTitlesWithLinks: typeof import("../remediate").requeueLinklessTitlesWithLinks;
let drainDossierRepointRegen: typeof import("../remediate").drainDossierRepointRegen;
let LINKLESS_WARNING: string;

const PFX = "TEST_RMD_";

interface RepointFixture {
  scrutinId: string;
  wrongDossierId: string;
  correctDossierId: string;
  wrongAmendmentId: string;
  correctAmendmentId: string | null;
  policyTitleId: string;
}

/**
 * Seeds a scrutin pointed at a "wrong" dossier (with a TITLE_REGEX link to an
 * unrelated amendment) plus a "correct" dossier that should replace it, plus an
 * APPROVED ScrutinPolicyTitle. The scrutin's title cites a sous-amendement
 * number so the real linkScrutinsToAmendments (invoked by repairScrutinDossier)
 * can resolve it against whichever dossier the scrutin currently points to.
 * When `correctDossierHasMatch` is false, the correct dossier has no amendment
 * with that number, so re-linking yields zero links (the "linkless" case).
 */
async function seedRepointFixture(opts: {
  suffix: string;
  amendmentNumber: string;
  correctDossierHasMatch: boolean;
}): Promise<RepointFixture> {
  const { suffix, amendmentNumber, correctDossierHasMatch } = opts;

  const wrongDossier = await db.legislativeDossier.create({
    data: {
      externalId: `${PFX}DLR_WRONG_${suffix}`,
      slug: `test-rmd-dlr-wrong-${suffix.toLowerCase()}`,
      title: `Dossier incorrect ${suffix}`,
      status: "EN_COURS",
    },
  });
  const correctDossier = await db.legislativeDossier.create({
    data: {
      externalId: `${PFX}DLR_CORRECT_${suffix}`,
      slug: `test-rmd-dlr-correct-${suffix.toLowerCase()}`,
      title: `Dossier correct ${suffix}`,
      status: "EN_COURS",
    },
  });

  const wrongAmendment = await db.amendment.create({
    data: {
      externalId: `${PFX}WRONG_${suffix}`,
      number: "1",
      dossierId: wrongDossier.id,
      status: "ADOPTE",
      legislature: 17,
      chamber: "AN",
    },
  });

  let correctAmendmentId: string | null = null;
  if (correctDossierHasMatch) {
    const correctAmendment = await db.amendment.create({
      data: {
        externalId: `${PFX}CORRECT_${suffix}`,
        number: amendmentNumber,
        dossierId: correctDossier.id,
        status: "ADOPTE",
        legislature: 17,
        chamber: "AN",
      },
    });
    correctAmendmentId = correctAmendment.id;
  }

  const scrutin = await db.scrutin.create({
    data: {
      externalId: `${PFX}S_${suffix}`,
      title: `le sous-amendement n° ${amendmentNumber} ...`,
      sourceUrl: `https://www.assemblee-nationale.fr/dyn/17/scrutins/test-rmd-s-${suffix.toLowerCase()}`,
      votingDate: new Date(),
      legislature: 17,
      chamber: "AN",
      votesFor: 1,
      votesAgainst: 0,
      votesAbstain: 0,
      result: "ADOPTED",
      dossierLegislatifId: wrongDossier.id,
      amendmentLinks: {
        create: [{ amendmentId: wrongAmendment.id, role: "PRINCIPAL", source: "TITLE_REGEX" }],
      },
    },
  });

  const policyTitle = await db.scrutinPolicyTitle.create({
    data: {
      scrutinId: scrutin.id,
      officialTitleSnapshot: scrutin.title,
      officialSourceUrl: scrutin.sourceUrl,
      inputHash: "0".repeat(64),
      policyTitle: `Titre test ${suffix}`,
      policySubtitle: null,
      proceduralLabel: `Sous-amendement n°${amendmentNumber}`,
      confidence: "HIGH",
      qualitySignals: {},
      generationSource: "LLM",
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedBy: "moderator@poligraph.fr",
      regenerationStatus: "idle",
    },
  });

  return {
    scrutinId: scrutin.id,
    wrongDossierId: wrongDossier.id,
    correctDossierId: correctDossier.id,
    wrongAmendmentId: wrongAmendment.id,
    correctAmendmentId,
    policyTitleId: policyTitle.id,
  };
}

function repointTransition(f: RepointFixture, externalId: string): ScrutinDossierTransition {
  return {
    scrutinId: f.scrutinId,
    externalId,
    previousDossierId: f.wrongDossierId,
    resolvedDossierId: f.correctDossierId,
    resolution: "TITLE_MATCH",
    appliedDossierId: f.correctDossierId,
    action: "REPOINT",
    candidateExternalIds: [],
  };
}

describeIfDb("repairScrutinDossier (Phase A)", () => {
  let fixtureA: RepointFixture; // happy-path REPOINT
  let fixtureB: RepointFixture; // linkless REPOINT
  let fixtureD: RepointFixture; // idempotent re-run

  let scrutinCId: string;
  let wrongDossierCId: string;
  let correctDossierCId: string;
  let manualAmendmentCId: string;
  let titleRegexAmendmentCId: string;
  let policyTitleCId: string;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ repairScrutinDossier, requeueLinklessTitlesWithLinks, LINKLESS_WARNING } =
      await import("../remediate"));

    await db.scrutinAmendment.deleteMany({
      where: { amendment: { externalId: { startsWith: PFX } } },
    });
    await db.scrutinPolicyTitle.deleteMany({
      where: { scrutin: { externalId: { startsWith: PFX } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.legislativeDossier.deleteMany({ where: { externalId: { startsWith: PFX } } });

    fixtureA = await seedRepointFixture({
      suffix: "A",
      amendmentNumber: "2368",
      correctDossierHasMatch: true,
    });
    fixtureB = await seedRepointFixture({
      suffix: "B",
      amendmentNumber: "9999",
      correctDossierHasMatch: false,
    });
    // Pre-existing unrelated warning: proves mergeWarning does not wipe it out.
    await db.scrutinPolicyTitle.update({
      where: { id: fixtureB.policyTitleId },
      data: { currentWarnings: [{ code: "OTHER_WARNING" }] },
    });
    fixtureD = await seedRepointFixture({
      suffix: "D",
      amendmentNumber: "2368",
      correctDossierHasMatch: true,
    });

    // Fixture C: incompatible MANUAL link.
    const wrongDossierC = await db.legislativeDossier.create({
      data: {
        externalId: `${PFX}DLR_WRONG_C`,
        slug: "test-rmd-dlr-wrong-c",
        title: "Dossier incorrect C",
        status: "EN_COURS",
      },
    });
    const correctDossierC = await db.legislativeDossier.create({
      data: {
        externalId: `${PFX}DLR_CORRECT_C`,
        slug: "test-rmd-dlr-correct-c",
        title: "Dossier correct C",
        status: "EN_COURS",
      },
    });
    const manualAmendmentC = await db.amendment.create({
      data: {
        externalId: `${PFX}MANUAL_C`,
        number: "42",
        dossierId: wrongDossierC.id,
        status: "ADOPTE",
        legislature: 17,
        chamber: "AN",
      },
    });
    const titleRegexAmendmentC = await db.amendment.create({
      data: {
        externalId: `${PFX}REGEX_C`,
        number: "43",
        dossierId: wrongDossierC.id,
        status: "ADOPTE",
        legislature: 17,
        chamber: "AN",
      },
    });
    const scrutinC = await db.scrutin.create({
      data: {
        externalId: `${PFX}S_C`,
        title: "l'amendement n° 42 ...",
        sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/scrutins/test-rmd-s-c",
        votingDate: new Date(),
        legislature: 17,
        chamber: "AN",
        votesFor: 1,
        votesAgainst: 0,
        votesAbstain: 0,
        result: "ADOPTED",
        dossierLegislatifId: wrongDossierC.id,
        amendmentLinks: {
          create: [
            { amendmentId: manualAmendmentC.id, role: "PRINCIPAL", source: "MANUAL" },
            { amendmentId: titleRegexAmendmentC.id, role: "PRINCIPAL", source: "TITLE_REGEX" },
          ],
        },
      },
    });
    const policyTitleC = await db.scrutinPolicyTitle.create({
      data: {
        scrutinId: scrutinC.id,
        officialTitleSnapshot: scrutinC.title,
        officialSourceUrl: scrutinC.sourceUrl,
        inputHash: "0".repeat(64),
        policyTitle: "Titre test C",
        policySubtitle: null,
        proceduralLabel: "Amendement n°42",
        confidence: "HIGH",
        qualitySignals: {},
        generationSource: "LLM",
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedBy: "moderator@poligraph.fr",
        regenerationStatus: "idle",
      },
    });

    scrutinCId = scrutinC.id;
    wrongDossierCId = wrongDossierC.id;
    correctDossierCId = correctDossierC.id;
    manualAmendmentCId = manualAmendmentC.id;
    titleRegexAmendmentCId = titleRegexAmendmentC.id;
    policyTitleCId = policyTitleC.id;
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
    await db.legislativeDossier.deleteMany({ where: { externalId: { startsWith: PFX } } });
  });

  it("REPOINT: snapshots APPROVED, sets STALE, deletes TITLE_REGEX links, relinks, queues", async () => {
    const result = await repairScrutinDossier(
      repointTransition(fixtureA, "TEST_RMD_EXT_A"),
      "repair-run-A"
    );

    expect(result.repairStatus).toBe("DB_REPAIRED");
    expect(result.linkless).toBe(false);

    const scrutin = await db.scrutin.findUniqueOrThrow({ where: { id: fixtureA.scrutinId } });
    expect(scrutin.dossierLegislatifId).toBe(fixtureA.correctDossierId);

    const oldLink = await db.scrutinAmendment.findFirst({
      where: { scrutinId: fixtureA.scrutinId, amendmentId: fixtureA.wrongAmendmentId },
    });
    expect(oldLink).toBeNull();

    const links = await db.scrutinAmendment.findMany({ where: { scrutinId: fixtureA.scrutinId } });
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => l.source === "TITLE_REGEX")).toBe(true);
    expect(links.some((l) => l.amendmentId === fixtureA.correctAmendmentId)).toBe(true);

    const title = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { id: fixtureA.policyTitleId },
    });
    expect(title.status).toBe("STALE");
    expect(title.regenerationStatus).toBe("queued");

    const revisions = await db.scrutinPolicyTitleRevision.findMany({
      where: {
        policyTitleId: fixtureA.policyTitleId,
        action: "dossier_reconciliation_invalidated",
      },
    });
    expect(revisions).toHaveLength(1);
    const snapshot = revisions[0].snapshot as { status?: string; repairRunId?: string };
    expect(snapshot.status).toBe("APPROVED");
    expect(snapshot.repairRunId).toBe("repair-run-A");
  });

  it("linkless REPOINT: STALE, NOT queued, DOSSIER_RECONCILIATION_LINKLESS merged", async () => {
    const result = await repairScrutinDossier(
      repointTransition(fixtureB, "TEST_RMD_EXT_B"),
      "repair-run-B"
    );

    expect(result.repairStatus).toBe("DB_REPAIRED");
    expect(result.linkless).toBe(true);

    const links = await db.scrutinAmendment.findMany({ where: { scrutinId: fixtureB.scrutinId } });
    expect(links).toHaveLength(0);

    const title = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { id: fixtureB.policyTitleId },
    });
    expect(title.status).toBe("STALE");
    expect(title.regenerationStatus).toBe("idle");

    const warnings = title.currentWarnings as { code: string }[];
    expect(warnings.some((w) => w.code === LINKLESS_WARNING)).toBe(true);
    // The pre-existing unrelated warning must survive the merge.
    expect(warnings.some((w) => w.code === "OTHER_WARNING")).toBe(true);
    expect(warnings).toHaveLength(2);
  });

  it("incompatible MANUAL link blocks: repairStatus BLOCKED_MANUAL_LINK, title STALE, no queue", async () => {
    const t: ScrutinDossierTransition = {
      scrutinId: scrutinCId,
      externalId: "TEST_RMD_EXT_C",
      previousDossierId: wrongDossierCId,
      resolvedDossierId: correctDossierCId,
      resolution: "TITLE_MATCH",
      appliedDossierId: correctDossierCId,
      action: "REPOINT",
      candidateExternalIds: [],
    };

    const result = await repairScrutinDossier(t, "repair-run-C");

    expect(result.repairStatus).toBe("BLOCKED_MANUAL_LINK");
    expect(result.linkless).toBe(false);

    // Title is unpublished (unpublish-first) even though the repair is blocked.
    const title = await db.scrutinPolicyTitle.findUniqueOrThrow({ where: { id: policyTitleCId } });
    expect(title.status).toBe("STALE");
    expect(title.regenerationStatus).toBe("idle"); // untouched, Transaction A2 never ran

    // No mutation of dossier or links.
    const scrutin = await db.scrutin.findUniqueOrThrow({ where: { id: scrutinCId } });
    expect(scrutin.dossierLegislatifId).toBe(wrongDossierCId);

    const manualLink = await db.scrutinAmendment.findFirst({
      where: { scrutinId: scrutinCId, amendmentId: manualAmendmentCId },
    });
    expect(manualLink).not.toBeNull();
    expect(manualLink?.source).toBe("MANUAL");

    const regexLink = await db.scrutinAmendment.findFirst({
      where: { scrutinId: scrutinCId, amendmentId: titleRegexAmendmentCId },
    });
    expect(regexLink).not.toBeNull();

    const revisions = await db.scrutinPolicyTitleRevision.findMany({
      where: { policyTitleId: policyTitleCId, action: "dossier_reconciliation_invalidated" },
    });
    expect(revisions).toHaveLength(1);
  });

  it("idempotent: re-running with the same repairRunId adds no duplicate invalidation revision", async () => {
    const t = repointTransition(fixtureD, "TEST_RMD_EXT_D");

    const first = await repairScrutinDossier(t, "repair-run-D");
    expect(first.repairStatus).toBe("DB_REPAIRED");

    const revisionsAfterFirst = await db.scrutinPolicyTitleRevision.findMany({
      where: {
        policyTitleId: fixtureD.policyTitleId,
        action: "dossier_reconciliation_invalidated",
      },
    });
    expect(revisionsAfterFirst).toHaveLength(1);

    const second = await repairScrutinDossier(t, "repair-run-D");
    expect(second.repairStatus).toBe("DB_REPAIRED");

    const revisionsAfterSecond = await db.scrutinPolicyTitleRevision.findMany({
      where: {
        policyTitleId: fixtureD.policyTitleId,
        action: "dossier_reconciliation_invalidated",
      },
    });
    expect(revisionsAfterSecond).toHaveLength(1);
    expect(revisionsAfterSecond[0].id).toBe(revisionsAfterFirst[0].id);
  });
});

describeIfDb("requeueLinklessTitlesWithLinks", () => {
  const PFX2 = "TEST_RMD_LATE_";
  let policyTitleId: string;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ requeueLinklessTitlesWithLinks, LINKLESS_WARNING } = await import("../remediate"));

    await db.scrutinAmendment.deleteMany({
      where: { amendment: { externalId: { startsWith: PFX2 } } },
    });
    await db.scrutinPolicyTitle.deleteMany({
      where: { scrutin: { externalId: { startsWith: PFX2 } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX2 } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX2 } } });

    // Mirrors the post-repair linkless state left by repairScrutinDossier: STALE,
    // idle, LINKLESS_WARNING plus an unrelated warning that must survive pruning.
    // The amendment link below stands in for the normal amendment linker having
    // since created a link for this scrutin, which is the trigger for requeueing.
    const amendment = await db.amendment.create({
      data: {
        externalId: `${PFX2}AMD_1`,
        number: "1",
        status: "ADOPTE",
        legislature: 17,
        chamber: "AN",
      },
    });

    const scrutin = await db.scrutin.create({
      data: {
        externalId: `${PFX2}S_1`,
        title: "Scrutin de test requeue",
        sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/scrutins/test-rmd-late-s-1",
        votingDate: new Date(),
        legislature: 17,
        chamber: "AN",
        votesFor: 1,
        votesAgainst: 0,
        votesAbstain: 0,
        result: "ADOPTED",
        amendmentLinks: {
          create: [{ amendmentId: amendment.id, role: "PRINCIPAL", source: "TITLE_REGEX" }],
        },
      },
    });

    const policyTitle = await db.scrutinPolicyTitle.create({
      data: {
        scrutinId: scrutin.id,
        officialTitleSnapshot: scrutin.title,
        officialSourceUrl: scrutin.sourceUrl,
        inputHash: "0".repeat(64),
        policyTitle: "Titre test requeue",
        policySubtitle: null,
        proceduralLabel: "Amendement n°1",
        confidence: "HIGH",
        qualitySignals: {},
        generationSource: "LLM",
        status: "STALE",
        regenerationStatus: "idle",
        currentWarnings: [{ code: LINKLESS_WARNING }, { code: "OTHER_WARNING" }],
      },
    });

    policyTitleId = policyTitle.id;
  });

  afterAll(async () => {
    await db.scrutinAmendment.deleteMany({
      where: { amendment: { externalId: { startsWith: PFX2 } } },
    });
    await db.scrutinPolicyTitle.deleteMany({
      where: { scrutin: { externalId: { startsWith: PFX2 } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX2 } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX2 } } });
  });

  it("requeues a previously linkless STALE title once its amendment link appears", async () => {
    // Assert count >= 1 rather than === 1: this scan is unscoped by design (it
    // finds every STALE+idle+linkless title in the table), so a shared
    // non-test DB could legitimately have other rows requeued in the same call.
    const count = await requeueLinklessTitlesWithLinks();
    expect(count).toBeGreaterThanOrEqual(1);

    const title = await db.scrutinPolicyTitle.findUniqueOrThrow({ where: { id: policyTitleId } });
    expect(title.regenerationStatus).toBe("queued");

    const warnings = title.currentWarnings as { code: string }[];
    expect(warnings.some((w) => w.code === LINKLESS_WARNING)).toBe(false);
    expect(warnings.some((w) => w.code === "OTHER_WARNING")).toBe(true);
    expect(warnings).toHaveLength(1);
  });
});

/**
 * Phase B: drainDossierRepointRegen scans the whole table for STALE ∧ queued
 * rows, same unscoped-by-design shape as requeueLinklessTitlesWithLinks above.
 * Unlike that scan, though, a claimed row here gets its content OVERWRITTEN by
 * a real (mocked-LLM) generation pass, and the `limit`/`orderBy: updatedAt asc`
 * tests below assume no OTHER STALE ∧ queued ∧ has-links rows exist yet in the
 * target database. That is true for an empty or dedicated test database, but
 * NOT for a database already holding the real #477 remediation backlog (per
 * CLAUDE.local.md, `.env`/`.env.prod` are the same production database). Do
 * not run this file with DATABASE_URL pointed at that database.
 */
describeIfDb("drainDossierRepointRegen (Phase B)", () => {
  const PFX3 = "TEST_RMD_DRAIN_";

  interface DrainFixture {
    scrutinId: string;
    amendmentId: string;
    policyTitleId: string;
    marker: string;
  }

  function goodLlmJson(sourceId: string): string {
    return JSON.stringify({
      policyTitle: "Titre de test généré par le drain de régénération",
      policySubtitle: null,
      evidenceQuotes: [
        {
          sourceType: "amendment",
          sourceId,
          field: "Amendment.summary",
          quote: "Exposé sommaire de test pour le drain de régénération.",
        },
      ],
      selfConfidence: "HIGH",
      rationale: "Test.",
    });
  }

  function mistralResponse(content: string) {
    return { choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] };
  }

  /**
   * Seeds one linked scrutin + ScrutinPolicyTitle row in the requested state.
   * The amendment's content/summary embed a unique marker string so a test can
   * later count, from mockCall.mock.calls, exactly how many LLM calls were made
   * FOR THIS fixture specifically, regardless of how many other rows a shared
   * database causes the drain to also process.
   */
  async function seedDrainFixture(opts: {
    suffix: string;
    status: "STALE" | "DRAFT" | "NEEDS_REVIEW";
    regenerationStatus: "queued" | "running" | "idle" | "failed";
    updatedAt?: Date;
  }): Promise<DrainFixture> {
    const { suffix, status, regenerationStatus, updatedAt } = opts;
    const marker = `${PFX3}AMD_${suffix}`;

    const amendment = await db.amendment.create({
      data: {
        externalId: marker,
        number: suffix,
        status: "ADOPTE",
        legislature: 17,
        chamber: "AN",
        content: `<p>Dispositif de test ${marker}.</p>`,
        summary: `<p>Expos&#xE9; sommaire de test ${marker}.</p>`,
      },
    });

    const scrutin = await db.scrutin.create({
      data: {
        externalId: `${PFX3}S_${suffix}`,
        title: `l'amendement de test ${suffix} ...`,
        sourceUrl: `https://www.assemblee-nationale.fr/dyn/17/scrutins/test-rmd-drain-s-${suffix.toLowerCase()}`,
        votingDate: new Date(),
        legislature: 17,
        chamber: "AN",
        votesFor: 1,
        votesAgainst: 0,
        votesAbstain: 0,
        result: "ADOPTED",
        amendmentLinks: {
          create: [{ amendmentId: amendment.id, role: "PRINCIPAL", source: "TITLE_REGEX" }],
        },
      },
    });

    const policyTitle = await db.scrutinPolicyTitle.create({
      data: {
        scrutinId: scrutin.id,
        officialTitleSnapshot: scrutin.title,
        officialSourceUrl: scrutin.sourceUrl,
        inputHash: "0".repeat(64),
        policyTitle: `Ancien titre ${suffix}`,
        policySubtitle: null,
        proceduralLabel: `Amendement n°${suffix}`,
        confidence: "HIGH",
        qualitySignals: {},
        generationSource: "LLM",
        status,
        regenerationStatus,
        ...(updatedAt ? { updatedAt } : {}),
      },
    });

    return {
      scrutinId: scrutin.id,
      amendmentId: amendment.id,
      policyTitleId: policyTitle.id,
      marker,
    };
  }

  /** Number of LLM calls whose prompt embeds this fixture's unique marker. */
  function callsFor(marker: string): number {
    return mockCall.mock.calls.filter((args) => {
      const messages = args[0] as { content: string }[];
      return messages.some((m) => m.content.includes(marker));
    }).length;
  }

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ drainDossierRepointRegen } = await import("../remediate"));

    await db.scrutinAmendment.deleteMany({
      where: { amendment: { externalId: { startsWith: PFX3 } } },
    });
    await db.scrutinPolicyTitle.deleteMany({
      where: { scrutin: { externalId: { startsWith: PFX3 } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX3 } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX3 } } });
  });

  afterAll(async () => {
    await db.scrutinAmendment.deleteMany({
      where: { amendment: { externalId: { startsWith: PFX3 } } },
    });
    await db.scrutinPolicyTitle.deleteMany({
      where: { scrutin: { externalId: { startsWith: PFX3 } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX3 } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX3 } } });
  });

  beforeEach(() => {
    mockCall.mockReset();
  });

  it("regenerates only STALE ∧ queued ∧ has-links; ignores a substance-drift-style queued DRAFT", async () => {
    // updatedAt pinned to an ancient date so orderBy: updatedAt asc always ranks
    // this fixture ahead of any real (recent) row a shared database might hold.
    const stale = await seedDrainFixture({
      suffix: "A1",
      status: "STALE",
      regenerationStatus: "queued",
      updatedAt: new Date("2000-01-01T00:00:00Z"),
    });
    // Mimics markPolicyTitlesForSubstanceDrift's "queue" action: a DRAFT row with
    // regenerationStatus "queued" but status left untouched (never STALE). The
    // drain's selector must not pick this up.
    const draftQueued = await seedDrainFixture({
      suffix: "A2",
      status: "DRAFT",
      regenerationStatus: "queued",
      updatedAt: new Date("2000-01-01T00:00:00Z"),
    });

    mockCall.mockResolvedValue(mistralResponse(goodLlmJson(stale.amendmentId)));

    await drainDossierRepointRegen({ limit: 20 });

    const staleAfter = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { id: stale.policyTitleId },
    });
    expect(staleAfter.status).not.toBe("STALE");
    expect(staleAfter.regenerationStatus).toBe("idle");
    expect(callsFor(stale.marker)).toBe(1);

    const draftAfter = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { id: draftQueued.policyTitleId },
    });
    expect(draftAfter.status).toBe("DRAFT");
    expect(draftAfter.regenerationStatus).toBe("queued");
    expect(callsFor(draftQueued.marker)).toBe(0);
  });

  it("atomic claim: a row already claimed by one call is not double-processed by another", async () => {
    // Same ancient-updatedAt pinning as above, so this fixture is always in
    // the queue regardless of any other rows a shared database might hold.
    const fx = await seedDrainFixture({
      suffix: "B1",
      status: "STALE",
      regenerationStatus: "queued",
      updatedAt: new Date("2000-01-01T00:00:00Z"),
    });
    mockCall.mockResolvedValue(mistralResponse(goodLlmJson(fx.amendmentId)));

    // Two real concurrent calls sharing the same DB connection pool: whichever
    // one's per-row updateMany claim lands first flips regenerationStatus to
    // "running", so the other's claim WHERE clause no longer matches (count 0)
    // and it skips the row without calling the generator a second time.
    await Promise.all([
      drainDossierRepointRegen({ limit: 20 }),
      drainDossierRepointRegen({ limit: 20 }),
    ]);

    const after = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { id: fx.policyTitleId },
    });
    expect(after.status).not.toBe("STALE");
    expect(after.regenerationStatus).toBe("idle");
    expect(after.regenerationError).toBeNull();
    // The decisive assertion: exactly one generation attempt reached the LLM for
    // this row. If the claim were not atomic, both calls could have raced past
    // the claim and this would be 2.
    expect(callsFor(fx.marker)).toBe(1);
  });

  it("honours the limit; leftover rows stay queued", async () => {
    // Ancient, strictly increasing updatedAt values: guarantees these three are
    // the globally oldest STALE ∧ queued rows (ahead of any real row a shared
    // database might hold), so a limit of 2 deterministically picks oldest and
    // middle, leaving newest as the sole leftover.
    const oldest = await seedDrainFixture({
      suffix: "C1",
      status: "STALE",
      regenerationStatus: "queued",
      updatedAt: new Date("2000-01-01T00:00:00Z"),
    });
    const middle = await seedDrainFixture({
      suffix: "C2",
      status: "STALE",
      regenerationStatus: "queued",
      updatedAt: new Date("2000-01-01T00:01:00Z"),
    });
    const newest = await seedDrainFixture({
      suffix: "C3",
      status: "STALE",
      regenerationStatus: "queued",
      updatedAt: new Date("2000-01-01T00:02:00Z"),
    });

    mockCall.mockImplementation((...args: unknown[]) => {
      const messages = args[0] as { content: string }[];
      const prompt = messages[0]?.content ?? "";
      const sourceId = prompt.includes(oldest.marker)
        ? oldest.amendmentId
        : prompt.includes(middle.marker)
          ? middle.amendmentId
          : newest.amendmentId;
      return Promise.resolve(mistralResponse(goodLlmJson(sourceId)));
    });

    const result = await drainDossierRepointRegen({ limit: 2 });
    expect(result.claimed).toBeGreaterThanOrEqual(2);

    const oldestAfter = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { id: oldest.policyTitleId },
    });
    const middleAfter = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { id: middle.policyTitleId },
    });
    const newestAfter = await db.scrutinPolicyTitle.findUniqueOrThrow({
      where: { id: newest.policyTitleId },
    });

    // orderBy updatedAt asc: the two oldest rows are drained first.
    expect(oldestAfter.status).not.toBe("STALE");
    expect(oldestAfter.regenerationStatus).toBe("idle");
    expect(middleAfter.status).not.toBe("STALE");
    expect(middleAfter.regenerationStatus).toBe("idle");
    // The newest of the three is the leftover a limit of 2 must not touch.
    expect(newestAfter.status).toBe("STALE");
    expect(newestAfter.regenerationStatus).toBe("queued");
  });
});
