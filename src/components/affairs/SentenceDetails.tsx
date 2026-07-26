import { InfoTooltip } from "@/components/ui/info-tooltip";
import { isAccusedInvolvement } from "@/config/certainty";
import type { Involvement } from "@/types";

interface SentenceDetailsProps {
  affair: {
    prisonMonths?: number | null;
    prisonSuspended?: boolean | null;
    fineAmount?: unknown; // Prisma Decimal type
    ineligibilityMonths?: number | null;
    communityService?: number | null;
    otherSentence?: string | null;
    sentence?: string | null;
  };
  /**
   * Role of the politician whose fiche is being read.
   *
   * Required on purpose: the penalty columns belong to the affair, not to the person,
   * and an affair is one row per person. A fiche where the politician is only
   * mentioned therefore carries the prosecuted third party's sentence. Rendering it
   * unqualified attributes someone else's conviction to them (#511, mitigates #517).
   */
  involvement: Involvement;
}

function formatMonths(months: number): string {
  if (months < 12) {
    return `${months} mois`;
  }
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (remainingMonths === 0) {
    return `${years} an${years > 1 ? "s" : ""}`;
  }
  return `${years} an${years > 1 ? "s" : ""} et ${remainingMonths} mois`;
}

function formatAmount(amount: unknown): string {
  const num = typeof amount === "number" ? amount : parseFloat(String(amount));
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(num);
}

export function SentenceDetails({ affair, involvement }: SentenceDetailsProps) {
  // The values are never presented as this person's when they are not the one
  // prosecuted. They stay readable in the description and the sources, which say
  // who was sentenced; here there is no field naming the convicted party, so
  // showing a figure would be an attribution the data does not support.
  if (!isAccusedInvolvement(involvement)) {
    return (
      <p className="text-sm text-muted-foreground">
        Les peines prononcées dans cette affaire ne concernent pas cette personne. Le détail figure
        dans la description et les sources.
      </p>
    );
  }

  const hasPrison = Boolean(affair.prisonMonths && affair.prisonMonths > 0);
  const hasFine = Boolean(affair.fineAmount != null && parseFloat(String(affair.fineAmount)) > 0);
  const hasIneligibility = Boolean(affair.ineligibilityMonths && affair.ineligibilityMonths > 0);
  const hasCommunityService = Boolean(affair.communityService && affair.communityService > 0);
  const hasOther = Boolean(affair.otherSentence);

  const hasDetailedSentence =
    hasPrison || hasFine || hasIneligibility || hasCommunityService || hasOther;

  // If no detailed sentence, show the legacy sentence field
  if (!hasDetailedSentence) {
    if (affair.sentence && affair.sentence !== "null") {
      return (
        <div>
          <span className="text-sm font-medium">Peine : </span>
          <span className="text-sm text-muted-foreground">{affair.sentence}</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Peine prononcée</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {hasPrison && (
          <div className="flex items-center gap-2 p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 text-red-600 dark:text-red-400"
            >
              <path
                fillRule="evenodd"
                d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                clipRule="evenodd"
              />
            </svg>
            <span>
              <span className="font-medium">{formatMonths(affair.prisonMonths!)}</span>
              {affair.prisonSuspended && (
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  {" "}
                  (avec sursis) <InfoTooltip term="sursis" />
                </span>
              )}
              {!affair.prisonSuspended && (
                <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-1">
                  {" "}
                  (ferme) <InfoTooltip term="ferme" />
                </span>
              )}
            </span>
          </div>
        )}

        {hasFine && (
          <div className="flex items-center gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 text-amber-600 dark:text-amber-400"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.798 7.45c.512-.67 1.135-.95 1.702-.95s1.19.28 1.702.95a.75.75 0 001.192-.91C12.637 5.55 11.596 5 10.5 5s-2.137.55-2.894 1.54A5.205 5.205 0 006.83 8H5.75a.75.75 0 000 1.5h.77a6.333 6.333 0 000 1h-.77a.75.75 0 000 1.5h1.08c.183.528.442 1.023.776 1.46.757.99 1.798 1.54 2.894 1.54s2.137-.55 2.894-1.54a.75.75 0 00-1.192-.91c-.512.67-1.135.95-1.702.95s-1.19-.28-1.702-.95a3.505 3.505 0 01-.343-.55h1.795a.75.75 0 000-1.5H8.026a4.835 4.835 0 010-1h2.224a.75.75 0 000-1.5H8.455c.098-.195.212-.38.343-.55z"
                clipRule="evenodd"
              />
            </svg>
            <span>
              <span className="font-medium">{formatAmount(affair.fineAmount!)}</span>
              <span className="text-muted-foreground"> d&apos;amende</span>
            </span>
          </div>
        )}

        {hasIneligibility && (
          <div className="flex items-center gap-2 p-2 rounded bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 text-purple-600 dark:text-purple-400"
            >
              <path d="M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 00.572.729 6.016 6.016 0 002.856 0A.75.75 0 0012 15.1v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8.863 17.414a.75.75 0 00-.226 1.483 9.066 9.066 0 002.726 0 .75.75 0 00-.226-1.483 7.553 7.553 0 01-2.274 0z" />
            </svg>
            <span>
              <span className="font-medium">{formatMonths(affair.ineligibilityMonths!)}</span>
              <span className="text-muted-foreground inline-flex items-center gap-1">
                {" "}
                d&apos;inéligibilité <InfoTooltip term="ineligibilite" />
              </span>
            </span>
          </div>
        )}

        {hasCommunityService && (
          <div className="flex items-center gap-2 p-2 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 text-primary"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                clipRule="evenodd"
              />
            </svg>
            <span>
              <span className="font-medium">{affair.communityService}h</span>
              <span className="text-muted-foreground inline-flex items-center gap-1">
                {" "}
                de TIG <InfoTooltip term="tig" />
              </span>
            </span>
          </div>
        )}
      </div>

      {hasOther && (
        <p className="text-sm text-muted-foreground mt-2">
          <span className="font-medium">Autre : </span>
          {affair.otherSentence}
        </p>
      )}
    </div>
  );
}
