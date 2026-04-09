import { cache } from "react";
import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, stripMarkdown } from "@/lib/utils";
import { MarkdownText } from "@/components/ui/markdown";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_COLORS,
  AFFAIR_STATUS_DESCRIPTIONS,
  AFFAIR_STATUS_NEEDS_PRESUMPTION,
  AFFAIR_CATEGORY_LABELS,
  AFFAIR_SUPER_CATEGORY_LABELS,
  AFFAIR_SUPER_CATEGORY_COLORS,
  CATEGORY_TO_SUPER,
  INVOLVEMENT_LABELS,
  INVOLVEMENT_COLORS,
} from "@/config/labels";
import {
  getCertaintyLevel,
  CERTAINTY_LABELS,
  CERTAINTY_COLORS,
  CERTAINTY_DESCRIPTIONS,
} from "@/config/certainty";
import { LinkedAffairBanner } from "@/components/affairs/LinkedAffairBanner";
import { SentenceDetails } from "@/components/affairs/SentenceDetails";
import { StatusTooltip } from "@/components/affairs/StatusTooltip";
import { AffairTimeline } from "@/components/affairs/AffairTimeline";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { ArticleJsonLd } from "@/components/seo/JsonLd";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import type { AffairCategory, Involvement } from "@/types";
import type { Prisma } from "@/generated/prisma";
import { SITE_URL } from "@/config/site";
import { ShareBar } from "@/components/ui/ShareBar";
import { getAffairPartyDisplay } from "@/lib/affairs/party-display";

export const revalidate = 3600; // ISR: revalidate every hour

