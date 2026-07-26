import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate, stripMarkdown } from "@/lib/utils";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_COLORS,
  AFFAIR_CATEGORY_LABELS,
  INVOLVEMENT_LABELS,
  INVOLVEMENT_COLORS,
} from "@/config/labels";
import { isAccusedInvolvement } from "@/config/certainty";
import type { AffairStatus, AffairCategory, Involvement } from "@/types";
import { ensureContrast } from "@/lib/contrast";
import { SentenceDetails } from "@/components/affairs/SentenceDetails";
import { AffairTimeline } from "@/components/affairs/AffairTimeline";
import { AffairStatusNotice } from "@/components/affairs/AffairStatusNotice";
import { CiteAnchor } from "@/components/ui/CiteAnchor";
import { citeAnchorId } from "@/lib/cite";

interface AffairCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  affair: any;
  variant: "critique" | "other";
}

/** Treat the string "null" / "undefined" as falsy (data quality artifact) */
function present(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value !== "null" && value !== "undefined";
}

export function AffairCard({ affair, variant }: AffairCardProps) {
  const accused = isAccusedInvolvement(affair.involvement as Involvement);
  const borderClass =
    variant === "critique"
      ? "border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/20"
      : "border-gray-200 dark:border-gray-700";

  return (
    <div
      id={citeAnchorId.affair(affair.id)}
      className={`group border rounded-lg p-4 overflow-hidden ${borderClass}`}
    >
      {/* Header */}
      <div className="mb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {(affair.verdictDate || affair.startDate || affair.factsDate) && (
                <Badge variant="secondary" className="font-mono text-base font-bold">
                  {new Date(
                    affair.verdictDate || affair.startDate || affair.factsDate!
                  ).getFullYear()}
                </Badge>
              )}
              <h3 className="font-semibold text-lg">
                <Link
                  href={`/affaires/${affair.slug || affair.id}`}
                  className="hover:underline focus-visible:underline"
                  prefetch={false}
                >
                  {affair.title}
                </Link>
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start">
            {/* Same rule as the affair detail page (#383) : quand la personne n'est
                pas mise en cause, le rôle mène et le statut passe en couleur neutre,
                pour que l'affaire ne se lise pas comme sa condamnation (#511). */}
            {!accused && (
              <Badge className={INVOLVEMENT_COLORS[affair.involvement as Involvement]}>
                {INVOLVEMENT_LABELS[affair.involvement as Involvement]}
              </Badge>
            )}
            <Badge
              className={`whitespace-nowrap ${
                accused
                  ? AFFAIR_STATUS_COLORS[affair.status as AffairStatus]
                  : "bg-muted text-muted-foreground border-transparent"
              }`}
            >
              {AFFAIR_STATUS_LABELS[affair.status as AffairStatus]}
            </Badge>
            <CiteAnchor anchorId={citeAnchorId.affair(affair.id)} label="cette affaire" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge variant="outline" className="text-xs">
            {AFFAIR_CATEGORY_LABELS[affair.category as AffairCategory]}
          </Badge>
          {affair.partyAtTime && (
            <Badge
              variant="outline"
              className="text-xs"
              title={affair.partyAtTime.name}
              style={{
                borderColor: affair.partyAtTime.color || undefined,
                color: affair.partyAtTime.color
                  ? ensureContrast(affair.partyAtTime.color, "#ffffff")
                  : undefined,
              }}
            >
              {affair.partyAtTime.shortName} à l&apos;époque
            </Badge>
          )}
        </div>
      </div>

      {/* Encart de prudence juridique — avant toute lecture à charge
          (RGPD art. 10 : issues favorables dominantes) */}
      <AffairStatusNotice
        status={affair.status as AffairStatus}
        involvement={affair.involvement}
        className="mb-3"
      />

      {/* Description */}
      <p className="text-sm text-muted-foreground mb-3">{stripMarkdown(affair.description)}</p>

      {/* Dates & details */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
        {affair.factsDate && (
          <div>
            <span className="text-muted-foreground">Faits :</span>{" "}
            <span className="font-medium">{formatDate(affair.factsDate)}</span>
          </div>
        )}
        {affair.startDate && (
          <div>
            <span className="text-muted-foreground">Révélation :</span>{" "}
            <span className="font-medium">{formatDate(affair.startDate)}</span>
          </div>
        )}
        {affair.verdictDate && (
          <div>
            <span className="text-muted-foreground">Verdict :</span>{" "}
            <span className="font-medium">{formatDate(affair.verdictDate)}</span>
          </div>
        )}
        {affair.appeal && (
          <div>
            <Badge variant="outline" className="text-xs bg-orange-50">
              En appel
            </Badge>
          </div>
        )}
      </div>

      {/* Jurisdiction info */}
      {(present(affair.court) || present(affair.caseNumber)) && (
        <div className="text-xs text-muted-foreground mb-3">
          {present(affair.court) && <span>{affair.court}</span>}
          {present(affair.chamber) && <span> - {affair.chamber}</span>}
          {present(affair.caseNumber) && (
            <span className="ml-2 font-mono">({affair.caseNumber})</span>
          )}
        </div>
      )}

      {/* Sentence details */}
      <div className="mb-3">
        <SentenceDetails affair={affair} involvement={affair.involvement} />
      </div>

      {/* Timeline */}
      {affair.events && affair.events.length > 0 && (
        <div className="mb-3 border-t pt-3">
          <AffairTimeline events={affair.events} />
        </div>
      )}

      {/* Sources */}
      {affair.sources.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Sources ({affair.sources.length})
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {affair.sources.map(
              (source: {
                id: string;
                url: string;
                title: string;
                publisher: string;
                publishedAt: Date;
              }) => (
                <li key={source.id}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {source.title}
                  </a>
                  <span className="text-muted-foreground">
                    {" "}
                    — {source.publisher}
                    {source.publisher.toLowerCase() === "wikidata"
                      ? `, mis à jour le ${formatDate(source.publishedAt)}`
                      : `, ${formatDate(source.publishedAt)}`}
                  </span>
                </li>
              )
            )}
          </ul>
        </details>
      )}
    </div>
  );
}
