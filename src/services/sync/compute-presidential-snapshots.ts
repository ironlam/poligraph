import { Prisma } from "@/generated/prisma";
import { getCategoriesForSuper } from "@/config/labels";
import { db } from "@/lib/db";
import { getConvictionOnlyWhere } from "@/lib/affairs/public-filters";
import { PUBLIC_HUB_CANDIDACY_WHERE } from "@/lib/presidentielle/publication";
import { probityCandidateCountKey, type ProbityCandidateCount } from "@/types/stats-snapshots";

/**
 * Pre-compute the presidential aggregations that are too heavy for the request path.
 *
 * Called by:
 *   - npm run sync:presidential-snapshots (CLI)
 *   - the GitHub Actions daily sync (scripts/sync-daily.ts)
 *
 * It runs in GitHub Actions rather than Inngest on purpose: Inngest is served by Next, so a heavy
 * query there holds one of the two connection-pool slots of a lambda that also serves pages.
 *
 * Idempotent. Safe to run concurrently, the upsert key prevents duplicates.
 */
export async function computePresidentialSnapshots(
  electionSlug = "presidentielle-2027",
  options: { dryRun?: boolean } = {}
): Promise<{ ok: true; computed: string[]; totalDurationMs: number }> {
  const { dryRun = false } = options;
  const t0 = Date.now();
  const computed: string[] = [];

  const key = probityCandidateCountKey(electionSlug);
  const t1 = Date.now();
  const count = await computeProbityCandidateCountLive(electionSlug);
  const durationMs = Date.now() - t1;

  const data: ProbityCandidateCount = { electionSlug, count };
  if (dryRun) {
    // `.env` points at production on this project, so a preview run must not write.
    console.log(`  [DRY RUN] would upsert ${key} -> ${count} (${durationMs}ms)`);
  } else {
    await db.statsSnapshot.upsert({
      where: { key },
      create: { key, data: data as unknown as Prisma.InputJsonValue, durationMs },
      update: {
        data: data as unknown as Prisma.InputJsonValue,
        durationMs,
        computedAt: new Date(),
      },
    });
    console.log(`  [snapshot] ${key} -> ${count} in ${durationMs}ms`);
  }
  computed.push(`${key} = ${count} (${durationMs}ms)`);

  return { ok: true, computed, totalDurationMs: Date.now() - t0 };
}

/**
 * The live form, kept as the read-time fallback so a missing snapshot costs speed, never accuracy.
 * The predicate is the single source of truth for both paths: it must stay identical to what the
 * candidate fiches use, so an investigation or a favourable outcome can never enter the count.
 */
export async function computeProbityCandidateCountLive(electionSlug: string): Promise<number> {
  const rows = await db.affair.groupBy({
    by: ["politicianId"],
    where: {
      ...getConvictionOnlyWhere(),
      category: { in: getCategoriesForSuper("PROBITE") },
      politician: {
        is: {
          candidacies: {
            some: {
              election: { slug: electionSlug },
              ...PUBLIC_HUB_CANDIDACY_WHERE,
            },
          },
        },
      },
    },
  });
  return rows.length;
}