export async function generateStaticParams() {
  const affairs = await db.affair.findMany({
    where: { publicationStatus: "PUBLISHED" },
    select: { slug: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return affairs.map((a) => ({ slug: a.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

const affairInclude = {
  politician: {
    select: {
      id: true,
      fullName: true,
      slug: true,
      photoUrl: true,
      civility: true,
      currentParty: {
        select: {
          id: true,
          shortName: true,
          name: true,
          color: true,
          foundedDate: true,
        },
      },
    },
  },
  partyAtTime: {
    select: {
      id: true,
      slug: true,
      shortName: true,
      name: true,
      color: true,
      foundedDate: true,
    },
  },
  sources: {
    orderBy: { publishedAt: "desc" as const },
  },
  events: {
    orderBy: { date: "asc" as const },
  },
  linkedAffair: {
    select: {
      id: true,
      slug: true,
      title: true,
      involvement: true,
      politician: { select: { fullName: true, slug: true } },
    },
  },
  linkedBy: {
    select: {
      id: true,
      slug: true,
      title: true,
      involvement: true,
      politician: { select: { fullName: true, slug: true } },
    },
  },
};

async function findAffair(where: Prisma.AffairWhereInput) {
  const affair = await db.affair.findFirst({ where, include: affairInclude });
  if (!affair) return null;
  return { ...affair, fineAmount: affair.fineAmount ? Number(affair.fineAmount) : null };
}

type AffairResult = NonNullable<Awaited<ReturnType<typeof findAffair>>>;

const getAffairWithRedirect = cache(async function getAffairWithRedirect(
  slugOrId: string
): Promise<{ affair: AffairResult | null; redirect: string | null }> {
  // 1. Try current slug (canonical)
  let affair = await findAffair({ slug: slugOrId, publicationStatus: "PUBLISHED" });
  if (affair) return { affair, redirect: null };

  // 2. Try old slugs (301 redirect)
  affair = await findAffair({ oldSlugs: { has: slugOrId }, publicationStatus: "PUBLISHED" });
  if (affair) return { affair, redirect: affair.slug };

  // 3. Try by ID (CUID)
  affair = await findAffair({ id: slugOrId });
  if (affair) return { affair, redirect: affair.slug };

  return { affair: null, redirect: null };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { affair } = await getAffairWithRedirect(slug);

  if (!affair) {
    return { title: "Affaire non trouvée" };
  }

  return {
    title: `${affair.title} - ${affair.politician.fullName}`,
    description: stripMarkdown(affair.description).slice(0, 160),
    alternates: { canonical: `/affaires/${affair.slug}` },
    openGraph: {
      title: `${affair.title} - ${affair.politician.fullName}`,
      description: stripMarkdown(affair.description).slice(0, 160),
      type: "article",
    },
  };
}

export default async function AffairDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const { affair, redirect } = await getAffairWithRedirect(slug);

  if (redirect) {
    permanentRedirect(`/affaires/${redirect}`);
  }

  if (!affair) {
    notFound();
  }

  const superCategory = CATEGORY_TO_SUPER[affair.category as AffairCategory];
  const certainty = getCertaintyLevel(affair.status);
  const partyDisplay = getAffairPartyDisplay({
    factsDate: affair.factsDate,
    partyAtTime: affair.partyAtTime,
    currentParty: affair.politician.currentParty,
  });
  const linked = affair.linkedAffair || affair.linkedBy?.[0];

  return (
    <>
      <ArticleJsonLd
        headline={`${affair.title} - ${affair.politician.fullName}`}
        description={stripMarkdown(affair.description).slice(0, 300)}
        datePublished={affair.factsDate?.toISOString().split("T")[0]}
        dateModified={affair.updatedAt?.toISOString().split("T")[0]}
        url={`${SITE_URL}/affaires/${affair.slug}`}
        about={{
          name: affair.politician.fullName,
          url: `${SITE_URL}/politiques/${affair.politician.slug}`,
        }}
      />
      <ShareBar
        data={{
          title: affair.title,
          text: `Affaire judiciaire : ${affair.title} (${AFFAIR_STATUS_LABELS[affair.status]})`,
          url: `${SITE_URL}/affaires/${affair.slug}`,
        }}
      />
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-4xl">
        <Breadcrumb items={[{ label: "Affaires", href: "/affaires" }, { label: affair.title }]} />

        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge className={`${CERTAINTY_COLORS[certainty]} text-sm px-3 py-1`}>
              {CERTAINTY_LABELS[certainty]}
            </Badge>
            <Badge className={AFFAIR_SUPER_CATEGORY_COLORS[superCategory]}>
              {AFFAIR_SUPER_CATEGORY_LABELS[superCategory]}
            </Badge>
            <Badge variant="outline">{AFFAIR_CATEGORY_LABELS[affair.category]}</Badge>
            <StatusTooltip
              status={affair.status}
              label={AFFAIR_STATUS_LABELS[affair.status]}
              description={AFFAIR_STATUS_DESCRIPTIONS[affair.status]}
              colorClass={AFFAIR_STATUS_COLORS[affair.status]}
            />
            {affair.involvement !== "DIRECT" && (
              <Badge className={INVOLVEMENT_COLORS[affair.involvement as Involvement]}>
                {INVOLVEMENT_LABELS[affair.involvement as Involvement]}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">{CERTAINTY_DESCRIPTIONS[certainty]}</p>

          <h1 className="text-3xl font-display font-extrabold tracking-tight mb-4">
            {affair.title}
          </h1>

          {/* Politician card */}
          <div className="inline-flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <Link
              href={`/politiques/${affair.politician.slug}`}
              className="inline-flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <PoliticianAvatar
                fullName={affair.politician.fullName}
                photoUrl={affair.politician.photoUrl}
                size="md"
              />
              <div>
                <p className="font-semibold">{affair.politician.fullName}</p>
              </div>
            </Link>
            {partyDisplay.kind === "at-time" && (
              <p className="text-sm text-muted-foreground">
                {partyDisplay.party.slug ? (
                  <Link
                    href={`/affaires/parti/${partyDisplay.party.slug}`}
                    className="hover:underline hover:text-foreground"
                  >
                    {partyDisplay.party.name}
                  </Link>
                ) : (
                  partyDisplay.party.name
                )}
                {!partyDisplay.sameAsCurrent && <span className="text-xs"> (à l&apos;époque)</span>}
              </p>
            )}
            {partyDisplay.kind === "current" && (
              <p className="text-sm text-muted-foreground">{partyDisplay.party.name}</p>
            )}
            {partyDisplay.kind === "unknown" &&
              partyDisplay.reason === "pre-dates-current-party" && (
                <p
                  className="text-sm text-muted-foreground italic"
                  title={`Parti actuel (${partyDisplay.currentPartyName}) fondé en ${partyDisplay.currentPartyFoundedDate?.getFullYear()}, soit après la date des faits.`}
                >
                  Parti à l&apos;époque : non renseigné
                </p>
              )}
          </div>
        </div>

        {/* Presumption of innocence — only for accused, not victims */}
        {AFFAIR_STATUS_NEEDS_PRESUMPTION[affair.status] &&
          (affair.involvement === "DIRECT" || affair.involvement === "INDIRECT") && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Présomption d&apos;innocence :</strong> Cette affaire est en cours. La
                personne concernée est présumée innocente jusqu&apos;à condamnation définitive.
              </p>
            </div>
          )}

        {/* Linked affair cross-reference */}
        {linked && (
          <div className="mb-6">
            <LinkedAffairBanner linked={linked} />
          </div>
        )}

        {/* Description */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-lg font-semibold">Description</h2>
          </CardHeader>
          <CardContent>
            <MarkdownText className="text-muted-foreground">{affair.description}</MarkdownText>
          </CardContent>
        </Card>

        {/* Dates & Jurisdiction */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Dates */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Dates clés</h2>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                {affair.factsDate && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Date des faits</dt>
                    <dd className="font-medium">{formatDate(affair.factsDate)}</dd>
                  </div>
                )}
                {affair.startDate && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Révélation publique</dt>
                    <dd className="font-medium">{formatDate(affair.startDate)}</dd>
                  </div>
                )}
                {affair.verdictDate && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Date du verdict</dt>
                    <dd className="font-medium">{formatDate(affair.verdictDate)}</dd>
                  </div>
                )}
                {!affair.factsDate && !affair.startDate && !affair.verdictDate && (
                  <p className="text-muted-foreground text-sm">Dates non renseignées</p>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Jurisdiction */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Juridiction</h2>
            </CardHeader>
            <CardContent>
              {affair.court || affair.chamber || affair.caseNumber ? (
                <dl className="space-y-3">
                  {affair.court && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Tribunal</dt>
                      <dd className="font-medium text-right">{affair.court}</dd>
                    </div>
                  )}
                  {affair.chamber && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Chambre</dt>
                      <dd className="font-medium">{affair.chamber}</dd>
                    </div>
                  )}
                  {affair.caseNumber && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">N° dossier</dt>
                      <dd className="font-mono text-sm">{affair.caseNumber}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-muted-foreground text-sm">Informations non renseignées</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sentence */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-lg font-semibold">Peine</h2>
          </CardHeader>
          <CardContent>
            <SentenceDetails affair={affair} />
            {!affair.sentence &&
              !affair.prisonMonths &&
              !affair.fineAmount &&
              !affair.ineligibilityMonths &&
              !affair.communityService &&
              !affair.otherSentence && (
                <p className="text-muted-foreground text-sm">
                  {AFFAIR_STATUS_NEEDS_PRESUMPTION[affair.status]
                    ? "Affaire en cours - pas encore de verdict"
                    : "Peine non renseignée"}
                </p>
              )}
          </CardContent>
        </Card>

        {/* Timeline */}
        {affair.events.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <h2 className="text-lg font-semibold">Chronologie</h2>
            </CardHeader>
            <CardContent>
              <AffairTimeline events={affair.events} />
            </CardContent>
          </Card>
        )}

        {/* Sources */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-lg font-semibold">Sources ({affair.sources.length})</h2>
          </CardHeader>
          <CardContent>
            {affair.sources.length > 0 ? (
              <ul className="space-y-3">
                {affair.sources.map((source) => (
                  <li key={source.id} className="border-b last:border-b-0 pb-3 last:pb-0">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    >
                      {source.title || source.url}
                    </a>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      {source.publisher && <span>{source.publisher}</span>}
                      {source.publishedAt && (
                        <>
                          {source.publisher && <span>•</span>}
                          <span>
                            {source.publisher?.toLowerCase() === "wikidata"
                              ? `mis à jour le ${formatDate(source.publishedAt)}`
                              : formatDate(source.publishedAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Aucune source documentée</p>
            )}
          </CardContent>
        </Card>

        {/* Verification info */}
        {affair.verifiedAt && (
          <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="font-medium">Information vérifiée</span>
              </div>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                Vérifié le {formatDate(affair.verifiedAt)}
                {affair.verifiedBy && ` par Poligraph Moderation`}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href={`/politiques/${affair.politician.slug}`}
            className="text-sm text-primary hover:underline"
          >
            ← Voir la fiche de {affair.politician.fullName}
          </Link>
          <Link href="/affaires" className="text-sm text-primary hover:underline">
            ← Retour à la liste des affaires
          </Link>
          {affair.partyAtTime?.slug && (
            <Link
              href={`/affaires/parti/${affair.partyAtTime.slug}`}
              className="text-sm text-primary hover:underline"
            >
              ← Affaires {affair.partyAtTime.shortName}
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
