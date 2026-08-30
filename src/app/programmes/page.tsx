import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, FileCheck2, Info, UsersRound } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { getHubCandidacyField, getHubMeasureContext } from "@/lib/data/hub";
import { getLatestPlatformsPerParty } from "@/lib/data/platforms";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { cn } from "@/lib/utils";

export const revalidate = 300;

const PRESIDENTIAL_HUB_PATH = `/elections/${PRESIDENTIELLE_2027_SLUG}`;

export const metadata: Metadata = {
  title: "Programmes politiques 2027 et programmes des partis",
  description:
    "Consultez les programmes et mesures sourcées des candidats à la présidentielle 2027, ainsi que les derniers programmes documentés des partis politiques français.",
  alternates: { canonical: "/programmes" },
};

export default async function ProgrammesPage() {
  if (!(await isFeatureEnabled("PROGRAMMES_ENABLED"))) notFound();

  const [platforms, presidentialContext, candidacies] = await Promise.all([
    getLatestPlatformsPerParty(),
    getHubMeasureContext(PRESIDENTIELLE_2027_SLUG),
    getHubCandidacyField(PRESIDENTIELLE_2027_SLUG),
  ]);
  const candidaciesWithMeasures = candidacies.filter((candidacy) => candidacy.measureCount > 0);

  return (
    <div className="container mx-auto px-4 pt-4 pb-8">
      <CollectionPageJsonLd
        name="Programmes politiques et présidentielle 2027"
        description="Les mesures des candidats à la présidentielle 2027 et les derniers programmes officiels documentés des partis politiques français."
        url="https://poligraph.fr/programmes"
        numberOfItems={platforms.length + (presidentialContext?.hubPublishable === true ? 1 : 0)}
      />
      <Breadcrumb items={[{ label: "Programmes" }]} />

      <main className="mt-6 space-y-10">
        <header className="max-w-3xl space-y-2">
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-5xl">
            Programmes politiques et présidentielle 2027
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
            Explorez les mesures publiées pour l’élection présidentielle et retrouvez les programmes
            officiels déjà documentés par Poligraph.
          </p>
        </header>

        {presidentialContext?.hubPublishable === true && (
          <section
            aria-labelledby="presidentielle-programmes-title"
            className="overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.035]"
          >
            <div className="space-y-6 p-5 sm:p-7">
              <div className="max-w-3xl space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-brand-on-surface">
                  Élection présidentielle 2027
                </p>
                <h2
                  id="presidentielle-programmes-title"
                  className="font-display text-2xl font-bold tracking-tight md:text-3xl"
                >
                  Comparer les programmes des candidats
                </h2>
                <p className="leading-relaxed text-muted-foreground">
                  Les mesures sont extraites de sources datées, relues puis organisées par thème et
                  sous-thème. Elles sont présentées sans score ni jugement sur leur contenu.
                </p>
              </div>

              <dl className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border bg-background p-4">
                  <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                    Mesures publiées
                  </dt>
                  <dd className="mt-1 font-display text-2xl font-bold">
                    {presidentialContext.verifiedMeasureCount.toLocaleString("fr-FR")}
                  </dd>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                    <UsersRound className="h-4 w-4" aria-hidden="true" />
                    Personnalités documentées
                  </dt>
                  <dd className="mt-1 font-display text-2xl font-bold">
                    {candidaciesWithMeasures.length.toLocaleString("fr-FR")}
                  </dd>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <dt className="text-sm text-muted-foreground">Thèmes comparables</dt>
                  <dd className="mt-1 font-display text-2xl font-bold">
                    {presidentialContext.publishableSubjectPageCount.toLocaleString("fr-FR")}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href={PRESIDENTIAL_HUB_PATH}
                  className={cn(buttonVariants({ variant: "default" }), "min-h-11")}
                >
                  Explorer la présidentielle 2027
                  <ArrowRight aria-hidden="true" />
                </Link>
                <Link
                  href={`${PRESIDENTIAL_HUB_PATH}/candidats`}
                  className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}
                >
                  Voir les candidats
                </Link>
                <Link
                  href={`${PRESIDENTIAL_HUB_PATH}/themes`}
                  className={cn(buttonVariants({ variant: "link" }), "min-h-11")}
                >
                  Parcourir les thèmes
                </Link>
              </div>
            </div>
          </section>
        )}

        <section aria-labelledby="parties-heading" className="space-y-5">
          <div className="max-w-3xl space-y-2">
            <h2 id="parties-heading" className="font-display text-2xl font-bold tracking-tight">
              Derniers programmes documentés par parti
            </h2>
            <p className="leading-relaxed text-muted-foreground">
              Cette collection rassemble les programmes officiels associés à une élection. Elle
              complète le suivi des programmes propres aux candidats à la présidentielle.
            </p>
          </div>

          <div className="flex gap-3 rounded-xl border bg-muted/30 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Une partie du corpus correspond encore aux élections législatives de 2024. La date et
              l’élection de référence sont indiquées sur chaque programme.{" "}
              <Link
                href="/sources"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Consulter nos sources
              </Link>
            </p>
          </div>

          {platforms.length === 0 ? (
            <p className="rounded-xl border p-6 text-muted-foreground">
              Aucun programme de parti n’est enregistré pour le moment.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {platforms.map((platform) => (
                <Link
                  key={platform.id}
                  href={`/partis/${platform.party?.slug}/programme`}
                  className="group flex min-h-24 items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  prefetch={false}
                >
                  {platform.party?.logoUrl && (
                    <Image
                      src={platform.party.logoUrl}
                      alt={`Logo de ${platform.party.name}`}
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-lg border object-contain p-1"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {platform.party?.name ?? "Parti inconnu"}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {platform._count.proposals} axe
                      {platform._count.proposals > 1 ? "s" : ""} documenté
                      {platform._count.proposals > 1 ? "s" : ""}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {platform.election.title}
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
