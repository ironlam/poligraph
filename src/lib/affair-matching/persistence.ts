import crypto from "node:crypto";
import { db } from "@/lib/db";
import { type Prisma } from "@/generated/prisma";
import type { AffairCandidateRecord, AffairScoringInput } from "./signals/types";
import type { CombinerDecision } from "./combiner";
import { RESOLVER_VERSION } from "./signals/constants";
import { normalizeText } from "./candidate-prefilter";
import { buildSurnameVocabulary, type SurnameVocabulary } from "./surname-ambiguity";

/** SHA256 hex digest of a text input, used as the idempotency key. */
export function computeTextHash(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Loads all politicians with enough context to be scored by the affair resolver.
 * Called once per batch by the resolver; results are passed to CandidatePrefilter.
 *
 * Schema adaptations vs. the plan template:
 * - Mandate.role maps to AffairCandidateRecord.mandates[].roleLabel (no separate roleLabel field)
 * - Location comes from Mandate.localData.commune.name (1:1 extension model)
 * - PartyMembership has no `current` boolean — derived from endDate === null
 * - PartyMembership.party.name is the party label (Party.name, not a separate label field)
 * - ExternalId.source is a DataSource enum — serialized to string as-is for externalIds map key
 * - Politician.normalizedLastName is nullable (Phase 3 backfill) — fall back to computed value
 */
export async function loadCandidatePool(): Promise<AffairCandidateRecord[]> {
  const rows = await db.politician.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      normalizedLastName: true,
      birthDate: true,
      deathDate: true,
      civility: true,
      mandates: {
        select: {
          type: true,
          role: true,
          departmentCode: true,
          startDate: true,
          endDate: true,
          localData: {
            select: {
              commune: {
                select: { name: true },
              },
            },
          },
        },
      },
      partyHistory: {
        select: {
          startDate: true,
          endDate: true,
          party: {
            select: { name: true },
          },
        },
      },
      externalIds: {
        select: {
          source: true,
          externalId: true,
        },
      },
    },
  });

  return rows.map((row) => {
    const normalizedLastName = row.normalizedLastName ?? normalizeText(row.lastName);

    const departments = row.mandates
      .map((m) => m.departmentCode)
      .filter((d): d is string => d !== null);

    const mandates = row.mandates.map((m) => ({
      type: m.type as string,
      roleLabel: m.role ?? null,
      location: m.localData?.commune?.name ?? null,
      startDate: m.startDate,
      endDate: m.endDate ?? null,
    }));

    const parties = row.partyHistory.map((pm) => ({
      partyLabel: pm.party.name,
      startDate: pm.startDate ?? null,
      endDate: pm.endDate ?? null,
      current: pm.endDate === null,
    }));

    // Reduce to a map: DataSource string key → externalId value.
    // When a politician has multiple IDs from the same source, last one wins
    // (matches the assumption in ExternalIdSignal that one ID per source suffices).
    const externalIds: Record<string, string> = {};
    for (const eid of row.externalIds) {
      externalIds[eid.source as string] = eid.externalId;
    }

    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      fullName: row.fullName,
      normalizedLastName,
      birthDate: row.birthDate ?? null,
      deathDate: row.deathDate ?? null,
      civility: row.civility ?? null,
      departments,
      mandates,
      parties,
      externalIds,
    };
  });
}

/**
 * How many past decisions feed the casing statistic. The corpus only has to be
 * large enough for the lowercase rate to be stable; the separation it measures
 * is wide (2% for "paris" against 76% for "justice"), so a few thousand texts
 * settle it. Bounded because this loads text into memory on a serverless
 * function, and ordered by recency so the vocabulary tracks current coverage.
 */
const VOCABULARY_CORPUS_SIZE = 3_000;

/**
 * Loads the surname ambiguity vocabulary. Same contract as loadCandidatePool:
 * called once per batch, result passed down to every scoring call.
 *
 * Three queries, none of them per-candidate. The corpus one is the only heavy
 * read, and it is why batch callers must hoist this out of their loop.
 */
export async function loadSurnameVocabulary(): Promise<SurnameVocabulary> {
  const [communes, politicianNames, decisions] = await Promise.all([
    db.commune.findMany({ select: { name: true, population: true } }),
    db.politician.findMany({ select: { firstName: true, lastName: true } }),
    db.affairPoliticianDecision.findMany({
      select: { candidateText: true },
      orderBy: { createdAt: "desc" },
      take: VOCABULARY_CORPUS_SIZE,
    }),
  ]);

  return buildSurnameVocabulary({
    communes,
    politicianNames,
    corpus: decisions.map((d) => d.candidateText),
  });
}

export interface PersistInput {
  text: string;
  metadata: AffairScoringInput["metadata"];
  decision: CombinerDecision;
}

export interface PersistResult {
  decisionId: string;
  created: boolean;
}

/**
 * Writes a decision or returns the existing decision id on duplicate.
 * Idempotency via @@unique([textHash, source, sourceRef]).
 * The sourceRef field is non-null with empty-string default, so we coerce
 * null/undefined to "" when checking and writing.
 */
export async function persistDecision(input: PersistInput): Promise<PersistResult> {
  const textHash = computeTextHash(input.text);
  const source = input.metadata.source;
  const sourceRef = input.metadata.sourceRef ?? "";

  const existing = await db.affairPoliticianDecision.findUnique({
    where: { textHash_source_sourceRef: { textHash, source, sourceRef } },
  });
  if (existing) {
    return { decisionId: existing.id, created: false };
  }

  const payload: Prisma.AffairPoliticianDecisionCreateInput = {
    textHash,
    candidateText: input.text.slice(0, 2000),
    metadata: input.metadata as unknown as Prisma.InputJsonValue,
    judgment: input.decision.judgment as Prisma.AffairPoliticianDecisionCreateInput["judgment"],
    topCandidates: input.decision.topCandidates as unknown as Prisma.InputJsonValue,
    topScore: input.decision.topScore,
    gap: input.decision.gap,
    resolverVersion: RESOLVER_VERSION,
    source,
    sourceRef,
    ...(input.decision.topCandidateId && input.decision.judgment === "SAME"
      ? { chosenPolitician: { connect: { id: input.decision.topCandidateId } } }
      : {}),
  };

  const created = await db.affairPoliticianDecision.create({ data: payload });
  return { decisionId: created.id, created: true };
}

/**
 * Loads the set of politician IDs blocklisted for a given text hash.
 * Returns all NOT_SAME decisions for the same input text so the resolver
 * can exclude them from the candidate set.
 */
export async function loadBlocklist(textHash: string): Promise<Set<string>> {
  const rows = await db.affairPoliticianDecision.findMany({
    where: {
      textHash,
      judgment: "NOT_SAME",
    },
    select: { chosenPoliticianId: true },
  });
  return new Set(rows.map((r) => r.chosenPoliticianId).filter((id): id is string => !!id));
}
