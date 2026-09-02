import { CANDIDACY_STATUS_SHORT_LABELS } from "@/config/labels";
import type { CandidacyStatus } from "@/generated/prisma";

/**
 * Status and documented programme, merged into the single coloured element of a row.
 *
 * Two pieces of information that were never read apart: "déclarée" without "combien de mesures
 * avons-nous" says nothing about what the reader will find here, and a measure count without a
 * status says nothing about whether the candidacy exists. Merged, they fit in one pastille and
 * free the rest of the row of every flat fill, which is the whole point of the third pass:
 * repeated twenty-eight times, a navy button becomes the only pattern the eye sees and the
 * candidate's name drops to second place.
 *
 * The badge is INFORMATION, not an action, even though it is a link: it opens the source of the
 * declaration. That is why it keeps its colour while the two navigation links are plain navy text.
 *
 * No alert colour anywhere. `--brand` (red) stays reserved for judicial signals; a withdrawn
 * candidacy is a fact about a schedule, not about a person's record.
 */

type BadgeVariant = "announced" | "expected" | "withdrawn";

/**
 * `border` on every variant, transparent where the mockup has none: without it the four states
 * would not share a box height, and the pastilles of two consecutive rows would sit 2px apart.
 */
const VARIANT_CLASS: Record<BadgeVariant, string> = {
  announced: "border-primary bg-primary/8 text-primary",
  expected: "border-border bg-muted text-foreground",
  withdrawn: "border-dashed border-border bg-transparent text-muted-foreground-strong",
};

function badgeVariant(status: CandidacyStatus | null): BadgeVariant {
  if (status === "RETIRE") return "withdrawn";
  if (status === "DECLARE") return "announced";
  return "expected";
}

/**
 * The zero case never says "aucun programme" unless the data says so.
 *
 * `aucun_programme` is a claim about the CANDIDACY, `non_depouille` a claim about OUR backlog.
 * They are not interchangeable, and the fallback is the one about us: asserting a candidate has
 * published nothing, because our own field is null, would be a false claim about a real person.
 */
export function candidacyBadgeLabel(status: CandidacyStatus | null): string {
  return status === null ? "Statut non renseigné" : CANDIDACY_STATUS_SHORT_LABELS[status];
}

/**
 * `min-h` and padding on the pastille, never a fixed `height`.
 *
 * "Pressentie · aucun programme" is 26 characters and wraps to two lines in the 230px column of
 * the desktop list. With `height` the second line escapes the pastille; with `min-height` the
 * pastille grows. Same reason `leading-[1.35]` rather than a centred single line.
 */
const PILL =
  "inline-flex min-h-[26px] max-w-full items-center gap-1.5 rounded-full border px-2.5 py-[3px] font-display text-xs font-bold leading-[1.35]";

export function CandidacyStatusBadge({ status }: { status: CandidacyStatus | null }) {
  return (
    <span className={`${PILL} ${VARIANT_CLASS[badgeVariant(status)]} self-start`}>
      {candidacyBadgeLabel(status)}
    </span>
  );
}
