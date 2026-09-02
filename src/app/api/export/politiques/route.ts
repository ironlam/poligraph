import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCSV, formatDateForCSV, formatDateTimeForCSV, createCSVResponse } from "@/lib/csv";
import { MANDATE_TYPE_LABELS, POLITICAL_POSITION_LABELS } from "@/config/labels";
import { MandateType as MandateTypeEnum } from "@/generated/prisma";
import { pickEnumValue } from "@/lib/data/enum-guards";
import { SITE_URL } from "@/config/site";
import { withPublicRoute } from "@/lib/api/with-public-route";
import {
  getMandateStartDatePublicationStatus,
  getPublicFactCheckWhere,
} from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";

export const dynamic = "force-dynamic";

/**
 * @openapi
 * /api/export/politiques:
 *   get:
 *     summary: Export CSV des politiques
 *     description: >
 *       Retourne les politiques publiés au format CSV, avec leur poligraphId
 *       (identifiant stable pour citation), parti actuel, mandat en cours,
 *       département, score de prominence et Q-ID Wikidata pour croisement
 *       avec d'autres jeux de données.
 *     tags: [Exports]
 *     parameters:
 *       - in: query
 *         name: partyId
 *         schema:
 *           type: string
 *       - in: query
 *         name: mandateType
 *         schema:
 *           type: string
 *       - in: query
 *         name: hasAffairs
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *           default: true
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

  const partyId = searchParams.get("partyId");
  const mandateTypeParam = searchParams.get("mandateType");
  const mandateType = pickEnumValue(mandateTypeParam, MandateTypeEnum);
  if (mandateTypeParam && !mandateType) {
    return NextResponse.json({ error: "Type de mandat invalide" }, { status: 400 });
  }
  const hasAffairs = searchParams.get("hasAffairs") === "true";
  const activeOnly = searchParams.get("activeOnly") !== "false";

  const where: Record<string, unknown> = {
    publicationStatus: "PUBLISHED",
  };

  if (partyId) {
    where.currentPartyId = partyId;
  }

  if (mandateType) {
    where.mandates = {
      some: {
        type: mandateType,
        ...(activeOnly && { isCurrent: true }),
      },
    };
  } else if (activeOnly) {
    where.mandates = {
      some: { isCurrent: true },
    };
  }

  if (hasAffairs) {
    where.affairs = { some: getPublishedAffairWhere() };
  }

  const politicians = await db.politician.findMany({
    where,
    include: {
      currentParty: {
        select: {
          publicId: true,
          slug: true,
          shortName: true,
          name: true,
          politicalPosition: true,
        },
      },
      mandates: {
        where: activeOnly ? { isCurrent: true } : undefined,
        orderBy: { startDate: "desc" },
        take: 1,
        select: {
          type: true,
          title: true,
          constituency: true,
          departmentCode: true,
          startDate: true,
          endDate: true,
        },
      },
      externalIds: {
        where: { source: "WIKIDATA" },
        select: { externalId: true },
        take: 1,
      },
      _count: {
        select: {
          affairs: { where: getPublishedAffairWhere() },
          factCheckMentions: { where: { factCheck: getPublicFactCheckWhere() } },
        },
      },
    },
    orderBy: { lastName: "asc" },
  });

  const data = politicians.map((p) => {
    const mandate = p.mandates[0];
    const gender = p.civility === "M." ? "M" : p.civility === "Mme" ? "F" : "";
    return {
      poligraphId: p.publicId ?? "",
      slug: p.slug,
      civility: p.civility ?? "",
      firstName: p.firstName,
      lastName: p.lastName,
      fullName: p.fullName,
      gender,
      birthDate: formatDateForCSV(p.birthDate),
      birthPlace: p.birthPlace ?? "",
      deathDate: formatDateForCSV(p.deathDate),
      partyPoligraphId: p.currentParty?.publicId ?? "",
      partyShort: p.currentParty?.shortName ?? "",
      partyLong: p.currentParty?.name ?? "",
      partyPosition: p.currentParty?.politicalPosition
        ? POLITICAL_POSITION_LABELS[p.currentParty.politicalPosition]
        : "",
      currentMandateType: mandate ? MANDATE_TYPE_LABELS[mandate.type] : "",
      currentMandateTitle: mandate?.title ?? "",
      currentMandateStart: formatDateForCSV(mandate?.startDate),
      currentMandateStartPublicationStatus: mandate
        ? getMandateStartDatePublicationStatus(mandate.type)
        : "",
      currentMandateEnd: formatDateForCSV(mandate?.endDate),
      constituency: mandate?.constituency ?? "",
      departmentCode: mandate?.departmentCode ?? "",
      affairsCount: p._count.affairs,
      factcheckMentionsCount: p._count.factCheckMentions,
      prominenceScore: p.prominenceScore,
      wikidataId: p.externalIds[0]?.externalId ?? "",
      photoUrl: p.blobPhotoUrl ?? p.photoUrl ?? "",
      profileUrl: `${SITE_URL}/politiques/${p.slug}`,
      createdAt: formatDateTimeForCSV(p.createdAt),
      updatedAt: formatDateTimeForCSV(p.updatedAt),
    };
  });

  const columns = [
    { key: "poligraphId" as const, header: "poligraphId" },
    { key: "slug" as const, header: "Slug" },
    { key: "civility" as const, header: "Civilité" },
    { key: "firstName" as const, header: "Prénom" },
    { key: "lastName" as const, header: "Nom" },
    { key: "fullName" as const, header: "Nom complet" },
    { key: "gender" as const, header: "Genre" },
    { key: "birthDate" as const, header: "Date de naissance" },
    { key: "birthPlace" as const, header: "Lieu de naissance" },
    { key: "deathDate" as const, header: "Date de décès" },
    { key: "partyPoligraphId" as const, header: "poligraphId parti" },
    { key: "partyShort" as const, header: "Parti (abrégé)" },
    { key: "partyLong" as const, header: "Parti" },
    { key: "partyPosition" as const, header: "Position politique" },
    { key: "currentMandateType" as const, header: "Mandat actuel" },
    { key: "currentMandateTitle" as const, header: "Titre du mandat" },
    { key: "currentMandateStart" as const, header: "Début du mandat" },
    {
      key: "currentMandateStartPublicationStatus" as const,
      header: "Statut de publication du début de mandat",
    },
    { key: "currentMandateEnd" as const, header: "Fin du mandat" },
    { key: "constituency" as const, header: "Circonscription" },
    { key: "departmentCode" as const, header: "Code département" },
    { key: "affairsCount" as const, header: "Nombre d'affaires" },
    { key: "factcheckMentionsCount" as const, header: "Fact-checks (mentions)" },
    { key: "prominenceScore" as const, header: "Score de prominence" },
    { key: "wikidataId" as const, header: "Wikidata Q-ID" },
    { key: "photoUrl" as const, header: "Photo" },
    { key: "profileUrl" as const, header: "Profil Poligraph" },
    { key: "createdAt" as const, header: "Créé le" },
    { key: "updatedAt" as const, header: "Mis à jour le" },
  ];

  const csv = toCSV(data, columns);
  const filename = `politiques-${new Date().toISOString().split("T")[0]}.csv`;

  return createCSVResponse(csv, filename);
});
