import type { ReactNode } from "react";
import Link from "next/link";
import { StatusBadge } from "./GovernmentBadges";
import { formatDay } from "./format";

/**
 * Edge states (mockup 2f). Each one says what is known, what is missing, and offers a useful
 * action. An undocumented composition is never presented as an empty one.
 */
export function StateCard({
  tone,
  title,
  children,
  action,
}: {
  tone: "neutral" | "warning";
  title: string;
  children: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <StatusBadge tone={tone}>{title}</StatusBadge>
      <div className="mt-2 text-sm leading-relaxed">{children}</div>
      {action && (
        <Link
          href={action.href}
          className="mt-3 inline-flex min-h-11 items-center rounded-[10px] border bg-card px-4 text-sm font-bold hover:bg-muted"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function OutOfRangeState({
  govName,
  date,
  range,
  baseHref,
}: {
  govName: string;
  date: string;
  range: { from: string; to: string };
  baseHref: string;
}) {
  const before = date < range.from;
  const target = before ? range.from : range.to;
  return (
    <StateCard
      tone="warning"
      title="Date hors période"
      action={{ href: `${baseHref}?date=${target}`, label: `Aller au ${formatDay(target)}` }}
    >
      Le {formatDay(date)} est {before ? "antérieur" : "postérieur"} à la période consultable du{" "}
      {govName}. Dates disponibles : du {formatDay(range.from)} au {formatDay(range.to)}.
    </StateCard>
  );
}

export function NotEstablishedState({
  reason,
  date,
  formedAt,
  baseHref,
}: {
  reason: "before_team" | "no_formation_date" | "not_verified";
  date: string | null;
  formedAt: string | null;
  baseHref: string;
}) {
  if (reason === "before_team" && date && formedAt) {
    return (
      <StateCard
        tone="warning"
        title="Composition non établie à cette date"
        action={{
          href: `${baseHref}?date=${formedAt}`,
          label: `Voir la composition documentée au ${formatDay(formedAt)}`,
        }}
      >
        Les sources ne permettent pas d&apos;établir la composition au {formatDay(date)}. Manquant :
        nomination de l&apos;équipe, postérieure à celle du Premier ministre. Ce n&apos;est pas une
        composition vide.
      </StateCard>
    );
  }
  if (reason === "no_formation_date") {
    return (
      <StateCard tone="warning" title="Composition non établie">
        La date de nomination de l&apos;équipe n&apos;est pas documentée : aucune composition datée
        ne peut être affichée. Ce n&apos;est pas une composition vide. La liste des participants
        reste disponible plus bas.
      </StateCard>
    );
  }
  return (
    <StateCard tone="warning" title="Composition non établie">
      Aucune composition de ce gouvernement n&apos;a encore été vérifiée à une date donnée. Ce
      n&apos;est pas une composition vide. La liste des participants reste disponible plus bas.
    </StateCard>
  );
}

/** Established absence: the sources checked show nobody at that date (decision 9). */
export function EstablishedAbsenceState({ date, partial }: { date: string; partial: boolean }) {
  return (
    <StateCard tone="neutral" title="Absence établie">
      {partial
        ? `Aucune personne n'est présente de façon établie au ${formatDay(date)} parmi les fonctions documentées. La couverture de ce gouvernement est partielle.`
        : `Aucune personne n'est présente de façon établie au ${formatDay(date)} d'après les sources vérifiées.`}
    </StateCard>
  );
}

export function NoResultsState({ q, resetHref }: { q: string; resetHref: string }) {
  return (
    <StateCard
      tone="neutral"
      title="Aucun résultat pour ces filtres"
      action={{ href: resetHref, label: "Réinitialiser les filtres" }}
    >
      {q
        ? `Aucune personne ne correspond à « ${q} » pour la période choisie.`
        : "Aucune personne ne correspond à ces filtres."}
    </StateCard>
  );
}
