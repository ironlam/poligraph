import Link from "next/link";
import { stripMarkdown } from "@/lib/utils";
import { SITE_URL } from "@/config/site";
import {
  getCertaintyLevel,
  CERTAINTY_LABELS,
  CERTAINTY_COLORS,
  isAccusedInvolvement,
  type CertaintyLevel,
} from "@/config/certainty";
import {
  AFFAIR_CATEGORY_LABELS,
  INVOLVEMENT_LABELS,
  INVOLVEMENT_COLORS,
  CATEGORY_TO_SUPER,
  AFFAIR_SUPER_CATEGORY_LABELS,
} from "@/config/labels";
import { AffairStatusNotice } from "@/components/affairs/AffairStatusNotice";
import { CiteAnchor } from "@/components/ui/CiteAnchor";
import { citeAnchorId } from "@/lib/cite";
import { getAffairPartyDisplay, type PartyDisplayRef } from "@/lib/affairs/party-display";
import type { AffairStatus, AffairCategory, Involvement } from "@/types";

/**
 * Left-border hex per certainty level, distinct from the super-category
 * palette used elsewhere: the listing card foregrounds judicial certainty,
 * not the offence family.
 */
const CERTAINTY_BORDER: Record<CertaintyLevel, string> = {
  ETABLI: "#dc2626",
  PRONONCE: "#ea580c",
  EN_COURS: "#d97706",
  CLOS_SANS_CHARGE: "#64748b",
  CLOS_FAVORABLE: "#9ca3af",
};

// Non-accused cards (victim, plaintiff, mentioned) never carry a charging
// certainty tier: the border stays neutral so a third party's conviction does
// not tint the tracked politician's entry as severe. Mirrors the pill gating.
const NON_ACCUSED_BORDER = "#9ca3af";

export interface AffairListingCardData {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  status: AffairStatus;
  involvement: Involvement;
  category: AffairCategory;
  verdictDate: Date | null;
  startDate: Date | null;
  factsDate: Date | null;
  sentence: string | null;
  _count: { sources: number };
  politician: {
    slug: string;
    fullName: string;
    currentParty: PartyDisplayRef | null;
  };
  partyAtTime: PartyDisplayRef | null;
}

interface AffairListingCardProps {
  affair: AffairListingCardData;
  /** Serialised origin filters, for the non-destructive return on the detail page. */
  retour?: string;
  /** Origin result count, so the return can read "Retour aux N résultats". */
  resultCount?: number;
}

export function AffairListingCard({ affair, retour, resultCount }: AffairListingCardProps) {
  const certainty = getCertaintyLevel(affair.status);
  // Charging certainty pill only for the accused; otherwise the involvement
  // badge carries the politician's role, never a status that is not theirs (#383).
  const accused = isAccusedInvolvement(affair.involvement);
  const superCat = CATEGORY_TO_SUPER[affair.category];
  const detailBase = `/affaires/${affair.slug ?? affair.id}`;
  const detailHref = (() => {
    const sp = new URLSearchParams();
    if (retour) sp.set("retour", retour);
    if (resultCount !== undefined) sp.set("rn", String(resultCount));
    const qs = sp.toString();
    return qs ? `${detailBase}?${qs}` : detailBase;
  })();

  const relevantDate = affair.verdictDate || affair.startDate || affair.factsDate;
  const dateLabel = affair.verdictDate ? "Verdict" : affair.startDate ? "Révélation" : "Faits";

  const partyDisplay = getAffairPartyDisplay({
    factsDate: affair.factsDate,
    partyAtTime: affair.partyAtTime,
    currentParty: affair.politician.currentParty,
  });

  const sourcesCount = affair._count.sources;

  return (
    <article
      id={citeAnchorId.affair(affair.id)}
      className="group relative rounded-xl border border-l-4 bg-card p-4 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      style={{ borderLeftColor: accused ? CERTAINTY_BORDER[certainty] : NON_ACCUSED_BORDER }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {accused ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${CERTAINTY_COLORS[certainty]}`}
          >
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-current" />
            {CERTAINTY_LABELS[certainty]}
          </span>
        ) : (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${INVOLVEMENT_COLORS[affair.involvement]}`}
          >
            {INVOLVEMENT_LABELS[affair.involvement]}
          </span>
        )}
        {relevantDate && (
          <span className="text-xs text-muted-foreground">
            {new Date(relevantDate).getFullYear()} ({dateLabel})
          </span>
        )}
      </div>

      <h2 className="mb-1 text-lg font-semibold">
        {/* Stretched link: the title is the single card-navigation link; its
            ::after overlay makes the whole card clickable. Nested links below sit
            at z-10 so they stay independently clickable. */}
        <Link
          href={detailHref}
          className="after:absolute after:inset-0 hover:underline focus-visible:underline focus:outline-none"
        >
          {affair.title}
        </Link>
      </h2>

      <p className="text-sm">
        <Link
          href={`/politiques/${affair.politician.slug}`}
          className="relative z-10 text-primary hover:underline"
        >
          {affair.politician.fullName}
        </Link>
        {partyDisplay.kind === "at-time" && (
          <span className="text-muted-foreground">
            {" ("}
            {partyDisplay.party.slug ? (
              <Link
                href={`/affaires/parti/${partyDisplay.party.slug}`}
                className="relative z-10 hover:text-foreground hover:underline"
              >
                {partyDisplay.party.shortName}
              </Link>
            ) : (
              partyDisplay.party.shortName
            )}
            {!partyDisplay.sameAsCurrent && <span className="text-xs"> à l&apos;époque</span>}
            {")"}
          </span>
        )}
        {partyDisplay.kind === "current" && (
          <span className="text-muted-foreground">
            {" ("}
            {partyDisplay.party.shortName}
            {")"}
          </span>
        )}
        {partyDisplay.kind === "unknown" && partyDisplay.reason === "pre-dates-current-party" && (
          <span
            className="text-muted-foreground italic"
            title={`Parti actuel (${partyDisplay.currentPartyName}) fondé en ${partyDisplay.currentPartyFoundedDate?.getFullYear()}, soit après la date des faits.`}
          >
            {" (parti à l'époque non renseigné)"}
          </span>
        )}
      </p>

      <p className="mt-1 text-xs text-muted-foreground">
        {AFFAIR_SUPER_CATEGORY_LABELS[superCat]} · {AFFAIR_CATEGORY_LABELS[affair.category]}
        {accused && affair.involvement !== "DIRECT" && (
          <> · {INVOLVEMENT_LABELS[affair.involvement]}</>
        )}
      </p>

      <AffairStatusNotice
        status={affair.status}
        involvement={affair.involvement}
        className="mt-3"
      />

      <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
        {stripMarkdown(affair.description)}
      </p>

      <div className="mt-3 border-t pt-3">
        {affair.sentence && (
          <p className="mb-1 text-sm font-medium text-foreground">{affair.sentence}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {sourcesCount} source{sourcesCount !== 1 ? "s" : ""} vérifiée
            {sourcesCount !== 1 ? "s" : ""}
            <CiteAnchor
              permalink={`${SITE_URL}/affaires/${affair.slug ?? affair.id}`}
              label={affair.title}
              className="relative z-10"
            />
          </span>
          {/* Decorative affordance only: the whole card is the link (stretched
              above), so this must not be a second link to the same target. */}
          <span aria-hidden="true" className="font-medium text-primary">
            Voir détails →
          </span>
        </div>
      </div>
    </article>
  );
}
