// Plan et application du backfill des gouvernements (one-shot, voir scripts/governments-backfill.ts).
// `planBackfill` est pure : elle ne lit que les lignes qu'on lui donne. `applyBackfill` écrit.

import type { db as Db } from "@/lib/db";
import {
  GOVERNMENT_CATALOG,
  LECORNU_MERGED_LEGACY_NAME,
  governmentSlugForLegacyName,
} from "./catalog";

export type BackfillRow = {
  membershipId: string;
  mandateId: string;
  politicianId: string;
  governmentName: string;
  type: string; // MandateType
  startDate: Date;
  endDate: Date | null;
};

export type GovernmentReport = {
  functions: number;
  persons: number;
  withoutEnd: number;
  entryDays: number;
  exitDays: number;
};

export type PlannedGovernment = {
  slug: string;
  name: string;
  sequence: number;
  primeMinisterId: string;
  primeMinisterAppointedAt: string; // YYYY-MM-DD
  formedAt: string;
  endedAt: string | null;
  membershipIds: string[];
  report: GovernmentReport;
};

export type UnresolvedKind =
  | "unknown-label"
  | "split-manual"
  | "no-prime-minister"
  | "lecornu-prime-minister-not-found"
  | "no-function";

export type Unresolved = {
  kind: UnresolvedKind;
  label: string;
  slug: string | null;
  membershipIds: string[];
};

export type BackfillPlan = {
  governments: PlannedGovernment[];
  unresolved: Unresolved[];
  // Fin de fonction connue par membershipId : null = pas de fin.
  memberships: { membershipId: string; governmentSlug: string; hasEnd: boolean }[];
};

const LECORNU_PM_STARTS: Record<string, string> = {
  "lecornu-1": "2025-09-09",
  "lecornu-2": "2025-10-10",
};

const day = (d: Date) => d.toISOString().slice(0, 10);

function byStartThenId(a: BackfillRow, b: BackfillRow) {
  return (
    a.startDate.getTime() - b.startDate.getTime() || a.membershipId.localeCompare(b.membershipId)
  );
}

function report(rows: BackfillRow[]): GovernmentReport {
  return {
    functions: rows.length,
    persons: new Set(rows.map((r) => r.politicianId)).size,
    withoutEnd: rows.filter((r) => !r.endDate).length,
    entryDays: new Set(rows.map((r) => day(r.startDate))).size,
    exitDays: new Set(rows.filter((r) => r.endDate).map((r) => day(r.endDate!))).size,
  };
}

function derivedDates(rows: BackfillRow[]) {
  const starts = rows.map((r) => day(r.startDate)).sort();
  const open = rows.some((r) => !r.endDate);
  const ends = rows
    .filter((r) => r.endDate)
    .map((r) => day(r.endDate!))
    .sort();
  return { formedAt: starts[0]!, endedAt: open ? null : (ends[ends.length - 1] ?? null) };
}

export function planBackfill(rows: readonly BackfillRow[]): BackfillPlan {
  const bySlug = new Map<string, BackfillRow[]>();
  const unknown = new Map<string, BackfillRow[]>();
  const lecornuMerged: BackfillRow[] = [];

  for (const r of rows) {
    const label = r.governmentName.trim();
    if (label === LECORNU_MERGED_LEGACY_NAME) {
      lecornuMerged.push(r);
      continue;
    }
    const slug = governmentSlugForLegacyName(label);
    const bucket = slug ? bySlug : unknown;
    const key = slug ?? label;
    bucket.set(key, [...(bucket.get(key) ?? []), r]);
  }

  const governments: PlannedGovernment[] = [];
  const unresolved: Unresolved[] = [];
  const memberships: BackfillPlan["memberships"] = [];

  for (const entry of GOVERNMENT_CATALOG) {
    if (entry.slug in LECORNU_PM_STARTS) {
      const wanted = LECORNU_PM_STARTS[entry.slug];
      const pm = lecornuMerged
        .filter((r) => r.type === "PREMIER_MINISTRE" && day(r.startDate) === wanted)
        .sort(byStartThenId)[0];
      if (!pm) {
        unresolved.push({
          kind: "lecornu-prime-minister-not-found",
          label: LECORNU_MERGED_LEGACY_NAME,
          slug: entry.slug,
          membershipIds: [],
        });
        continue;
      }
      governments.push({
        slug: entry.slug,
        name: entry.name,
        sequence: entry.sequence,
        primeMinisterId: pm.politicianId,
        primeMinisterAppointedAt: day(pm.startDate),
        formedAt: day(pm.startDate),
        endedAt: pm.endDate ? day(pm.endDate) : null,
        membershipIds: [],
        report: report([]),
      });
      continue;
    }

    const linked = [...(bySlug.get(entry.slug) ?? [])].sort(byStartThenId);
    if (linked.length === 0) {
      unresolved.push({
        kind: "no-function",
        label: entry.name,
        slug: entry.slug,
        membershipIds: [],
      });
      continue;
    }
    const pm = linked.find((r) => r.type === "PREMIER_MINISTRE");
    if (!pm) {
      unresolved.push({
        kind: "no-prime-minister",
        label: entry.legacyNames.join(" / "),
        slug: entry.slug,
        membershipIds: linked.map((r) => r.membershipId),
      });
      continue;
    }
    const { formedAt, endedAt } = derivedDates(linked);
    governments.push({
      slug: entry.slug,
      name: entry.name,
      sequence: entry.sequence,
      primeMinisterId: pm.politicianId,
      primeMinisterAppointedAt: day(pm.startDate),
      formedAt,
      endedAt,
      membershipIds: linked.map((r) => r.membershipId),
      report: report(linked),
    });
    for (const r of linked) {
      memberships.push({
        membershipId: r.membershipId,
        governmentSlug: entry.slug,
        hasEnd: r.endDate !== null,
      });
    }
  }

  if (lecornuMerged.length > 0) {
    unresolved.push({
      kind: "split-manual",
      label: LECORNU_MERGED_LEGACY_NAME,
      slug: null,
      membershipIds: lecornuMerged.map((r) => r.membershipId).sort(),
    });
  }
  for (const [label, list] of [...unknown].sort(([a], [b]) => a.localeCompare(b))) {
    unresolved.push({
      kind: "unknown-label",
      label,
      slug: null,
      membershipIds: list.map((r) => r.membershipId).sort(),
    });
  }

  governments.sort((a, b) => a.sequence - b.sequence);
  unresolved.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.label.localeCompare(b.label) ||
      (a.slug ?? "").localeCompare(b.slug ?? "")
  );
  memberships.sort((a, b) => a.membershipId.localeCompare(b.membershipId));
  return { governments, unresolved, memberships };
}

