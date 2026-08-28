import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Landmark } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { DataProvenance } from "./DataProvenance";
import { HubStats } from "./HubStats";

interface HubCorpusStateProps {
  electionTitle: string;
  round1Date: Date | null;
  round2Date: Date | null;
  dateConfirmed: boolean;
  verifiedMeasureCount: number;
  themeCount: number;
  comparableThemeCount: number;
  lastReviewedAt: Date | null;
  calendarLink: ReactNode;
}

export function HubCorpusState({
  electionTitle,
  round1Date,
  round2Date,
  dateConfirmed,
  verifiedMeasureCount,
  themeCount,
  comparableThemeCount,
  lastReviewedAt,
  calendarLink,
}: HubCorpusStateProps) {
  const comparableLabel =
    comparableThemeCount === themeCount && themeCount > 0
      ? "toutes comparables"
      : `${comparableThemeCount} comparable${comparableThemeCount === 1 ? "" : "s"}`;

  return (
    <section aria-labelledby="hub-corpus" className="space-y-4">
      <h2 id="hub-corpus" className="font-display text-xl font-bold tracking-tight md:text-2xl">
        État du corpus
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-4 rounded-2xl p-5">
          <div className="grid grid-cols-2 gap-4">
            <HubStats verifiedMeasureCount={verifiedMeasureCount} lastReviewedAt={lastReviewedAt} />
            <div>
              <p className="font-display text-3xl font-extrabold tabular-nums tracking-tight text-primary">
                {themeCount}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground-strong">
                thématiques suivies, {comparableLabel}
              </p>
            </div>
          </div>
          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            Les compteurs décrivent le corpus Poligraph, pas la totalité de la campagne.
          </p>
          <Link
            href="/elections/presidentielle-2027/themes"
            prefetch={false}
            className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Couverture par thématique
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Card>

        <div className="space-y-4">
          <Card className="flex-row items-center gap-3 rounded-2xl p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Landmark aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{electionTitle}</p>
              {(round1Date !== null || round2Date !== null) && (
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground-strong">
                  {round1Date !== null && `1er tour le ${formatDate(round1Date)}`}
                  {round1Date !== null && round2Date !== null && " · "}
                  {round2Date !== null && `2d tour le ${formatDate(round2Date)}`}
                  {!dateConfirmed && " · dates non confirmées"}
                </p>
              )}
            </div>
            {calendarLink !== null && (
              <div className="shrink-0 [&>div>button]:min-h-11 [&>div>button]:min-w-11 [&>div>button]:justify-center [&>div>button]:px-3">
                {calendarLink}
              </div>
            )}
          </Card>
          <DataProvenance />
        </div>
      </div>
    </section>
  );
}
