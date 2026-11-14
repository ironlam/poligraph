import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { Prisma, MandateType } from "@/generated/prisma";
import { RelationType, GraphNode, GraphLink, Cluster, RelationsResponse } from "@/types/relations";
import { ALL_RELATION_TYPES } from "@/config/relations";
import { DeclarationDetails } from "@/types/hatvp";
import { parsePagination } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";

const GOVERNMENT_TYPES: MandateType[] = [
  "MINISTRE",
  "PREMIER_MINISTRE",
  "MINISTRE_DELEGUE",
  "SECRETAIRE_ETAT",
];

function toGraphNode(p: {
  id: string;
  slug: string;
  fullName: string;
  photoUrl: string | null;
  currentParty: { shortName: string; color: string | null } | null;
  mandates?: { type: MandateType; isCurrent: boolean }[];
}): GraphNode {
  const mandate = p.mandates?.find((m) => m.isCurrent);
  return {
    id: p.id,
    slug: p.slug,
    fullName: p.fullName,
    photoUrl: p.photoUrl,
    party: p.currentParty,
    mandateType: mandate?.type || null,
  };
}

const POLITICIAN_SELECT = {
  id: true,
  slug: true,
  fullName: true,
  photoUrl: true,
  currentParty: { select: { shortName: true, color: true } },
  mandates: {
    where: { isCurrent: true },
    select: { type: true, isCurrent: true },
    take: 1,
  },
} as const;

/**
 * @openapi
 * /api/politiques/{slug}/relations:
 *   get:
 *     summary: Relations d'un représentant publié
 *     description: Retourne les clusters de relations entre représentants publiés (gouvernement, entreprises, département, parcours partisan)
 *     tags: [Relations]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug du représentant publié
 *         example: emmanuel-macron
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *         description: Types de relations à inclure (séparés par virgules)
 *         example: SAME_GOVERNMENT,SHARED_COMPANY
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: Nombre max de connexions par type
 *     responses:
 *       200:
 *         description: Clusters de relations entre représentants publiés
 *       400:
 *         description: Filtre de relation invalide
 *       404:
 *         description: Représentant non trouvé ou non publié
 *       500:
 *         description: Erreur serveur
 */
