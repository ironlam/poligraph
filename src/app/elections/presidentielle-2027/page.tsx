import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { AddToCalendar } from "@/components/elections/AddToCalendar";
import { EventJsonLd } from "@/components/seo/JsonLd";
import { getHubCandidacyField, getHubMeasureContext } from "@/lib/data/hub";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { formatDate } from "@/lib/utils";
import { SITE_URL } from "@/config/site";
import { DataProvenance } from "./_components/DataProvenance";
import { HubCandidacyField } from "./_components/HubCandidacyField";
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
        <Breadcrumb items={[{ label: "Présidentielle" }]} />

        <header className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {context.electionTitle}
            {daysUntil !== null && daysUntil > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-primary">J-{daysUntil}</span>
              </>
            )}
            {context.round1Date && <> · 1er tour le {formatDate(context.round1Date)}</>}
            {context.round2Date && <> · 2d tour le {formatDate(context.round2Date)}</>}
          </p>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            Qu&apos;est-ce qui changerait pour vous ?
          </h1>
        </header>

        {context.round1Date && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold mb-3">Ajouter au calendrier</h2>
              <AddToCalendar
                title={context.electionTitle}
                round1Date={context.round1Date}
                round2Date={context.round2Date}
                slug={PRESIDENTIELLE_2027_SLUG}
                dateConfirmed={context.dateConfirmed}
              />
            </CardContent>
          </Card>
        )}

        <HubEntryCards />

        <section id="candidatures" className="space-y-3">
          <h2 className="text-xl font-display font-bold tracking-tight">Les candidatures</h2>
          <HubCandidacyField candidacies={field} />
        </section>

        <DataProvenance />

        <HubStats
          verifiedMeasureCount={context.verifiedMeasureCount}
          lastReviewedAt={context.lastReviewedAt}
        />
      </div>
    </>
  );
}
