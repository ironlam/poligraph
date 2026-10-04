import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import {
  PROFILE_SNAPSHOT_VERSION,
  deserializeProfileDocument,
  type PoliticianProfileDocument,
} from "@/lib/politicians/profile-snapshot/document";
import { buildPoliticianProfileDocument } from "@/lib/politicians/profile-snapshot/build";
import { readDatabaseNow, writeProfileSnapshot } from "@/lib/politicians/profile-snapshot/store";
import { createReportGate } from "@/lib/telemetry/pool-exhaustion";

/** How often one process may send a fallback build to Sentry. */
export const PROFILE_FALLBACK_REPORT_INTERVAL_MS = 10 * 60_000;

const fallbackReportGate = createReportGate(PROFILE_FALLBACK_REPORT_INTERVAL_MS);
// Its own gate on the same interval: the fallback report that precedes a write failure would
// otherwise always close the shared one first, and the failure would never reach Sentry.
const fallbackWriteFailureReportGate = createReportGate(PROFILE_FALLBACK_REPORT_INTERVAL_MS);

type FallbackCause = "missing" | "outdated-version";

function reportFallback(slug: string, cause: FallbackCause): void {
  // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
  console.warn("[profile-snapshot] fallback", { slug, cause });

  // Only inside a Next runtime: scripts and the unit suite have no Sentry.
  if (!process.env.NEXT_RUNTIME) return;
  if (!fallbackReportGate()) return;

  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureMessage("Fiche politicien construite à la volée", {
        level: "warning",
        fingerprint: ["profile-snapshot-fallback"],
        tags: { cause },
      });
    })
    .catch(() => {});
}

function reportFallbackWriteFailure(slug: string, error: unknown): void {
  // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
  console.error(
    JSON.stringify({
      event: "[profile-snapshot] fallback write failed",
      slug,
      message: error instanceof Error ? error.message : String(error),
    })
  );

  if (!process.env.NEXT_RUNTIME) return;
  if (!fallbackWriteFailureReportGate()) return;

  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureException(error, {
        level: "warning",
        fingerprint: ["profile-snapshot-fallback-write-failed"],
      });
    })
    .catch(() => {});
}

/**
 * Reads the precomputed profile document, uncached. One query on the hot path. When the row is
 * missing or built for another document version, builds it and stores it so the next read is
 * fast. That fallback sends no Inngest event and invalidates nothing: it only fills a gap. A
 * failed write is reported and the built document still served: the page never fails for it.
 */
export async function readProfileSnapshot(slug: string): Promise<PoliticianProfileDocument | null> {
  const row = await db.politicianProfileSnapshot.findFirst({
    where: { politician: { slug, ...PUBLIC_POLITICIAN_WHERE } },
    select: { politicianId: true, version: true, data: true },
  });

  if (row && row.version === PROFILE_SNAPSHOT_VERSION) {
    return deserializeProfileDocument(row.data);
  }

  const startedAt = await readDatabaseNow();
  const document = await buildPoliticianProfileDocument({ slug });
  if (!document) return null;

  // Reported before the write, so a write that fails or hangs cannot swallow the signal.
  reportFallback(slug, row ? "outdated-version" : "missing");
  try {
    await writeProfileSnapshot({ politicianId: document.identity.id, document, startedAt });
  } catch (error) {
    reportFallbackWriteFailure(slug, error);
  }
  return document;
}

export const getPoliticianProfile = cache(async (slug: string) => {
  "use cache";
  cacheTag(`politician:${slug}`);
  cacheLife("synced");
  return readProfileSnapshot(slug);
});