export type ApplyResult = {
  governments: { created: number; updated: number; unchanged: number };
  memberships: { updated: number; unchanged: number };
};

const asDate = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const sameDay = (d: Date | null, s: string | null) => (d ? day(d) : null) === s;

/**
 * Écrit les gouvernements puis le rattachement des fonctions. Idempotent : une ligne n'est
 * modifiée que si une valeur diffère, et une date déjà passée en preuve ACT n'est jamais écrasée.
 */
export async function applyBackfill(plan: BackfillPlan, db: typeof Db): Promise<ApplyResult> {
  const result: ApplyResult = {
    governments: { created: 0, updated: 0, unchanged: 0 },
    memberships: { updated: 0, unchanged: 0 },
  };
  const idBySlug = new Map<string, string>();

  for (const g of plan.governments) {
    const existing = await db.government.findUnique({ where: { slug: g.slug } });
    if (!existing) {
      const created = await db.government.create({
        data: {
          slug: g.slug,
          name: g.name,
          sequence: g.sequence,
          primeMinisterId: g.primeMinisterId,
          primeMinisterAppointedAt: asDate(g.primeMinisterAppointedAt)!,
          primeMinisterAppointedEvidence: "DERIVED",
          formedAt: asDate(g.formedAt),
          formedEvidence: "DERIVED",
          endedAt: asDate(g.endedAt),
          endedEvidence: g.endedAt ? "DERIVED" : null,
          completeness: "PARTIAL",
          publicationStatus: "DRAFT",
        },
      });
      idBySlug.set(g.slug, created.id);
      result.governments.created += 1;
      continue;
    }

    idBySlug.set(g.slug, existing.id);
    const data: Record<string, unknown> = {};
    if (existing.name !== g.name) data.name = g.name;
    if (existing.sequence !== g.sequence) data.sequence = g.sequence;
    if (existing.primeMinisterId !== g.primeMinisterId) data.primeMinisterId = g.primeMinisterId;
    if (
      existing.primeMinisterAppointedEvidence !== "ACT" &&
      (!sameDay(existing.primeMinisterAppointedAt, g.primeMinisterAppointedAt) ||
        existing.primeMinisterAppointedEvidence !== "DERIVED")
    ) {
      data.primeMinisterAppointedAt = asDate(g.primeMinisterAppointedAt);
      data.primeMinisterAppointedEvidence = "DERIVED";
    }
    if (
      existing.formedEvidence !== "ACT" &&
      (!sameDay(existing.formedAt, g.formedAt) || existing.formedEvidence !== "DERIVED")
    ) {
      data.formedAt = asDate(g.formedAt);
      data.formedEvidence = "DERIVED";
    }
    const endEvidence = g.endedAt ? "DERIVED" : null;
    if (
      existing.endedEvidence !== "ACT" &&
      (!sameDay(existing.endedAt, g.endedAt) || existing.endedEvidence !== endEvidence)
    ) {
      data.endedAt = asDate(g.endedAt);
      data.endedEvidence = endEvidence;
    }
    if (Object.keys(data).length > 0) {
      await db.government.update({ where: { id: existing.id }, data });
      result.governments.updated += 1;
    } else {
      result.governments.unchanged += 1;
    }
  }

  const current = await db.mandateGovernment.findMany({
    where: { id: { in: plan.memberships.map((m) => m.membershipId) } },
    select: { id: true, governmentId: true, startEvidence: true, endEvidence: true },
  });
  const currentById = new Map(current.map((c) => [c.id, c]));

  for (const m of plan.memberships) {
    const governmentId = idBySlug.get(m.governmentSlug);
    const cur = currentById.get(m.membershipId);
    if (!governmentId || !cur) continue;
    const data: Record<string, unknown> = {};
    if (cur.governmentId !== governmentId) data.governmentId = governmentId;
    if (cur.startEvidence !== "ACT" && cur.startEvidence !== "DATASET") {
      data.startEvidence = "DATASET";
    }
    const wantedEnd = m.hasEnd ? "DATASET" : null;
    if (cur.endEvidence !== "ACT" && cur.endEvidence !== wantedEnd) data.endEvidence = wantedEnd;
    if (Object.keys(data).length > 0) {
      await db.mandateGovernment.update({ where: { id: m.membershipId }, data });
      result.memberships.updated += 1;
    } else {
      result.memberships.unchanged += 1;
    }
  }
  return result;
}
