import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Mail } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { AddToCalendar } from "@/components/elections/AddToCalendar";
import { CollectionPageJsonLd, EventJsonLd } from "@/components/seo/JsonLd";
import { getHubCandidacyField, getHubMeasureContext } from "@/lib/data/hub";
import { PRESIDENTIELLE_2027_SLUG, THEMES_IN_ORDER } from "@/lib/presidentielle/themes";
import { formatDate } from "@/lib/utils";
import { SITE_URL } from "@/config/site";
import { HubCandidacyOverview } from "./_components/HubCandidacyOverview";
import { HubClosedState } from "./_components/HubClosedState";
import { HubCorpusState } from "./_components/HubCorpusState";
import { HubComparisonLauncher } from "./_components/HubComparisonLauncher";
import { HubSubjects } from "./_components/HubSubjects";
import { HubTopics } from "./_components/HubTopics";
import { HubReaderGuides } from "./_components/HubReaderGuides";
import { PresidentialHubNav } from "./_components/PresidentialHubNav";
import { PresidentialCorpusSearch } from "./_components/PresidentialCorpusSearch";

// ISR: 24h backstop. Real changes propagate on demand: a measure write busts election-measures:<id>.
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const context = await getHubMeasureContext(PRESIDENTIELLE_2027_SLUG);
  // The hub stays out of search results until the themes index clears its own publication
  // gate (spec §4): below the gate there is nothing to send readers to yet.
  const publishable = context !== null && context.hubPublishable;

  return {
    title: "Présidentielle 2027 : programmes, mesures et candidatures",
    description:
      "Les candidatures à la présidentielle 2027, leurs mesures sourcées et relues par thème, et les votes parlementaires disponibles dans Poligraph.",
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
      <CollectionPageJsonLd
        name="Présidentielle 2027 : programmes et mesures des candidatures"
        description="Comparer les candidatures à l'élection présidentielle 2027, leurs mesures sourcées et les votes parlementaires disponibles par sujet."
        url={`${SITE_URL}/elections/${PRESIDENTIELLE_2027_SLUG}`}
        numberOfItems={context.verifiedMeasureCount}
      />
      <div className="container mx-auto space-y-8 px-4 pt-4 pb-8">
        <Breadcrumb
          items={[{ label: "Élections", href: "/elections" }, { label: "Présidentielle 2027" }]}
        />

        <PresidentialHubNav active="overview" />

        <header className="max-w-3xl space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-on-surface">
            Présidentielle 2027
          </p>
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
            Présidentielle 2027 : comparer les programmes et les mesures
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-lg">
            Pour chaque thème : les mesures publiées par les personnalités suivies et,
            lorsqu&apos;ils existent, les votes parlementaires documentés sur le même objet.
          </p>
          {context.round1Date && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground-strong">
              {daysUntil !== null && daysUntil > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">
                  J-{daysUntil}
                </span>
              )}
              <span>
                1er tour le {formatDate(context.round1Date)}
                {!context.dateConfirmed && ", date non confirmée"}
              </span>
            </p>
          )}
        </header>

        <HubCandidacyOverview candidacies={field} />

        <PresidentialCorpusSearch />

        {/* Below the gate the body says so too, instead of leaving the state in a meta tag. */}
        {!context.hubPublishable && (
          <HubClosedState
            verifiedMeasureCount={context.verifiedMeasureCount}
            themeCount={themeCount}
          />
        )}

        <HubTopics subtopics={context.featuredSubtopics} />

        <HubSubjects themes={context.themes} />

        <HubReaderGuides guides={context.featuredReaderGuides} />

        <HubComparisonLauncher candidacies={field} themes={context.themes} />

        <section
          aria-labelledby="campaign-contact-title"
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="campaign-contact-title" className="font-display text-lg font-bold">
              Vous représentez une équipe de campagne ?
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Envoyez-nous le programme officiel, une correction ou une source. Chaque ajout reste
              soumis à la même vérification éditoriale.
            </p>
          </div>
          <a
            href="mailto:contact@poligraph.fr?subject=Présidentielle%202027%20-%20programme%20ou%20correction"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary px-4 font-display text-sm font-bold text-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Mail aria-hidden="true" className="h-4 w-4" />
            Contacter Poligraph
          </a>
        </section>

        <HubCorpusState
          electionTitle={context.electionTitle}
          round1Date={context.round1Date}
          round2Date={context.round2Date}
          dateConfirmed={context.dateConfirmed}
          verifiedMeasureCount={context.verifiedMeasureCount}
          themeCount={themeCount}
          comparableThemeCount={context.publishableSubjectPageCount}
          lastReviewedAt={context.lastReviewedAt}
          calendarLink={calendarLink}
        />
      </div>
    </>
  );
}
