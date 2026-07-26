/**
 * Targeted enrichment of a `CourtDecision` from Judilibre (#337).
 *
 * The input is always a **reference** — a Judilibre id, an ECLI, a pourvoi number —
 * never a person's name. Searching the corpus by name produced 0 affairs out of 156
 * decisions, because the corpus is pseudonymised; that pipeline is retired and this
 * one deliberately cannot express it.
 *
 * The output is a decision, and only a decision. Nothing here creates or modifies an
 * `Affair`, changes a publication status, touches `Affair.court` or
 * `Affair.verdictDate`, creates an editorial proposal, merges affairs, or alters a
 * link. Editorial proposals stay reserved for corrections to an `Affair`.
 *
 * Writes are direct rather than proposed: a `CourtDecision` records an official act,
 * its fields come from an authenticated response, and the editorial fiche is left
 * untouched. Every write is audited with enough provenance to be re-derived.
 */

import { db, type DbTransactionClient } from "@/lib/db";
import { createJudilibreClient, type JudilibreDecision } from "@/lib/api/judilibre";
import { foldJudicialReference } from "@/lib/affairs/judicial-reference";
import {
  hashJudilibrePayload,
  JUDILIBRE_MAPPER_VERSION,
  mapJudilibreToCourtDecision,
  type JudilibreLabels,
  type MappedCourtDecision,
} from "./judilibre-court-decision";

/** Fields this service may write. `judilibreId` is the identity, handled apart. */
const ENRICHABLE_FIELDS = [
  "ecli",
  "pourvoiNumber",
  "pourvoiNumberNormalized",
  "decisionDate",
  "court",
  "chamber",
  "solution",
  "sourceUrl",
] as const;

type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

export interface EnrichCourtDecisionInput {
  courtDecisionId: string;
  /** At least one reference is required; they are tried in this order. */
  judilibreId?: string | null;
  ecli?: string | null;
  pourvoiNumber?: string | null;
  /** Channel that triggered it — "admin", "cli" — not the tool used. Audited. */
  triggeredBy?: string | null;
  requestMeta?: { ip?: string | null; userAgent?: string | null } | null;
}

export type EnrichCourtDecisionResult =
  | { status: "UPDATED"; judilibreId: string; changes: FieldChange[] }
  | { status: "UNCHANGED"; judilibreId: string }
  | { status: "NOT_FOUND"; reference: string }
  | { status: "AMBIGUOUS"; reference: string; candidates: string[] }
  | { status: "CONFLICT"; reason: string }
  | { status: "NO_REFERENCE" }
  | { status: "UNAVAILABLE" };

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** The narrow slice of the client this service needs, so tests can supply their own. */
export interface JudilibreReader {
  getDecision(id: string): Promise<JudilibreDecision>;
  findDecisionByEcli(ecli: string): Promise<{ id: string } | null>;
  findDecisionsByPourvoiNumber(pourvoiNumber: string): Promise<{ id: string }[]>;
  getTaxonomy(
    id: "jurisdiction" | "chamber" | "solution" | "type"
  ): Promise<Record<string, string>>;
}

class EnrichmentStop extends Error {
  constructor(public readonly result: EnrichCourtDecisionResult) {
    super("enrichment stopped");
  }
}

/**
 * Resolves the reference to exactly one Judilibre id.
 *
 * A pourvoi number is never treated as an identity: several decisions can carry it,
 * so more than one candidate stops the operation instead of picking the first.
 */
