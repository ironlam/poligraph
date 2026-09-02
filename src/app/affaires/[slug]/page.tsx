import { Metadata } from "next";
import { Suspense } from "react";
import { cacheTag, cacheLife } from "next/cache";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
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
  isAccusedInvolvement,
} from "@/config/certainty";
import {
  AffairStatusNotice,
  getAffairNoticeVariant,
} from "@/components/affairs/AffairStatusNotice";
import { LinkedAffairBanner } from "@/components/affairs/LinkedAffairBanner";
import { SentenceDetails } from "@/components/affairs/SentenceDetails";
import { StatusTooltip } from "@/components/affairs/StatusTooltip";
import { AffairTimeline } from "@/components/affairs/AffairTimeline";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { AffairStickyBar } from "@/components/affairs/AffairStickyBar";
import { AffairContextBand } from "@/components/affairs/AffairContextBand";
import { AffairContinue } from "@/components/affairs/AffairContinue";
import { AffairNeighborBar } from "@/components/affairs/AffairNeighborBar";
import { pickDisplayMandate, formatMandateMeta } from "@/lib/affairs/context-meta";
import type { AffairCategory, Involvement } from "@/types";
import type { Prisma } from "@/generated/prisma";
import { SITE_URL } from "@/config/site";
import { getAffairPartyDisplay } from "@/lib/affairs/party-display";
import { buildPublicAffairLookupWheres, pickPublicLinkedAffair } from "@/lib/affairs/affair-lookup";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import { resolveDecisionFields } from "@/lib/affairs/decision-fields";
import {
  buildCourtDecisionDisplay,
  sortCourtDecisionsForDisplay,
} from "@/lib/affairs/court-decision-display";
import { SlappBadge } from "@/components/slapp/SlappBadge";
import { CriteriaList } from "@/components/slapp/CriteriaList";
import type { SlappCriteriaPayload } from "@/config/slapp";

export const revalidate = 86400; // ISR: 24h backstop; real changes propagate on-demand via revalidateTag

