import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Landmark } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { AddToCalendar } from "@/components/elections/AddToCalendar";
import { EventJsonLd } from "@/components/seo/JsonLd";
import { getHubCandidacyField, getHubMeasureContext } from "@/lib/data/hub";
import { PRESIDENTIELLE_2027_SLUG, THEMES_IN_ORDER } from "@/lib/presidentielle/themes";
import { formatDate } from "@/lib/utils";
import { SITE_URL } from "@/config/site";
import { DataProvenance } from "./_components/DataProvenance";
import { HubCandidacyField } from "./_components/HubCandidacyField";
import { HubClosedState } from "./_components/HubClosedState";
import { HubEntryCards } from "./_components/HubEntryCards";
import { HubStats } from "./_components/HubStats";

// ISR: 24h backstop. Real changes propagate on demand: a measure write busts election-measures:<id>.
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const context = await getHubMeasureContext(PRESIDENTIELLE_2027_SLUG);
  // The hub stays out of search results until the themes index clears its own publication
  // gate (spec §4): below the gate there is nothing to send readers to yet.
  const publishable = context !== null && context.hubPublishable;

  return {
    title: "Présidentielle 2027 : programmes, votes, bilans | Poligraph",
    description:
      "Les candidatures à la présidentielle 2027, leurs mesures documentées par sujet et les votes qui les éclairent.",
    robots: publishable ? undefined : { index: false, follow: true },
    alternates: { canonical: "/elections/presidentielle-2027" },
  };
}

export default async function PresidentialHubPage() {
  const [field, context] = await Promise.all([
    getHubCandidacyField(PRESIDENTIELLE_2027_SLUG),
    getHubMeasureContext(PRESIDENTIELLE_2027_SLUG),
  ]);
  if (context === null) notFound();

  const now = new Date();
  const daysUntil = context.round1Date
    ? Math.ceil((context.round1Date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const themeCount = THEMES_IN_ORDER.length;

  const statsRow = (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="font-display text-2xl font-extrabold tracking-tight text-primary">
          {themeCount}
        </p>
        <p className="text-xs text-muted-foreground">sujets suivis</p>
      </div>
      <HubStats
        verifiedMeasureCount={context.verifiedMeasureCount}
        lastReviewedAt={context.lastReviewedAt}
      />
    </div>
  );

  const calendarLink = context.round1Date && (
    <AddToCalendar
      title={context.electionTitle}
      round1Date={context.round1Date}
      round2Date={context.round2Date}
      slug={PRESIDENTIELLE_2027_SLUG}
      dateConfirmed={context.dateConfirmed}
    />
  );

  return (
    <>
      {context.round1Date && (
        <EventJsonLd
          name={context.electionTitle}
          description={context.electionDescription || undefined}
          startDate={context.round1Date.toISOString()}
          location="France"
          url={`${SITE_URL}/elections/${PRESIDENTIELLE_2027_SLUG}`}
        />
      )}
      <div className="container mx-auto px-4 pt-4 pb-8 space-y-8">
        <Breadcrumb
          items={[{ label: "Élections", href: "/elections" }, { label: "Présidentielle 2027" }]}
        />

        <header className="space-y-6">
          {/* Mobile: compact election banner, distinct from the desktop hero card (no stats,
              no divider — the mockup treats it as a short summary, not a scaled-down encart). */}
          <Card className="flex-row items-center gap-3 p-4 md:hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Landmark className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{context.electionTitle}</p>
              {context.round1Date && (
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {daysUntil !== null && daysUntil > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                      J-{daysUntil}
                    </span>
                  )}
                  <span>1er tour le {formatDate(context.round1Date)}</span>
                </p>
              )}
            </div>
            {/* The shared AddToCalendar trigger is sized for a dense desktop sidebar (~20px tall)
                and hides its label below 640px. Enlarging it here, rather than in the shared
                component, gives the 44px touch target this page needs without resizing it
                everywhere else. It sits inside the card so the icon is not orphaned in whitespace. */}
            {calendarLink && (
              <div className="shrink-0 [&>div>button]:min-h-11 [&>div>button]:min-w-11 [&>div>button]:justify-center [&>div>button]:px-3">
                {calendarLink}
              </div>
            )}
          </Card>
          <div className="rounded-xl border border-border p-4 md:hidden">{statsRow}</div>

          <div className="grid gap-8 md:grid-cols-[1.35fr_1fr] md:items-center">
            <div className="space-y-3">
              <p className="hidden text-xs font-bold uppercase tracking-widest text-brand md:block">
                Présidentielle 2027
              </p>
              <h1 className="text-2xl font-display font-extrabold leading-tight tracking-tight md:text-5xl">
                Qu&apos;est-ce qui changerait pour vous ?
              </h1>
              <p className="max-w-xl text-sm text-muted-foreground md:text-lg">
                Pour chaque sujet : ce que les candidats proposent, ce qu&apos;ils ont voté, et ce
                qu&apos;ils ont fait quand ils étaient au pouvoir.
              </p>
            </div>

            {/* Desktop: the full election card, with its stats and the calendar link tucked in. */}
            <Card className="hidden md:block">
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Landmark className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">{context.electionTitle}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {daysUntil !== null && daysUntil > 0 && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                          J-{daysUntil}
                        </span>
                      )}
                      {context.round1Date && (
                        <span>1er tour le {formatDate(context.round1Date)}</span>
                      )}
                      {context.round2Date && (
                        <span>2d tour le {formatDate(context.round2Date)}</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="border-t border-border pt-4">{statsRow}</div>

                {calendarLink && <div className="flex justify-end">{calendarLink}</div>}
              </CardContent>
            </Card>
          </div>
        </header>

        {/* Below the gate the body says so too, instead of leaving the state in a meta tag. */}
        {!context.hubPublishable && (
          <HubClosedState
            verifiedMeasureCount={context.verifiedMeasureCount}
            themeCount={themeCount}
          />
        )}

        <HubEntryCards />

        <section id="candidatures" className="space-y-3">
          <h2 className="text-xl font-display font-bold tracking-tight">Les candidatures</h2>
          <HubCandidacyField candidacies={field} />
        </section>

        <DataProvenance />
      </div>
    </>
  );
}
