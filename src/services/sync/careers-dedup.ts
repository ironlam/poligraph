import { MandateType, DataSource, type DatePrecision } from "@/generated/prisma";
import { sameStartWithin } from "@/lib/mandates/dates";

export const PARLIAMENTARY_MANDATE_TYPES: MandateType[] = [
  MandateType.DEPUTE,
  MandateType.SENATEUR,
];

const AUTHORITATIVE_PARLIAMENTARY_SOURCES: DataSource[] = [
  DataSource.SENAT,
  DataSource.ASSEMBLEE_NATIONALE,
];

export interface ExistingMandateForGuard {
  type: MandateType;
  source: DataSource | null;
  startDate: Date | string | null;
  /** Absent means known to the day, as every synced mandate is. */
  startDatePrecision?: DatePrecision;
  isCurrent: boolean;
}

export interface MandateCandidateForGuard {
  type: MandateType;
  startDate: Date;
  isCurrent: boolean;
}

/**
 * Whether a Wikidata mandate candidate duplicates an existing mandate and must
 * be skipped before creation.
 *
 * Parliamentary mandates (DEPUTE/SENATEUR): a politician can hold at most one
 * ACTIVE mandate of a given type — also enforced at the DB level by the
 * Mandate_current_type partial unique index — so an active candidate duplicates
 * any active same-type mandate regardless of source or start date. Authoritative
 * SENAT/AN data also always wins over Wikidata. Other types fall back to a
 * 30-day start-date tolerance, widened to the year or the month when the existing mandate's
 * start is only known that precisely: a mandate entered by hand as "2001" is stored on
 * 1 January, and Wikidata's 25 March 2001 is the same term, not a second one.
 *
 * NOTE: this guard and the partial unique index Mandate_current_type_uq enforce
 * related but different invariants. The index is the AUTHORITATIVE guarantee: it
 * rejects any second active same-type parliamentary mandate at write time,
 * regardless of source or dates. This guard is a best-effort pre-check whose main
 * job is to skip the create so the sync does not hit that index (no P2002 noise);
 * it also defers to authoritative SENAT/AN data and a 30-day tolerance for
 * non-parliamentary types.
 */
export function isDuplicateMandateCandidate(
  existingMandates: ExistingMandateForGuard[],
  candidate: MandateCandidateForGuard
): boolean {
  const isParliamentary = PARLIAMENTARY_MANDATE_TYPES.includes(candidate.type);

  return existingMandates.some((m) => {
    if (m.type !== candidate.type) return false;

    if (isParliamentary) {
      // Two active mandates of the same type cannot coexist.
      if (candidate.isCurrent && m.isCurrent) return true;
      // Authoritative parliamentary source always wins over Wikidata.
      if (m.source && AUTHORITATIVE_PARLIAMENTARY_SOURCES.includes(m.source)) return true;
    }

    if (!m.startDate) return false;
    return sameStartWithin(
      new Date(m.startDate),
      m.startDatePrecision ?? "DAY",
      candidate.startDate,
      30
    );
  });
}
