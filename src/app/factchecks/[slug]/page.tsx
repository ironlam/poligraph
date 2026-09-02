import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { FACTCHECK_RATING_LABELS, FACTCHECK_RATING_COLORS } from "@/config/labels";
import { ClaimReviewJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SITE_URL } from "@/config/site";
import { ShareBar } from "@/components/ui/ShareBar";
import { getPublicFactCheckWhere, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";

export const revalidate = 86400; // ISR: 24h backstop; real changes propagate on-demand via revalidateTag

export async function generateStaticParams() {
  const factChecks = await db.factCheck.findMany({
    where: { ...getPublicFactCheckWhere(), slug: { not: null } },
    select: { slug: true },
    take: 100,
    orderBy: { publishedAt: "desc" },
  });
  return factChecks.filter((fc) => fc.slug !== null).map((fc) => ({ slug: fc.slug! }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getFactCheck(slug: string) {
  "use cache";
  cacheTag(`factcheck:${slug}`, "factchecks");
  cacheLife("synced");

  return db.factCheck.findFirst({
    where: { ...getPublicFactCheckWhere(), slug },
    include: {
      mentions: {
        where: { politician: PUBLIC_POLITICIAN_WHERE },
        include: {
          politician: {
            select: {
              slug: true,
              fullName: true,
              photoUrl: true,
              currentParty: {
                select: { shortName: true, color: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const factCheck = await getFactCheck(slug);

  if (!factCheck) {
    return missingEntityMetadata("Fact-check non trouvé");
  }

  const ratingLabel = FACTCHECK_RATING_LABELS[factCheck.verdictRating];
  const description = factCheck.claimant
    ? `${ratingLabel} — ${factCheck.claimant} : « ${factCheck.claimText.slice(0, 120)} »`
    : `${ratingLabel} — « ${factCheck.claimText.slice(0, 140)} »`;

  return {
    title: factCheck.title,
    description,
    alternates: { canonical: `/factchecks/${slug}` },
    openGraph: {
      title: `${ratingLabel} — ${factCheck.title}`,
      description,
      type: "article",
    },
  };
}

export default async function FactCheckDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const factCheck = await getFactCheck(slug);

  if (!factCheck) {
    notFound();
  }

  const ratingLabel = FACTCHECK_RATING_LABELS[factCheck.verdictRating];
  const ratingColor = FACTCHECK_RATING_COLORS[factCheck.verdictRating];

  return (
    <>
      <ShareBar
        data={{
          title: factCheck.title,
          text: `${factCheck.title} - Verdict : ${ratingLabel}`,
          url: `${SITE_URL}/factchecks/${factCheck.slug}`,
        }}
      />
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-3xl">
        <Breadcrumb
          items={[{ label: "Fact-checks", href: "/factchecks" }, { label: factCheck.title }]}
        />
        <ClaimReviewJsonLd
          url={`${SITE_URL}/factchecks/${factCheck.slug}`}
          claimText={factCheck.claimText}
          claimant={factCheck.claimant}
          verdict={factCheck.verdict}
          verdictRating={factCheck.verdictRating}
          reviewDate={factCheck.publishedAt.toISOString().split("T")[0]!}
          source={factCheck.source}
          sourceUrl={factCheck.sourceUrl}
        />

        {/* Source */}
        <p className="text-sm text-muted-foreground mb-4">{factCheck.source}</p>

        {/* Title */}
        <h1 className="text-2xl font-display font-extrabold tracking-tight mb-2">
          {factCheck.title}
        </h1>

        {/* Date */}
        <p className="text-sm text-muted-foreground mb-6">
          Publié le {formatDate(factCheck.publishedAt)}
        </p>

        {/* Claim card */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-sm font-semibold">Déclaration vérifiée</h2>
          </CardHeader>
          <CardContent>
            <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground">
              {factCheck.claimant && (
                <span className="font-medium not-italic text-foreground">
                  {factCheck.claimant} :{" "}
                </span>
              )}
              &laquo;&nbsp;{factCheck.claimText}&nbsp;&raquo;
            </blockquote>
            {factCheck.claimDate && (
              <p className="text-xs text-muted-foreground mt-2">
                Déclaration du {formatDate(factCheck.claimDate)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Verdict card */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-sm font-semibold">Verdict</h2>
          </CardHeader>
          <CardContent>
            <Badge className={`text-base px-4 py-1.5 ${ratingColor}`}>{ratingLabel}</Badge>
          </CardContent>
        </Card>

        {/* Politicians — split by role */}
        {factCheck.mentions.length > 0 &&
          (() => {
            const claimants = factCheck.mentions.filter((m) => m.isClaimant);
            const subjects = factCheck.mentions.filter((m) => !m.isClaimant);

            return (
              <Card className="mb-6">
                <CardContent className="pt-6 space-y-4">
                  {claimants.length > 0 && (
                    <div>
                      <h2 className="text-sm font-semibold mb-2">
                        Auteur{claimants.length > 1 ? "s" : ""} de la déclaration
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {claimants.map((mention) => (
                          <Link
                            key={mention.politician.slug}
                            href={`/politiques/${mention.politician.slug}`}
                            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-muted transition-colors"
                          >
                            <span className="text-sm font-medium">
                              {mention.politician.fullName}
                            </span>
                            {mention.politician.currentParty && (
                              <Badge variant="outline" className="text-xs">
                                {mention.politician.currentParty.shortName}
                              </Badge>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {subjects.length > 0 && (
                    <div>
                      <h2 className="text-sm font-semibold mb-2 text-muted-foreground">
                        Politicien{subjects.length > 1 ? "s" : ""} concerné
                        {subjects.length > 1 ? "s" : ""}
                      </h2>
                      <p className="text-xs text-muted-foreground mb-2">
                        Mentionné{subjects.length > 1 ? "s" : ""} dans ce fact-check, mais pas
                        auteur
                        {subjects.length > 1 ? "s" : ""} de la déclaration vérifiée.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {subjects.map((mention) => (
                          <Link
                            key={mention.politician.slug}
                            href={`/politiques/${mention.politician.slug}`}
                            className="inline-flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 hover:bg-muted transition-colors"
                          >
                            <span className="text-sm text-muted-foreground">
                              {mention.politician.fullName}
                            </span>
                            {mention.politician.currentParty && (
                              <Badge variant="outline" className="text-xs">
                                {mention.politician.currentParty.shortName}
                              </Badge>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

        {/* Source link */}
        <div className="flex justify-center">
          <a
            href={factCheck.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Lire l&apos;article original sur {factCheck.source} →
          </a>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground text-center mt-8">
          Le verdict ci-dessus provient de {factCheck.source}. Poligraph ne produit pas ses propres
          vérifications.
        </p>
      </div>
    </>
  );
}
