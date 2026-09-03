import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { createPromiseSchema } from "@/lib/security/schemas";
import { getRequestMeta } from "@/lib/security/audit";
import { getPromisesForModeration } from "@/lib/data/promises";
import { parseIntFilter, parsePageParam } from "@/lib/data/query-params";
import { PROMISE_EXTRACTION_STATUS_LABELS } from "@/config/labels";
import type { PromiseExtractionStatus, ThemeCategory } from "@/types";
import { LEGACY_THEME_CATEGORIES } from "@/lib/theme-utils";

const STATUS_KEYS = new Set(Object.keys(PROMISE_EXTRACTION_STATUS_LABELS));
const THEME_KEYS = new Set<string>(LEGACY_THEME_CATEGORIES);

export const GET = withAdminAuth(async (request) => {
  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status");
  const rawTheme = searchParams.get("theme");
  const result = await getPromisesForModeration({
    status:
      rawStatus && STATUS_KEYS.has(rawStatus) ? (rawStatus as PromiseExtractionStatus) : undefined,
    theme: rawTheme && THEME_KEYS.has(rawTheme) ? (rawTheme as ThemeCategory) : undefined,
    politicianSlug: searchParams.get("politicianSlug") ?? undefined,
    page: parsePageParam(searchParams.get("page")),
    // Math.min(NaN, 100) is NaN in the loader, so an unreadable pageSize would
    // reach Prisma as `take: NaN`. The floor also keeps a negative out.
    pageSize: Math.max(1, parseIntFilter(searchParams.get("pageSize")) ?? 25),
  });
  return NextResponse.json(result);
});

export const POST = withAdminAuth(
  withValidation(createPromiseSchema, async (request, _ctx, data) => {
    const promise = await db.promise.create({
      data: {
        politicianId: data.politicianId,
        text: data.text,
        context: data.context,
        theme: data.theme,
        sourceKind: data.sourceKind,
        sourceUrl: data.sourceUrl,
        sourceLabel: data.sourceLabel,
        publishedAt: new Date(data.publishedAt),
        extractionStatus: "EXTRACTED",
        extractionMethod: "manual",
      },
    });

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "Promise",
        entityId: promise.id,
        changes: data,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return NextResponse.json({ promise }, { status: 201 });
  })
);
