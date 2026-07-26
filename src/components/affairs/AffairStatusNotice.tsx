import type { AffairStatus, Involvement } from "@/types";
import { isAccusedInvolvement } from "@/config/certainty";
import { getJudicialMaturity } from "@/config/judicial-maturity";

/**
 * Encart de prudence juridique affiché avec chaque affaire publique
 * (RGPD article 10, invariant I5) : la qualification procédurale exacte est
 * énoncée avant toute lecture à charge, et les issues favorables sont
 * dominantes (jamais rendues comme des mises en cause actives).
 *
 * La prescription a volontairement un wording distinct des autres issues
 * favorables : elle éteint l'action publique sans décision sur le fond.
 */

export type AffairNoticeVariant =
  | "presumption"
  | "non_definitive"
  | "pourvoi"
  | "definitive"
  | "favorable"
  | "prescription"
  | "third_party";

const FAVORABLE_STATUSES: readonly AffairStatus[] = [
  "RELAXE",
  "ACQUITTEMENT",
  "NON_LIEU",
  "CLASSEMENT_SANS_SUITE",
];

const NON_DEFINITIVE_STATUSES: readonly AffairStatus[] = [
  "CONDAMNATION_PREMIERE_INSTANCE",
  "APPEL_EN_COURS",
];

const EN_COURS_STATUSES: readonly AffairStatus[] = [
  "ENQUETE_PRELIMINAIRE",
  "INSTRUCTION",
  "MISE_EN_EXAMEN",
  "RENVOI_TRIBUNAL",
  "PROCES_EN_COURS",
];

export function getAffairNoticeVariant(
  status: AffairStatus,
  involvement: Involvement
): AffairNoticeVariant | null {
  // Les encarts qualifient la situation d'une personne mise en cause. Quand le
  // politicien est victime, plaignant ou simplement mentionné, aucun encart à charge
  // ne s'applique, mais le silence total laissait un statut de condamnation et une
  // peine sur la page sans dire qu'ils ne sont pas les siens (#511).
  if (!isAccusedInvolvement(involvement)) {
    return getJudicialMaturity(status) === "CONDAMNATION" ? "third_party" : null;
  }
  if (status === "PRESCRIPTION") return "prescription";
  if (FAVORABLE_STATUSES.includes(status)) return "favorable";
  if (status === "CONDAMNATION_DEFINITIVE") return "definitive";
  // Checked before the generic non-definitive wording: "en cours d'appel" would be
  // wrong here, the appeal is over and it is cassation that is pending (#511).
  if (status === "POURVOI_EN_CASSATION") return "pourvoi";
  if (NON_DEFINITIVE_STATUSES.includes(status)) return "non_definitive";
  if (EN_COURS_STATUSES.includes(status)) return "presumption";
  return null;
}

const NOTICES: Record<AffairNoticeVariant, { title: string; body: string; className: string }> = {
  presumption: {
    title: "Présomption d'innocence",
    body: "cette procédure est en cours. La personne concernée est présumée innocente jusqu'à une éventuelle condamnation définitive.",
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
  },
  non_definitive: {
    title: "Décision non définitive",
    body: "cette condamnation peut encore faire l'objet d'un recours ou est en cours d'appel.",
    className:
      "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200",
  },
  third_party: {
    title: "Résultat judiciaire d'un tiers",
    body: "cette personne n'est pas celle qui a été poursuivie dans cette affaire. La condamnation et les peines prononcées concernent une autre personne.",
    className:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200",
  },
  pourvoi: {
    title: "Décision non définitive",
    body: "cette condamnation a été prononcée en appel et fait l'objet d'un pourvoi en cassation. La Cour de cassation peut encore l'annuler.",
    className:
      "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200",
  },
  definitive: {
    title: "Condamnation définitive",
    body: "les voies de recours ordinaires sont épuisées ou la décision est définitive selon les sources disponibles.",
    className:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  },
  favorable: {
    title: "Procédure close sans condamnation",
    body: "cette issue est favorable à la personne concernée. Cette entrée ne doit pas être lue comme une condamnation.",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
  },
  prescription: {
    title: "Action publique éteinte par prescription",
    body: "la procédure est close sans condamnation. La prescription ne constitue pas une décision sur le fond.",
    className:
      "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300",
  },
};

interface AffairStatusNoticeProps {
  status: AffairStatus;
  involvement: Involvement;
  className?: string;
}

export function AffairStatusNotice({
  status,
  involvement,
  className = "",
}: AffairStatusNoticeProps) {
  const variant = getAffairNoticeVariant(status, involvement);
  if (!variant) return null;
  const notice = NOTICES[variant];

  return (
    <div
      role="note"
      data-variant={variant}
      className={`rounded-lg border p-4 ${notice.className} ${className}`}
    >
      <p className="text-sm">
        <strong>{notice.title} :</strong> {notice.body}
      </p>
    </div>
  );
}
