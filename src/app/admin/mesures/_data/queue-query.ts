import type { Prisma, ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  deriveModerationState,
  MODERATION_MEASURE_SELECT,
  toModerationMeasureRow,
  type ModerationState,
  type PublicationState,
} from "@/lib/measures/moderation-state";

/**
 * The moderation queue for measures.
 *
 * Two of the filters, `publication` and `anomaliesOnly`, apply to DERIVED values and not to
 * stored columns, so they cannot be a Prisma `where`. Expressing them in SQL would mean
 * writing the derivation a second time in another language, and the two would drift.
 *
 * So: the SQL-expressible filters bound the scan, the derivation runs over the scanned rows,
 * and the derived filters apply after it. The scan is capped, and `scanCapped` says so rather
 * than letting the counters look exhaustive when they are not.
 */

const DEFAULT_TAKE = 25;
const MAX_TAKE = 100;

/**
 * The ceiling on rows fed to the derivation in one call. At a few hundred measures it never
 * bites; when it does, the caller is told instead of being handed truncated counters that
 * read like totals.
 */
export const QUEUE_SCAN_CAP = 500;

export type MeasureQueueFilters = {
  publication?: PublicationState[];
  theme?: ThemeCategory[];
  electionId?: string;
  politicianId?: string;
  withdrawn?: "only" | "exclude";
  anomaliesOnly?: boolean;
  q?: string;
  take?: number;
  skip?: number;
};

const QUEUE_SELECT = {
  ...MODERATION_MEASURE_SELECT,
  createdAt: true,
  theme: true,
  attribution: true,
  politician: { select: { fullName: true, slug: true } },
  election: { select: { title: true, slug: true } },
  // Extends the shared selection rather than replacing it: the derivation reads the same
  // fields either way, and the queue needs the text and the date on top.
  revisions: {
    select: { ...MODERATION_MEASURE_SELECT.revisions.select, text: true, validFrom: true },
    orderBy: MODERATION_MEASURE_SELECT.revisions.orderBy,
  },
} satisfies Prisma.MeasureSelect;

type QueueDbRow = Prisma.MeasureGetPayload<{ select: typeof QUEUE_SELECT }>;

export type MeasureQueueRow = {
  id: string;
  theme: ThemeCategory;
  politicianName: string;
  politicianSlug: string;
  electionTitle: string;
  createdAt: Date;
  /**
   * The text of the reference revision, published one first and active draft otherwise.
   * Null only when the measure has no revision at all, which the EMPTY stage names.
   */
  referenceText: string | null;
  state: ModerationState;
};

export type MeasureQueueResult = {
  rows: MeasureQueueRow[];
  /** Rows matching every filter, derived ones included. Not the page length. */
  total: number;
  counts: Record<PublicationState, number>;
  anomalyCount: number;
  withdrawnCount: number;
  scanCapped: boolean;
};

function clampTake(take: number | undefined): number {
  if (take === undefined || !Number.isFinite(take)) return DEFAULT_TAKE;
  return Math.min(Math.max(Math.trunc(take), 1), MAX_TAKE);
}

function clampSkip(skip: number | undefined): number {
  if (skip === undefined || !Number.isFinite(skip)) return 0;
  return Math.max(Math.trunc(skip), 0);
}

function buildWhere(filters: MeasureQueueFilters): Prisma.MeasureWhereInput {
  const where: Prisma.MeasureWhereInput = {};

  if (filters.theme && filters.theme.length > 0) where.theme = { in: filters.theme };
  if (filters.electionId) where.electionId = filters.electionId;
  if (filters.politicianId) where.politicianId = filters.politicianId;
  if (filters.withdrawn === "only") where.withdrawnAt = { not: null };
  if (filters.withdrawn === "exclude") where.withdrawnAt = null;

  if (filters.q && filters.q.trim() !== "") {
    // Substring search on the moderation side, deliberately: the lexical index is built for
    // the public search, and a moderator looking for a formulation they half remember needs
    // the substring behaviour the index refuses to give.
    const like = filters.q.trim();
    where.revisions = { some: { text: { contains: like, mode: "insensitive" } } };
  }

  return where;
}

function referenceTextOf(row: QueueDbRow): string | null {
  const referenceId = row.publishedRevisionId ?? row.latestRevisionId;
  if (referenceId === null) return null;
  return row.revisions.find((revision) => revision.id === referenceId)?.text ?? null;
}

function toQueueRow(row: QueueDbRow): MeasureQueueRow {
  return {
    id: row.id,
    theme: row.theme,
    politicianName: row.politician.fullName,
    politicianSlug: row.politician.slug,
    electionTitle: row.election.title,
    createdAt: row.createdAt,
    referenceText: referenceTextOf(row),
    state: deriveModerationState(toModerationMeasureRow(row)),
  };
}

function matchesDerivedFilters(row: MeasureQueueRow, filters: MeasureQueueFilters): boolean {
  if (filters.publication && filters.publication.length > 0) {
    if (!filters.publication.includes(row.state.publication)) return false;
  }
  if (filters.anomaliesOnly && row.state.anomalies.length === 0) return false;
  return true;
}

function emptyCounts(): Record<PublicationState, number> {
  return { EMPTY: 0, DRAFT: 0, REVIEWED: 0, PUBLISHED: 0, DEPUBLISHED: 0 };
}

export async function queryMeasureQueue(
  filters: MeasureQueueFilters = {}
): Promise<MeasureQueueResult> {
  const take = clampTake(filters.take);
  const skip = clampSkip(filters.skip);

  const scanned = await db.measure.findMany({
    where: buildWhere(filters),
    select: QUEUE_SELECT,
    // Oldest first: a queue that shows the newest extractions first leaves the oldest
    // untreated measures at the bottom forever. The page states the order.
    orderBy: { createdAt: "asc" },
    take: QUEUE_SCAN_CAP + 1,
  });

  const scanCapped = scanned.length > QUEUE_SCAN_CAP;
  const rows = scanned.slice(0, QUEUE_SCAN_CAP).map(toQueueRow);

  // Counters are computed BEFORE the derived filters, so the filter chips show the whole
  // distribution of the SQL-filtered set instead of only the state already selected.
  const counts = emptyCounts();
  let anomalyCount = 0;
  let withdrawnCount = 0;
  for (const row of rows) {
    counts[row.state.publication] += 1;
    if (row.state.anomalies.length > 0) anomalyCount += 1;
    if (row.state.withdrawal !== null) withdrawnCount += 1;
  }

  const matching = rows.filter((row) => matchesDerivedFilters(row, filters));

  return {
    rows: matching.slice(skip, skip + take),
    total: matching.length,
    counts,
    anomalyCount,
    withdrawnCount,
    scanCapped,
  };
}
