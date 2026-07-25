import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { normalizePourvoiNumber } from "@/services/affairs/court-decisions";

/**
 * Search among decisions that already exist (#536).
 *
 * Read-only, and it never creates a decision: the admin surface manages links, not
 * the decision catalogue. Creation belongs to #337.
 *
 * A pourvoi search always returns a list. A pourvoi can produce several decisions
 * (rejection, partial cassation, remand), so assuming uniqueness here would hand the
 * administrator one row and hide the others.
 */
export const GET = withAdminAuth(async (request) => {
  const term = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (term.length < 2) {
    return NextResponse.json({ error: "Terme de recherche trop court" }, { status: 400 });
  }

  const normalized = normalizePourvoiNumber(term);

  const decisions = await db.courtDecision.findMany({
    where: {
      OR: [
        { ecli: term },
        { judilibreId: term },
        // Normalised, so « 96-83.698 » and « 9683698 » find the same rows. `contains`
        // is for ergonomics on a partial number, not an identity rule.
        ...(normalized.length >= 2
          ? [{ pourvoiNumberNormalized: { contains: normalized } as const }]
          : []),
      ],
    },
    select: {
      id: true,
      ecli: true,
      pourvoiNumber: true,
      court: true,
      chamber: true,
      decisionDate: true,
      solution: true,
      sourceUrl: true,
      _count: { select: { affairs: true } },
    },
    orderBy: [{ decisionDate: "asc" }, { pourvoiNumber: "asc" }],
    take: 25,
  });

  return NextResponse.json({
    // Always a list, never a single match: the caller must see every candidate.
    results: decisions.map((d) => ({ ...d, linkedAffairCount: d._count.affairs })),
    total: decisions.length,
  });
});
