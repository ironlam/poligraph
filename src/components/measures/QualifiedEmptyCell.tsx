import type { ThemeCategory } from "@/generated/prisma";
import { THEME_CATEGORY_LABELS } from "@/config/labels";

/**
 * The seven typed absences (spec §9.1). The point of this component is that an empty cell is never
 * ambiguous: "personne n'a encore regardé" and "on a regardé, rien trouvé" are different facts and get
 * different labels. Adding a `kind` without handling it below is a compile error (the `never` default),
 * the same guarantee as the non-`Partial` Record on affair statuses.
 */
export type MeasureAbsence =
  | { kind: "no_vote_identified"; checkedAt: Date; scope: string }
  | { kind: "never_sat" }
  | { kind: "never_held_office" }
  | { kind: "no_measure_published"; theme: ThemeCategory }
  | { kind: "not_reviewed" }
  | { kind: "insufficient_context" }
  | { kind: "not_applicable"; reason: string };

function formatDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

export function measureAbsenceLabel(absence: MeasureAbsence): string {
  switch (absence.kind) {
    case "no_vote_identified":
      return `Aucun vote identifié ${absence.scope}, vérifié le ${formatDateFr(absence.checkedAt)}`;
    case "never_sat":
      return "N'a jamais siégé";
    case "never_held_office":
      return "N'a jamais exercé de mandat";
    case "no_measure_published":
      return `Aucune mesure publiée sur ${THEME_CATEGORY_LABELS[absence.theme]}`;
    case "not_reviewed":
      return "Pas encore relu";
    case "insufficient_context":
      return "Pas assez d'éléments publiés";
    case "not_applicable":
      return absence.reason;
    default: {
      const exhaustive: never = absence;
      return exhaustive;
    }
  }
}

export function QualifiedEmptyCell({
  absence,
  className,
}: {
  absence: MeasureAbsence;
  className?: string;
}) {
  const base = "text-sm text-muted-foreground";
  return (
    <span className={className ? `${base} ${className}` : base} data-absence-kind={absence.kind}>
      {measureAbsenceLabel(absence)}
    </span>
  );
}
