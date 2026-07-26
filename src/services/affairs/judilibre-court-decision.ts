/**
 * Judilibre record → `CourtDecision` fields (#337).
 *
 * Pure mapping, no I/O and no database access, so the translation can be tested
 * against fixed payloads rather than against a live API.
 *
 * This module maps a decision onto a **decision**. It deliberately produces no
 * affair title, category, status, sentence or person involvement: the discovery
 * pipeline that inferred those from a pseudonymised corpus produced 0 affairs out
 * of 156 decisions and was retired. `judilibre-mapping.ts` still holds those
 * affair-facing helpers and is not reused here.
 *
 * Labels are passed in from the API's own taxonomy rather than hardcoded, so a
 * reader sees the wording the Cour de cassation publishes. An unknown code maps to
 * null: inventing a label would be asserting something the source did not say.
 */

import {
  buildJudilibreDecisionUrl,
  type JudilibreDecision,
  type JudilibreTaxonomy,
} from "@/lib/api/judilibre";
import { hashSourceContent } from "@/lib/hash/canonical";
import { foldJudicialReference } from "@/lib/affairs/judicial-reference";

/**
 * Bumped whenever this mapping changes what it writes for the same payload.
 * Recorded in the audit trail so a stored value can be traced to the rules that
 * produced it.
 */
export const JUDILIBRE_MAPPER_VERSION = "1.0.0";

/** Official label tables, as returned by `/taxonomy`. */
export interface JudilibreLabels {
  jurisdiction: JudilibreTaxonomy;
  chamber: JudilibreTaxonomy;
  solution: JudilibreTaxonomy;
  type: JudilibreTaxonomy;
}

/** Exactly the `CourtDecision` columns this mapping is allowed to fill. */
export interface MappedCourtDecision {
  judilibreId: string;
  ecli: string | null;
  pourvoiNumber: string | null;
  pourvoiNumberNormalized: string | null;
  decisionDate: Date | null;
  court: string | null;
  chamber: string | null;
  solution: string | null;
  sourceUrl: string;
  metadata: JudilibreMetadata;
}

export interface JudilibreMetadata {
  /** The raw payload, minus the decision body. See `text` handling below. */
  judilibre: Record<string, unknown>;
  /** Length of the omitted body, so its absence is visible rather than silent. */
  textLength: number;
  /** Hash over the payload *including* the body, so any change is detectable. */
  sourceContentHash: string;
  mapperVersion: string;
  retrievedAt: string;
}

/** Reads a taxonomy without ever inventing a label for an unknown code. */
function label(taxonomy: JudilibreTaxonomy, code: string | undefined): string | null {
  if (!code) return null;
  return taxonomy[code] ?? null;
}

/**
 * Parses the API's `YYYY-MM-DD` at UTC midnight.
 *
 * Without the explicit `Z`, a date-only string is parsed as UTC by the spec but
 * displayed in local time, which can shift a decision to the previous day west of
 * Greenwich. A malformed value yields null rather than an Invalid Date.
 */
function parseDecisionDate(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Stable hash of the full payload, body included.
 *
 * Exported so callers can compare a fresh response with what was stored without
 * having to rebuild the metadata.
 */
export function hashJudilibrePayload(record: JudilibreDecision): string {
  return hashSourceContent(record as unknown);
}

/**
 * The raw payload as stored, with the decision body removed.
 *
 * The body runs to ~110 000 characters, and `metadata` is loaded on every public
 * affair page through `listCourtDecisionsForAffair`. Keeping it would put a large
 * unused string on the read path of every fiche. It stays reachable at `sourceUrl`,
 * its length is recorded, and the hash still covers it, so nothing is silently lost.
 */
export function buildJudilibreMetadata(
  record: JudilibreDecision,
  retrievedAt: Date
): JudilibreMetadata {
  const { text, ...withoutText } = record;

  return {
    judilibre: withoutText,
    textLength: typeof text === "string" ? text.length : 0,
    sourceContentHash: hashJudilibrePayload(record),
    mapperVersion: JUDILIBRE_MAPPER_VERSION,
    retrievedAt: retrievedAt.toISOString(),
  };
}

/**
 * Translates one official record into decision fields.
 *
 * `pourvoiNumber` keeps the principal number as published; the full `numbers` list
 * stays in the raw payload. The principal number is not an identity — several
 * decisions can share it — so it is stored for display and lookup only.
 */
export function mapJudilibreToCourtDecision(
  record: JudilibreDecision,
  labels: JudilibreLabels,
  retrievedAt: Date
): MappedCourtDecision {
  const pourvoiNumber = record.number?.trim() || null;

  return {
    judilibreId: record.id,
    // Absent on decisions predating ECLI in France; null, never fabricated.
    ecli: record.ecli?.trim() || null,
    pourvoiNumber,
    pourvoiNumberNormalized: pourvoiNumber ? foldJudicialReference(pourvoiNumber) : null,
    decisionDate: parseDecisionDate(record.decision_date),
    court: label(labels.jurisdiction, record.jurisdiction),
    chamber: label(labels.chamber, record.chamber),
    solution: label(labels.solution, record.solution),
    sourceUrl: buildJudilibreDecisionUrl(record.id),
    metadata: buildJudilibreMetadata(record, retrievedAt),
  };
}
