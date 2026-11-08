import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownText } from "@/components/ui/markdown";
import { StatusBadge } from "./StatusBadge";
import { CategoryBadge } from "./CategoryBadge";
import { DOSSIER_STATUS_SITUATIONS } from "@/config/labels";
import type { DossierStatus, ThemeCategory } from "@/generated/prisma";
import { ExternalLink, FileText, Milestone, Scale } from "lucide-react";

interface DossierCardProps {
  id: string;
  externalId: string;
  slug?: string | null;
  title: string;
  shortTitle?: string | null;
  number?: string | null;
  status: DossierStatus;
  category?: string | null;
  theme?: ThemeCategory | null;
  summary?: string | null;
  filingDate?: Date | null;
  adoptionDate?: Date | null;
  sourceUrl?: string | null;
  amendmentCount?: number;
  compact?: boolean;
}

const STATUS_BORDER_COLORS: Record<DossierStatus, string> = {
  DEPOSE: "border-l-amber-400 dark:border-l-amber-600",
  EN_COMMISSION: "border-l-violet-400 dark:border-l-violet-600",
  EN_COURS: "border-l-blue-400 dark:border-l-blue-600",
  CONSEIL_CONSTITUTIONNEL: "border-l-purple-400 dark:border-l-purple-600",
  ADOPTE: "border-l-green-500 dark:border-l-green-600",
  REJETE: "border-l-red-400 dark:border-l-red-600",
  REJETE_NAVETTE: "border-l-orange-400 dark:border-l-orange-600",
  RETIRE: "border-l-gray-400 dark:border-l-gray-500",
  CADUQUE: "border-l-gray-300 dark:border-l-gray-600",
};

export function DossierCard({
  id,
  slug,
  title,
  shortTitle,
  number,
  status,
  category,
  theme,
  summary,
  filingDate,
  adoptionDate,
  sourceUrl,
  amendmentCount = 0,
  compact = false,
}: DossierCardProps) {
  const href = `/parlement/dossiers/${slug || id}`;
  const displayTitle = shortTitle || title;
  const displayDate = adoptionDate || filingDate;

  if (compact) {
    return (
      <div className="flex items-center justify-between py-2 border-b last:border-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {number && (
              <span className="font-mono text-xs font-medium text-muted-foreground">{number}</span>
            )}
            <CategoryBadge category={category} theme={theme} showIcon={false} />
          </div>
          <Link href={href} prefetch={false} className="text-sm font-medium hover:text-primary">
            {displayTitle}
          </Link>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <StatusBadge status={status} />
          {displayDate && (
            <span className="text-xs text-muted-foreground">
              {new Date(displayDate).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card
      className={`hover:shadow-md transition-shadow border-l-4 ${STATUS_BORDER_COLORS[status]}`}
    >
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          {/* Header: type indicator + badges */}
          <div className="flex flex-wrap items-center gap-2">
            {number && (
              <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-foreground/80">
                <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                {number}
              </span>
            )}
            <StatusBadge status={status} showIcon />
            <CategoryBadge category={category} theme={theme} />
          </div>

          {/* Title - no truncation */}
          <div>
            <h3 className="text-lg font-semibold mb-1">
              <Link href={href} prefetch={false} className="hover:text-primary">
                {displayTitle}
              </Link>
            </h3>
            {shortTitle && shortTitle !== title && (
              <p className="text-sm text-muted-foreground">{title}</p>
            )}
          </div>

          {/* Où ça en est — situation derived solely from DossierStatus */}
          <div className="flex items-start gap-2 text-sm">
            <Milestone
              className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-muted-foreground">{DOSSIER_STATUS_SITUATIONS[status]}</p>
          </div>

          {/* Summary */}
          {summary && (
            <div className="text-sm text-muted-foreground">
              <p className="mb-1 text-xs font-medium text-foreground">En bref</p>
              <div className="line-clamp-4">
                <MarkdownText>{summary}</MarkdownText>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {displayDate && (
                <span>
                  {status === "ADOPTE" ? "Adopté le" : "Déposé le"}{" "}
                  {new Date(displayDate).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              )}
              {amendmentCount > 0 && (
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {amendmentCount} amendement{amendmentCount > 1 ? "s" : ""} lié
                  {amendmentCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Link href={href} prefetch={false} className="text-sm text-primary hover:underline">
                Comprendre ce dossier
              </Link>
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                  aria-label="Voir le dossier sur le site officiel"
                >
                  Voir sur AN.fr
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
