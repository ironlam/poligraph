import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VotingResultBadge } from "./VoteBadge";
import { THEME_CATEGORY_LABELS, THEME_CATEGORY_COLORS } from "@/config/labels";
import { Calendar, Star } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { VotingResult, ThemeCategory } from "@/types";
import {
  toPublicTitleView,
  displayTitleOf,
  type PolicyForView,
} from "@/lib/votes/to-public-title-view";

interface KeyVoteCardProps {
  id: string;
  slug: string | null;
  title: string;
  votingDate: Date | string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  result: VotingResult;
  theme: ThemeCategory | null;
  summary: string | null;
  citizenImpact: string | null;
  isKeyVote?: boolean;
  policy?: PolicyForView | null;
}

export function KeyVoteCard({
  id,
  slug,
  title,
  votingDate,
  votesFor,
  votesAgainst,
  votesAbstain,
  result,
  theme,
  summary,
  citizenImpact,
  isKeyVote = true,
  policy,
}: KeyVoteCardProps) {
  const href = `/parlement/votes/${slug || id}`;
  // Public title: policy iff APPROVED + valid, else official (no leak).
  const view = toPublicTitleView({
    title,
    votingDate: new Date(votingDate),
    result,
    chamber: "AN",
    sourceUrl: null,
    policyTitle: policy ?? null,
  });
  const heading = displayTitleOf(view);
  const isPolicy = view.mode === "policy";
  const total = votesFor + votesAgainst + votesAbstain;
  const forPct = total > 0 ? (votesFor / total) * 100 : 0;
  const againstPct = total > 0 ? (votesAgainst / total) * 100 : 0;

  return (
    <Card
      className={`hover:shadow-md transition-shadow ${isKeyVote ? "border-amber-200 dark:border-amber-800" : ""}`}
    >
      <CardContent className="p-4">
        {isKeyVote && (
          <div className="flex items-center gap-1 mb-2">
            <Star className="h-3 w-3 text-amber-500" aria-hidden="true" />
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Vote clé</span>
          </div>
        )}

        <Link href={href} prefetch={false} className="hover:underline">
          <p className="font-medium text-base mb-2">
            {heading}
            {isPolicy && (
              <Badge variant="accent" className="ml-1.5 align-middle text-xs font-medium">
                Titre explicatif
              </Badge>
            )}
          </p>
        </Link>

        {(citizenImpact || summary) && (
          <p className="text-xs text-muted-foreground line-clamp-3 mb-3">
            {citizenImpact || summary}
          </p>
        )}

        <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
          <VotingResultBadge result={result} />
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(new Date(votingDate))}
          </span>
          {theme && (
            <span
              className={`px-1.5 py-0.5 rounded text-xs font-medium ${THEME_CATEGORY_COLORS[theme]}`}
            >
              {THEME_CATEGORY_LABELS[theme]}
            </span>
          )}
        </div>

        <div
          className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800"
          role="img"
          aria-label={`${votesFor} pour, ${votesAgainst} contre, ${votesAbstain} abstentions`}
        >
          <div className="bg-green-500" style={{ width: `${forPct}%` }} />
          <div className="bg-red-500" style={{ width: `${againstPct}%` }} />
          <div className="bg-yellow-500" style={{ width: `${100 - forPct - againstPct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}
