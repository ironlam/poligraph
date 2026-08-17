import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withCache } from "@/lib/cache";
import {
  getPublicFactCheckWhere,
  PUBLIC_PARTY_WHERE,
  PUBLIC_POLITICIAN_WHERE,
} from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";

/**
 * @openapi
 * /api/stats:
 *   get:
 *     summary: Statistiques globales de la plateforme
 *     description: >
 *       Retourne les compteurs publics principaux de Poligraph :
 *       politiciens, partis, affaires, scrutins et fact-checks.
 *       Seules les entités publiées sont comptées.
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Statistiques globales
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 politicians:
 *                   type: integer
 *                 parties:
 *                   type: integer
 *                 affairs:
 *                   type: integer
 *                 scrutins:
 *                   type: integer
 *                 factchecks:
 *                   type: integer
 *                 lastUpdated:
 *                   type: string
 *                   format: date-time
 */
export const GET = withPublicRoute(async () => {
  const [politicians, parties, affairs, scrutins, factchecks] = await Promise.all([
    db.politician.count({ where: PUBLIC_POLITICIAN_WHERE }),
    db.party.count({ where: PUBLIC_PARTY_WHERE }),
    db.affair.count({
      where: {
        ...getPublishedAffairWhere(),
        politician: PUBLIC_POLITICIAN_WHERE,
      },
    }),
    db.scrutin.count(),
    db.factCheck.count({ where: getPublicFactCheckWhere() }),
  ]);

  return withCache(
    NextResponse.json({
      politicians,
      parties,
      affairs,
      scrutins,
      factchecks,
      lastUpdated: new Date().toISOString(),
    }),
    "daily"
  );
});
