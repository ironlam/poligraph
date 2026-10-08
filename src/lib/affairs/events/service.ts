/**
 * Écriture des étapes de procédure. Chaque action tourne dans une transaction, verrouille la ligne
 * visée et laisse une trace dans `AuditLog`. Une règle violée ne déclenche aucune écriture.
 */
import type {
  AffairEvent,
  AffairEventStatus,
  AffairEventType,
  DatePrecision,
  EventOccurrence,
  EventOutcome,
  EventSourceKind,
  Prisma,
} from "@/generated/prisma";
import { db, type DbTransactionClient } from "@/lib/db";
import { parisDay } from "@/lib/affairs/monitoring/cadence";
import { normalizeEventDate } from "./dates";
import { checkEventPublishable, checkEventShape } from "./guard";

export type EventDraftInput = {
  type: AffairEventType;
  date: Date;
  datePrecision: DatePrecision;
  dateEnd?: Date | null;
  occurrence: EventOccurrence;
  outcome?: EventOutcome | null;
  title: string;
  court?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceKind?: EventSourceKind | null;
  incidental?: boolean;
  corroborationUrl?: string | null;
};

export type EventActionMeta = { ip?: string | null; userAgent?: string | null };

export type EventActionResult =
  | { ok: true; eventId: string; affairSlug: string; politicianSlug: string }
  | {
      ok: false;
      reason: "not_found" | "not_draft" | "not_published" | "not_confirmable" | "invalid";
      messages?: string[];
    };

type AuditOp = "create" | "update" | "delete" | "publish" | "retract" | "confirm";

export const RETRACTION_REASON_MAX = 280;

const NOT_FOUND: EventActionResult = { ok: false, reason: "not_found" };

/** Champs modifiables d'un brouillon : remplacement complet, jamais une fusion. */
function draftData(input: EventDraftInput) {
  return {
    type: input.type,
    date: normalizeEventDate(input.date, input.datePrecision),
    datePrecision: input.datePrecision,
    dateEnd: input.dateEnd ? normalizeEventDate(input.dateEnd, input.datePrecision) : null,
    occurrence: input.occurrence,
    outcome: input.outcome ?? null,
    title: input.title,
    court: input.court ?? null,
    description: input.description ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourceTitle: input.sourceTitle ?? null,
    sourceKind: input.sourceKind ?? null,
    incidental: input.incidental ?? false,
    corroborationUrl: input.corroborationUrl ?? null,
  };
}

/** Les dates passent en ISO : `changes` est du JSON. */
function toJson(fields: Record<string, unknown>): Record<string, Prisma.InputJsonValue | null> {
  const out: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    out[key] =
      value instanceof Date ? value.toISOString() : (value as Prisma.InputJsonValue | null);
  }
  return out;
}

async function audit(
  tx: DbTransactionClient,
  action: "CREATE" | "UPDATE" | "DELETE",
  eventId: string,
  op: AuditOp,
  affairId: string,
  extra: Record<string, unknown>,
  meta: EventActionMeta
) {
  await tx.auditLog.create({
    data: {
      action,
      entityType: "AffairEvent",
      entityId: eventId,
      changes: toJson({ op, affairId, ...extra }) as Prisma.InputJsonValue,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
}

async function loadSlugs(tx: DbTransactionClient, affairId: string) {
  const affair = await tx.affair.findUnique({
    where: { id: affairId },
    select: { slug: true, politician: { select: { slug: true } } },
  });
  if (!affair) return null;
  return { affairSlug: affair.slug, politicianSlug: affair.politician.slug };
}

async function done(
  tx: DbTransactionClient,
  affairId: string,
  eventId: string
): Promise<EventActionResult> {
  const slugs = await loadSlugs(tx, affairId);
  if (!slugs) return NOT_FOUND;
  return { ok: true, eventId, ...slugs };
}

/** Verrouille l'étape si elle appartient bien à l'affaire ; `null` sinon. */
async function lockEvent(
  tx: DbTransactionClient,
  affairId: string,
  eventId: string
): Promise<AffairEvent | null> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "AffairEvent" WHERE id = ${eventId} AND "affairId" = ${affairId} FOR UPDATE
  `;
  if (locked.length === 0) return null;
  return tx.affairEvent.findUnique({ where: { id: eventId } });
}

export async function createDraftEvent(
  affairId: string,
  input: EventDraftInput,
  meta: EventActionMeta
): Promise<EventActionResult> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Affair" WHERE id = ${affairId} FOR NO KEY UPDATE
    `;
    if (locked.length === 0) return NOT_FOUND;

    const data = draftData(input);
    const messages = checkEventShape(data);
    if (messages.length > 0) return { ok: false, reason: "invalid", messages };

    const created = await tx.affairEvent.create({
      data: { affairId, ...data, status: "DRAFT" },
      select: { id: true },
    });
    await audit(tx, "CREATE", created.id, "create", affairId, data, meta);
    return done(tx, affairId, created.id);
  });
}

export async function updateDraftEvent(
  affairId: string,
  eventId: string,
  input: EventDraftInput,
  meta: EventActionMeta
): Promise<EventActionResult> {
  return db.$transaction(async (tx) => {
    const event = await lockEvent(tx, affairId, eventId);
    if (!event) return NOT_FOUND;
    if (event.status !== "DRAFT") return { ok: false, reason: "not_draft" };

    const data = draftData(input);
    const messages = checkEventShape(data);
    if (messages.length > 0) return { ok: false, reason: "invalid", messages };

    await tx.affairEvent.update({ where: { id: eventId }, data });
    await audit(tx, "UPDATE", eventId, "update", affairId, data, meta);
    return done(tx, affairId, eventId);
  });
}

