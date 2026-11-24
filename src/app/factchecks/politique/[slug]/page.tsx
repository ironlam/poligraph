import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import {
  FactCheckList,
  SourceTable,
  VerdictSummary,
} from "@/components/factchecks/politique/PoliticianFactChecks";
import { MANDATE_TYPE_LABELS, feminizeRole } from "@/config/labels";
import { SITE_URL } from "@/config/site";
import {
  factCheckPoliticianPath,
  getPoliticianFactCheckLanding,
} from "@/lib/data/factcheck-politician";
import { factCheckRobotsMetadata } from "@/lib/seo/factcheck-robots";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { openGraph, SEGMENT_IMAGE_FILE } from "@/lib/seo/open-graph";

// ISR: 24h backstop; changes propagate on demand through the tags of the data function. The page
// reads no searchParams: the verdict filter runs in the browser over the rendered list.
export const revalidate = 86400;

// Empty on purpose: its presence makes the route ISR-cacheable without prerendering anything at
// build time (see src/__tests__/architecture/isr-cacheable-routes.test.ts).
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

const buttonClass =
  "inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg border text-sm font-medium hover:bg-muted transition-colors";

function heading(fullName: string): string {
  return `Les déclarations de ${fullName} vérifiées`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const landing = await getPoliticianFactCheckLanding(slug);
  if (!landing) return missingEntityMetadata("Fact-checks non trouvés");

  const { author, claimed, bySource } = landing;
  const description =
    claimed.length > 0
      ? `${claimed.length.toLocaleString("fr-FR")} déclaration${claimed.length > 1 ? "s" : ""} de ${author.fullName} vérifiée${claimed.length > 1 ? "s" : ""} par ${bySource.map((s) => s.name).join(", ")} : verdicts, dates et liens vers les articles.`
      : `Les fact-checks des rédactions suivies par Poligraph qui citent ${author.fullName}.`;

  return {
    title: heading(author.fullName),
    description,
    alternates: { canonical: factCheckPoliticianPath(slug) },
    ...factCheckRobotsMetadata(landing.indexable),
    openGraph: openGraph({
      title: heading(author.fullName),
      description,
      type: "website",
      images: SEGMENT_IMAGE_FILE,
    }),
  };
}

export default async function PoliticianFactChecksPage({ params }: PageProps) {
  const { slug } = await params;
  const landing = await getPoliticianFactCheckLanding(slug);
  if (!landing) notFound();

  const { author, hasCandidacy, claimed, bySource } = landing;
  const url = `${SITE_URL}${factCheckPoliticianPath(author.slug)}`;
  const role =
    author.mandateTitle ??
    (author.mandateType
      ? feminizeRole(MANDATE_TYPE_LABELS[author.mandateType], author.civility)
      : null);

  return (
    <div className="container mx-auto px-4 pt-4 pb-8 max-w-3xl">
      <Breadcrumb
        items={[
          { label: "Fact-checks", href: "/factchecks" },
          // The href only feeds the BreadcrumbList JSON-LD: the last step renders as plain text.
          { label: author.fullName, href: factCheckPoliticianPath(author.slug) },
        ]}
      />
      <CollectionPageJsonLd
        name={heading(author.fullName)}
        description={`Les fact-checks des déclarations de ${author.fullName}.`}
        url={url}
        numberOfItems={claimed.length}
        about={{ name: author.fullName, url: `${SITE_URL}/politiques/${author.slug}` }}
        aboutType="Person"
      />

      <section className="mb-6 space-y-4">
        <h1 className="text-2xl font-display font-extrabold tracking-tight">
          {heading(author.fullName)}
        </h1>
        <div className="flex items-center gap-4">
          <PoliticianAvatar
            photoUrl={author.photoUrl}
            blobPhotoUrl={author.blobPhotoUrl}
            fullName={author.fullName}
            size="md"
          />
          <div className="min-w-0">
            {role && <p className="font-bold">{role}</p>}
            {author.group && (
              <p className="text-sm text-muted-foreground">
                Groupe {author.group.name} ({author.group.code})
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {author.party?.slug && (
            <Link href={`/partis/${author.party.slug}`} className={buttonClass}>
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-border"
                style={{ backgroundColor: author.party.color ?? undefined }}
              />
              {author.party.name} ({author.party.shortName}), parti actuel
            </Link>
          )}
          <Link href={`/politiques/${author.slug}`} className={buttonClass}>
            Sa fiche
          </Link>
          {hasCandidacy && (
            <Link
              href={`/elections/presidentielle-2027/candidats/${author.slug}`}
              className={buttonClass}
            >
              Sa fiche de candidat 2027
            </Link>
          )}
        </div>
      </section>

      <VerdictSummary landing={landing} />
      <SourceTable landing={landing} />
      <FactCheckList landing={landing} />

      <footer className="mt-8 pt-4 border-t text-xs text-muted-foreground leading-relaxed space-y-2">
        {bySource.length > 0 && (
          <p>
            Les verdicts sont ceux des rédactions citées ({bySource.map((s) => s.name).join(", ")}).
            Poligraph les rassemble et ne produit pas ses propres vérifications.
          </p>
        )}
        <p>
          Le bilan compte les déclarations attribuées à {author.fullName} et rattachées à sa fiche.
          Une rédaction vérifie surtout ce qui circule : ces chiffres ne mesurent pas la fiabilité d
          {"'"}une personne. Cette page suit le même format pour chaque personnalité.
        </p>
        <p className="flex flex-wrap gap-x-4">
          <Link
            href="/methodologie"
            className="inline-flex min-h-11 items-center text-primary hover:underline"
          >
            Notre méthode
          </Link>
          <Link
            href={`/signaler?from=${encodeURIComponent(factCheckPoliticianPath(author.slug))}`}
            rel="nofollow"
            prefetch={false}
            className="inline-flex min-h-11 items-center text-primary hover:underline"
          >
            Signaler une erreur
          </Link>
        </p>
      </footer>
    </div>
  );
}
