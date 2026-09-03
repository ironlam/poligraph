import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Landmark } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { SourceLine } from "@/components/ui/SourceLine";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { EventJsonLd } from "@/components/seo/JsonLd";
import { formatDate } from "@/lib/utils";
import { SITE_URL } from "@/config/site";
import {
  getGroupExposure,
  getSenatorialesElection,
  SENATORIALES_2026_SLUG,
} from "@/lib/data/senatoriales";
import { BallotDay } from "./_components/BallotDay";
import { CandidacyDeposit } from "./_components/CandidacyDeposit";
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
  SOURCE_TABLEAU_5,
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
    title: "Sénatoriales 2026 : la composition du Sénat se joue dans les conseils municipaux",
    description:
      "Le 27 septembre 2026, 178 sièges du Sénat sont renouvelés par 93 469 grands électeurs. " +
      "Le calendrier par série, le barème du collège et les sénateurs sortants par département.",
    alternates: { canonical: `/elections/${SENATORIALES_2026_SLUG}` },
  };
}

export default async function SenatorialesHubPage() {
  const [election, groupExposure] = await Promise.all([
    getSenatorialesElection(),
    getGroupExposure(),
  ]);
  if (!election) notFound();

  // Phase resolved at read time by the data layer: the stored column never
  // transitions on its own, so a page trusting it would still say "à venir" on
  // 28 September.
  const phase = getBallotPhase(election.status);
  const isOver = phase === "after";
  // Narrower than the phase on purpose: `isBallotDay` is the ballot's own Paris day, so
  // the "aujourd'hui" wording cannot outlive it by the two hours the UTC window adds.
  const isBallotDay = phase === "polling-day" && election.isBallotDay;
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
                    {/* First mention of "série" on the page. The tooltip is a shortcut,
                        not the explanation: the full definition sits in `ScrutinRules`
                        as text, because a hover is unreachable on touch.

                        `min-h-11 min-w-11` because AGENTS.md requires 44 px and forbids
                        shipping a bare icon as a standalone target; the shared
                        `InfoTooltip` renders a 14 px icon with `p-0.5`, so it measures
                        18 px on its own. The negative margin keeps the enlarged hit area
                        from stretching this line: it overflows into the card's own padding
                        and the non-interactive status line below, so it swallows no other
                        control. */}
                    <p className="flex items-center gap-1 text-sm font-semibold leading-tight">
                      Renouvellement de la série 2
                      <InfoTooltip term="serieSenatoriale" className="-my-3 min-h-11 min-w-11" />
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {/* "Jour du scrutin", not "Aujourd'hui": `isBallotDay` is the Paris
                          calendar day, so a relative term here is false for a reader whose
                          local day is still the 26th in Polynésie française or already the
                          28th in Wallis-et-Futuna. Same defect as the heading of `BallotDay`,
                          and it survived that fix because it lives in another file. */}
                      {isBallotDay ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                          Jour du scrutin
                        </span>
                      ) : (
                        daysUntil !== null &&
                        daysUntil > 0 && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                            J-{daysUntil}
                          </span>
                        )
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

                {/* Tableau n° 5 is what establishes the 178 of 348 shown above; the decree
                    convenes the circonscriptions but states no seat total. */}
                <SourceLine
                  sources={[SOURCE_TABLEAU_5, SOURCE_DECREE, SOURCE_SENAT]}
                  note="63 départements et collectivités, plus les Français établis hors de France"
                  reportHref={null}
                />
              </CardContent>
            </Card>
          </header>

          {/* The bridge is the first block of content, before the college, before the
              seats: it is the answer to "why does this concern me". */}
          <MunicipalBridge />

          {/* État 3, on the ballot's own day only. Placed after the bridge so the
              "why this concerns you" block stays the first content of the page. */}
          {isBallotDay && <BallotDay />}

          <CommuneLookup phase={phase} />

          <SeatsAtStake exposure={groupExposure} phase={phase} />

          {/* État 2. Present in every phase: before the window it gives the dates, after
              it says what is still possible, and throughout it says why no candidate is
              listed. */}
          <CandidacyDeposit phase={election.candidacyPhase} ballotPhase={phase} />

          <ScrutinRules />

          <SenateMilestones />
        </div>
      </main>
    </>
  );
}
