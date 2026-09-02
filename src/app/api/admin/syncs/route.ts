import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { createSyncSchema } from "@/lib/security/schemas";
import { parsePagination } from "@/lib/api/pagination";

const STALE_JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export const GET = withAdminAuth(async (request) => {
  // Cleanup stale jobs (stuck PENDING/RUNNING > 30 minutes)
  await db.syncJob.updateMany({
    where: {
      status: { in: ["PENDING", "RUNNING"] },
      createdAt: { lt: new Date(Date.now() - STALE_JOB_TIMEOUT_MS) },
    },
    data: {
      status: "FAILED",
      error: "Timeout : job bloqué depuis plus de 30 minutes",
      completedAt: new Date(),
    },
  });

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20 });

  const [jobs, total, running] = await Promise.all([
    db.syncJob.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.syncJob.count(),
    db.syncJob.findMany({
      where: { status: { in: ["PENDING", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    data: jobs,
    running,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const POST = withAdminAuth(
  withValidation(createSyncSchema, async (request, _context, { script }) => {
    // Check if this script is already running
    const existing = await db.syncJob.findFirst({
      where: { script, status: { in: ["PENDING", "RUNNING"] } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Ce script est déjà en cours d'exécution" },
        { status: 409 }
      );
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const ipAddress = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
    const userAgent = request.headers.get("user-agent");
    const job = await db.$transaction(async (tx) => {
      const created = await tx.syncJob.create({
        data: { script, status: "PENDING" },
      });
      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entityType: "SyncJob",
          entityId: created.id,
          changes: { script, status: "PENDING" },
          ipAddress,
          userAgent,
        },
      });
      return created;
    });

    // Trigger via Inngest
    try {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: `sync/${script}`,
        data: { jobId: job.id },
      });
    } catch (err) {
      console.error("Failed to send Inngest event:", err);
      await db.syncJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: "Impossible d'envoyer l'événement Inngest",
          completedAt: new Date(),
        },
      });
      return NextResponse.json({ error: "Erreur Inngest" }, { status: 503 });
    }

    return NextResponse.json(job, { status: 201 });
  })
);