async function resolveJudilibreId(
  reader: JudilibreReader,
  input: EnrichCourtDecisionInput
): Promise<{ id: string; reference: string }> {
  const judilibreId = input.judilibreId?.trim();
  if (judilibreId) return { id: judilibreId, reference: judilibreId };

  const ecli = input.ecli?.trim();
  if (ecli) {
    const found = await reader.findDecisionByEcli(ecli);
    if (!found) throw new EnrichmentStop({ status: "NOT_FOUND", reference: ecli });
    return { id: found.id, reference: ecli };
  }

  const pourvoi = input.pourvoiNumber?.trim();
  if (pourvoi) {
    const candidates = await reader.findDecisionsByPourvoiNumber(pourvoi);
    if (candidates.length === 0)
      throw new EnrichmentStop({ status: "NOT_FOUND", reference: pourvoi });
    if (candidates.length > 1) {
      throw new EnrichmentStop({
        status: "AMBIGUOUS",
        reference: pourvoi,
        candidates: candidates.map((c) => c.id),
      });
    }
    return { id: candidates[0]!.id, reference: pourvoi };
  }

  throw new EnrichmentStop({ status: "NO_REFERENCE" });
}

/**
 * Refuses a response that is not the decision that was asked for.
 *
 * Covers both directions: the response must answer the reference used, and it must
 * not contradict an identity the row already carries. Enriching a row that already
 * points at another Judilibre decision would silently rewrite which decision a
 * published fiche cites.
 */
function assertIdentityMatches(
  record: JudilibreDecision,
  input: EnrichCourtDecisionInput,
  stored: { judilibreId: string | null; ecli: string | null }
): void {
  const stop = (reason: string): never => {
    throw new EnrichmentStop({ status: "CONFLICT", reason });
  };

  if (input.judilibreId?.trim() && record.id !== input.judilibreId.trim()) {
    stop(`la réponse porte l'identifiant ${record.id}, pas ${input.judilibreId.trim()}`);
  }

  const askedEcli = input.ecli?.trim();
  if (askedEcli && foldJudicialReference(record.ecli ?? "") !== foldJudicialReference(askedEcli)) {
    stop(`la réponse porte l'ECLI ${record.ecli ?? "aucun"}, pas ${askedEcli}`);
  }

  const askedPourvoi = input.pourvoiNumber?.trim();
  if (askedPourvoi) {
    const wanted = foldJudicialReference(askedPourvoi);
    const numbers = record.numbers?.length ? record.numbers : [record.number];
    if (!numbers.some((n) => n && foldJudicialReference(n) === wanted)) {
      stop(`la réponse ne porte pas le pourvoi ${askedPourvoi}`);
    }
  }

  if (stored.judilibreId && stored.judilibreId !== record.id) {
    stop(
      `la décision est déjà rattachée à l'identifiant ${stored.judilibreId}, ` +
        `la réponse porte ${record.id}`
    );
  }

  if (
    stored.ecli &&
    record.ecli &&
    foldJudicialReference(stored.ecli) !== foldJudicialReference(record.ecli)
  ) {
    stop(`la décision porte l'ECLI ${stored.ecli}, la réponse porte ${record.ecli}`);
  }
}

/** Two stored values compare equal, dates included. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/**
 * What the official response changes, field by field.
 *
 * A null in the response never erases a stored value: the API omitting a field is
 * not the API stating that the field is empty. A non-null official value that
 * differs is applied, and the full before/after lands in the audit trail.
 */
function computeChanges(
  stored: Record<string, unknown>,
  mapped: MappedCourtDecision
): { data: Record<string, unknown>; changes: FieldChange[] } {
  const data: Record<string, unknown> = {};
  const changes: FieldChange[] = [];

  for (const field of ENRICHABLE_FIELDS) {
    const after = mapped[field as EnrichableField];
    if (after === null || after === undefined) continue;

    const before = stored[field] ?? null;
    if (sameValue(before, after)) continue;

    data[field] = after;
    changes.push({ field, before, after });
  }

  return { data, changes };
}

/**
 * Fetches the official record and writes it onto the decision.
 *
 * The network call happens outside the transaction: holding a database connection
 * open across an HTTP round trip is how a pool runs dry. The row is then re-read
 * inside the transaction, so a concurrent change is seen before writing.
 */
