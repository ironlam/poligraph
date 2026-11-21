import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { FACTCHECK_RATING_LABELS, FACTCHECK_RATING_COLORS } from "@/config/labels";
import type { FactCheckRating } from "@/types";

interface FactCheckCardProps {
  slug: string;
  title: string;
  claimText: string;
  claimant?: string | null;
  verdict: string;
  verdictRating: FactCheckRating;
  source: string;
  publishedAt: Date;
  mentions: Array<{
    isClaimant: boolean;
    politician: {
      slug: string;
      fullName: string;
    };
  }>;
  /** When filtering by politician, highlight their role (claimant vs mentioned) */
  highlightedSlug?: string;
}

// Accent border color per rating (matches VERDICT_GROUP_COLORS from labels.ts)
const RATING_BORDER_ACCENT: Record<string, string> = {
  FALSE: "#c1121f",
  MOSTLY_FALSE: "#c1121f",
  MISLEADING: "#e9a825",
  OUT_OF_CONTEXT: "#e9a825",
  HALF_TRUE: "#e9a825",
  MOSTLY_TRUE: "#2d6a4f",
  TRUE: "#2d6a4f",
  UNVERIFIABLE: "#6b7280",
};

export function FactCheckCard({
  slug,
  title,
  claimText,
  claimant,
  verdictRating,
  source,
  publishedAt,
  mentions,
  highlightedSlug,
}: FactCheckCardProps) {
  const ratingLabel = FACTCHECK_RATING_LABELS[verdictRating];
  const ratingColor = FACTCHECK_RATING_COLORS[verdictRating];
  const borderAccent = RATING_BORDER_ACCENT[verdictRating] || "#6b7280";

  const maxPoliticians = 3;
  const visiblePoliticians = mentions.slice(0, maxPoliticians);
  const hiddenCount = mentions.length - maxPoliticians;

  return (
    <article
      className="group bg-card border border-l-4 rounded-lg p-4 hover:shadow-md transition-shadow"
      style={{ borderLeftColor: borderAccent }}
    >
      {/* Header: verdict + source */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge className={ratingColor}>{ratingLabel}</Badge>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{source}</span>
      </div>

      {/* Title */}
      <Link href={`/factchecks/${slug}`} prefetch={false} className="block">
        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
          {title}
        </h3>
      </Link>

      {/* Claim */}
      <p className="text-sm text-muted-foreground mt-2">
        {claimant && <span className="font-medium">{claimant} : </span>}
        &laquo;&nbsp;{claimText}&nbsp;&raquo;
      </p>

      {/* Date */}
      <p className="text-xs text-muted-foreground mt-2">Vérifié le {formatDate(publishedAt)}</p>

      {/* Politicians mentioned */}
      {mentions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {highlightedSlug &&
            (() => {
              const highlighted = mentions.find((m) => m.politician.slug === highlightedSlug);
              if (!highlighted) return null;
              return (
                <Badge
                  variant={highlighted.isClaimant ? "default" : "secondary"}
                  className="text-xs"
                >
                  {highlighted.isClaimant ? "Propos direct" : "Mentionné"}
                </Badge>
              );
            })()}
          {visiblePoliticians.map((mention) => (
            <Link
              key={mention.politician.slug}
              href={`/factchecks/politique/${mention.politician.slug}`}
              prefetch={false}
              className="inline-block"
            >
              <Badge variant="outline" className="text-xs hover:bg-muted">
                {mention.politician.fullName}
              </Badge>
            </Link>
          ))}
          {hiddenCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              +{hiddenCount}
            </Badge>
          )}
        </div>
      )}

      {/* Detail link */}
      <Link
        href={`/factchecks/${slug}`}
        prefetch={false}
        className="text-xs text-primary hover:underline mt-2 inline-block"
      >
        Voir le détail →
      </Link>
    </article>
  );
}
