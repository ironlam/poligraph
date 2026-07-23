import { mkdirSync, existsSync, rmSync } from "fs";
import path from "path";
import os from "os";
import { downloadAmendmentsZip, AMENDMENTS_ZIP_URL } from "./amendments-an/download";
import {
  iterateZipJsonEntries,
  dossierRefFromEntryPath,
  texteRefFromEntryPath,
} from "./amendments-an/zip-iterator";
import { normalizeAmendment } from "./amendments-an/normalize";
import {
  writeAmendmentBatch,
  resolveParents,
  resolveIdenticalGroups,
} from "./amendments-an/writer";
import { loadFeedState, saveFeedState } from "./amendments-an/feed-state";
import { scanCentralDirectory } from "./amendments-an/dossier-index";
import {
  loadStoredDossierSignatures,
  saveStoredDossierSignatures,
} from "./amendments-an/signature-store";
import { markPolicyTitlesForSubstanceDrift } from "./mark-policy-titles-substance-drift";
import type {
  NormalizedAmendment,
  AmendmentResolveRef,
  SyncAmendmentsANOptions,
  SyncAmendmentsANStats,
  SyncWarning,
} from "./amendments-an/types";

function emptyStats(warnings: SyncWarning[]): SyncAmendmentsANStats {
  return {
    dossiersInspected: 0,
    dossiersChanged: 0,
    amendmentsSeen: 0,
    amendmentsCreated: 0,
    amendmentsUpdated: 0,
    amendmentsContentChanged: 0,
    amendmentsSummaryChanged: 0,
    amendmentsSubstanceChanged: 0,
    amendmentsMetadataOnly: 0,
    amendmentsUnchanged: 0,
    changedSubstanceAmendmentIds: [],
    amendmentsSkipped: 0,
    parentLinksResolved: 0,
    parentLinksDeferred: 0,
    identicalGroupsResolved: 0,
    dossiersResolved: 0,
    dossiersUnresolved: 0,
    warnings,
    durationMs: 0,
    writeMs: 0,
    resolveMs: 0,
    peakRssMb: 0,
  };
}

