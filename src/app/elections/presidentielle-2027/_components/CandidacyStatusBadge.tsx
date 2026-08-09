import { ExternalLink } from "lucide-react";
import { CANDIDACY_STATUS_SHORT_LABELS } from "@/config/labels";
import type { CandidacyStatus } from "@/generated/prisma";

/**
 * Status and documented programme, merged into the single coloured element of a row.
 *
 * Two pieces of information that were never read apart: "déclarée" without "combien de mesures
 * avons-nous" says nothing about what the reader will find here, and a measure count without a
 * status says nothing about whether the candidacy exists. Merged, they fit in one pastille and
 * free the rest of the row of every flat fill — which is the whole point of the third pass:
 * repeated twenty-eight times, a navy button becomes the only pattern the eye sees and the
 * candidate's name drops to second place.
 *
 * The badge is INFORMATION, not an action, even though it is a link: it opens the source of the
 * declaration. That is why it keeps its colour while the two navigation links are plain navy text.
 *
 * No alert colour anywhere. `--brand` (red) stays reserved for judicial signals; a withdrawn
 * candidacy is a fact about a schedule, not about a person's record.
 */

type ProgrammeAbsence = "aucun_programme" | "non_depouille" | null;

type BadgeVariant = "documented" | "declared" | "pending" | "withdrawn";

/**
 * `border` on every variant, transparent where the mockup has none: without it the four states
 * would not share a box height, and the pastilles of two consecutive rows would sit 2px apart.
 */
const VARIANT_CLASS: Record<BadgeVariant, string> = {
  documented: "border-primary bg-primary text-primary-foreground",
  declared: "border-primary bg-card text-primary",
  pending: "border-transparent bg-muted text-foreground",
  withdrawn: "border-dashed border-border bg-transparent text-muted-foreground-strong",
};

function badgeVariant(status: CandidacyStatus | null, measureCount: number): BadgeVariant {
  if (status === "RETIRE") return "withdrawn";
  if (measureCount > 0) return "documented";
  if (status === "DECLARE") return "declared";
  return "pending";
}

/**
 * The zero case never says "aucun programme" unless the data says so.
 *
 * `aucun_programme` is a claim about the CANDIDACY, `non_depouille` a claim about OUR backlog.
 * They are not interchangeable, and the fallback is the one about us: asserting a candidate has
 * published nothing, because our own field is null, would be a false claim about a real person.
 */
function programmePart(measureCount: number, programmeAbsence: ProgrammeAbsence): string {
  if (measureCount > 0) {
    return `${measureCount} ${measureCount === 1 ? "mesure" : "mesures"}`;
  }
  return programmeAbsence === "aucun_programme" ? "aucun programme" : "non documenté";
}

export function candidacyBadgeLabel(params: {
  status: CandidacyStatus | null;
  measureCount: number;
  programmeAbsence: ProgrammeAbsence;
}): string {
  // A withdrawal ends the candidacy: what we did or did not document of its programme is no
  // longer the reader's question, so the badge says the one thing that still holds.
  if (params.status === "RETIRE") return CANDIDACY_STATUS_SHORT_LABELS.RETIRE;

  const programme = programmePart(params.measureCount, params.programmeAbsence);
  if (params.status === null) return programme;
  return `${CANDIDACY_STATUS_SHORT_LABELS[params.status]} · ${programme}`;
}

/**
 * `min-h` and padding, never a fixed `height`.
 *
 * "Pressentie · aucun programme" is 26 characters and wraps to two lines in the 230px column of
 * the desktop list. With `height` the second line escapes the pastille; with `min-height` the
 * pastille grows. Same reason `leading-[1.35]` rather than a centred single line.
 */
export function CandidacyStatusBadge({
  status,
  measureCount,
  programmeAbsence,
  sourceUrl,
  sourceLabel,
  className = "",
}: {
  status: CandidacyStatus | null;
  measureCount: number;
  programmeAbsence: ProgrammeAbsence;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  className?: string;
}) {
  const label = candidacyBadgeLabel({ status, measureCount, programmeAbsence });
  const shape = `inline-flex max-w-full items-center gap-1.5 self-start rounded-full border px-2.5 py-[3px] font-display text-xs font-bold leading-[1.35] ${VARIANT_CLASS[badgeVariant(status, measureCount)]} ${className}`;

  if (sourceUrl == null || sourceLabel == null) {
    return (
      <span className={`min-h-[26px] ${shape}`}>
        <span className="min-w-0">{label}</span>
      </span>
    );
  }

  return (
    <a
      href={sourceUrl}
      rel="nofollow noopener"
      target="_blank"
      // `title` for the pointer, `aria-label` for everyone else: a title attribute is not reliably
      // announced, and a link named "Déclarée · 19 mesures" that opens an external site without
      // saying which one is exactly the surprise the row exists to remove. `aria-label` rather
      // than an `sr-only` sibling because the accessibility tree joins sibling nodes with a space,
      // which announces "19 mesures , source" — the visible label stays a prefix of it, so the
      // spoken name still starts with what a speech-input user sees (WCAG 2.5.3).
      title={sourceLabel}
      aria-label={`${label}, source de la candidature : ${sourceLabel}`}
      className={`min-h-[26px] hover:brightness-95 ${shape}`}
    >
      <span className="min-w-0">{label}</span>
      <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0 opacity-70" />
    </a>
  );
}
