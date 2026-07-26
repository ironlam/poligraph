import { db } from "@/lib/db";
import {
  toCSV,
  formatDateForCSV,
  formatDateTimeForCSV,
  stripMarkdownForCSV,
  createCSVResponse,
} from "@/lib/csv";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_CATEGORY_LABELS,
  AFFAIR_SEVERITY_LABELS,
  INVOLVEMENT_LABELS,
  POLITICAL_POSITION_LABELS,
} from "@/config/labels";
import { parsePagination } from "@/lib/api/pagination";
import type { AffairStatus, AffairCategory } from "@/types";
import { SITE_URL } from "@/config/site";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { resolveDecisionField } from "@/lib/affairs/decision-fields";

export const dynamic = "force-dynamic";

/**
 * @openapi
 * /api/export/affaires:
 *   get:
 *     summary: Export CSV des affaires judiciaires
 *     description: >
 *       Retourne toutes les affaires judiciaires publiées au format CSV,
 *       prêtes à l'emploi pour l'analyse statistique (R, Python, Excel).
 *       Chaque ligne inclut le poligraphId (identifiant stable pour citation),
 *       les métadonnées du politique et du parti (actuel + au moment des
 *       faits), la classification Sapin II (gravité, catégorie, implication),
 *       le détail de la peine (prison, amende, inéligibilité), et la
 *       description complète nettoyée du markdown.
 *     tags: [Exports]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ENQUETE_PRELIMINAIRE, INSTRUCTION, MISE_EN_EXAMEN, RENVOI_TRIBUNAL, PROCES_EN_COURS, CONDAMNATION_PREMIERE_INSTANCE, APPEL_EN_COURS, POURVOI_EN_CASSATION, CONDAMNATION_DEFINITIVE, RELAXE, ACQUITTEMENT, NON_LIEU, PRESCRIPTION, CLASSEMENT_SANS_SUITE]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: politicianId
 *         schema:
 *           type: string
 *         description: Filtrer par ID interne du politique
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10000
 *           minimum: 1
 *           maximum: 50000
 *     responses:
 *       200:
 *         description: Fichier CSV UTF-8 avec BOM
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
export const GET = withPublicRoute(async (request) => {
  const searchParams = request.nextUrl.searchParams;

  const status = searchParams.get("status") as AffairStatus | null;
  const category = searchParams.get("category") as AffairCategory | null;
  const politicianId = searchParams.get("politicianId");
  const { limit } = parsePagination(searchParams, {
    defaultLimit: 10000,
    maxLimit: 50000,
  });

  const where: Record<string, unknown> = {
    publicationStatus: "PUBLISHED",
  };
  if (status) where.status = status;
  if (category) where.category = category;
  if (politicianId) where.politicianId = politicianId;

  const affairs = await db.affair.findMany({
    where,
    include: {
      politician: {
        select: {
          publicId: true,
          slug: true,
          fullName: true,
          currentParty: {
            select: {
              shortName: true,
              name: true,
              politicalPosition: true,
            },
          },
        },
      },
      partyAtTime: {
        select: {
          shortName: true,
          name: true,
        },
      },
      sources: {
        select: { url: true, title: true },
      },
      _count: {
        select: { sources: true },
      },
      // Double lecture (#536) : l'export sert la valeur historique de l'affaire, et
      // ne se rabat sur la décision que si l'affaire n'en porte pas et qu'une seule
      // décision est liée.
      courtDecisions: {
        select: { courtDecision: { select: { ecli: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const data = affairs.map((a) => ({
    poligraphId: a.publicId ?? "",
    affairSlug: a.slug,
    title: a.title,
    politicianPoligraphId: a.politician.publicId ?? "",
    politicianSlug: a.politician.slug,
    politicianName: a.politician.fullName,
    partyCurrentShort: a.politician.currentParty?.shortName ?? "",
    partyCurrentLong: a.politician.currentParty?.name ?? "",
    partyCurrentPosition: a.politician.currentParty?.politicalPosition
      ? POLITICAL_POSITION_LABELS[a.politician.currentParty.politicalPosition]
      : "",
    partyAtTimeShort: a.partyAtTime?.shortName ?? "",
    partyAtTimeLong: a.partyAtTime?.name ?? "",
    status: AFFAIR_STATUS_LABELS[a.status],
    statusCode: a.status,
    category: AFFAIR_CATEGORY_LABELS[a.category],
    categoryCode: a.category,
    severity: AFFAIR_SEVERITY_LABELS[a.severity],
    severityCode: a.severity,
    involvement: INVOLVEMENT_LABELS[a.involvement],
    involvementCode: a.involvement,
    isRelatedToMandate: a.isRelatedToMandate ? "oui" : "non",
    factsDate: formatDateForCSV(a.factsDate),
    startDate: formatDateForCSV(a.startDate),
    verdictDate: formatDateForCSV(a.verdictDate),
    fineAmount: a.fineAmount !== null ? Number(a.fineAmount) : "",
    prisonMonths: a.prisonMonths ?? "",
    prisonSuspended: a.prisonSuspended === null ? "" : a.prisonSuspended ? "oui" : "non",
    ineligibilityMonths: a.ineligibilityMonths ?? "",
    communityService: a.communityService ?? "",
    appeal: a.appeal ? "oui" : "non",
    sentence: a.sentence ?? "",
    otherSentence: a.otherSentence ?? "",
    court: a.court ?? "",
    ecli: resolveDecisionField(a.courtDecisions.map((l) => l.courtDecision.ecli)).value ?? "",
    descriptionPlain: stripMarkdownForCSV(a.description),
    sourceCount: a._count.sources,
    sourceUrl: a.sources[0]?.url ?? "",
    sourceTitle: a.sources[0]?.title ?? "",
    pageUrl: `${SITE_URL}/affaires/${a.slug}`,
    createdAt: formatDateTimeForCSV(a.createdAt),
    updatedAt: formatDateTimeForCSV(a.updatedAt),
  }));

  const columns = [
    { key: "poligraphId" as const, header: "poligraphId" },
    { key: "affairSlug" as const, header: "Slug affaire" },
    { key: "title" as const, header: "Titre" },
    { key: "politicianPoligraphId" as const, header: "poligraphId politique" },
    { key: "politicianSlug" as const, header: "Slug politique" },
    { key: "politicianName" as const, header: "Politique" },
    { key: "partyCurrentShort" as const, header: "Parti actuel (abrégé)" },
    { key: "partyCurrentLong" as const, header: "Parti actuel" },
    { key: "partyCurrentPosition" as const, header: "Position politique" },
    { key: "partyAtTimeShort" as const, header: "Parti au moment (abrégé)" },
    { key: "partyAtTimeLong" as const, header: "Parti au moment" },
    { key: "status" as const, header: "Statut" },
    { key: "statusCode" as const, header: "Statut (code)" },
    { key: "category" as const, header: "Catégorie" },
    { key: "categoryCode" as const, header: "Catégorie (code)" },
    { key: "severity" as const, header: "Gravité" },
    { key: "severityCode" as const, header: "Gravité (code)" },
    { key: "involvement" as const, header: "Implication" },
    { key: "involvementCode" as const, header: "Implication (code)" },
    { key: "isRelatedToMandate" as const, header: "Liée au mandat" },
    { key: "factsDate" as const, header: "Date des faits" },
    { key: "startDate" as const, header: "Date de début" },
    { key: "verdictDate" as const, header: "Date du verdict" },
    { key: "fineAmount" as const, header: "Amende (EUR)" },
    { key: "prisonMonths" as const, header: "Prison (mois)" },
    { key: "prisonSuspended" as const, header: "Prison avec sursis" },
    { key: "ineligibilityMonths" as const, header: "Inéligibilité (mois)" },
    { key: "communityService" as const, header: "TIG (heures)" },
    { key: "appeal" as const, header: "Appel" },
    { key: "sentence" as const, header: "Peine (texte libre)" },
    { key: "otherSentence" as const, header: "Autres peines" },
    { key: "court" as const, header: "Juridiction" },
    { key: "ecli" as const, header: "ECLI" },
    { key: "descriptionPlain" as const, header: "Description" },
    { key: "sourceCount" as const, header: "Nombre de sources" },
    { key: "sourceUrl" as const, header: "Première source (URL)" },
    { key: "sourceTitle" as const, header: "Première source (titre)" },
    { key: "pageUrl" as const, header: "Page Poligraph" },
    { key: "createdAt" as const, header: "Créée le" },
    { key: "updatedAt" as const, header: "Mise à jour le" },
  ];

  const csv = toCSV(data, columns);
  const filename = `affaires-${new Date().toISOString().split("T")[0]}.csv`;

  return createCSVResponse(csv, filename);
});
