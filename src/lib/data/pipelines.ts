import { db } from "@/lib/db";
import { cacheLife, cacheTag } from "next/cache";
import {
  PIPELINE_REGISTRY,
  computePipelineHealth,
  type PipelineConfig,
  type PipelineHealth,
  type PipelineLastRun,
} from "@/config/pipeline-registry";

export interface PipelineConversionMetrics {
  entitiesCreated7d: number;
  /** Conversion rate (entities created / items processed). 0 if no items processed in window. */
  conversionRate: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Count entities produced by a pipeline over the last 7 days and compute the
 * conversion rate vs. items processed (when itemCount is available).
 *
 * Returns null when the pipeline has no `conversionTarget` or doesn't exist.
 */
export async function getPipelineConversionMetrics(
  pipelineId: string
): Promise<PipelineConversionMetrics | null> {
  const pipeline = PIPELINE_REGISTRY.find((p) => p.id === pipelineId);
  if (!pipeline?.conversionTarget) return null;

  const since = new Date(Date.now() - SEVEN_DAYS_MS);
  const { model, sourceFilter } = pipeline.conversionTarget;

  let entitiesCreated7d = 0;
  if (model === "affair") {
    entitiesCreated7d = await db.affair.count({
      where: {
        createdAt: { gte: since },
        ...(sourceFilter ? { sources: { some: { sourceType: sourceFilter } } } : {}),
      },
    });
  } else if (model === "factCheck") {
    entitiesCreated7d = await db.factCheck.count({
      where: { createdAt: { gte: since } },
    });
  } else if (model === "politician") {
    entitiesCreated7d = await db.politician.count({
      where: { createdAt: { gte: since } },
    });
  }

  // NOTE: we look up syncMetadata by pipeline.id, but some pipelines write to
  // a different sourceKey (e.g. registry id "press" vs sourceKey "press-rss" /
  // "press-analysis"). When the keys don't match the sum is 0 and conversionRate
  // falls back to 0. A registry-level sourceKey mapping is a follow-up task.
  const itemsAgg = await db.syncMetadata.aggregate({
    where: {
      sourceKey: pipeline.id,
      lastSyncAt: { gte: since },
    },
    _sum: { itemCount: true },
  });
  const itemsProcessed = itemsAgg._sum.itemCount ?? 0;
  const conversionRate = itemsProcessed > 0 ? entitiesCreated7d / itemsProcessed : 0;

  return { entitiesCreated7d, conversionRate };
}

// ─── DB queries (private) ───────────────────────────────────────

async function getLastRunFromMetadata(keys: string[]): Promise<PipelineLastRun> {
  const rows = await db.syncMetadata.findMany({
    where: { sourceKey: { in: keys } },
    orderBy: { lastSyncAt: "desc" },
    take: 1,
  });

  const row = rows[0];
  if (!row) {
    return { lastRunAt: null, durationS: null, itemCount: null, error: null, status: null };
  }

  return {
    lastRunAt: row.lastSyncAt,
    durationS: row.lastDurationS,
    itemCount: row.itemCount,
    error: null,
    status: row.lastSyncAt ? "completed" : null,
  };
}

async function getLastRunFromJobs(scripts: string[]): Promise<PipelineLastRun> {
  const job = await db.syncJob.findFirst({
    where: { script: { in: scripts } },
    orderBy: { createdAt: "desc" },
  });

  if (!job) {
    return { lastRunAt: null, durationS: null, itemCount: null, error: null, status: null };
  }

  const durationS =
    job.startedAt && job.completedAt
      ? (job.completedAt.getTime() - job.startedAt.getTime()) / 1000
      : null;

  return {
    lastRunAt: job.completedAt ?? job.startedAt ?? job.createdAt,
    durationS,
    itemCount: job.processed,
    error: job.error,
    status:
      job.status === "COMPLETED"
        ? "completed"
        : job.status === "FAILED"
          ? "failed"
          : job.status === "RUNNING"
            ? "running"
            : null,
  };
}

// ─── Exported functions ─────────────────────────────────────────

async function getLastRunForPipeline(config: PipelineConfig): Promise<PipelineLastRun> {
  const results: PipelineLastRun[] = [];

  if (config.metadataKeys?.length) {
    results.push(await getLastRunFromMetadata(config.metadataKeys));
  }

  if (config.jobScripts?.length) {
    results.push(await getLastRunFromJobs(config.jobScripts));
  }

  if (results.length === 0) {
    return { lastRunAt: null, durationS: null, itemCount: null, error: null, status: null };
  }

  // Pick the most recent successful run across all sources
  return results.reduce((best, current) => {
    if (!current.lastRunAt) return best;
    if (!best.lastRunAt) return current;
    return current.lastRunAt > best.lastRunAt ? current : best;
  });
}

/**
 * Get health status for all registered pipelines.
 * Cached for 5 minutes (admin dashboard refresh).
 */
export async function getPipelineHealthAll(): Promise<PipelineHealth[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("pipelines");

  const now = new Date();
  return Promise.all(
    PIPELINE_REGISTRY.map(async (config) =>
      computePipelineHealth(config, await getLastRunForPipeline(config), now)
    )
  );
}

/**
 * Get health status for a single pipeline by ID.
 */
export async function getPipelineHealth(id: string): Promise<PipelineHealth | null> {
  const config = PIPELINE_REGISTRY.find((p) => p.id === id);
  if (!config) return null;

  const lastRun = await getLastRunForPipeline(config);
  return computePipelineHealth(config, lastRun);
}

/**
 * Summary stats for the dashboard header.
 */
export async function getPipelinesSummary(): Promise<{
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  unknown: number;
  disabled: number;
}> {
  const all = await getPipelineHealthAll();

  return {
    total: all.length,
    healthy: all.filter((h) => h.status === "healthy").length,
    warning: all.filter((h) => h.status === "warning").length,
    critical: all.filter((h) => h.status === "critical").length,
    unknown: all.filter((h) => h.status === "unknown").length,
    disabled: all.filter((h) => h.status === "disabled").length,
  };
}
