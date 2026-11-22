import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvidenceQuote, SubstanceTextBlock } from "../types";

// A one-off script must be able to publish a hand-written title, but only through
// the guard and with an "approved" revision. Before this service existed, a local
// script upserted status APPROVED directly and two result-leaking titles went public.

const BLOCK: SubstanceTextBlock = {
  sourceType: "dossier",
  sourceId: "dossier-1",
  field: "LegislativeDossier.exposeDesMotifs",
  text: "Prévision de solde structurel et de solde effectif pour l'année 2026",
  trust: "official",
};
const QUOTE: EvidenceQuote = {
  sourceType: BLOCK.sourceType,
  sourceId: BLOCK.sourceId,
  field: BLOCK.field,
  quote: "Prévision de solde structurel et de solde effectif",
};
const OFFICIAL_TITLE = "l'ensemble du projet de loi de finances de fin de gestion pour 2026";

const writes: { op: string; data: Record<string, unknown> }[] = [];
let row: Record<string, unknown>;
let latestRevision: { action: string } | null;

vi.mock("@/lib/db", () => {
  const tx = {
    scrutinPolicyTitleRevision: {
      create: vi.fn(async ({ data }) => {
        writes.push({ op: "revision", data });
      }),
    },
    scrutinPolicyTitle: {
      update: vi.fn(async ({ data }) => {
        writes.push({ op: "update", data });
      }),
    },
  };
  return {
    db: {
      scrutinPolicyTitle: {
        findUnique: vi.fn(async () => ({
          ...row,
          scrutin: { id: "s1", title: OFFICIAL_TITLE, sourceUrl: null, amendmentLinks: [] },
        })),
      },
      scrutinPolicyTitleRevision: { findFirst: vi.fn(async () => latestRevision) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    },
  };
});
vi.mock("@/services/scrutin-policy-title/substance-resolver", () => ({
  resolveSubstanceSources: vi.fn(async () => ({ blocks: [BLOCK] })),
}));
vi.mock("@/services/scrutin-policy-title", () => ({
  buildInputHashInput: vi.fn(() => ({ fixed: true })),
}));
// The profile document embeds the approved title of a politician's latest votes.
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({
  requestProfileRefresh: vi.fn(async (target: Record<string, unknown>) => {
    writes.push({ op: "refresh", data: target });
  }),
}));
vi.mock("@/services/scrutin-policy-title/input-hash", () => ({
  computeInputHash: vi.fn(() => "current-hash"),
  isAgreementOnlyTitleDrift: vi.fn(() => false),
}));

const { approveManualPolicyTitle } = await import("../approval");

const INPUT = {
  title: "Vote sur l'ensemble du budget rectificatif de fin de gestion pour 2026",
  evidenceQuotes: [QUOTE],
  actor: "session:test",
  reason: "Titre neutre sans issue du vote",
};

beforeEach(() => {
  writes.length = 0;
  latestRevision = null;
  row = {
    id: "pt1",
    scrutinId: "s1",
    status: "APPROVED",
    confidence: "HIGH",
    inputHash: "wrong-hash-from-a-direct-write",
    policyTitle: "L'Assemblée rejette le budget rectificatif de fin d'année 2026",
    policySubtitle: null,
    proceduralLabel: "Scrutin",
    officialTitleSnapshot: OFFICIAL_TITLE,
    evidenceQuotes: [],
    generationSource: "MANUAL",
  };
});

describe("approveManualPolicyTitle", () => {
  it("refuses a title that announces the outcome, and writes nothing", async () => {
    const res = await approveManualPolicyTitle("s1", {
      ...INPUT,
      title: "L'Assemblée rejette le budget rectificatif de fin d'année 2026",
    });
    expect(res).toEqual({ ok: false, reason: "RESULT_LEAKAGE" });
    expect(writes).toEqual([]);
  });

  it("refuses a title without evidence quotes", async () => {
    const res = await approveManualPolicyTitle("s1", { ...INPUT, evidenceQuotes: [] });
    expect(res).toEqual({ ok: false, reason: "EVIDENCE_GROUNDING" });
    expect(writes).toEqual([]);
  });

  it("refuses a quote that is not in the official source", async () => {
    const res = await approveManualPolicyTitle("s1", {
      ...INPUT,
      evidenceQuotes: [{ ...QUOTE, quote: "une phrase absente de la source" }],
    });
    expect(res).toEqual({ ok: false, reason: "EVIDENCE_GROUNDING" });
    expect(writes).toEqual([]);
  });

  it("refuses an empty reason or actor", async () => {
    expect(await approveManualPolicyTitle("s1", { ...INPUT, reason: " " })).toEqual({
      ok: false,
      reason: "MISSING_REASON",
    });
    expect(await approveManualPolicyTitle("s1", { ...INPUT, actor: "" })).toEqual({
      ok: false,
      reason: "MISSING_ACTOR",
    });
    expect(writes).toEqual([]);
  });

  it("keeps a rejected row rejected", async () => {
    row.status = "REJECTED";
    latestRevision = { action: "rejected" };
    const res = await approveManualPolicyTitle("s1", INPUT);
    expect(res).toEqual({ ok: false, reason: "REJECTED_NOT_REVISED" });
    expect(writes).toEqual([]);
  });

  it("writes nothing on a dry run that would pass", async () => {
    const res = await approveManualPolicyTitle("s1", { ...INPUT, dryRun: true });
    expect(res).toEqual({ ok: true, written: false });
    expect(writes).toEqual([]);
  });

  it("edits, unpublishes, then approves with an approved revision", async () => {
    const res = await approveManualPolicyTitle("s1", INPUT);
    expect(res).toEqual({ ok: true, written: true });
    expect(writes.map((w) => w.op)).toEqual([
      "revision",
      "update",
      "revision",
      "update",
      "refresh",
    ]);

    const [editRev, edit, approveRev, approve, refresh] = writes;
    expect(refresh!.data).toEqual({ scrutinIds: ["s1"] });
    expect(editRev!.data).toMatchObject({ action: "edited", actorId: "session:test" });
    expect(edit!.data).toMatchObject({
      policyTitle: INPUT.title,
      evidenceQuotes: [QUOTE],
      generationSource: "MANUAL",
      inputHash: "current-hash",
      status: "NEEDS_REVIEW",
    });
    expect(approveRev!.data).toMatchObject({
      action: "approved",
      actorId: "session:test",
      snapshot: { approvalOverride: { reason: INPUT.reason, actor: "session:test" } },
    });
    expect(approve!.data).toMatchObject({ status: "APPROVED", reviewedBy: "session:test" });
  });
});
