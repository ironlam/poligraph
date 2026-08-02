import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { VOTING_RESULT_LABELS, VOTING_RESULT_COLORS, CHAMBER_SHORT_LABELS } from "@/config/labels";
import type { VotingResult, Chamber } from "@/generated/prisma";
import type { WeeklyRecapData } from "@/lib/data/recap";

interface WeekFeedProps {
  recap: WeeklyRecapData | null;
}

const SCRUTINS_SHOWN = 4;
const UPDATES_SHOWN = 2;

function formatDay(date: Date): string {
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Slim proportional bar of a single scrutin's votes (pour / contre / abstention). */
function VoteBar({ pour, contre, abstain }: { pour: number; contre: number; abstain: number }) {
  const total = pour + contre + abstain;
  if (total === 0) return null;
  const segments = [
    { key: "pour", value: pour, className: "bg-green-500" },
    { key: "contre", value: contre, className: "bg-red-500" },
    { key: "abstain", value: abstain, className: "bg-yellow-500" },
  ].filter((s) => s.value > 0);
  return (
    <div
      className="mt-1.5 flex h-1.5 w-full max-w-[220px] overflow-hidden rounded-full"
      aria-hidden="true"
    >
      {segments.map((s) => (
        <span
          key={s.key}
          className={s.className}
          style={{ width: `${(s.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function WeekFeed({ recap }: WeekFeedProps) {
  if (!recap) return null;

  const scrutins = recap.votes.scrutins.slice(0, SCRUTINS_SHOWN);
  const updates = recap.platformUpdates.updates.slice(0, UPDATES_SHOWN);
  const affairsTotal = recap.affairs.total;
  const factChecksTotal = recap.factChecks.total;

  const hasContent =
    scrutins.length > 0 || updates.length > 0 || affairsTotal > 0 || factChecksTotal > 0;
  if (!hasContent) return null;

  const range = `${formatDay(recap.weekStart)} au ${formatDay(
    new Date(new Date(recap.weekEnd).getTime() - 1)
  )}`;

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-display font-bold">Cette semaine</h2>
        <span className="text-xs text-muted-foreground">{range}</span>
      </div>

      <ul className="divide-y rounded-xl border bg-card">
        {scrutins.map((s) => {
          const resultLabel = VOTING_RESULT_LABELS[s.result as VotingResult] ?? s.result;
          const resultColor =
            VOTING_RESULT_COLORS[s.result as VotingResult] ?? "bg-muted text-muted-foreground";
          const chamber = CHAMBER_SHORT_LABELS[s.chamber as Chamber] ?? s.chamber;
          return (
            <li key={s.slug ?? s.title}>
              <Link
                href={s.slug ? `/parlement/votes/${s.slug}` : "/parlement/votes"}
                prefetch={false}
                className="group flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${resultColor}`}
                  >
                    {resultLabel}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{s.title}</span>
                </div>
                <VoteBar pour={s.votesFor} contre={s.votesAgainst} abstain={s.votesAbstain} />
                <span className="text-xs text-muted-foreground">
                  {chamber} · {formatDay(s.votingDate)}
                </span>
              </Link>
            </li>
          );
        })}

        {updates.map((u) => (
          <li key={u.id}>
            {u.sourceUrl ? (
              <a
                href={u.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/40"
              >
                <span className="min-w-0 flex-1 font-medium leading-snug">{u.title}</span>
                <ExternalLink
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </a>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 font-medium leading-snug">{u.title}</span>
              </div>
            )}
          </li>
        ))}

        {affairsTotal > 0 && (
          <li>
            <Link
              href="/affaires"
              prefetch={false}
              className="group flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/40"
            >
              <span className="min-w-0 flex-1 font-medium">
                {affairsTotal} nouvelle{affairsTotal > 1 ? "s" : ""} affaire
                {affairsTotal > 1 ? "s" : ""} documentée{affairsTotal > 1 ? "s" : ""}
              </span>
              <ArrowUpRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
            </Link>
          </li>
        )}

        {factChecksTotal > 0 && (
          <li>
            <Link
              href="/factchecks"
              prefetch={false}
              className="group flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/40"
            >
              <span className="min-w-0 flex-1 font-medium">
                {factChecksTotal} fact-check{factChecksTotal > 1 ? "s" : ""} vérifié
                {factChecksTotal > 1 ? "s" : ""}
                {recap.factChecks.falseCount > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {recap.factChecks.falseCount} faux
                  </span>
                )}
              </span>
              <ArrowUpRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
            </Link>
          </li>
        )}
      </ul>

      {recap.votes.scrutins.length > SCRUTINS_SHOWN && (
        <Link
          href="/parlement/votes"
          prefetch={false}
          className="group mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
        >
          Voir tous les votes
          <ArrowUpRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Les affaires en cours ne valent pas condamnation. Poligraph distingue les procédures, les
        classements, les relaxes et les condamnations.
      </p>
    </section>
  );
}