export async function deleteDraftEvent(
  affairId: string,
  eventId: string,
  meta: EventActionMeta
): Promise<EventActionResult> {
  return db.$transaction(async (tx) => {
    const event = await lockEvent(tx, affairId, eventId);
    if (!event) return NOT_FOUND;
    if (event.status !== "DRAFT") return { ok: false, reason: "not_draft" };

    await tx.affairEvent.delete({ where: { id: eventId } });
    await audit(
      tx,
      "DELETE",
      eventId,
      "delete",
      affairId,
      { type: event.type, date: event.date, title: event.title, sourceUrl: event.sourceUrl },
      meta
    );
    return done(tx, affairId, eventId);
  });
}

export async function publishEvent(
  affairId: string,
  eventId: string,
  meta: EventActionMeta,
  now: Date = new Date()
): Promise<EventActionResult> {
  return db.$transaction(async (tx) => {
    const event = await lockEvent(tx, affairId, eventId);
    if (!event) return NOT_FOUND;
    if (event.status !== "DRAFT") return { ok: false, reason: "not_draft" };

    const messages = checkEventPublishable(event);
    if (messages.length > 0) return { ok: false, reason: "invalid", messages };

    await tx.affairEvent.update({
      where: { id: eventId },
      data: { status: "PUBLISHED", publishedAt: now },
    });
    await audit(tx, "UPDATE", eventId, "publish", affairId, { publishedAt: now }, meta);
    return done(tx, affairId, eventId);
  });
}

export async function retractEvent(
  affairId: string,
  eventId: string,
  reason: string,
  meta: EventActionMeta,
  now: Date = new Date()
): Promise<EventActionResult> {
  return db.$transaction(async (tx) => {
    const event = await lockEvent(tx, affairId, eventId);
    if (!event) return NOT_FOUND;
    if (event.status !== "PUBLISHED") return { ok: false, reason: "not_published" };

    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      return { ok: false, reason: "invalid", messages: ["La raison du retrait est obligatoire."] };
    }
    if (trimmed.length > RETRACTION_REASON_MAX) {
      return {
        ok: false,
        reason: "invalid",
        messages: [`La raison du retrait dépasse ${RETRACTION_REASON_MAX} caractères.`],
      };
    }

    await tx.affairEvent.update({
      where: { id: eventId },
      data: { status: "RETRACTED", retractedAt: now, retractionReason: trimmed },
    });
    await audit(tx, "UPDATE", eventId, "retract", affairId, { reason: trimmed }, meta);
    return done(tx, affairId, eventId);
  });
}

export async function confirmEvent(
  affairId: string,
  eventId: string,
  input: {
    sourceUrl: string;
    sourceTitle?: string | null;
    sourceKind: EventSourceKind;
    outcome?: EventOutcome | null;
    corroborationUrl?: string | null;
  },
  meta: EventActionMeta,
  now: Date = new Date()
): Promise<EventActionResult> {
  return db.$transaction(async (tx) => {
    const event = await lockEvent(tx, affairId, eventId);
    if (!event) return NOT_FOUND;
    const reached = event.date.getTime() <= parisDay(now).getTime();
    if (event.status !== "PUBLISHED" || event.occurrence !== "SCHEDULED" || !reached) {
      return { ok: false, reason: "not_confirmable" };
    }

    const sourceUrl = input.sourceUrl.trim();
    if (sourceUrl === (event.sourceUrl ?? "").trim()) {
      return {
        ok: false,
        reason: "invalid",
        messages: [
          "La confirmation exige une nouvelle source, différente de celle qui annonçait l'étape.",
        ],
      };
    }

    const data = {
      occurrence: "HELD" as const,
      sourceUrl,
      sourceTitle: input.sourceTitle ?? null,
      sourceKind: input.sourceKind,
      outcome: input.outcome ?? null,
      corroborationUrl: input.corroborationUrl?.trim() || null,
    };
    const messages = checkEventPublishable({ ...event, ...data });
    if (messages.length > 0) return { ok: false, reason: "invalid", messages };

    await tx.affairEvent.update({ where: { id: eventId }, data });
    await audit(
      tx,
      "UPDATE",
      eventId,
      "confirm",
      affairId,
      { ...data, previousSourceUrl: event.sourceUrl },
      meta
    );
    return done(tx, affairId, eventId);
  });
}

/**
 * Révélation issue d'une proposition acceptée. L'appelant tient déjà le verrou de l'affaire et
 * écrit son propre audit : ici, ni verrou ni audit. Publiée si le garde passe, brouillon sinon.
 */
export async function createProposalRevelationInTx(
  tx: DbTransactionClient,
  affairId: string,
  data: {
    identityKey: string | null;
    date: Date;
    title: string;
    description?: string | null;
    sourceUrl: string;
    sourceTitle?: string | null;
  },
  now: Date
): Promise<{ id: string; status: AffairEventStatus }> {
  const event = {
    type: "REVELATION" as const,
    date: normalizeEventDate(data.date, "DAY"),
    datePrecision: "DAY" as const,
    occurrence: "HELD" as const,
    title: data.title,
    description: data.description ?? null,
    sourceUrl: data.sourceUrl,
    sourceTitle: data.sourceTitle ?? null,
    sourceKind: "PRESS" as const,
  };
  const publishable = checkEventPublishable(event).length === 0;
  return tx.affairEvent.create({
    data: {
      affairId,
      identityKey: data.identityKey,
      ...event,
      status: publishable ? "PUBLISHED" : "DRAFT",
      publishedAt: publishable ? now : null,
    },
    select: { id: true, status: true },
  });
}
