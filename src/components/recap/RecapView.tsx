import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { FadeIn } from "@/components/motion/FadeIn";
import { HexPattern } from "@/components/ui/HexPattern";
import {
  getWeekStart,
  getWeekEnd,
  getISOWeekNumber,
  getISOWeekString,
  type WeeklyRecapData,
} from "@/lib/data/recap";
import { PLATFORM_UPDATE_TYPE_LABELS, PLATFORM_UPDATE_TYPE_ICONS } from "@/config/labels";
import { CERTAINTY_LABELS, CERTAINTY_COLORS, type CertaintyLevel } from "@/config/certainty";
import { NewsletterCTA } from "@/app/recap/NewsletterCTA";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { RecapShareBlock } from "./RecapShareBlock";
import { SITE_URL } from "@/config/site";

function formatWeekRange(start: Date, end: Date): string {
  const endDisplay = new Date(end);
  endDisplay.setUTCDate(endDisplay.getUTCDate() - 1);
  const startDay = start.getUTCDate();
  const endDay = endDisplay.getUTCDate();
  const startMonth = start.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
  const endMonth = endDisplay.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
  const year = start.getUTCFullYear();

  if (startMonth === endMonth) {
    return `${startDay}–${endDay} ${startMonth} ${year}`;
  }
  return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${year}`;
}

interface RecapViewProps {
  weekStart: Date;
  data: WeeklyRecapData;
}

export function RecapView({ weekStart, data }: RecapViewProps) {
  const weekEnd = getWeekEnd(weekStart);
  const weekNum = getISOWeekNumber(weekStart);
  const weekIso = getISOWeekString(weekStart);

  const prevWeek = new Date(weekStart);
  prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const isNextWeekFuture = nextWeek >= getWeekStart(new Date());

  const prevIso = getISOWeekString(prevWeek);
  const nextIso = getISOWeekString(nextWeek);

  const range = formatWeekRange(weekStart, weekEnd);

  const isEmpty =
    data.votes.total === 0 &&
    data.affairs.total === 0 &&
    data.factChecks.total === 0 &&
    data.press.articleCount === 0 &&
    data.platformUpdates.total === 0;

  return (
    <>
      <Breadcrumb items={[{ label: "Le récap" }]} />
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-primary/5 via-background to-accent/10">
        <HexPattern className="absolute inset-0 opacity-[0.03] text-primary" />
        <div className="container mx-auto px-4 py-12 md:py-16 relative z-10">
          <FadeIn>
            <div className="max-w-3xl mx-auto text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="h-px flex-1 max-w-16 bg-border" />
                <Badge variant="outline" className="font-display text-xs tracking-widest uppercase">
                  Édition n°{weekNum}
                </Badge>
                <div className="h-px flex-1 max-w-16 bg-border" />
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-extrabold tracking-tight mb-3">
                Le Recap
              </h1>
              <p className="text-lg text-muted-foreground font-display">{range}</p>

              <nav className="flex items-center justify-center gap-4 mt-6">
                <Link
                  href={`/recap/${prevIso}`}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  prefetch={false}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Semaine précédente
                </Link>
                {!isNextWeekFuture && (
                  <Link
                    href={`/recap/${nextIso}`}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    prefetch={false}
                  >
                    Semaine suivante
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </nav>
            </div>
          </FadeIn>
        </div>
      </section>

      <div className="container mx-auto px-4 py-10">
        {isEmpty ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">Aucune donnée pour cette semaine.</p>
            <Link
              href={`/recap/${prevIso}`}
              className="text-primary hover:underline mt-2 inline-block"
            >
              ← Voir la semaine précédente
            </Link>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-12">
            <FadeIn delay={0.1}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                  value={data.votes.total}
                  label={`scrutin${data.votes.total > 1 ? "s" : ""}`}
                  emoji="🗳️"
                />
                <KpiCard
                  value={data.press.articleCount}
                  label={`article${data.press.articleCount > 1 ? "s" : ""} presse`}
                  emoji="📰"
                />
                <KpiCard
                  value={data.affairs.total}
                  label={`nouvelle${data.affairs.total > 1 ? "s" : ""} affaire${data.affairs.total > 1 ? "s" : ""}`}
                  emoji="⚖️"
                />
                <KpiCard
                  value={data.factChecks.total}
                  label={`fact-check${data.factChecks.total > 1 ? "s" : ""}`}
                  emoji="🔍"
                />
              </div>
            </FadeIn>

            {data.votes.total > 0 && (
              <FadeIn delay={0.15}>
                <RecapSection title="Votes" emoji="🗳️">
                  <div className="flex gap-4 mb-5">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-sm">
                        {data.votes.adopted} adopté{data.votes.adopted > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-sm">
                        {data.votes.rejected} rejeté{data.votes.rejected > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  <div className="divide-y divide-border">
                    {data.votes.scrutins.slice(0, 8).map((s) => {
                      const total = s.votesFor + s.votesAgainst + s.votesAbstain;
                      const forPct = total > 0 ? (s.votesFor / total) * 100 : 0;
                      const againstPct = total > 0 ? (s.votesAgainst / total) * 100 : 0;
                      return (
                        <div key={s.slug || s.title} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              {s.slug ? (
                                <Link
                                  href={`/parlement/votes/${s.slug}`}
                                  className="text-sm font-medium hover:underline line-clamp-2"
                                  prefetch={false}
                                >
                                  {s.title}
                                </Link>
                              ) : (
                                <span className="text-sm font-medium line-clamp-2">{s.title}</span>
                              )}
                              <div className="flex items-center gap-2 mt-1.5">
                                <Badge
                                  variant="outline"
                                  className={
                                    s.result === "ADOPTED"
                                      ? "text-green-700 border-green-300 dark:text-green-400 dark:border-green-800"
                                      : "text-red-700 border-red-300 dark:text-red-400 dark:border-red-800"
                                  }
                                >
                                  {s.result === "ADOPTED" ? "Adopté" : "Rejeté"}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {s.chamber === "AN" ? "AN" : "Sénat"}
                                </span>
                              </div>
                            </div>
                            {total > 0 && (
                              <div className="w-24 shrink-0 pt-1">
                                <div className="flex h-2 rounded-full overflow-hidden">
                                  <div className="bg-green-500" style={{ width: `${forPct}%` }} />
                                  <div className="bg-red-500" style={{ width: `${againstPct}%` }} />
                                  <div className="bg-gray-300 dark:bg-gray-600 flex-1" />
                                </div>
                                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                                  <span>{s.votesFor}</span>
                                  <span>{s.votesAgainst}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {data.votes.total > 8 && (
                    <Link
                      href="/parlement/votes"
                      className="block text-sm text-primary hover:underline mt-4"
                      prefetch={false}
                    >
                      Voir les {data.votes.total} scrutins →
                    </Link>
                  )}
                </RecapSection>
              </FadeIn>
            )}

            {data.activity.topVoters.length > 0 && (
              <FadeIn delay={0.2}>
                <RecapSection title="Les plus actifs" emoji="🏛️">
                  <p className="text-sm text-muted-foreground mb-4">
                    Parlementaires ayant le plus voté cette semaine.
                  </p>
                  <div className="space-y-3">
                    {data.activity.topVoters.map((p, i) => (
                      <Link
                        key={p.slug}
                        href={`/politiques/${p.slug}`}
                        className="flex items-center gap-3 group"
                        prefetch={false}
                      >
                        <span className="w-6 text-right text-sm font-display font-extrabold text-muted-foreground tabular-nums">
                          {i + 1}
                        </span>
                        <PoliticianAvatar
                          photoUrl={p.photoUrl}
                          firstName={p.fullName.split(" ")[0]}
                          lastName={p.fullName.split(" ").slice(1).join(" ")}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium group-hover:underline">
                            {p.fullName}
                          </span>
                          {p.partyShortName && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {p.partyShortName}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-display font-bold tabular-nums">
                          {p.count} votes
                        </span>
                      </Link>
                    ))}
                  </div>
                </RecapSection>
              </FadeIn>
            )}

            {data.affairs.total > 0 && (
              <FadeIn delay={0.25}>
                <RecapSection title="Affaires judiciaires" emoji="⚖️">
                  <div className="space-y-3">
                    {data.affairs.newAffairs.map((a) => (
                      <div
                        key={a.slug}
                        className="flex items-start gap-3 py-2 border-b last:border-0"
                      >
                        <Badge
                          variant="outline"
                          className={`shrink-0 ${CERTAINTY_COLORS[a.certaintyLevel as CertaintyLevel] || ""}`}
                        >
                          {CERTAINTY_LABELS[a.certaintyLevel as CertaintyLevel] || a.certaintyLevel}
                        </Badge>
                        <div className="min-w-0">
                          <Link
                            href={`/affaires/${a.slug}`}
                            className="text-sm font-medium hover:underline line-clamp-1"
                            prefetch={false}
                          >
                            {a.title}
                          </Link>
                          <Link
                            href={`/politiques/${a.politicianSlug}`}
                            className="text-xs text-muted-foreground hover:underline"
                            prefetch={false}
                          >
                            {a.politicianName}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </RecapSection>
              </FadeIn>
            )}

            {data.factChecks.total > 0 && (
              <FadeIn delay={0.3}>
                <RecapSection title="Fact-checks" emoji="🔍">
                  <div className="mb-5">
                    <div className="flex h-3 rounded-full overflow-hidden">
                      {data.factChecks.falseCount > 0 && (
                        <div
                          className="bg-red-400"
                          style={{
                            width: `${(data.factChecks.falseCount / data.factChecks.total) * 100}%`,
                          }}
                        />
                      )}
                      {data.factChecks.mixedCount > 0 && (
                        <div
                          className="bg-yellow-400"
                          style={{
                            width: `${(data.factChecks.mixedCount / data.factChecks.total) * 100}%`,
                          }}
                        />
                      )}
                      {data.factChecks.trueCount > 0 && (
                        <div
                          className="bg-green-400"
                          style={{
                            width: `${(data.factChecks.trueCount / data.factChecks.total) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span className="text-red-600 dark:text-red-400">
                        Faux : {data.factChecks.falseCount}
                      </span>
                      <span className="text-yellow-600 dark:text-yellow-400">
                        Mitigé : {data.factChecks.mixedCount}
                      </span>
                      <span className="text-green-600 dark:text-green-400">
                        Vrai : {data.factChecks.trueCount}
                      </span>
                    </div>
                  </div>

                  {data.factChecks.topPoliticians.length > 0 && (
                    <>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                        Les plus vérifiés
                      </h3>
                      <div className="space-y-2">
                        {data.factChecks.topPoliticians.map((p) => (
                          <Link
                            key={p.slug}
                            href={`/factchecks?politician=${p.slug}&directOnly=1`}
                            className="flex items-center gap-3 group"
                            prefetch={false}
                          >
                            <PoliticianAvatar
                              photoUrl={p.photoUrl}
                              firstName={p.fullName.split(" ")[0]}
                              lastName={p.fullName.split(" ").slice(1).join(" ")}
                              size="sm"
                            />
                            <span className="text-sm group-hover:underline flex-1">
                              {p.fullName}
                            </span>
                            <span className="text-sm font-display font-bold tabular-nums">
                              {p.count}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                  <Link
                    href="/factchecks"
                    className="block text-sm text-primary hover:underline mt-4"
                    prefetch={false}
                  >
                    Tous les fact-checks →
                  </Link>
                </RecapSection>
              </FadeIn>
            )}

            {data.press.articleCount > 0 && (
              <FadeIn delay={0.35}>
                <RecapSection title="Dans la presse" emoji="📰">
                  <p className="text-sm text-muted-foreground mb-6">
                    {data.press.articleCount.toLocaleString("fr-FR")} articles analysés cette
                    semaine.
                  </p>

                  {/* Press "stories of the week" hidden from the public recap for now
                      (press-publisher neighbouring rights). We link, we don't reproduce. */}

                  <Link
                    href="/presse"
                    className="block text-sm text-primary hover:underline mt-6"
                    prefetch={false}
                  >
                    Voir la revue de presse →
                  </Link>
                </RecapSection>
              </FadeIn>
            )}

            {data.platformUpdates.total > 0 && (
              <FadeIn delay={0.38}>
                <RecapSection title="Évolutions Poligraph" emoji="🚀">
                  <div className="space-y-3">
                    {data.platformUpdates.updates.map((update) => (
                      <div
                        key={update.id}
                        className="flex items-start gap-3 py-2 border-b last:border-0"
                      >
                        <span className="text-lg shrink-0" aria-hidden="true">
                          {PLATFORM_UPDATE_TYPE_ICONS[update.type]}
                        </span>
                        <div className="min-w-0 flex-1">
                          {update.sourceUrl ? (
                            <a
                              href={update.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium hover:underline"
                            >
                              {update.title}
                            </a>
                          ) : (
                            <span className="text-sm font-medium">{update.title}</span>
                          )}
                          <div className="mt-0.5">
                            <Badge variant="outline" className="text-xs">
                              {PLATFORM_UPDATE_TYPE_LABELS[update.type]}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </RecapSection>
              </FadeIn>
            )}

            <FadeIn delay={0.4}>
              <RecapShareBlock
                shareUrl={`${SITE_URL}/recap/${weekIso}`}
                totalVotes={data.votes.total}
                totalAffairs={data.affairs.total}
                totalArticles={data.press.articleCount}
                weekIso={weekIso}
              />
            </FadeIn>

            <FadeIn delay={0.42}>
              <NewsletterCTA />
            </FadeIn>

            <FadeIn delay={0.45}>
              <div className="text-center py-8 border-t">
                <p className="text-sm text-muted-foreground mb-3">
                  Le Recap est mis à jour chaque lundi matin.
                </p>
                <Link href="/statistiques" className="text-sm text-primary hover:underline">
                  Voir les statistiques complètes →
                </Link>
              </div>
            </FadeIn>
          </div>
        )}
      </div>
    </>
  );
}

function KpiCard({ value, label, emoji }: { value: number; label: string; emoji: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 text-center">
        <span className="text-lg mb-1 block">{emoji}</span>
        <div className="text-2xl font-display font-extrabold tracking-tight tabular-nums">
          {value.toLocaleString("fr-FR")}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}

function RecapSection({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">{emoji}</span>
          <h2 className="text-lg font-display font-bold tracking-tight">{title}</h2>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
