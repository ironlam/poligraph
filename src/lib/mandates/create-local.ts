import type { z } from "zod/v4";
import { db } from "@/lib/db";
import type { RequestMeta } from "@/lib/security";
import type { createLocalMandateSchema } from "@/lib/security/schemas/mandate";
import { parsePartialDate } from "./dates";

export type CreateLocalMandateInput = z.infer<typeof createLocalMandateSchema>;

export type CreateLocalMandateResult =
  | {
      kind: "created";
      mandate: { id: string; publicId: string | null };
      politician: { id: string; slug: string };
    }
  | { kind: "politician-not-found" }
  | { kind: "commune-not-found"; communeId: string }
  /** Same profile, type, territory and start date: a second click, or a mandate already held. */
  | { kind: "duplicate"; mandateId: string };

/**
 * Adds a local mandate typed by an admin to a profile.
 *
 * The input has passed `createLocalMandateSchema`: the territory matches the type, the dates
 * parse, the source is there. What is checked here needs the database: the profile and the
 * commune exist, and the mandate is not already held. The profile row is locked first, so two
 * submissions of the same form cannot both pass the duplicate check.
 *
 * The mandate, its local extension and the audit row are written in one transaction. Cache
 * invalidation and the profile document are the caller's job, after commit.
 */
export async function createLocalMandate(
  politicianId: string,
  input: CreateLocalMandateInput,
  meta: RequestMeta
): Promise<CreateLocalMandateResult> {
  const start = parsePartialDate(input.startDate);
  const end = input.endDate ? parsePartialDate(input.endDate) : null;
  if (!start) throw new Error("startDate should have been validated by the schema");

  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; slug: string }>>`
      SELECT id, slug FROM "Politician" WHERE id = ${politicianId} FOR UPDATE
    `;
    const politician = locked[0];
    if (!politician) return { kind: "politician-not-found" };

    const commune = input.communeId
      ? await tx.commune.findUnique({
          where: { id: input.communeId },
          select: { id: true, departmentCode: true },
        })
      : null;
    if (input.communeId && !commune) {
      return { kind: "commune-not-found", communeId: input.communeId };
    }

    const departmentCode = commune?.departmentCode ?? input.departmentCode ?? null;
    const local = {
      communeId: commune?.id ?? null,
      regionCode: input.regionCode ?? null,
      epciSiren: input.epciSiren ?? null,
    };
    const hasLocalData = Object.values(local).some((value) => value !== null);

    const existing = await tx.mandate.findFirst({
      where: {
        politicianId,
        type: input.type,
        startDate: start.date,
        departmentCode,
        ...(hasLocalData ? { localData: { is: local } } : {}),
      },
      select: { id: true },
    });
    if (existing) return { kind: "duplicate", mandateId: existing.id };

    const mandate = await tx.mandate.create({
      data: {
        politicianId,
        type: input.type,
        title: input.title,
        institution: input.institution,
        departmentCode,
        startDate: start.date,
        startDatePrecision: start.precision,
        endDate: end?.date ?? null,
        endDatePrecision: end?.precision ?? "DAY",
        isCurrent: input.isCurrent,
        source: "MANUAL",
        sourceUrl: input.sourceUrl,
        officialUrl: input.officialUrl ?? null,
        ...(hasLocalData ? { localData: { create: local } } : {}),
      },
      select: { id: true, publicId: true },
    });

    await tx.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "Mandate",
        entityId: mandate.id,
        changes: {
          politicianId,
          type: input.type,
          title: input.title,
          institution: input.institution,
          departmentCode,
          ...local,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          isCurrent: input.isCurrent,
          source: "MANUAL",
          sourceUrl: input.sourceUrl,
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return { kind: "created", mandate, politician };
  });
}
