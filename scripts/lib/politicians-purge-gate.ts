/**
 * Tells the daily script whether the "politicians" tag needs purging on this run.
 *
 * The tag is carried by the readers of every commune, department and region page, the listings
 * and the homepage. The daily script used to purge it on each of its three runs, as the catch-all
 * for whatever writes without purging: prominence, publication status, the politician syncs, the
 * manual imports. That regenerated those pages three times a day, mostly for no change.
 *
 * Two conditions now decide, and either one purges:
 *
 * - the politicians or their mandates changed since the last purge, whoever wrote them. The
 *   comparison is against the state recorded at that purge, not against the start of this run, so
 *   a write made between two runs by another workflow or by hand is caught too;
 * - the last purge is older than `MAX_AGE_MS`. This keeps the catch-all for what the marker cannot
 *   see: raw SQL that leaves `updatedAt` alone (prominence) and the tables it does not read.
 *
 * Anything unknown purges: a missing record, an unreadable marker, a failed read.
 */

/** Under a day, so that the catch-all lands on the same run every day despite cron drift. */
export const MAX_AGE_MS = 20 * 60 * 60 * 1000;

export const PURGE_STATE_KEY = "cache-purge:politicians";

export interface PurgeState {
  marker: string;
  purgedAt: Date;
}

export interface PurgeDecision {
  purge: boolean;
  reason: string;
}

interface GateDeps {
  readMarker: () => Promise<string>;
  readState: () => Promise<PurgeState | null>;
  writeState: (marker: string) => Promise<void>;
  now?: () => Date;
}

async function readPoliticiansMarker(): Promise<string> {
  // Imported here, not at module load: the client is built on import and needs DATABASE_URL.
  const { db } = await import("@/lib/db");
  // The row count sits next to the newest update because a deletion moves no `updatedAt`.
  const [politicians, mandates, localMandates] = await Promise.all([
    db.politician.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.mandate.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.mandateLocal.aggregate({ _max: { updatedAt: true }, _count: true }),
  ]);
  return [politicians, mandates, localMandates]
    .map((table) => `${table._max.updatedAt?.toISOString() ?? "none"}#${table._count}`)
    .join("|");
}

async function readPurgeState(): Promise<PurgeState | null> {
  const { syncMetadata } = await import("@/lib/sync/sync-metadata");
  const row = await syncMetadata.get(PURGE_STATE_KEY);
  if (!row?.cursor || !row.lastSyncAt) return null;
  return { marker: row.cursor, purgedAt: row.lastSyncAt };
}

async function writePurgeState(marker: string): Promise<void> {
  const { syncMetadata } = await import("@/lib/sync/sync-metadata");
  await syncMetadata.set(PURGE_STATE_KEY, { cursor: marker });
}

export function createPoliticiansPurgeGate(
  deps: GateDeps = {
    readMarker: readPoliticiansMarker,
    readState: readPurgeState,
    writeState: writePurgeState,
  }
) {
  const now = deps.now ?? (() => new Date());
  // The marker the decision was taken on. Recorded after the purge, so a write landing while the
  // purge runs is newer than what gets stored and purges again on the next run.
  let decidedOn: string | undefined;

  return {
    /** Never throws: a decision that cannot be reached is a purge. */
    async decide(): Promise<PurgeDecision> {
      decidedOn = undefined;
      let marker: string;
      let state: PurgeState | null;
      try {
        [marker, state] = await Promise.all([deps.readMarker(), deps.readState()]);
      } catch (error) {
        return { purge: true, reason: `état illisible (${String(error)})` };
      }
      decidedOn = marker;
      if (!state) return { purge: true, reason: "aucune purge enregistrée" };
      if (state.marker !== marker) {
        return { purge: true, reason: "fiches ou mandats modifiés depuis la dernière purge" };
      }
      const age = now().getTime() - state.purgedAt.getTime();
      if (age >= MAX_AGE_MS) {
        return { purge: true, reason: "dernière purge trop ancienne, filet quotidien" };
      }
      return { purge: false, reason: "rien de changé depuis la dernière purge" };
    },

    /** Call once the purge went through. A failure here only costs one extra purge next run. */
    async recordPurge(): Promise<void> {
      if (decidedOn === undefined) return;
      try {
        await deps.writeState(decidedOn);
      } catch (error) {
        console.warn(`Purge state not recorded, the next run will purge again: ${String(error)}`);
      }
    },
  };
}
