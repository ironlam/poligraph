import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { CURRENT_LEGISLATURE } from "@/config/scrutin-importance";
import { accentInsensitivePattern, scrutinSearchTokens } from "@/lib/votes/scrutin-search";

/** Suggestions per family: the box lists four families, so a few of each keep it readable. */
const PER_FAMILY = 4;

/**
 * @openapi
 * /api/search/parlement:
 *   get:
 *     summary: Suggestions de la recherche du Parlement
 *     description: Parlementaires en exercice, groupes de la législature en cours, scrutins et dossiers législatifs correspondant à la saisie (4 résultats maximum par famille, accents ignorés).
 *     tags: [Recherche]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         example: "retraites"
 *     responses:
 *       200:
 *         description: Suggestions groupées par famille
 */
export const GET = withPublicRoute(async (request) => {
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  const tokens = scrutinSearchTokens(query);

  if (query.length < 2 || tokens.length === 0) {
    return NextResponse.json({ parlementaires: [], groupes: [], scrutins: [], dossiers: [] });
  }

  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;
  const startPattern = `${escaped}%`;
  const wordStartPattern = `% ${escaped}%`;
  const hyphenStartPattern = `%-${escaped}%`;
  const scrutinConditions = tokens.map(
    (token) => Prisma.sql`s."title" ~* ${accentInsensitivePattern(token)}`
  );

  const [parlementaires, groupes, scrutins, dossiers] = await Promise.all([
    // Sitting deputies and senators only: their votes page is where the suggestion leads.
    db.$queryRaw<{ slug: string; fullName: string; type: string }[]>`
      SELECT p."slug", p."fullName", m."type"
      FROM "Politician" p
      JOIN "Mandate" m ON m."politicianId" = p."id"
        AND m."isCurrent" = true AND m."type" IN ('DEPUTE', 'SENATEUR')
      WHERE p."publicationStatus" = 'PUBLISHED'
        -- Start of a word only: "lfi" must not suggest MontgoLFIer.
        AND (unaccent(p."fullName") ILIKE unaccent(${startPattern})
          OR unaccent(p."fullName") ILIKE unaccent(${wordStartPattern})
          OR unaccent(p."fullName") ILIKE unaccent(${hyphenStartPattern}))
      ORDER BY p."prominenceScore" DESC NULLS LAST, p."lastName" ASC
      LIMIT ${PER_FAMILY}
    `,
    // Same perimeter as the groups listing: current legislature, or no legislature (Senate).
    db.$queryRaw<{ slug: string; name: string; code: string; chamber: string }[]>`
      SELECT g."slug", g."name", COALESCE(g."shortName", g."code") AS "code", g."chamber"
      FROM "ParliamentaryGroup" g
      WHERE g."slug" IS NOT NULL
        AND (g."legislature" = ${CURRENT_LEGISLATURE} OR g."legislature" IS NULL)
        AND (unaccent(g."name") ILIKE unaccent(${pattern})
          OR unaccent(g."code") ILIKE unaccent(${pattern})
          OR unaccent(COALESCE(g."shortName", '')) ILIKE unaccent(${pattern}))
      ORDER BY g."chamber" ASC, g."name" ASC
      LIMIT ${PER_FAMILY}
    `,
    // Composed with Prisma.sql, as the global search does: nested fragments are then inlined
    // rather than sent as a bound value.
    db.$queryRaw<{ id: string; slug: string | null; title: string; votingDate: Date }[]>(
      Prisma.sql`
        SELECT s."id", s."slug", s."title", s."votingDate"
        FROM "Scrutin" s
        WHERE ${Prisma.join(scrutinConditions, " AND ")}
        ORDER BY s."votingDate" DESC
        LIMIT ${PER_FAMILY}
      `
    ),
    db.$queryRaw<{ slug: string; title: string; shortTitle: string | null }[]>`
      SELECT d."slug", d."title", d."shortTitle"
      FROM "LegislativeDossier" d
      WHERE d."slug" IS NOT NULL
        AND (unaccent(d."title") ILIKE unaccent(${pattern})
          OR unaccent(COALESCE(d."shortTitle", '')) ILIKE unaccent(${pattern}))
      ORDER BY d."filingDate" DESC NULLS LAST
      LIMIT ${PER_FAMILY}
    `,
  ]);

  return withCache(
    NextResponse.json({
      parlementaires: parlementaires.map((p) => ({
        slug: p.slug,
        fullName: p.fullName,
        role: p.type === "SENATEUR" ? "Sénateur" : "Député",
      })),
      groupes,
      scrutins: scrutins.map((s) => ({
        slug: s.slug ?? s.id,
        title: s.title,
        votingDate: s.votingDate.toISOString(),
      })),
      dossiers: dossiers.map((d) => ({ slug: d.slug, title: d.shortTitle || d.title })),
    }),
    // Same as the global search: free-text results must follow publication changes at once.
    "none"
  );
});
