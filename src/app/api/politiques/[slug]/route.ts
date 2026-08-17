import { NextResponse } from "next/server";
import { getPoliticianBySlug } from "@/services/politicians";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { computeAffairCounts } from "@/lib/affairs/affair-counts";
import { getMandateStartDatePublicationStatus } from "@/lib/api/public-contract";

/**
 * @openapi
 * /api/politiques/{slug}:
 *   get:
 *     summary: Détails d'un représentant politique publié
 *     description: Retourne les informations détaillées d'un représentant politique publié, incluant ses mandats, déclarations et compteurs éditoriaux role-aware
 *     tags: [Politiques]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Identifiant unique du représentant (ex. emmanuel-macron)
 *     responses:
 *       200:
 *         description: Détails du représentant politique. Les mandats contiennent startDatePublicationStatus ; affairsCount est conservé pour compatibilité et les compteurs par rôle font foi éditorialement.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PoliticianDetails'
 *       404:
 *         description: Représentant non trouvé ou non publié
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const GET = withPublicRoute(async (_request, context) => {
  const params = await context.params;
  const slug = params["slug"]!;

  const politician = await getPoliticianBySlug(slug);

  // Public callers must not be able to distinguish an absent record from a
  // record that exists but is outside the PUBLISHED corpus.
  if (!politician) {
    return NextResponse.json({ error: "Représentant non trouvé ou non publié" }, { status: 404 });
  }

  return withCache(
    NextResponse.json({
      id: politician.id,
      slug: politician.slug,
      fullName: politician.fullName,
      firstName: politician.firstName,
      lastName: politician.lastName,
      civility: politician.civility,
      birthDate: politician.birthDate,
      deathDate: politician.deathDate,
      birthPlace: politician.birthPlace,
      photoUrl: politician.photoUrl,
      currentParty: politician.currentParty
        ? {
            id: politician.currentParty.id,
            name: politician.currentParty.name,
            shortName: politician.currentParty.shortName,
            color: politician.currentParty.color,
          }
        : null,
      mandates: politician.mandates.map((m) => {
        const mandate = m as typeof m & {
          parliamentaryData?: {
            parliamentaryGroup?: { code: string; name: string; color: string | null } | null;
          } | null;
        };
        return {
          id: mandate.id,
          type: mandate.type,
          title: mandate.title,
          institution: mandate.institution,
          constituency: mandate.constituency,
          startDate: mandate.startDate,
          startDatePublicationStatus: getMandateStartDatePublicationStatus(mandate.type),
          endDate: mandate.endDate,
          isCurrent: mandate.isCurrent,
          parliamentaryGroup: mandate.parliamentaryData?.parliamentaryGroup
            ? {
                code: mandate.parliamentaryData.parliamentaryGroup.code,
                name: mandate.parliamentaryData.parliamentaryGroup.name,
                color: mandate.parliamentaryData.parliamentaryGroup.color,
              }
            : null,
        };
      }),
      declarations: politician.declarations.map((d) => ({
        id: d.id,
        type: d.type,
        year: d.year,
        url: d.pdfUrl,
        hatvpUrl: d.hatvpUrl,
        details: d.details,
      })),
      // Legacy compatibility total: all published affairs across roles. Consumers
      // must use the role-aware counters below for editorial presentation.
      affairsCount: politician.affairs.length,
      ...computeAffairCounts(politician.affairs),
      factchecksCount:
        (politician as unknown as { _count: { factCheckMentions: number } })._count
          ?.factCheckMentions ?? 0,
    }),
    "daily"
  );
});
