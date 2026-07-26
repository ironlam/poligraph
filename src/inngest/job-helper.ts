import { Prisma } from "@/generated/prisma";
import type { InputJsonValue } from "@/generated/prisma/runtime/client";
import { db } from "@/lib/db";
import { isCriticalScript } from "@/config/sync-criticality";
import { sendWebhook, formatDuration } from "@/services/notifications";

export async function markJobRunning(jobId: string) {
  await db.syncJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });
}

export async function markJobCompleted(jobId: string, result?: InputJsonValue) {
  const job = await db.syncJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      progress: 100,
      completedAt: new Date(),
      result: result ?? Prisma.DbNull,
    },
  });

  // Notify on new affairs detected
  if (
    job.script === "sync-press-analysis" &&
    result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    "newAffairs" in result &&
    typeof (result as Record<string, unknown>).newAffairs === "number" &&
    ((result as Record<string, unknown>).newAffairs as number) > 0
  ) {
    sendWebhook({
      event: "sync.new_affairs",
      script: job.script,
      status: "COMPLETED",
      duration: formatDuration(job.startedAt, job.completedAt),
      stats: { processed: job.processed, total: job.total },
      timestamp: new Date().toISOString(),
      url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://poligraph.fr"}/admin/syncs`,
    }).catch(() => {});
  }
}

export async function markJobFailed(jobId: string, error: string) {
  const job = await db.syncJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      error: error.slice(0, 2000),
    },
  });

  // Notify on critical script failure
  if (isCriticalScript(job.script)) {
    sendWebhook({
      event: "sync.failed",
      script: job.script,
      status: "FAILED",
      duration: formatDuration(job.startedAt, job.completedAt),
      error: error.slice(0, 500),
      stats: { processed: job.processed, total: job.total },
      timestamp: new Date().toISOString(),
      url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://poligraph.fr"}/admin/syncs`,
    }).catch(() => {});
  }
}

export async function updateJobProgress(jobId: string, progress: number, processed?: number) {
  await db.syncJob.update({
    where: { id: jobId },
    data: {
      progress,
      ...(processed != null ? { processed } : {}),
    },
  });
}
