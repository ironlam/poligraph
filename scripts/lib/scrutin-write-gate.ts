/**
 * Tells the daily script whether its scrutin syncs wrote anything, so the "votes" purge can be
 * skipped when they did not.
 *
 * The syncs run as child processes and hand back no counters. Both of them go through
 * `db.scrutin.update` or `create` before they write a scrutin's votes, which moves
 * `Scrutin.updatedAt`: the newest value before and after the syncs is the same signal as the
 * counters the Inngest path reads (src/inngest/vote-cache.ts).
 */

type MarkerReader = () => Promise<string | null>;

async function readNewestScrutinUpdate(): Promise<string | null> {
  // Imported here, not at module load: the client is built on import and needs DATABASE_URL.
  const { db } = await import("@/lib/db");
  const { _max } = await db.scrutin.aggregate({ _max: { updatedAt: true } });
  return _max.updatedAt?.toISOString() ?? null;
}

export function createScrutinWriteGate(read: MarkerReader = readNewestScrutinUpdate) {
  // undefined: never captured, or the read failed. Both mean "unknown", which purges.
  let before: string | null | undefined;

  return {
    /** Call before the scrutin syncs. Never throws: an unreadable marker must not fail the run. */
    async capture(): Promise<void> {
      try {
        before = await read();
      } catch (error) {
        before = undefined;
        console.warn(`Scrutin marker unreadable, the votes purge will run: ${String(error)}`);
      }
    },

    /** Call after the scrutin syncs. True whenever a write happened or cannot be ruled out. */
    async scrutinsWritten(): Promise<boolean> {
      if (before === undefined) return true;
      try {
        return (await read()) !== before;
      } catch {
        return true;
      }
    },
  };
}
