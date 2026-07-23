import crypto from "crypto";
import { db } from "@/lib/db";
import type { NormalizedAmendment, AmendmentResolveRef } from "./types";
import { diffAmendmentRow } from "./change-detection";

export interface BatchResult {
  created: number;
  /** Existing rows actually written this batch (substanceChanged + metadataOnly). */
  updated: number;
  /** Existing rows whose `content` (dispositif) really changed; may overlap summaryChanged. */
  contentChanged: number;
  /** Existing rows whose `summary` (exposé sommaire) really changed; may overlap contentChanged. */
  summaryChanged: number;
  /** Existing rows where content OR summary changed, each counted once. */
  substanceChanged: number;
  /** Existing rows where only non-substance fields changed (subset of `updated`). */
  metadataOnly: number;
  /** Existing rows that were identical to the parse: no write issued. */
  unchanged: number;
  /**
   * cuid ids of existing amendments whose substance (content OR summary) really
   * changed this batch. The read-only signal a later stage (PR B) will consume to
   * flag the linked ScrutinPolicyTitle rows for regeneration. PR A only produces it.
   */
  changedSubstanceAmendmentIds: string[];
  dossiersResolved: number;
  dossiersUnresolved: number;
}

/**
 * Idempotent upsert by externalId. Resolves dossierRefFromPath -> dossierId via
 * a bulk lookup, then a 2-step partition:
 *   1. SELECT existing externalIds in this batch (one query).
 *   2. createMany() for new rows (one bulk insert).
 *   3. per-row update() for rows that already existed (incremental path).
 *
 * On a backfill (empty table) step 3 is empty, so a 1000-row batch costs 2
 * round-trips total (~ms each via the pooler) instead of 1000 × 2. On the daily
 * incremental run, the existing-rows path stays correct via per-row update().
 *
 * Returns counts of dossier-refs that resolved vs. did not.
 */
export async function writeAmendmentBatch(batch: NormalizedAmendment[]): Promise<BatchResult> {
  let dossiersResolved = 0;
  let dossiersUnresolved = 0;

  // Bulk-resolve dossier refs.
  const dossierRefs = [
    ...new Set(batch.map((b) => b.dossierRefFromPath).filter((x): x is string => !!x)),
  ];
  const dossiers = dossierRefs.length
    ? await db.legislativeDossier.findMany({
        where: { externalId: { in: dossierRefs } },
        select: { id: true, externalId: true },
      })
    : [];
  const dossierIdByRef = new Map(dossiers.map((d) => [d.externalId, d.id]));

  // Build the rows we actually intend to write (skip records missing externalId / number).
  type Row = {
    externalId: string;
    number: string;
    texteRef: string | null;
    article: string | null;
    content: string | null;
    summary: string | null;
    status: NormalizedAmendment["status"];
    authorType: string | null;
    authorName: string | null;
    legislature: number;
    chamber: NormalizedAmendment["chamber"];
    dossierId: string | null;
  };
  const rows: Row[] = [];
  for (const a of batch) {
    if (!a.externalId || !a.number) continue;
    let dossierId: string | null = null;
    if (a.dossierRefFromPath) {
      const resolved = dossierIdByRef.get(a.dossierRefFromPath);
      if (resolved) {
        dossierId = resolved;
        dossiersResolved++;
      } else {
        dossiersUnresolved++;
      }
    }
    rows.push({
      externalId: a.externalId,
      number: a.number,
      texteRef: a.texteRef,
      article: a.article,
      content: a.content,
      summary: a.summary,
      status: a.status,
      authorType: a.authorType,
      authorName: a.authorName,
      legislature: a.legislature,
      chamber: a.chamber,
      dossierId,
    });
  }

  if (rows.length === 0)
    return {
      created: 0,
      updated: 0,
      contentChanged: 0,
      summaryChanged: 0,
      substanceChanged: 0,
      metadataOnly: 0,
      unchanged: 0,
      changedSubstanceAmendmentIds: [],
      dossiersResolved,
      dossiersUnresolved,
    };

  // 1. Bulk-fetch the existing rows for this batch with the fields we compare,
  //    so we can decide per-row whether anything actually changed.
  const externalIds = rows.map((r) => r.externalId);
  const existing = await db.amendment.findMany({
    where: { externalId: { in: externalIds } },
    select: {
      id: true,
      externalId: true,
      number: true,
      texteRef: true,
      article: true,
      content: true,
      summary: true,
      status: true,
      authorType: true,
      authorName: true,
      legislature: true,
      chamber: true,
      dossierId: true,
    },
  });
  const existingByExternalId = new Map(existing.map((e) => [e.externalId, e]));

  // 2. Partition.
  const newRows = rows.filter((r) => !existingByExternalId.has(r.externalId));
  const updateRows = rows.filter((r) => existingByExternalId.has(r.externalId));

  // 3a. Bulk insert all new rows in a single createMany.
  if (newRows.length > 0) {
    await db.amendment.createMany({ data: newRows });
  }

  // 3b. Per-row diff + conditional update for the existing set. We only write the
  //     fields that really changed (no blind overwrite), and record which rows had
  //     a genuine substance change (content OR summary) as the regeneration signal
  //     for a later stage.
  let contentChanged = 0;
  let summaryChanged = 0;
  let substanceChanged = 0;
  let metadataOnly = 0;
  let unchanged = 0;
  const changedSubstanceAmendmentIds: string[] = [];

  for (const r of updateRows) {
    const prev = existingByExternalId.get(r.externalId);
    if (!prev) continue; // unreachable: filtered above, narrows the type
    const { externalId, ...incoming } = r;
    const diff = diffAmendmentRow(prev, incoming);

    if (diff.contentChanged) contentChanged++;
    if (diff.summaryChanged) summaryChanged++;

    if (diff.substanceChanged) {
      substanceChanged++;
      changedSubstanceAmendmentIds.push(prev.id);
    } else if (diff.metadataChanged) {
      metadataOnly++;
    } else {
      unchanged++;
      continue; // nothing to write
    }

    await db.amendment.update({ where: { externalId }, data: diff.data });
  }

  return {
    created: newRows.length,
    updated: substanceChanged + metadataOnly,
    contentChanged,
    summaryChanged,
    substanceChanged,
    metadataOnly,
    unchanged,
    changedSubstanceAmendmentIds,
    dossiersResolved,
    dossiersUnresolved,
  };
}

