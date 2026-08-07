import type { MeasurePrecision } from "@/generated/prisma";
import { MEASURE_PRECISION_LABELS, MEASURE_PRECISION_PILL_CLASS } from "@/config/labels";

/**
 * The two precision states of a published measure, on the same pill idiom as `VoteRelationBadge`.
 *
 * `precision` is nullable on the revision, and a null is NOT a state this badge renders: the caller
 * decides what an unqualified measure looks like, because "we have not qualified it" is a statement
 * about our own work and belongs to `QualifiedEmptyCell`, not to a pill that would read as a third
 * precision level.
 */
export function MeasurePrecisionBadge({
  precision,
  className,
}: {
  precision: MeasurePrecision;
  className?: string;
}) {
  const base = `inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${MEASURE_PRECISION_PILL_CLASS[precision]}`;

  return (
    <span data-measure-precision={precision} className={className ? `${base} ${className}` : base}>
      {MEASURE_PRECISION_LABELS[precision]}
    </span>
  );
}
