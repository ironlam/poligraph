import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Landmark } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { SourceLine } from "@/components/ui/SourceLine";
import { EventJsonLd } from "@/components/seo/JsonLd";
import { formatDate } from "@/lib/utils";
import { SITE_URL } from "@/config/site";
import {
  getGroupExposure,
  getSenatorialesElection,
  SENATORIALES_2026_SLUG,
} from "@/lib/data/senatoriales";
import { CommuneLookup } from "./_components/CommuneLookup";
import { MunicipalBridge } from "./_components/MunicipalBridge";
import { ScrutinRules } from "./_components/ScrutinRules";
import { SeatsAtStake } from "./_components/SeatsAtStake";
import { SenateMilestones } from "./_components/SenateMilestones";
import {
  CONSTITUENCY_COUNT,
  HUB_LEDE,
  HUB_LEDE_PAST,
  HUB_TITLE,
  HUB_TITLE_PAST,
  SENATE_SEATS_AT_STAKE,
  SENATE_SEATS_TOTAL,
  SOURCE_DECREE,
  SOURCE_SENAT,
  getBallotPhase,
} from "./_content";

/**
 * ISR at five minutes, flat.
 *
 * A shorter window only matters around 27 September, but `revalidate` must be
 * statically analysable, so a conditional value is not an option. Five minutes
 * everywhere costs little on a page this stable and removes the need to remember an
 * operation on the eve of the ballot: the phase change propagates on its own.
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const election = await getSenatorialesElection();
  if (!election) {
    return { title: "Sénatoriales 2026", robots: { index: false, follow: true } };
  }
  return {
    title: "Sénatoriales 2026 : le Sénat se joue dans les conseils municipaux | Poligraph",
    description:
      "Le 27 septembre 2026, 178 sièges du Sénat sont renouvelés par 93 469 grands électeurs. " +
      "Vos délégués, le barème du collège et les sénateurs sortants de votre département.",
    alternates: { canonical: `/elections/${SENATORIALES_2026_SLUG}` },
  };
}

export default async function SenatorialesHubPage() {
  const [election, groups] = await Promise.all([getSenatorialesElection(), getGroupExposure()]);
  if (!election) notFound();

  // Phase resolved at read time by the data layer: the stored column never
  // transitions on its own, so a page trusting it would still say "à venir" on
  // 28 September.
  const phase = getBallotPhase(election.status);
  const isOver = phase === "after";
  const now = new Date();
  const daysUntil =
    election.round1Date && !isOver
      ? Math.ceil((election.round1Date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

  return (
    <>
      {election.round1Date && (
        <EventJsonLd
          name={election.title}
          description={election.description || undefined}
          startDate={election.round1Date.toISOString()}
          location="France"
          url={`${SITE_URL}/elections/${SENATORIALES_2026_SLUG}`}
        />
      )}

      <main id="main-content" className="container mx-auto max-w-5xl px-4 pt-4 pb-12">
        <Breadcrumb
          items={[{ label: "Élections", href: "/elections" }, { label: "Sénatoriales 2026" }]}
        />

        <div className="space-y-10">
          <header className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-brand-on-surface">
                Élections sénatoriales
                {election.round1Date ? ` · ${formatDate(election.round1Date)}` : ""}
              </p>
              <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight md:text-4xl">
                {isOver ? HUB_TITLE_PAST : HUB_TITLE}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-lg">
                {isOver ? HUB_LEDE_PAST : HUB_LEDE}
              </p>
            </div>

            <Card>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Landmark className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">
                      Renouvellement de la série 2
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {daysUntil !== null && daysUntil > 0 && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                          J-{daysUntil}
                        </span>
                      )}
                      {election.round1Date && (
                        <span>
                          {isOver ? "Tenu le" : "Scrutin le"} {formatDate(election.round1Date)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* "0 bulletin pour vous" is the thesis in figure form, so it sits with
                    the other two rather than in the prose. */}
                <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4">
                  <div>
                    <dd className="font-display text-2xl font-extrabold tabular-nums text-primary">
                      {SENATE_SEATS_AT_STAKE}
                    </dd>
                    <dt className="text-xs text-muted-foreground">
                      sièges sur {SENATE_SEATS_TOTAL}
                    </dt>
                  </div>
                  <div>
                    <dd className="font-display text-2xl font-extrabold tabular-nums text-primary">
                      {CONSTITUENCY_COUNT}
                    </dd>
                    <dt className="text-xs text-muted-foreground">circonscriptions</dt>
                  </div>
                  <div>
                    <dd className="font-display text-2xl font-extrabold tabular-nums text-primary">
                      0
                    </dd>
                    <dt className="text-xs text-muted-foreground">bulletin pour vous</dt>
                  </div>
                </dl>

                <SourceLine
                  sources={[SOURCE_DECREE, SOURCE_SENAT]}
                  note="63 départements et collectivités, plus les Français établis hors de France"
                  reportHref={null}
                />
              </CardContent>
            </Card>
          </header>

          {/* The bridge is the first block of content, before the college, before the
              seats: it is the answer to "why does this concern me". */}
          <MunicipalBridge />

          <CommuneLookup phase={phase} />

          <SeatsAtStake groups={groups} phase={phase} />

          <ScrutinRules />

          <SenateMilestones />
        </div>
      </main>
    </>
  );
}