export async function generateStaticParams() {
  const affairs = await db.affair.findMany({
    where: {
      ...getPublishedAffairWhere(),
      politician: PUBLIC_POLITICIAN_WHERE,
    },
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
          slug: true,
          shortName: true,
          name: true,
          color: true,
          foundedDate: true,
        },
      },
      mandates: {
        where: { isCurrent: true },
        select: { type: true, constituency: true, startDate: true },
        orderBy: { startDate: "asc" as const },
      },
      _count: { select: { affairs: { where: getPublishedAffairWhere() } } },
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
      _count: {
        select: {
          politicians: { where: PUBLIC_POLITICIAN_WHERE },
          affairsAtTime: {
            where: {
              ...getPublishedAffairWhere(),
              politician: PUBLIC_POLITICIAN_WHERE,
            },
          },
        },
      },
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
      publicationStatus: true,
      politician: { select: { fullName: true, slug: true } },
    },
  },
  // Double lecture (#536) : la fiche sert la valeur historique de l'affaire, et ne
  // se rabat sur la décision que si l'affaire n'en porte pas et qu'une seule est
  // liée. Plusieurs décisions liées n'affichent aucune valeur plate.
  courtDecisions: {
    select: {
      courtDecision: {
        select: {
          id: true,
          ecli: true,
          pourvoiNumber: true,
          chamber: true,
          decisionDate: true,
          court: true,
          solution: true,
          sourceUrl: true,
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  linkedBy: {
    where: { publicationStatus: "PUBLISHED" as const },
    select: {
      id: true,
      slug: true,
      title: true,
      involvement: true,
      publicationStatus: true,
      politician: { select: { fullName: true, slug: true } },
    },
  },
};

async function findAffair(where: Prisma.AffairWhereInput) {
  const affair = await db.affair.findFirst({
    where: {
      ...where,
      ...getPublishedAffairWhere(),
      politician: PUBLIC_POLITICIAN_WHERE,
    },
    include: affairInclude,
  });
  if (!affair) return null;
  const partyAtTime = affair.partyAtTime;
  const publicPartyAtTime =
    partyAtTime && partyAtTime._count.politicians > 0
      ? {
          ...partyAtTime,
          _count: { affairsAtTime: partyAtTime._count.affairsAtTime },
        }
      : null;
  return {
    ...affair,
    partyAtTime: publicPartyAtTime,
    fineAmount: affair.fineAmount ? Number(affair.fineAmount) : null,
  };
}

type AffairResult = NonNullable<Awaited<ReturnType<typeof findAffair>>>;

async function getAffairWithRedirect(
  slugOrId: string
): Promise<{ affair: AffairResult | null; redirect: string | null }> {
  "use cache";
  cacheTag("affairs");
  cacheLife("synced");

  const [bySlug, byOldSlug, byId] = buildPublicAffairLookupWheres(slugOrId);

  // 1. Slug canonique
  let affair = await findAffair(bySlug);
  if (affair) return { affair, redirect: null };

  // 2. Ancien slug (redirection 301)
  affair = await findAffair(byOldSlug);
  if (affair) return { affair, redirect: affair.slug };

  // 3. Id (CUID) — filtré PUBLISHED comme les autres voies
  affair = await findAffair(byId);
  if (affair) return { affair, redirect: affair.slug };

  return { affair: null, redirect: null };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { affair } = await getAffairWithRedirect(slug);

  if (!affair) {
    return missingEntityMetadata("Affaire non trouvée");
  }

  // Off-site there is often only a name and an affair title left: append the
  // name only when the person is accused (I7).
  const title = isAccusedInvolvement(affair.involvement)
    ? `${affair.title} - ${affair.politician.fullName}`
    : affair.title;
  const description = stripMarkdown(affair.description).slice(0, 160);

  return {
    title,
    description,
    alternates: { canonical: `/affaires/${affair.slug}` },
    openGraph: { title, description, type: "article" },
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

  // Identifiants lus depuis les décisions rattachées (#545). `court` et
  // `verdictDate` restent lus depuis l'affaire : ils sont éditoriaux.
  const linkedDecisions = sortCourtDecisionsForDisplay(
    affair.courtDecisions.map((link) => link.courtDecision)
  );
  const resolvedDecisionFields = resolveDecisionFields(linkedDecisions);

  const superCategory = CATEGORY_TO_SUPER[affair.category as AffairCategory];
  const certainty = getCertaintyLevel(affair.status);
  // The certainty/status describes the outcome for the person prosecuted. When
  // the tracked politician is a plaintiff, victim or merely mentioned, a
  // charging badge ("Condamnation définitive") would misrepresent them (#383).
  const accused = isAccusedInvolvement(affair.involvement);
  const noticeVariant = getAffairNoticeVariant(affair.status, affair.involvement);
  const partyDisplay = getAffairPartyDisplay({
    factsDate: affair.factsDate,
    partyAtTime: affair.partyAtTime,
    currentParty: affair.politician.currentParty,
  });
  const linked = pickPublicLinkedAffair(affair.linkedAffair, affair.linkedBy);

  // Context band: who the tracked politician is, plus lateral journeys.
  const displayMandate = pickDisplayMandate(affair.politician.mandates);
  const politicianMeta = formatMandateMeta(displayMandate, affair.politician.civility);
  const affairCount = affair.politician._count.affairs;

  const contextParty =
    partyDisplay.kind === "at-time"
      ? {
          name: partyDisplay.party.name,
          shortName: partyDisplay.party.shortName,
          color: partyDisplay.party.color ?? null,
          slug: partyDisplay.party.slug ?? null,
          atTime: !partyDisplay.sameAsCurrent,
        }
      : partyDisplay.kind === "current"
        ? {
            name: partyDisplay.party.name,
            shortName: partyDisplay.party.shortName,
            color: partyDisplay.party.color ?? null,
            slug: partyDisplay.party.slug ?? null,
            atTime: false,
          }
        : null;

  // Only the historical party carries a count we fetched; the current-party
  // fallback shows the tile without an unverified number.
  const partyAffairCount =
    partyDisplay.kind === "at-time" ? (affair.partyAtTime?._count?.affairsAtTime ?? null) : null;

  const superCategoryLabel = AFFAIR_SUPER_CATEGORY_LABELS[superCategory];
  const superCategoryHref = `/affaires?supercat=${superCategory}`;

  const breadcrumbItems = [
    { name: "Accueil", url: `${SITE_URL}/` },
    { name: "Affaires", url: `${SITE_URL}/affaires` },
    { name: superCategoryLabel, url: `${SITE_URL}${superCategoryHref}` },
    { name: affair.title, url: `${SITE_URL}/affaires/${affair.slug}` },
  ];

  // For a non-accused person the empty Peine and Juridiction cards are hidden:
  // two cards reserved for a trial that does not target them contradicted the
  // role. When populated they stay (a third party's sentence).
  const hasSentence = Boolean(
    affair.sentence ||
    affair.prisonMonths ||
    affair.fineAmount ||
    affair.ineligibilityMonths ||
    affair.communityService ||
    affair.otherSentence
  );
  const hasJuridiction = Boolean(
    affair.court ||
    resolvedDecisionFields.chamber.value ||
    affair.caseNumber ||
    linkedDecisions.length > 0
  );
  const showPeine = accused || hasSentence;
  const showJuridiction = accused || hasJuridiction;

  return (
    <>
      <ArticleJsonLd
        headline={accused ? `${affair.title} - ${affair.politician.fullName}` : affair.title}
        description={stripMarkdown(affair.description).slice(0, 300)}
        datePublished={affair.factsDate?.toISOString()}
        dateModified={affair.updatedAt?.toISOString()}
        url={`${SITE_URL}/affaires/${affair.slug}`}
        image={`${SITE_URL}/affaires/${affair.slug}/opengraph-image`}
        about={{
          name: affair.politician.fullName,
          url: `${SITE_URL}/politiques/${affair.politician.slug}`,
        }}
      />
      <BreadcrumbJsonLd items={breadcrumbItems} />
      <AffairStickyBar
        title={affair.title}
        shareUrl={`${SITE_URL}/affaires/${affair.slug}`}
        shareText={`Affaire : ${affair.title} (${AFFAIR_STATUS_LABELS[affair.status]})`}
        superCategoryLabel={superCategoryLabel}
        superCategoryHref={superCategoryHref}
      />
      <div className="container mx-auto max-w-4xl px-4 pt-4 pb-24 sm:pb-8">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {accused ? (
              <>
                <Badge className={`${CERTAINTY_COLORS[certainty]} px-3 py-1 text-sm`}>
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
              </>
            ) : (
              // Not accused: no charging certainty pill and no offence category
              // next to the person (I1, I2). The status stays, neutral, to situate
              // the procedure; the role and the "Faits qualifiés" line below
              // re-attach everything to the affair.
              <StatusTooltip
                status={affair.status}
                label={AFFAIR_STATUS_LABELS[affair.status]}
                description={AFFAIR_STATUS_DESCRIPTIONS[affair.status]}
                colorClass="bg-muted text-muted-foreground border-transparent"
              />
            )}
            {affair.isSlapp && affair.slappCriteria ? (
              <SlappBadge
                qualificationRule={
                  (affair.slappCriteria as unknown as SlappCriteriaPayload).qualificationRule
                }
                className="ml-2"
              />
            ) : null}
          </div>
          {!accused && (
            <p className="mb-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Faits qualifiés :</span>{" "}
              {AFFAIR_SUPER_CATEGORY_LABELS[superCategory]} ·{" "}
              {AFFAIR_CATEGORY_LABELS[affair.category]}
            </p>
          )}
          {accused && (
            <p className="text-sm text-muted-foreground mb-4">
              {CERTAINTY_DESCRIPTIONS[certainty]}
            </p>
          )}

          <h1 className="text-3xl font-display font-extrabold tracking-tight mb-4">
            {affair.title}
          </h1>

          <AffairContextBand
            politicianSlug={affair.politician.slug}
            fullName={affair.politician.fullName}
            photoUrl={affair.politician.photoUrl}
            meta={politicianMeta}
            affairCount={affairCount}
            party={contextParty}
            involvement={affair.involvement}
            subjectLabel={affair.subjectLabel}
            subjectKind={affair.subjectKind}
            subjectNote={affair.subjectNote}
            involvementNote={affair.involvementNote}
          />
        </div>

        {/* Legal caution notice (RGPD art. 10, I5). For a non-accused person
            outside a conviction the caution is already carried by the band's role
            étage, so we do not repeat it (not_accused). We keep the notice for the
            accused and for the third party of an affair concluded by a conviction
            (third_party), which states the sentence is someone else's. */}
        {noticeVariant && noticeVariant !== "not_accused" && (
          <AffairStatusNotice
            status={affair.status}
            involvement={affair.involvement}
            className="mb-6"
          />
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

        {affair.isSlapp && affair.slappCriteria ? (
          <section className="my-8">
            <h2 className="text-lg font-semibold mb-4">Critères de qualification SLAPP</h2>
            <CriteriaList criteria={affair.slappCriteria as unknown as SlappCriteriaPayload} />
            <p className="mt-4 text-xs text-muted-foreground">
              Critères évalués selon la méthodologie publiée sur la page{" "}
              <Link href="/procedures-baillons" className="text-primary hover:underline">
                procédures-bâillons
              </Link>
              .
            </p>
          </section>
        ) : null}

        {/* Dates & Jurisdiction */}
        <div className={showJuridiction ? "mb-6 grid gap-6 md:grid-cols-2" : "mb-6"}>
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

          {/* Jurisdiction — hidden for a non-accused person with no data (I8) */}
          {showJuridiction && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">
                  {accused ? "Juridiction" : "Juridiction (procédure de l'affaire)"}
                </h2>
              </CardHeader>
              <CardContent>
                {affair.court || resolvedDecisionFields.chamber.value || affair.caseNumber ? (
                  <dl className="space-y-3">
                    {affair.court && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Tribunal</dt>
                        <dd className="font-medium text-right">{affair.court}</dd>
                      </div>
                    )}
                    {resolvedDecisionFields.chamber.value && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Chambre</dt>
                        <dd className="font-medium">{resolvedDecisionFields.chamber.value}</dd>
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

                {linkedDecisions.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <h3 className="mb-2 text-sm font-medium">
                      Décision{linkedDecisions.length > 1 ? "s" : ""} de justice rattachée
                      {linkedDecisions.length > 1 ? "s" : ""}
                    </h3>
                    <ul className="space-y-2 text-sm">
                      {linkedDecisions.map((decision) => {
                        const display = buildCourtDecisionDisplay(decision, formatDate);
                        return (
                          <li key={decision.id} className="text-muted-foreground">
                            <span>{display.parts.join(" — ")}</span>
                            {display.link && (
                              <>
                                {" "}
                                <a
                                  href={display.link.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline underline-offset-4 hover:text-foreground"
                                >
                                  {display.link.label}
                                </a>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {resolvedDecisionFields.hasMultipleDecisions && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Cette affaire est rattachée à plusieurs décisions. Les références sont
                        listées séparément plutôt que résumées en une seule valeur.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sentence — hidden for a non-accused person with no data (I8); otherwise
            the header reminds that the sentence does not target this person. */}
        {showPeine && (
          <Card className="mb-6">
            <CardHeader>
              <h2 className="text-lg font-semibold">
                {accused
                  ? "Peine"
                  : "Peine prononcée dans l'affaire (ne concerne pas cette personne)"}
              </h2>
            </CardHeader>
            <CardContent>
              <SentenceDetails affair={affair} involvement={affair.involvement} />
              {accused &&
                !affair.sentence &&
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
        )}

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

        {/* Poursuivre — lateral journeys replace the former stacked "← …" footer */}
        <AffairContinue
          politicianSlug={affair.politician.slug}
          politicianName={affair.politician.fullName}
          affairCount={affairCount}
          party={
            contextParty
              ? {
                  name: contextParty.name,
                  shortName: contextParty.shortName,
                  slug: contextParty.slug,
                }
              : null
          }
          partyAffairCount={partyAffairCount}
        />
        <Suspense fallback={null}>
          <AffairNeighborBar slug={affair.slug} politicianSlug={affair.politician.slug} />
        </Suspense>
      </div>
    </>
  );
}
