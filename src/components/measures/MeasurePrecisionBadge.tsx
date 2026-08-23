import type { MeasurePrecision } from "@/generated/prisma";
import { MEASURE_PRECISION_LABELS } from "@/config/labels";
import { MeasureBadge } from "./MeasureBadge";

/**
 * The two precision states of a published measure, on the `qualification` tier of `MeasureBadge`.
 *
 * Both states take the SAME form and differ by their word. They used to differ by their form too,
 * a dark solid fill against a bare outline, which read as a scale: "Chiffrée" looked like a better
 * grade than "Objectif sans chiffre", and its fill was heavier than the vote position pills that
 * carry an actual verdict. Precision is descriptive, not a rank, so it gets one shape.
 *
 * `precision` is nullable on the revision, and a null is NOT a state this badge renders: the caller
 * decides what an unqualified measure looks like, because "we have not qualified it" is a statement
 * about our own work and belongs to `QualifiedEmptyCell`, not to a badge that would read as a third
 * precision level.
 */
export function MeasurePrecisionBadge({
  precision,
  className,
}: {
  precision: MeasurePrecision;
  className?: string;
}) {
  return (
    <MeasureBadge
      tier="qualification"
      className={className}
      attrs={{ "data-measure-precision": precision }}
    >
      {MEASURE_PRECISION_LABELS[precision]}
    </MeasureBadge>
  );
}
