import { MandateType } from "@/generated/prisma";

const PARLIAMENTARY_TYPES = new Set<MandateType>([MandateType.DEPUTE, MandateType.SENATEUR]);

export interface MandateInterval {
  id: string;
  politicianId: string;
  type: MandateType;
  externalId?: string | null;
  startDate: Date | string;
  endDate: Date | string | null;
  isCurrent: boolean;
}

export interface MandateOverlap<T extends MandateInterval = MandateInterval> {
  first: T;
  second: T;
}

/**
 * Find overlapping terms of the same parliamentary office for the same person.
 * Intervals are half-open: a mandate ending when the next one starts is successive,
 * not overlapping. Current mandates are treated as open-ended even if endDate is set.
 * A closed mandate without an end date is excluded because an overlap cannot be established.
 */
export function findOverlappingParliamentaryMandates<T extends MandateInterval>(
  mandates: readonly T[]
): MandateOverlap<T>[] {
  const byOffice = new Map<string, T[]>();

  for (const mandate of mandates) {
    if (!PARLIAMENTARY_TYPES.has(mandate.type)) continue;
    const key = `${mandate.politicianId}:${mandate.type}`;
    const group = byOffice.get(key) ?? [];
    group.push(mandate);
    byOffice.set(key, group);
  }

  const overlaps: MandateOverlap<T>[] = [];
  for (const group of byOffice.values()) {
    const ordered = group
      .filter((mandate) => mandate.isCurrent || mandate.endDate !== null)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    for (let i = 0; i < ordered.length; i++) {
      const first = ordered[i]!;
      const firstEnd =
        first.isCurrent || first.endDate === null
          ? Number.POSITIVE_INFINITY
          : new Date(first.endDate).getTime();

      for (let j = i + 1; j < ordered.length; j++) {
        const second = ordered[j]!;
        const secondStart = new Date(second.startDate).getTime();
        if (secondStart >= firstEnd) break;
        overlaps.push({ first, second });
      }
    }
  }

  return overlaps;
}

/**
 * Keep contradictory parliamentary periods out of confirmed public timelines.
 * A current mandate takes precedence over an overlapping ended record; when both
 * periods have the same status, neither can be selected safely.
 */
export function partitionMandatesForDisplay<T extends MandateInterval>(
  mandates: readonly T[]
): {
  displayable: T[];
  toVerify: MandateOverlap<T>[];
} {
  const toVerify = findOverlappingParliamentaryMandates(mandates);
  const excludedIds = new Set<string>();

  for (const { first, second } of toVerify) {
    if (first.isCurrent && !second.isCurrent) {
      excludedIds.add(second.id);
    } else if (second.isCurrent && !first.isCurrent) {
      excludedIds.add(first.id);
    } else {
      excludedIds.add(first.id);
      excludedIds.add(second.id);
    }
  }

  return {
    displayable: mandates.filter((mandate) => !excludedIds.has(mandate.id)),
    toVerify,
  };
}