/**
 * Second pass: set parentAmendmentId from parentExternalId.
 * Idempotent (skipped when already correct).
 *
 * Groups children by resolved parent id and issues ONE updateMany per distinct
 * parent, instead of one round trip per child — at the ~123k-entry full pass
 * scale, per-child sequential updates would blow the 270s step timeout.
 */
export async function resolveParents(
  records: AmendmentResolveRef[]
): Promise<{ resolved: number; deferred: number }> {
  let resolved = 0;
  let deferred = 0;

  const withParent = records.filter((r) => r.parentExternalId);
  const parentRefs = [...new Set(withParent.map((r) => r.parentExternalId as string))];
  const parents = parentRefs.length
    ? await db.amendment.findMany({
        where: { externalId: { in: parentRefs } },
        select: { id: true, externalId: true },
      })
    : [];
  const idByRef = new Map(parents.map((p) => [p.externalId, p.id]));

  const childrenByPid = new Map<string, string[]>();
  for (const r of withParent) {
    const pid = idByRef.get(r.parentExternalId as string);
    if (!pid) {
      deferred++;
      continue;
    }
    (childrenByPid.get(pid) ?? childrenByPid.set(pid, []).get(pid)!).push(r.externalId);
    resolved++; // pid found = link resolved (whether newly written or already correct)
  }

  for (const [pid, externalIds] of childrenByPid) {
    // Skip the write when parentAmendmentId is already correct. updateMany
    // matches only when the FK is NULL or set to a different parent — Postgres
    // three-valued logic means we spell out "NULL or != pid" rather than
    // `NOT: { parentAmendmentId: pid }` (which would silently miss NULL rows).
    await db.amendment.updateMany({
      where: {
        externalId: { in: externalIds },
        OR: [{ parentAmendmentId: null }, { parentAmendmentId: { not: pid } }],
      },
      data: { parentAmendmentId: pid },
    });
  }
  return { resolved, deferred };
}

/** Deterministic group key shared by all members of an AN identique discussion. */
export function computeIdenticalGroupKey(discussionId: string): string {
  return crypto.createHash("sha1").update(`identique:${discussionId}`).digest("hex").slice(0, 16);
}

/** Set identicalGroupKey for grouped amendments. Idempotent (same key on re-run). */
export async function resolveIdenticalGroups(
  records: AmendmentResolveRef[]
): Promise<{ groups: number }> {
  const byDiscussion = new Map<string, string[]>();
  for (const r of records) {
    if (!r.identicalDiscussionId) continue;
    const arr = byDiscussion.get(r.identicalDiscussionId) ?? [];
    arr.push(r.externalId);
    byDiscussion.set(r.identicalDiscussionId, arr);
  }
  for (const [discussionId, externalIds] of byDiscussion) {
    const key = computeIdenticalGroupKey(discussionId);
    await db.amendment.updateMany({
      where: { externalId: { in: externalIds } },
      data: { identicalGroupKey: key },
    });
  }
  return { groups: byDiscussion.size };
}
