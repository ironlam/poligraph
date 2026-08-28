import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { AddToCalendar } from "@/components/elections/AddToCalendar";
import { EventJsonLd } from "@/components/seo/JsonLd";
import { getHubCandidacyField, getHubMeasureContext } from "@/lib/data/hub";
import { PRESIDENTIELLE_2027_SLUG, THEMES_IN_ORDER } from "@/lib/presidentielle/themes";
import { formatDate } from "@/lib/utils";
import { SITE_URL } from "@/config/site";
import { HubCandidacyOverview } from "./_components/HubCandidacyOverview";
import { HubClosedState } from "./_components/HubClosedState";
import { HubCorpusState } from "./_components/HubCorpusState";
import { HubSubjects } from "./_components/HubSubjects";
import { PresidentialCorpusSearch } from "./_components/PresidentialCorpusSearch";

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
      "Les candidatures à la présidentielle 2027, leurs mesures sourcées et relues par thème et les votes qui les éclairent.",
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
      <div className="container mx-auto space-y-10 px-4 pt-4 pb-8">
        <Breadcrumb
          items={[{ label: "Élections", href: "/elections" }, { label: "Présidentielle 2027" }]}
        />

        <header className="max-w-3xl space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-on-surface">
            Présidentielle 2027
          </p>
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
            Qu&apos;est-ce qui changerait pour vous ?
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-lg">
            Pour chaque thème : ce que les personnalités suivies proposent, ce qu&apos;elles ont
            voté, et ce qu&apos;elles ont fait quand elles étaient au pouvoir.
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

        <PresidentialCorpusSearch />

        {/* Below the gate the body says so too, instead of leaving the state in a meta tag. */}
        {!context.hubPublishable && (
          <HubClosedState
            verifiedMeasureCount={context.verifiedMeasureCount}
            themeCount={themeCount}
          />
        )}

        <HubSubjects themes={context.themes} />

        <HubCandidacyOverview candidacies={field} />

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
