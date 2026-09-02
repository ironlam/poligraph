import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import {
  evidenceSnapshotV3Schema,
  type EvidenceSnapshot,
} from "@/services/measures/program-import/evidence-v6";

export const EvidenceSnapshotV3Schema = evidenceSnapshotV3Schema;

export type MeasureImportEngine = "V5" | "V6";

export type RevisionEvidenceInput = {
  importEngine?: MeasureImportEngine;
  evidenceSnapshot?: unknown | null;
};

export type RevisionEvidenceGateResult =
  | { ok: true; evidenceSnapshot: Prisma.InputJsonValue | undefined }
  | {
      ok: false;
      reason: "MISSING_VALID_EVIDENCE_SNAPSHOT" | "INVALID_EVIDENCE_SNAPSHOT";
    };

export type EvidenceSnapshotReadResult =
  | { status: "ABSENT" }
  | { status: "VALID"; snapshot: EvidenceSnapshot }
  | { status: "INVALID"; reason: string };

/** Gives an editorial correction of a V6 import its own stable idempotency key. */
export function createV6CorrectionFingerprint(input: {
  previousRevisionId: string;
  text: string;
  details?: string | null;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        kind: "V6_CORRECTION",
        previousRevisionId: input.previousRevisionId,
        text: input.text.trim(),
        details: input.details?.trim() || null,
      })
    )
    .digest("hex");
}

function toPrismaJson(snapshot: EvidenceSnapshot): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
}

/**
 * Future V6 write boundary. V5 and historical revisions keep their existing nullable behavior,
 * while V6 cannot reach a draft transition without a complete, internally consistent V3 proof.
 */
export function validateRevisionEvidence(input: RevisionEvidenceInput): RevisionEvidenceGateResult {
  if (input.evidenceSnapshot === undefined || input.evidenceSnapshot === null) {
    return input.importEngine === "V6"
      ? { ok: false, reason: "MISSING_VALID_EVIDENCE_SNAPSHOT" }
      : { ok: true, evidenceSnapshot: undefined };
  }

  const parsed = EvidenceSnapshotV3Schema.safeParse(input.evidenceSnapshot);
  if (!parsed.success) {
    return {
      ok: false,
      reason:
        input.importEngine === "V6"
          ? "MISSING_VALID_EVIDENCE_SNAPSHOT"
          : "INVALID_EVIDENCE_SNAPSHOT",
    };
  }

  return { ok: true, evidenceSnapshot: toPrismaJson(parsed.data as EvidenceSnapshot) };
}

/**
 * Read boundary used by moderation. Invalid or unknown snapshots are identified but never exposed
 * as valid evidence, so a malformed JSON value cannot acquire editorial authority in the UI.
 */
export function readEvidenceSnapshot(value: unknown): EvidenceSnapshotReadResult {
  if (value === undefined || value === null) return { status: "ABSENT" };

  const parsed = EvidenceSnapshotV3Schema.safeParse(value);
  if (!parsed.success) {
    return {
      status: "INVALID",
      reason: parsed.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  return { status: "VALID", snapshot: parsed.data as EvidenceSnapshot };
}
