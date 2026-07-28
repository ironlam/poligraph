import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VotingResultBadge } from "./VoteBadge";
import { CardGroupPositions } from "./CardGroupPositions";
import {
  toPublicTitleView,
  displayTitleOf,
  type PolicyForView,
} from "@/lib/votes/to-public-title-view";
import { formatDate } from "@/lib/utils";
import { formatLegislature } from "@/lib/votes/legislature";
import { formatVoteMargin } from "@/lib/votes/vote-margin";
import type { ScrutinGroupPositionData } from "@/lib/data/groupes";
import type { VotingResult, Chamber, ThemeCategory, ScrutinType } from "@/types";
import {
  CHAMBER_SHORT_LABELS,
  THEME_CATEGORY_LABELS,
  THEME_CATEGORY_ICONS,
  THEME_CATEGORY_COLORS,
  SCRUTIN_TYPE_LABELS,
  SCRUTIN_TYPE_COLORS,
} from "@/config/labels";
import { ExternalLink, Building2, FileText } from "lucide-react";

interface VoteCardProps {
  id: string;
  externalId: string;
  slug?: string | null;
  title: string;
  votingDate: Date | string;
  legislature: number;
  chamber?: Chamber;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  result: VotingResult;
  sourceUrl?: string | null;
  totalVotes?: number;
  theme?: ThemeCategory | null;
  type?: ScrutinType | null;
  dossier?: { title: string; slug: string | null } | null;
  /** Plan 6: the joined policy-title row. When APPROVED + valid, the card shows
   *  the policy title + "Titre explicatif" badge; otherwise the official title. */
  policy?: PolicyForView | null;
  /** Group positions for this scrutin (batch-loaded by the listing). Rendered
   *  below the suffrage bar in non-compact mode; omitted entirely when empty. */
  groupPositions?: ScrutinGroupPositionData[];
  compact?: boolean;
}

function extractScrutinNumber(externalId: string): string | null {
  const anMatch = externalId.match(/V(\d+)$/);
  if (anMatch?.[1]) return anMatch[1];
  const senatMatch = externalId.match(/-(\d+)$/);
  if (senatMatch?.[1]) return senatMatch[1];
  return null;
}

export function VoteCard({
  id,
  externalId,
  slug,
  title,
  votingDate,
  legislature,
  chamber,
  votesFor,
  votesAgainst,
  votesAbstain,
  result,
  sourceUrl,
  totalVotes: _totalVotes,
  theme,
  type,
  dossier,
  policy,
  groupPositions,
  compact = false,
}: VoteCardProps) {
  // Use slug for URL if available, fallback to id
  const href = `/parlement/votes/${slug || id}`;
  // Public title: policy iff APPROVED + valid, else official (no leak). The card
  // keeps its own date/result/theme chrome, so no chips are rendered here.
  const view = toPublicTitleView({
    title,
    votingDate: new Date(votingDate),
    result,
    chamber: chamber ?? "AN",
    sourceUrl: sourceUrl ?? null,
    policyTitle: policy ?? null,
  });
  const heading = displayTitleOf(view);
  const isPolicy = view.mode === "policy";
  const scrutinNumber = extractScrutinNumber(externalId);
  const total = votesFor + votesAgainst + votesAbstain;
  const margin = formatVoteMargin(votesFor, votesAgainst);
  const marginLabelBase = margin.isClose ? margin.label.replace(" · vote serré", "") : margin.label;
  const metaLine = [
    formatDate(new Date(votingDate)),
    ...(compact ? [] : [`${total} votants`]),
    formatLegislature(legislature),
  ].join(" · ");

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <Link href={href} prefetch={false} className="hover:underline">
              <p className="font-medium text-base">
                {scrutinNumber && (
                  <span className="font-mono text-xs text-muted-foreground mr-1.5">
                    Scrutin n°{scrutinNumber}
                  </span>
                )}
                {heading}
                {isPolicy && (
                  <Badge variant="accent" className="ml-1.5 align-middle text-xs font-medium">
                    Titre explicatif
                  </Badge>
                )}
              </p>
            </Link>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
              {type && type !== "AUTRE" && (
                <span
                  className={`px-1.5 py-0.5 rounded text-xs font-medium ${SCRUTIN_TYPE_COLORS[type]}`}
                >
                  {SCRUTIN_TYPE_LABELS[type]}
                </span>
              )}
              {chamber && (
                <span
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                    chamber === "AN" ? "bg-blue-100 text-blue-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  <Building2 className="h-3 w-3" />
                  {CHAMBER_SHORT_LABELS[chamber]}
                </span>
              )}
              {theme && (
                <span
                  className={`px-1.5 py-0.5 rounded text-xs font-medium ${THEME_CATEGORY_COLORS[theme]}`}
                >
                  {THEME_CATEGORY_ICONS[theme]} {THEME_CATEGORY_LABELS[theme]}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{metaLine}</p>
            {dossier?.slug && (
              <Link
                href={`/parlement/dossiers/${dossier.slug}`}
                prefetch={false}
                className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="line-clamp-1">{dossier.title}</span>
              </Link>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <VotingResultBadge result={result} />
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                title="Voir sur NosDéputés.fr"
                aria-label="Voir le scrutin sur NosDéputés.fr (nouvelle fenêtre)"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        {!compact && (
          <>
            {/* Suffrage bar: pour vs contre, relative to expressed votes, with
                a 50% majority marker. Abstention is shown separately below. */}
            <div className="space-y-1.5">
              {margin.hasExpressed ? (
                <>
                  <div className="relative flex h-2 rounded-full overflow-hidden bg-muted">
                    <div
                      className="transition-all"
                      style={{ width: `${margin.forPercent}%`, background: "var(--vote-pour)" }}
                      title={`Pour: ${votesFor}`}
                    />
                    <div
                      className="transition-all"
                      style={{
                        width: `${margin.againstPercent}%`,
                        background: "var(--vote-contre)",
                      }}
                      title={`Contre: ${votesAgainst}`}
                    />
                    <span
                      className="absolute left-1/2 top-0 bottom-0 w-px bg-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                    <span className="flex items-center gap-3 text-muted-foreground">
                      <span>Pour: {votesFor}</span>
                      <span>Contre: {votesAgainst}</span>
                    </span>
                    <span className="font-medium">
                      {marginLabelBase}
                      {margin.isClose && (
                        <Badge variant="outline" className="ml-1.5 align-middle text-xs">
                          vote serré
                        </Badge>
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{margin.label}</p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: "var(--vote-abstention)" }}
                  aria-hidden="true"
                />
                <span>Abstention: {votesAbstain}</span>
              </div>
            </div>
            {groupPositions && groupPositions.length > 0 && (
              <div className="mt-3">
                <CardGroupPositions positions={groupPositions} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