export async function enrichCourtDecisionFromJudilibre(
  input: EnrichCourtDecisionInput,
  reader?: JudilibreReader | null,
  client: typeof db = db
): Promise<EnrichCourtDecisionResult> {
  const judilibre = reader ?? (createJudilibreClient() as JudilibreReader | null);
  if (!judilibre) return { status: "UNAVAILABLE" };

  try {
    const existing = await client.courtDecision.findUnique({
      where: { id: input.courtDecisionId },
      select: { id: true, judilibreId: true, ecli: true },
    });
    if (!existing) {
      return { status: "CONFLICT", reason: "décision introuvable" };
    }

    const { id: resolvedId } = await resolveJudilibreId(judilibre, input);
    const record = await judilibre.getDecision(resolvedId);
    assertIdentityMatches(record, input, existing);

    const [jurisdiction, chamber, solution, type] = await Promise.all([
      judilibre.getTaxonomy("jurisdiction"),
      judilibre.getTaxonomy("chamber"),
      judilibre.getTaxonomy("solution"),
      judilibre.getTaxonomy("type"),
    ]);
    const labels: JudilibreLabels = { jurisdiction, chamber, solution, type };
    const payloadHash = hashJudilibrePayload(record);

    return await client.$transaction(async (tx) => {
      const current = await readForUpdate(tx, input.courtDecisionId);
      if (!current) return { status: "CONFLICT", reason: "décision supprimée entre-temps" };

      assertIdentityMatches(record, input, {
        judilibreId: current.judilibreId,
        ecli: current.ecli,
      });

      const mapped = mapJudilibreToCourtDecision(record, labels, new Date());
      const { data, changes } = computeChanges(current as Record<string, unknown>, mapped);
      const identityChanged = current.judilibreId !== record.id;
      const storedHash = readStoredHash(current.metadata);

      // Replaying the same response must write nothing: no row touched, no audit
      // entry, and in particular no refreshed `retrievedAt` masquerading as a change.
      if (!identityChanged && changes.length === 0 && storedHash === payloadHash) {
        return { status: "UNCHANGED", judilibreId: record.id };
      }

      if (identityChanged) {
        changes.unshift({ field: "judilibreId", before: current.judilibreId, after: record.id });
      }

      await tx.courtDecision.update({
        where: { id: input.courtDecisionId },
        data: { ...data, judilibreId: record.id, metadata: mapped.metadata },
      });

      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entityType: "CourtDecision",
          entityId: input.courtDecisionId,
          ipAddress: input.requestMeta?.ip ?? null,
          userAgent: input.requestMeta?.userAgent ?? null,
          changes: {
            action: "JUDILIBRE_ENRICHMENT",
            triggeredBy: input.triggeredBy ?? null,
            reference: describeReference(input),
            judilibreId: record.id,
            sourceContentHash: payloadHash,
            mapperVersion: JUDILIBRE_MAPPER_VERSION,
            retrievedAt: mapped.metadata.retrievedAt,
            changes: changes.map((c) => ({
              field: c.field,
              before: serialize(c.before),
              after: serialize(c.after),
            })),
          },
        },
      });

      return { status: "UPDATED", judilibreId: record.id, changes };
    });
  } catch (error) {
    if (error instanceof EnrichmentStop) return error.result;
    throw error;
  }
}

async function readForUpdate(tx: DbTransactionClient, id: string) {
  return tx.courtDecision.findUnique({ where: { id } });
}

/** The reference actually used, for the audit trail. */
function describeReference(input: EnrichCourtDecisionInput): string {
  if (input.judilibreId?.trim()) return `judilibreId:${input.judilibreId.trim()}`;
  if (input.ecli?.trim()) return `ecli:${input.ecli.trim()}`;
  if (input.pourvoiNumber?.trim()) return `pourvoi:${input.pourvoiNumber.trim()}`;
  return "aucune";
}

/** The hash stored on the previous enrichment, if this row carries one. */
function readStoredHash(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const hash = (metadata as Record<string, unknown>).sourceContentHash;
  return typeof hash === "string" ? hash : null;
}

function serialize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}
