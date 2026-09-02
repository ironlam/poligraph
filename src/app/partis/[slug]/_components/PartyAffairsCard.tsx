import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { AFFAIR_STATUS_LABELS, AFFAIR_STATUS_COLORS } from "@/config/labels";
import { CERTAINTY_LABELS, CERTAINTY_COLORS, type CertaintyLevel } from "@/config/certainty";
import type { AffairStatus } from "@/types";
import type { Involvement } from "@/generated/prisma";
import { byCertainty, countByCertainty, summarizePartyAffairs } from "../_lib/affair-summary";

/** Only the fields the card renders. The page passes richer rows; extra keys are ignored. */
export interface PartyAffair {
  id: string;
  slug: string;
  title: string;
  status: string;
  involvement: Involvement;
  verdictDate: Date | null;
  politician: { fullName: string };
}

interface PartyAffairsCardProps {
  affairs: PartyAffair[];
  /** Nullable in the schema; the links to the satellite pages need it, so they are guarded. */
  partySlug: string | null;
  /** Definitive convictions, counted server-side across the whole party. */
  definitiveConvictions: number;
}

const TOP_AFFAIRS = 5;

function InfoIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * The party's judicial record.
 *
 * Was an inline IIFE of roughly 180 lines inside the page component. The counting rules live in
 * `../_lib/affair-summary`, where they are tested; this file is the layout only.
 */
export function PartyAffairsCard({
  affairs,
  partySlug,
  definitiveConvictions,
}: PartyAffairsCardProps) {
  if (affairs.length === 0) return null;

  const { direct, condamnations, enCours, closesSansCondamnation } = summarizePartyAffairs(affairs);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>
            {condamnations > 0
              ? `${condamnations} condamnation${condamnations > 1 ? "s" : ""}`
              : "Aucune condamnation"}
          </CardTitle>
          <Link
            href="/methodologie#comment-nous-comptons"
            className="text-muted-foreground hover:text-foreground"
            title="Comment nous comptons"
            aria-label="Comment nous comptons les affaires judiciaires"
          >
            <InfoIcon />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-4">
          {enCours > 0 && (
            <span>
              {enCours} procédure{enCours > 1 ? "s" : ""} en cours (présomption d{"'"}
              innocence)
            </span>
          )}
          {closesSansCondamnation > 0 && (
            <span>
              {closesSansCondamnation} close{closesSansCondamnation > 1 ? "s" : ""} sans
              condamnation
            </span>
          )}
        </div>

        {/* Certainty level breakdown badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.keys(CERTAINTY_LABELS) as CertaintyLevel[]).map((level) => {
            const count = countByCertainty(direct, level);
            if (count === 0) return null;
            return (
              <Badge key={level} variant="outline" className={CERTAINTY_COLORS[level]}>
                {CERTAINTY_LABELS[level]} ({count})
              </Badge>
            );
          })}
        </div>

        {/* Top affairs, most certain first */}
        <div className="space-y-3">
          {byCertainty(direct)
            .slice(0, TOP_AFFAIRS)
            .map((affair) => (
              <Link
                key={affair.id}
                href={`/affaires/${affair.slug}`}
                className={`block p-3 rounded-lg border hover:bg-muted transition-colors ${
                  affair.certainty === "ETABLI" ? "border-red-200 dark:border-red-900/50" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge className={CERTAINTY_COLORS[affair.certainty]}>
                        {CERTAINTY_LABELS[affair.certainty]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={AFFAIR_STATUS_COLORS[affair.status as AffairStatus]}
                      >
                        {AFFAIR_STATUS_LABELS[affair.status as AffairStatus]}
                      </Badge>
                      <span className="text-sm font-medium">{affair.politician.fullName}</span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">{affair.title}</p>
                  </div>
                  {affair.verdictDate && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(affair.verdictDate)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
        </div>

        {/* CTA to satellite page */}
        {partySlug && (
          <Link
            href={`/affaires/parti/${partySlug}`}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-4"
          >
            Voir toutes les affaires ({affairs.length})
            <ChevronIcon />
          </Link>
        )}

        {definitiveConvictions > 0 && partySlug && (
          <p className="text-sm mt-2">
            <Link
              href={`/affaires/condamnations?parti=${partySlug}&certainty=etabli`}
              className="text-primary hover:underline"
              prefetch={false}
            >
              {definitiveConvictions} condamnation
              {definitiveConvictions !== 1 ? "s" : ""} définitive
              {definitiveConvictions !== 1 ? "s" : ""} →
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
