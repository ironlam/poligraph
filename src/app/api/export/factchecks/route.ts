import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCSV, formatDateForCSV, formatDateTimeForCSV, createCSVResponse } from "@/lib/csv";
import { FACTCHECK_RATING_LABELS, POLITICAL_POSITION_LABELS } from "@/config/labels";
import { FactCheckRating, Prisma } from "@/generated/prisma";
import { parsePagination } from "@/lib/api/pagination";
import { SITE_URL } from "@/config/site";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { getPublicFactCheckWhere, isAllowedFactCheckSource } from "@/lib/api/public-contract";

export const dynamic = "force-dynamic";

/**
 * @openapi
 * /api/export/factchecks:
 *   get:
 *     summary: Export CSV des fact-checks
 *     description: >
 *       Retourne les fact-checks publiés issus des sources autorisées au format CSV,
 *       dénormalisés par politique publié mentionné (une ligne par paire
 *       factcheck + politique). Un fact-check sans mention publique apparaît sur
 *       une seule ligne avec les colonnes politique vides.
 *     tags: [Exports]
 *     parameters:
 *       - in: query
 *         name: verdict
 *         schema:
 *           type: string
 *           enum: [TRUE, MOSTLY_TRUE, HALF_TRUE, MISLEADING, OUT_OF_CONTEXT, MOSTLY_FALSE, FALSE, UNVERIFIABLE]
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *         description: Source publique autorisée
 *       - in: query
 *         name: politicianSlug
 *         schema:
 *           type: string
 *         description: Slug d'un politique publié
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
 *         description: Filtre structuré vide, invalide ou non autorisé
 */
export const GET = withPublicRoute(async (request) => {
  const searchParams = request.nextUrl.searchParams;

  const verdict = searchParams.get("verdict");
  const source = searchParams.get("source");
  const politicianSlug = searchParams.get("politicianSlug");
  const { limit } = parsePagination(searchParams, {
    defaultLimit: 10000,
    maxLimit: 50000,
  });

  if (source !== null && !isAllowedFactCheckSource(source)) {
    return NextResponse.json({ error: "Source de fact-check non autorisée" }, { status: 400 });
  }
  if (verdict !== null && !Object.values(FactCheckRating).includes(verdict as FactCheckRating)) {
    return NextResponse.json({ error: "Verdict invalide" }, { status: 400 });
  }
  if (politicianSlug !== null && politicianSlug.length === 0) {
    return NextResponse.json({ error: "Politicien invalide" }, { status: 400 });
  }

  const where: Prisma.FactCheckWhereInput = {
    ...getPublicFactCheckWhere(source ?? undefined),
    ...(verdict !== null && { verdictRating: verdict as FactCheckRating }),
    ...(politicianSlug !== null && {
      mentions: {
        some: {
          politician: { slug: politicianSlug, publicationStatus: "PUBLISHED" },
        },
      },
    }),
  };

  const factchecks = await db.factCheck.findMany({
    where,
    include: {
      mentions: {
        where: { politician: { publicationStatus: "PUBLISHED" } },
        include: {
          politician: {
            select: {
              publicId: true,
              slug: true,
              fullName: true,
              currentParty: {
                select: {
                  publicId: true,
                  shortName: true,
                  name: true,
                  politicalPosition: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });

  // Denormalise: one row per (factcheck, public mention) pair. Factchecks with
  // no public politician mention still emit one row with empty politician columns.
  const data = factchecks.flatMap((fc) => {
    const base = {
      poligraphId: fc.publicId ?? "",
      slug: fc.slug ?? "",
      title: fc.title,
      claim: fc.claimText,
      claimant: fc.claimant ?? "",
      verdict: fc.verdict,
      verdictRating: FACTCHECK_RATING_LABELS[fc.verdictRating],
      verdictRatingCode: fc.verdictRating,
      sourcePublisher: fc.source,
      sourceUrl: fc.sourceUrl,
      publishedAt: formatDateForCSV(fc.publishedAt),
      claimDate: formatDateForCSV(fc.claimDate),
      languageCode: fc.languageCode ?? "",
      createdAt: formatDateTimeForCSV(fc.createdAt),
      updatedAt: formatDateTimeForCSV(fc.updatedAt),
      pageUrl: fc.slug ? `${SITE_URL}/factchecks/${fc.slug}` : `${SITE_URL}/factchecks`,
    };

    if (fc.mentions.length === 0) {
      return [
        {
          ...base,
          politicianPoligraphId: "",
          politicianSlug: "",
          politicianName: "",
          isClaimant: "",
          matchedName: "",
          partyPoligraphId: "",
          partyShort: "",
          partyLong: "",
          partyPosition: "",
        },
      ];
    }

    return fc.mentions.map((m) => ({
      ...base,
      politicianPoligraphId: m.politician.publicId ?? "",
      politicianSlug: m.politician.slug,
      politicianName: m.politician.fullName,
      isClaimant: m.isClaimant ? "oui" : "non",
      matchedName: m.matchedName ?? "",
      partyPoligraphId: m.politician.currentParty?.publicId ?? "",
      partyShort: m.politician.currentParty?.shortName ?? "",
      partyLong: m.politician.currentParty?.name ?? "",
      partyPosition: m.politician.currentParty?.politicalPosition
        ? POLITICAL_POSITION_LABELS[m.politician.currentParty.politicalPosition]
        : "",
    }));
  });

  const columns = [
    { key: "poligraphId" as const, header: "poligraphId" },
    { key: "slug" as const, header: "Slug" },
    { key: "title" as const, header: "Titre" },
    { key: "claim" as const, header: "Déclaration vérifiée" },
    { key: "claimant" as const, header: "Auteur de la déclaration" },
    { key: "verdict" as const, header: "Verdict (texte)" },
    { key: "verdictRating" as const, header: "Verdict (normalisé)" },
    { key: "verdictRatingCode" as const, header: "Verdict (code)" },
    { key: "sourcePublisher" as const, header: "Fact-checker" },
    { key: "sourceUrl" as const, header: "URL source" },
    { key: "publishedAt" as const, header: "Date de publication" },
    { key: "claimDate" as const, header: "Date de la déclaration" },
    { key: "languageCode" as const, header: "Langue" },
    { key: "politicianPoligraphId" as const, header: "poligraphId politique" },
    { key: "politicianSlug" as const, header: "Slug politique" },
    { key: "politicianName" as const, header: "Politique" },
    { key: "isClaimant" as const, header: "Auteur direct" },
    { key: "matchedName" as const, header: "Nom détecté" },
    { key: "partyPoligraphId" as const, header: "poligraphId parti" },
    { key: "partyShort" as const, header: "Parti (abrégé)" },
    { key: "partyLong" as const, header: "Parti" },
    { key: "partyPosition" as const, header: "Position politique" },
    { key: "pageUrl" as const, header: "Page Poligraph" },
    { key: "createdAt" as const, header: "Créé le" },
    { key: "updatedAt" as const, header: "Mis à jour le" },
  ];

  const csv = toCSV(data, columns);
  const filename = `factchecks-${new Date().toISOString().split("T")[0]}.csv`;

  return createCSVResponse(csv, filename);
});
