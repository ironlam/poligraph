import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VotingResultBadge } from "./VoteBadge";
import {
  toPublicTitleView,
  displayTitleOf,
  type PolicyForView,
} from "@/lib/votes/to-public-title-view";
import { formatDate } from "@/lib/utils";
import type { VotingResult, Chamber, ThemeCategory, ScrutinType } from "@/types";
import {
  CHAMBER_SHORT_LABELS,
  THEME_CATEGORY_LABELS,
  THEME_CATEGORY_ICONS,
  THEME_CATEGORY_COLORS,
  SCRUTIN_TYPE_LABELS,
  SCRUTIN_TYPE_COLORS,
} from "@/config/labels";
import { Calendar, Users, ExternalLink, Building2, FileText } from "lucide-react";

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
  const forPercent = total > 0 ? (votesFor / total) * 100 : 0;
  const againstPercent = total > 0 ? (votesAgainst / total) * 100 : 0;
  const abstainPercent = total > 0 ? (votesAbstain / total) * 100 : 0;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <Link href={href} prefetch={false} className="hover:underline">
              <p className="font-medium text-sm line-clamp-2">
                {scrutinNumber && (
                  <span className="font-mono text-xs text-muted-foreground mr-1.5">
                    Scrutin n°{scrutinNumber}
                  </span>
                )}
                {heading}
                {isPolicy && (
                  <Badge variant="accent" className="ml-1.5 align-middle text-[10px] font-medium">
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
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(new Date(votingDate))}
              </span>
              {!compact && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {total} votants
                </span>
              )}
              <span className="text-muted-foreground/60">{legislature}e législature</span>
            </div>
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
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        {!compact && (
          <>
            {/* Vote bar */}
            <div className="space-y-1">
              <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
                <div
                  className="bg-green-500 transition-all"
                  style={{ width: `${forPercent}%` }}
                  title={`Pour: ${votesFor}`}
                />
                <div
                  className="bg-red-500 transition-all"
                  style={{ width: `${againstPercent}%` }}
                  title={`Contre: ${votesAgainst}`}
                />
                <div
                  className="bg-yellow-500 transition-all"
                  style={{ width: `${abstainPercent}%` }}
                  title={`Abstention: ${votesAbstain}`}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="text-green-600">Pour: {votesFor}</span>
                <span className="text-red-600">Contre: {votesAgainst}</span>
                <span className="text-yellow-600">Abstention: {votesAbstain}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
