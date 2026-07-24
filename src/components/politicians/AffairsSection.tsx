import Link from "next/link";
import { pickPublicLinkedAffair } from "@/lib/affairs/affair-lookup";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AFFAIR_STATUS_LABELS,
  INVOLVEMENT_LABELS,
  INVOLVEMENT_COLORS,
  AFFAIR_CATEGORY_LABELS,
} from "@/config/labels";
import {
  getCertaintyLevel,
  CERTAINTY_LABELS,
  CERTAINTY_COLORS,
  CERTAINTY_DESCRIPTIONS,
  type CertaintyLevel,
} from "@/config/certainty";
import { formatDate, stripMarkdown } from "@/lib/utils";
import type { AffairStatus, AffairCategory, Involvement } from "@/types";
import { AffairCard } from "./AffairCard";
import { CiteAnchor } from "@/components/ui/CiteAnchor";
import { citeAnchorId } from "@/lib/cite";

interface AffairsSectionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  affairs: any[];
  civility: string | null;
}

const CERTAINTY_LEVELS: CertaintyLevel[] = ["ETABLI", "PRONONCE", "EN_COURS", "CLOS_FAVORABLE"];

export function AffairsSection({ affairs, civility }: AffairsSectionProps) {
  // Split affairs by involvement: direct (mis en cause) vs mentions vs victim
  const directAffairs = affairs.filter(
    (a) => a.involvement === "DIRECT" || a.involvement === "INDIRECT"
  );
  const mentionAffairs = affairs.filter((a) => a.involvement === "MENTIONED_ONLY");
  const victimAffairs = affairs.filter(
    (a) => a.involvement === "VICTIM" || a.involvement === "PLAINTIFF"
  );

  // Group direct affairs by certainty level
  const groupedByLevel: Record<CertaintyLevel, typeof directAffairs> = {
    ETABLI: [],
    PRONONCE: [],
    EN_COURS: [],
    CLOS_FAVORABLE: [],
  };

  for (const affair of directAffairs) {
    const level = getCertaintyLevel(affair.status);
    groupedByLevel[level].push(affair);
  }

  // Sort within each group by date (most recent first)
  for (const level of CERTAINTY_LEVELS) {
    groupedByLevel[level].sort((a, b) => {
      const dateA = a.verdictDate || a.startDate || a.factsDate || a.createdAt;
      const dateB = b.verdictDate || b.startDate || b.factsDate || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }

  return (
    <div className="space-y-8">
      {/* Affairs -- Accused / Involved */}
      <Card id="affaires">
        <CardHeader>
          <h2 className="leading-none font-semibold">Affaires judiciaires</h2>
          <p className="text-xs text-muted-foreground">
            Les procédures closes sans condamnation sont distinguées des condamnations. La
            présomption d&apos;innocence s&apos;applique aux procédures en cours.
          </p>
        </CardHeader>
        <CardContent>
          {directAffairs.length > 0 ? (
            <div className="space-y-8">
              {CERTAINTY_LEVELS.map((level) => {
                const levelAffairs = groupedByLevel[level];
                if (levelAffairs.length === 0) return null;

                return (
                  <div
                    key={level}
                    className={
                      level === "CLOS_FAVORABLE" ? "opacity-75 border-t border-dashed pt-6" : ""
                    }
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={CERTAINTY_COLORS[level]}>{CERTAINTY_LABELS[level]}</Badge>
                      <span className="text-sm text-muted-foreground">({levelAffairs.length})</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      {CERTAINTY_DESCRIPTIONS[level]}
                    </p>
                    <div className="space-y-6">
                      {levelAffairs.map((affair) => {
                        const linked = pickPublicLinkedAffair(affair.linkedAffair, affair.linkedBy);
                        return (
                          <div key={affair.id}>
                            <AffairCard
                              affair={affair}
                              variant={level === "ETABLI" ? "critique" : "other"}
                            />
                            {linked && (
                              <p className="mt-2 text-sm text-blue-700 dark:text-blue-400">
                                Implique également{" "}
                                <Link
                                  href={`/politiques/${linked.politician.slug}`}
                                  className="font-medium underline hover:no-underline"
                                  prefetch={false}
                                >
                                  {linked.politician.fullName}
                                </Link>
                                {" - "}
                                <Link
                                  href={`/affaires/${linked.slug}`}
                                  className="underline hover:no-underline"
                                  prefetch={false}
                                >
                                  voir sa fiche
                                </Link>
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <p className="text-muted-foreground">
                Aucune affaire judiciaire documentée à ce jour.
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Cela ne signifie pas l&apos;absence d&apos;affaire — nos données sont enrichies
                progressivement.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Affairs -- Mentions (MENTIONED_ONLY) */}
      {mentionAffairs.length > 0 && (
        <Card className="border-dashed border-gray-300 dark:border-gray-700">
          <CardHeader>
            <details>
              <summary className="cursor-pointer list-none flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4 text-muted-foreground transition-transform [[open]>&]:rotate-90"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clipRule="evenodd"
                  />
                </svg>
                <h2 className="leading-none font-semibold text-muted-foreground">
                  Mentions dans des affaires ({mentionAffairs.length})
                </h2>
              </summary>
              <p className="text-xs text-muted-foreground mt-2 sm:ml-6">
                Affaires où {civility === "MME" ? "elle" : "il"} est mentionné
                {civility === "MME" ? "e" : ""} sans être directement mis
                {civility === "MME" ? "e" : ""} en cause.
              </p>
              <div className="mt-4 space-y-4 sm:ml-6">
                {mentionAffairs.map((affair) => (
                  <div
                    key={affair.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50/50 dark:bg-gray-900/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge className={INVOLVEMENT_COLORS[affair.involvement as Involvement]}>
                            {INVOLVEMENT_LABELS[affair.involvement as Involvement]}
                          </Badge>
                          <Link
                            href={`/affaires/${affair.slug || affair.id}`}
                            className="font-medium hover:underline"
                          >
                            {affair.title}
                          </Link>
                        </div>
                        {affair.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {stripMarkdown(affair.description)}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs self-start whitespace-nowrap">
                        {AFFAIR_STATUS_LABELS[affair.status as AffairStatus]}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </CardHeader>
        </Card>
      )}

      {/* Affairs -- Victim */}
      {victimAffairs.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="leading-none font-semibold">Victime d&apos;infractions</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {victimAffairs.map((affair) => {
                const linked = pickPublicLinkedAffair(affair.linkedAffair, affair.linkedBy);
                return (
                  <div
                    key={affair.id}
                    id={citeAnchorId.affair(affair.id)}
                    className="group border rounded-lg p-4 border-blue-200 bg-blue-50/30"
                  >
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
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700 whitespace-nowrap">
                            {INVOLVEMENT_LABELS[affair.involvement as Involvement]}
                          </Badge>
                          {/* Neutral colour: in the victim section the status
                              describes the defendant's outcome, not the tracked
                              politician's own conviction (#383). */}
                          <Badge variant="outline" className="whitespace-nowrap">
                            {AFFAIR_STATUS_LABELS[affair.status as AffairStatus]}
                          </Badge>
                          <CiteAnchor
                            anchorId={citeAnchorId.affair(affair.id)}
                            label="cette affaire"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {AFFAIR_CATEGORY_LABELS[affair.category as AffairCategory]}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground mb-3">
                      {stripMarkdown(affair.description)}
                    </p>

                    {/* Dates */}
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
                    </div>

                    {linked && (
                      <p className="mt-2 text-sm text-blue-700 dark:text-blue-400">
                        Implique également{" "}
                        <Link
                          href={`/politiques/${linked.politician.slug}`}
                          className="font-medium underline hover:no-underline"
                          prefetch={false}
                        >
                          {linked.politician.fullName}
                        </Link>
                        {" - "}
                        <Link
                          href={`/affaires/${linked.slug}`}
                          className="underline hover:no-underline"
                          prefetch={false}
                        >
                          voir sa fiche
                        </Link>
                      </p>
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
                                  — {source.publisher}, {formatDate(source.publishedAt)}
                                </span>
                              </li>
                            )
                          )}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