export const GET = withPublicRoute(async (request, context) => {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);

  const typesParam = searchParams.get("types");
  const { limit } = parsePagination(searchParams, { defaultLimit: 10, maxLimit: 50 });

  const requestedTypeValues = typesParam !== null ? typesParam.split(",") : [];
  if (requestedTypeValues.some((type) => !ALL_RELATION_TYPES.includes(type as RelationType))) {
    return NextResponse.json({ error: "Type de relation invalide" }, { status: 400 });
  }
  const requestedTypes: RelationType[] =
    typesParam !== null ? (requestedTypeValues as RelationType[]) : ALL_RELATION_TYPES;

  const politician = await db.politician.findFirst({
    where: { slug, publicationStatus: "PUBLISHED" },
    include: {
      currentParty: { select: { id: true, shortName: true, color: true } },
      mandates: {
        select: {
          id: true,
          type: true,
          startDate: true,
          endDate: true,
          isCurrent: true,
          constituency: true,
          departmentCode: true,
          governmentData: {
            select: { governmentName: true },
          },
        },
      },
      partyHistory: { select: { partyId: true } },
      declarations: {
        where: { details: { not: Prisma.DbNull } },
        select: { details: true },
        orderBy: { year: "desc" },
        take: 1,
      },
    },
  });

  if (!politician) {
    return NextResponse.json({ error: "Représentant non trouvé ou non publié" }, { status: 404 });
  }

  const currentMandate = politician.mandates.find((m) => m.isCurrent);
  const center: GraphNode = {
    id: politician.id,
    slug: politician.slug,
    fullName: politician.fullName,
    photoUrl: politician.photoUrl,
    party: politician.currentParty,
    mandateType: currentMandate?.type || null,
  };

  const clusters: Cluster[] = [];

  // --- SAME_GOVERNMENT ---
  if (requestedTypes.includes("SAME_GOVERNMENT")) {
    const govMandates = politician.mandates.filter(
      (m) => GOVERNMENT_TYPES.includes(m.type) && m.governmentData?.governmentName
    );

    const govGroups = new Map<string, (typeof politician.mandates)[number][]>();
    for (const m of govMandates) {
      const name = m.governmentData!.governmentName;
      if (!govGroups.has(name)) govGroups.set(name, []);
      govGroups.get(name)!.push(m);
    }

    // One query for every government, `limit` colleagues each, instead of one query per government.
    const govNames = Array.from(govGroups.keys());
    const colleagueRows =
      govNames.length > 0
        ? await db.$queryRaw<Array<{ gov: string; politicianId: string }>>(Prisma.sql`
            SELECT gov, "politicianId" FROM (
              SELECT x.gov, x."politicianId",
                     ROW_NUMBER() OVER (PARTITION BY x.gov ORDER BY x."fullName", x."politicianId") AS rn
              FROM (
                SELECT DISTINCT mg."governmentName" AS gov, p.id AS "politicianId", p."fullName"
                FROM "MandateGovernment" mg
                JOIN "Mandate" m ON m.id = mg."mandateId"
                JOIN "Politician" p ON p.id = m."politicianId"
                WHERE mg."governmentName" IN (${Prisma.join(govNames)})
                  AND m.type::text IN (${Prisma.join(GOVERNMENT_TYPES)})
                  AND p."publicationStatus" = 'PUBLISHED'
                  AND p.id <> ${politician.id}
              ) x
            ) ranked
            WHERE rn <= ${limit}
            ORDER BY gov, rn
          `)
        : [];
    const colleagueIds = [...new Set(colleagueRows.map((r) => r.politicianId))];
    const colleagueById = new Map(
      (colleagueIds.length > 0
        ? await db.politician.findMany({
            where: { id: { in: colleagueIds } },
            select: POLITICIAN_SELECT,
          })
        : []
      ).map((p) => [p.id, p])
    );

    for (const [govName, mandates] of govGroups) {
      const mandate = mandates[0];
      const colleagues = colleagueRows
        .filter((r) => r.gov === govName)
        .map((r) => colleagueById.get(r.politicianId))
        .filter((p) => p !== undefined);

      if (colleagues.length > 0) {
        const nodes = colleagues.map(toGraphNode);
        const links: GraphLink[] = nodes.map((n) => ({
          source: politician.id,
          target: n.id,
          type: "SAME_GOVERNMENT" as RelationType,
          label: govName,
        }));

        const dateRange = mandate!.endDate
          ? `(${mandate!.startDate.getFullYear()}-${mandate!.endDate.getFullYear()})`
          : `(depuis ${mandate!.startDate.getFullYear()})`;

        clusters.push({
          type: "SAME_GOVERNMENT",
          label: `${govName} ${dateRange}`,
          nodes,
          links,
        });
      }
    }
  }

  // --- SHARED_COMPANY ---
  if (requestedTypes.includes("SHARED_COMPANY")) {
    const declaration = politician.declarations[0];
    if (declaration?.details) {
      const details = declaration.details as unknown as DeclarationDetails;
      const companies = new Set<string>();

      for (const fp of details.financialParticipations || []) {
        if (fp.company && !fp.company.includes("[Données non publiées]")) {
          companies.add(fp.company.toUpperCase().trim());
        }
      }
      for (const d of details.directorships || []) {
        if (d.company && !d.company.includes("[Données non publiées]")) {
          companies.add(d.company.toUpperCase().trim());
        }
      }

      if (companies.size > 0) {
        const companyArray = Array.from(companies);

        // Compare against every other published politician's latest declaration, like the
        // center's own (latest year with details). Matching runs in SQL over the whole table.
        const matches = await db.$queryRaw<Array<{ politicianId: string; companies: string[] }>>(
          Prisma.sql`
            WITH latest AS (
              SELECT DISTINCT ON (d."politicianId") d."politicianId", d.details
              FROM "Declaration" d
              JOIN "Politician" p ON p.id = d."politicianId"
              WHERE d.details IS NOT NULL
                AND p."publicationStatus" = 'PUBLISHED'
                AND d."politicianId" <> ${politician.id}
              ORDER BY d."politicianId", d.year DESC
            ),
            entries AS (
              SELECT l."politicianId", e->>'company' AS company
              FROM latest l
              CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(l.details->'financialParticipations') = 'array'
                     THEN l.details->'financialParticipations' ELSE '[]'::jsonb END
              ) e
              UNION ALL
              SELECT l."politicianId", e->>'company' AS company
              FROM latest l
              CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(l.details->'directorships') = 'array'
                     THEN l.details->'directorships' ELSE '[]'::jsonb END
              ) e
            )
            SELECT "politicianId", array_agg(DISTINCT trim(company)) AS companies
            FROM entries
            WHERE upper(trim(company)) IN (${Prisma.join(companyArray)})
            GROUP BY "politicianId"
            ORDER BY count(DISTINCT trim(company)) DESC, "politicianId"
            LIMIT ${limit}
          `
        );

        const matchedById = new Map(
          (matches.length > 0
            ? await db.politician.findMany({
                where: { id: { in: matches.map((m) => m.politicianId) } },
                select: POLITICIAN_SELECT,
              })
            : []
          ).map((p) => [p.id, p])
        );
        const sorted = matches.flatMap((m) => {
          const p = matchedById.get(m.politicianId);
          return p ? [{ node: toGraphNode(p), companies: m.companies }] : [];
        });

        if (sorted.length > 0) {
          const nodes = sorted.map((s) => s.node);
          const links: GraphLink[] = sorted.map((s) => ({
            source: politician.id,
            target: s.node.id,
            type: "SHARED_COMPANY" as RelationType,
            label: s.companies.join(", "),
          }));

          clusters.push({
            type: "SHARED_COMPANY",
            label: `${companies.size} entreprise${companies.size > 1 ? "s" : ""} déclarée${companies.size > 1 ? "s" : ""}`,
            nodes,
            links,
          });
        }
      }
    }
  }

  // --- SAME_DEPARTMENT ---
  if (requestedTypes.includes("SAME_DEPARTMENT")) {
    const deptMandate = politician.mandates.find((m) => m.departmentCode && m.isCurrent);

    if (deptMandate?.departmentCode) {
      const sameDept = await db.politician.findMany({
        where: {
          publicationStatus: "PUBLISHED",
          id: { not: politician.id },
          mandates: {
            some: {
              isCurrent: true,
              departmentCode: deptMandate.departmentCode,
            },
          },
        },
        select: POLITICIAN_SELECT,
        take: limit,
      });

      if (sameDept.length > 0) {
        const deptName =
          deptMandate.constituency?.split("(")[0]!.trim() || deptMandate.departmentCode;

        const nodes = sameDept.map(toGraphNode);
        const links: GraphLink[] = nodes.map((n) => ({
          source: politician.id,
          target: n.id,
          type: "SAME_DEPARTMENT" as RelationType,
          label: deptName,
        }));

        clusters.push({
          type: "SAME_DEPARTMENT",
          label: deptName,
          nodes,
          links,
        });
      }
    }
  }

  // --- PARTY_HISTORY ---
  if (requestedTypes.includes("PARTY_HISTORY")) {
    const partyIds = politician.partyHistory.map((h) => h.partyId);

    if (partyIds.length > 0) {
      const formerColleagues = await db.politician.findMany({
        where: {
          publicationStatus: "PUBLISHED",
          id: { not: politician.id },
          ...(politician.currentParty
            ? { NOT: { currentPartyId: politician.currentParty.id } }
            : {}),
          partyHistory: {
            some: { partyId: { in: partyIds } },
          },
        },
        select: POLITICIAN_SELECT,
        take: limit,
      });

      if (formerColleagues.length > 0) {
        const nodes = formerColleagues.map(toGraphNode);
        const links: GraphLink[] = nodes.map((n) => ({
          source: politician.id,
          target: n.id,
          type: "PARTY_HISTORY" as RelationType,
        }));

        clusters.push({
          type: "PARTY_HISTORY",
          label: "Anciens collègues de parti",
          nodes,
          links,
        });
      }
    }
  }

  const stats: RelationsResponse["stats"] = {
    totalConnections: clusters.reduce((sum, c) => sum + c.links.length, 0),
    byType: Object.fromEntries(clusters.map((c) => [c.type, c.links.length])) as Partial<
      Record<RelationType, number>
    >,
  };

  const response: RelationsResponse = { center, clusters, stats };
  return withCache(NextResponse.json(response), "daily");
});
