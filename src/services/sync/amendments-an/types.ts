import type { AmendmentStatus, Chamber } from "@/generated/prisma";

export interface NormalizedAmendment {
  externalId: string; // uid
  number: string; // identification.numeroLong (string!)
  texteRef: string | null; // texteLegislatifRef
  dossierRefFromPath: string | null; // DLR… from the ZIP path (resolved to dossierId by the writer)
  article: string | null; // pointeurFragmentTexte.division.articleDesignation
  content: string | null; // corps.contenuAuteur.dispositif (raw HTML)
  summary: string | null; // corps.contenuAuteur.exposeSommaire (raw HTML)
  status: AmendmentStatus;
  parentExternalId: string | null; // amendementParentRef
  identicalDiscussionId: string | null; // discussionIdentique.idDiscussion
  authorType: string | null; // signataires.auteur.typeAuteur
  authorName: string | null; // signataires.libelle
  legislature: number;
  chamber: Chamber;
}

/**
 * Minimal projection kept for the whole run so `resolveParents` /
 * `resolveIdenticalGroups` can run after all batches are flushed. Only these
 * three fields are read downstream, so we deliberately do NOT retain the heavy
 * `content`/`summary` HTML across the ~123k-entry full pass (that array would
 * otherwise dominate memory).
 */
export type AmendmentResolveRef = Pick<
  NormalizedAmendment,
  "externalId" | "parentExternalId" | "identicalDiscussionId"
>;

export interface SyncAmendmentsANOptions {
  legislature?: number; // default 17
  /**
   * "incremental" (default): diff the ZIP central directory against the last
   * successful run's per-dossier signatures and parse/write only new or changed
   * dossiers. "full": parse/write every entry (manual resync) and re-baseline
   * the stored signatures.
   */
  mode?: "incremental" | "full";
  dryRun?: boolean; // parse + report, no DB writes
  limit?: number; // debug/sample only: truncates silently — not for production runs
  safetyCap?: number; // hard ceiling: throw (do NOT truncate) if entries exceed this
  force?: boolean; // ignore etag, force re-download
  zipPath?: string; // use a local ZIP instead of downloading (debug/tests)
  batchSize?: number; // default 500
  verbose?: boolean;
}

export interface SyncWarning {
  code: string;
  message: string;
  externalId?: string;
}

/**
 * Outcome of consuming `changedSubstanceAmendmentIds` (PR B): policy titles whose
 * linked amendment substance changed, flagged for regeneration. No generation here.
 */
export interface PolicyTitleSubstanceDriftResult {
  changedSubstanceAmendmentCount: number;
  linkedScrutins: number;
  policyTitlesMarkedStale: number; // APPROVED -> STALE
  policyTitlesQueuedOrFlagged: number; // NEEDS_REVIEW / DRAFT -> regenerationStatus "queued"
  policyTitlesIgnored: number; // REJECTED / STALE -> untouched
}

export interface SyncAmendmentsANStats {
  notModified?: boolean; // true when feed-state returned 304 and the run short-circuited
  downloadedBytes?: number; // bytes written to disk this run (0 when notModified or zipPath used)
  dossiersInspected?: number; // distinct dossiers found in the ZIP central directory
  dossiersChanged?: number; // dossiers whose signature differed (parsed this run); == inspected in full mode
  amendmentsSeen: number;
  amendmentsCreated: number;
  amendmentsUpdated: number; // amendmentsSubstanceChanged + amendmentsMetadataOnly
  amendmentsContentChanged: number; // existing rows whose `content` (dispositif) really changed
  amendmentsSummaryChanged: number; // existing rows whose `summary` (exposé sommaire) really changed
  amendmentsSubstanceChanged: number; // existing rows where content OR summary changed (once each)
  amendmentsMetadataOnly: number; // existing rows where only non-substance fields changed
  amendmentsUnchanged: number; // existing rows identical to the parse (no write)
  changedSubstanceAmendmentIds: string[]; // signal for PR B: titles to regenerate
  amendmentsSkipped: number;
  parentLinksResolved: number;
  parentLinksDeferred: number;
  identicalGroupsResolved: number;
  dossiersResolved: number;
  dossiersUnresolved: number;
  substanceDrift?: PolicyTitleSubstanceDriftResult; // PR B: set on non-dryRun runs
  warnings: SyncWarning[];
  durationMs: number;
  writeMs?: number; // ms spent in writeAmendmentBatch
  resolveMs?: number; // ms spent in resolveParents + resolveIdenticalGroups
  peakRssMb?: number; // peak process RSS during the run
}
