import { NextResponse } from "next/server";
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
import { AffairStatus, AffairCategory, Prisma } from "@/generated/prisma";
import { parsePagination } from "@/lib/api/pagination";
import { SITE_URL } from "@/config/site";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { resolveDecisionField } from "@/lib/affairs/decision-fields";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { AFFAIR_EXPORT_COLUMNS } from "./columns";

export const dynamic = "force-dynamic";

/**
 * @openapi
 * /api/export/affaires:
 *   get:
 *     summary: Export CSV des affaires judiciaires
 *     description: >
 *       Retourne les affaires judiciaires publiées de personnalités publiées au format CSV,
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
 *           enum: [ENQUETE_PRELIMINAIRE, INSTRUCTION, INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN, MISE_EN_EXAMEN, RENVOI_TRIBUNAL, PROCES_EN_COURS, CONDAMNATION_PREMIERE_INSTANCE, APPEL_EN_COURS, POURVOI_EN_CASSATION, CONDAMNATION_DEFINITIVE, RELAXE, ACQUITTEMENT, NON_LIEU, PRESCRIPTION, CLASSEMENT_SANS_SUITE]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: politicianId
 *         schema:
 *           type: string
 *         description: Filtrer par ID interne d'un politique publié
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
 *       400:
 *         description: Filtre structuré vide ou invalide
 */
export const GET = withPublicRoute(async (request) => {
  const searchParams = request.nextUrl.searchParams;

  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const politicianId = searchParams.get("politicianId");
  const { limit } = parsePagination(searchParams, {
    defaultLimit: 10000,
    maxLimit: 50000,
  });

  if (status !== null && !Object.values(AffairStatus).includes(status as AffairStatus)) {
    return NextResponse.json({ error: "Statut judiciaire invalide" }, { status: 400 });
  }
  if (category !== null && !Object.values(AffairCategory).includes(category as AffairCategory)) {
    return NextResponse.json({ error: "Catégorie d'affaire invalide" }, { status: 400 });
  }
  if (politicianId !== null && politicianId.length === 0) {
    return NextResponse.json({ error: "Politicien invalide" }, { status: 400 });
  }

  const where: Prisma.AffairWhereInput = {
    ...getPublishedAffairWhere(),
    ...(status !== null && { status: status as AffairStatus }),
    ...(category !== null && { category: category as AffairCategory }),
    ...(politicianId !== null && { politicianId }),
    politician: PUBLIC_POLITICIAN_WHERE,
  };

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
          _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
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
    partyAtTimeShort: a.partyAtTime?._count.politicians ? (a.partyAtTime.shortName ?? "") : "",
    partyAtTimeLong: a.partyAtTime?._count.politicians ? (a.partyAtTime.name ?? "") : "",
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
    // `?? ""` and not `|| ""`: 0 means "entirely suspended" and must not export as empty.
    prisonFirmMonths: a.prisonFirmMonths ?? "",
    ineligibilityMonths: a.ineligibilityMonths ?? "",
    ineligibilityFirmMonths: a.ineligibilityFirmMonths ?? "",
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

  const columns = AFFAIR_EXPORT_COLUMNS;

  const csv = toCSV(data, columns);
  const filename = `affaires-${new Date().toISOString().split("T")[0]}.csv`;

  return createCSVResponse(csv, filename);
});