export async function syncAmendmentsAN(
  opts: SyncAmendmentsANOptions = {}
): Promise<SyncAmendmentsANStats> {
  const started = Date.now();
  const legislature = opts.legislature ?? 17;
  const batchSize = opts.batchSize ?? 500;
  const mode = opts.mode ?? "incremental";
  const warnings: SyncWarning[] = [];
  const stats = emptyStats(warnings);

  // zipPath mode = explicit local/debug ZIP. We do NOT delete a caller-provided
  // ZIP, and we do NOT touch feed-state (the caller is responsible for state).
  const usingProvidedZip = Boolean(opts.zipPath);
  let zipPath: string | null = opts.zipPath ?? null;
  let tmpDir: string | null = null;

  let downloadedBytes = 0;
  let freshEtag: string | undefined;
  let freshLastModified: string | undefined;

  if (!usingProvidedZip) {
    const prevState = opts.force ? null : await loadFeedState(legislature);

    tmpDir = path.join(os.tmpdir(), `amendments-an-${legislature}-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    zipPath = path.join(tmpDir, "Amendements.json.zip");

    const dl = await downloadAmendmentsZip(zipPath, {
      url: AMENDMENTS_ZIP_URL,
      etag: prevState?.etag ?? null,
    });

    if (dl.notModified) {
      rmSync(tmpDir, { recursive: true, force: true });
      stats.notModified = true;
      stats.downloadedBytes = 0;
      stats.durationMs = Date.now() - started;
      if (opts.verbose) {
        console.log(`[amendments] 304 not modified (etag ${prevState?.etag ?? "?"})`);
      }
      return stats;
    }

    downloadedBytes = dl.bytes;
    freshEtag = dl.etag;
    freshLastModified = dl.lastModified;
    if (opts.verbose) {
      console.log(`[amendments] downloaded ${downloadedBytes} bytes`);
    }
  }

  // --- Central-directory diff (cheap: reads metadata only, no decompression) ---
  // Signature each dossier from the ZIP central directory, then decide which to
  // parse. The fail-loud safety cap is enforced here against the TOTAL number of
  // entries seen during the scan — never a silent truncation.
  const scan = await scanCentralDirectory(zipPath!);
  const current = scan.signatures;
  stats.dossiersInspected = current.size;

  if (opts.safetyCap !== undefined && scan.entriesInspected > opts.safetyCap) {
    throw new Error(
      `[amendments] corpus exceeds safety cap (${opts.safetyCap} entries): refusing to ` +
        `truncate silently. Raise POLICY_TITLE_AMENDMENTS_SAFETY_CAP or investigate feed growth.`
    );
  }

  // Full mode parses every entry and re-baselines the signatures. Incremental
  // mode diffs against the last successful run and parses only new/changed
  // dossiers, skipping the rest before any decompression via `entryFilter`.
  let entryFilter: ((entryPath: string) => boolean) | undefined;
  if (mode === "full") {
    stats.dossiersChanged = current.size;
  } else {
    const stored = opts.dryRun ? {} : await loadStoredDossierSignatures(legislature);
    const changed = new Set<string>();
    for (const [ref, sig] of current) {
      if (stored[ref] !== sig) changed.add(ref);
    }
    stats.dossiersChanged = changed.size;
    entryFilter = (entryPath: string): boolean => {
      const ref = dossierRefFromEntryPath(entryPath);
      return ref !== null && changed.has(ref);
    };
  }

  // Light projection only: the resolve passes below read just these three
  // fields, so we never retain the heavy content/summary HTML for the whole
  // ~123k-entry pass. `batch` still holds full rows but is flushed every
  // `batchSize`, so its footprint stays bounded.
  const all: AmendmentResolveRef[] = [];
  let batch: NormalizedAmendment[] = [];
  let writeMs = 0;
  let peakRss = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    if (!opts.dryRun) {
      const t0 = Date.now();
      const r = await writeAmendmentBatch(batch);
      writeMs += Date.now() - t0;
      stats.amendmentsCreated += r.created;
      stats.amendmentsUpdated += r.updated;
      stats.amendmentsContentChanged += r.contentChanged;
      stats.amendmentsSummaryChanged += r.summaryChanged;
      stats.amendmentsSubstanceChanged += r.substanceChanged;
      stats.amendmentsMetadataOnly += r.metadataOnly;
      stats.amendmentsUnchanged += r.unchanged;
      stats.changedSubstanceAmendmentIds.push(...r.changedSubstanceAmendmentIds);
      stats.dossiersResolved += r.dossiersResolved;
      stats.dossiersUnresolved += r.dossiersUnresolved;
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }
    batch = [];
  };

  const onWarning = (w: { entryPath: string; error: string }) => {
    stats.amendmentsSkipped++;
    warnings.push({ code: "INVALID_JSON", message: `${w.entryPath}: ${w.error}` });
  };

  try {
    for await (const entry of iterateZipJsonEntries(zipPath!, {
      limit: opts.limit,
      onWarning,
      entryFilter,
    })) {
      stats.amendmentsSeen++;
      const dossierRefFromPath = dossierRefFromEntryPath(entry.entryPath);
      const texteRefFromPath = texteRefFromEntryPath(entry.entryPath);
      const n = normalizeAmendment(entry.json, {
        dossierRefFromPath,
        texteRefFromPath,
        legislature,
      });
      if (!n.externalId || !n.number) {
        stats.amendmentsSkipped++;
        warnings.push({
          code: "MISSING_KEY",
          message: `entry ${entry.entryPath} missing uid/number`,
        });
        continue;
      }
      all.push({
        externalId: n.externalId,
        parentExternalId: n.parentExternalId,
        identicalDiscussionId: n.identicalDiscussionId,
      });
      batch.push(n);
      if (batch.length >= batchSize) await flush();
    }
    await flush();

    if (!opts.dryRun) {
      const resolveT0 = Date.now();
      const p = await resolveParents(all);
      stats.parentLinksResolved = p.resolved;
      stats.parentLinksDeferred = p.deferred;
      const g = await resolveIdenticalGroups(all);
      stats.identicalGroupsResolved = g.groups;
      stats.resolveMs = Date.now() - resolveT0;
      // Highest-memory phase (both resolve passes hold their full id maps in
      // memory at once): sample here so peakRssMb is not understated.
      peakRss = Math.max(peakRss, process.memoryUsage().rss);

      // Consume the substance-drift signal: flag policy titles linked to amendments
      // whose content/summary really changed. Marks only (STALE / queued); never
      // generates, approves, publishes, or calls a model.
      stats.substanceDrift = await markPolicyTitlesForSubstanceDrift(
        stats.changedSubstanceAmendmentIds
      );
    }

    if (!usingProvidedZip && !opts.dryRun && freshEtag !== undefined) {
      await saveFeedState(legislature, {
        etag: freshEtag,
        lastModified: freshLastModified,
        contentLength: downloadedBytes,
        lastSuccessfulSyncAt: new Date().toISOString(),
      });
    }

    // Re-baseline the per-dossier signatures on success (both modes). Writing
    // only here — after the resolve passes — means an interrupted run leaves the
    // stored baseline untouched, so the next run reprocesses the same dossiers.
    if (!opts.dryRun) {
      await saveStoredDossierSignatures(legislature, current);
    }
  } finally {
    if (tmpDir && !usingProvidedZip && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  stats.downloadedBytes = downloadedBytes;
  stats.writeMs = writeMs;
  stats.peakRssMb = Math.round(peakRss / 1048576);
  stats.durationMs = Date.now() - started;
  console.info(`[amendments] ${mode} pass`, {
    dossiersInspected: stats.dossiersInspected,
    dossiersChanged: stats.dossiersChanged,
    seen: stats.amendmentsSeen,
    created: stats.amendmentsCreated,
    updated: stats.amendmentsUpdated,
    unchanged: stats.amendmentsUnchanged,
    skipped: stats.amendmentsSkipped,
    durationMs: stats.durationMs,
    writeMs,
    resolveMs: stats.resolveMs,
    peakRssMb: stats.peakRssMb,
  });
  return stats;
}
