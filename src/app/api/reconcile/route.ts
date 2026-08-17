import { NextResponse } from "next/server";
import { z } from "zod";
import { safeJsonParse } from "@/lib/api/safe-json";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { db } from "@/lib/db";
import { normalizeText } from "@/lib/name-matching";

const reconciliationQuerySchema = z.object({
  query: z.string().min(1).max(500),
  type: z.string().optional(),
  limit: z.number().int().min(1).max(25).optional(),
  properties: z.array(z.object({ pid: z.string(), v: z.string() })).optional(),
});

const reconciliationQueriesSchema = z.record(z.string(), reconciliationQuerySchema);

type ReconciliationQuery = z.infer<typeof reconciliationQuerySchema>;

interface ReconciliationResult {
  id: string;
  name: string;
  score: number;
  match: boolean;
  type: Array<{ id: string; name: string }>;
  description: string;
}

/**
 * W3C Reconciliation Service API v0.2
 * https://www.w3.org/community/reports/reconciliation/CG-FINAL-specs-0.2-20230410/
 */
export const GET = withPublicRoute(async (request) => {
  const url = new URL(request.url);
  const queriesParam = url.searchParams.get("queries");

  if (!queriesParam) {
    // Service manifest
    return NextResponse.json({
      versions: ["0.2"],
      name: "Poligraph — French Politicians Reconciliation Service",
      identifierSpace: "https://poligraph.fr/politiques/",
      schemaSpace: "https://poligraph.fr/schema/",
      defaultTypes: [{ id: "Politician", name: "Politicien" }],
    });
  }

  const raw = safeJsonParse(queriesParam);
  if (!raw.success) {
    return NextResponse.json({ error: "Invalid JSON in queries parameter" }, { status: 400 });
  }

  const parsed = reconciliationQueriesSchema.safeParse(raw.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid queries format", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  return handleQueries(parsed.data as Record<string, ReconciliationQuery>);
});

export const POST = withPublicRoute(async (request) => {
  const bodyText = await request.text();
  const raw = safeJsonParse(bodyText);
  if (!raw.success) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = raw.data;
  const input =
    typeof body === "object" && body !== null && !Array.isArray(body) && "queries" in body
      ? (body as Record<string, unknown>).queries
      : body;

  const parsed = reconciliationQueriesSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid queries format", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  return handleQueries(parsed.data as Record<string, ReconciliationQuery>);
});

async function handleQueries(queries: Record<string, ReconciliationQuery>): Promise<NextResponse> {
  const results: Record<string, { result: ReconciliationResult[] }> = {};

  for (const [key, q] of Object.entries(queries)) {
    results[key] = { result: await reconcileOne(q) };
  }

  return NextResponse.json(results);
}

async function reconcileOne(query: ReconciliationQuery): Promise<ReconciliationResult[]> {
  const limit = Math.min(query.limit ?? 5, 25);
  const nameParts = query.query.trim().split(/\s+/);

  if (nameParts.length < 1) return [];

  // Extract optional properties
  const props = new Map((query.properties ?? []).map((p) => [p.pid, p.v]));
  const birthDateStr = props.get("birthDate");
  const department = props.get("department");

  // Search by name (case-insensitive)
  const candidates = await db.politician.findMany({
    where: {
      OR: [
        { fullName: { contains: query.query, mode: "insensitive" } },
        ...(nameParts.length >= 2
          ? [
              {
                lastName: {
                  equals: nameParts[nameParts.length - 1]!,
                  mode: "insensitive" as const,
                },
                firstName: {
                  startsWith: nameParts[0]!,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
      publicationStatus: "PUBLISHED",
    },
    select: {
      id: true,
      publicId: true,
      firstName: true,
      lastName: true,
      fullName: true,
      birthDate: true,
      slug: true,
      mandates: {
        where: { isCurrent: true },
        select: { type: true, constituency: true, departmentCode: true },
        take: 3,
      },
    },
    take: limit * 2, // Fetch more, score and trim
  });

  // Score candidates
  const scored = candidates.map((c) => {
    let score = 0;
    const normalizedQuery = normalizeText(query.query);
    const normalizedName = normalizeText(c.fullName);

    // Name similarity
    if (normalizedName === normalizedQuery) {
      score = 100;
    } else if (normalizedName.includes(normalizedQuery)) {
      score = 80;
    } else {
      score = 50;
    }

    // Birthdate bonus/penalty
    if (birthDateStr && c.birthDate) {
      const queryDate = new Date(birthDateStr);
      const diff = Math.abs(c.birthDate.getTime() - queryDate.getTime());
      if (diff <= 86_400_000) score += 20;
      else score -= 30;
    }

    // Department bonus
    if (department) {
      const deptMatch = c.mandates.some((m) => m.departmentCode === department);
      if (deptMatch) score += 10;
    }

    const mandateDesc = c.mandates
      .map((m) => `${m.type}${m.constituency ? ` (${m.constituency})` : ""}`)
      .join(", ");

    return {
      id: c.publicId ?? c.slug,
      name: c.fullName,
      score: Math.min(100, Math.max(0, score)),
      match: score >= 95,
      type: [{ id: "Politician", name: "Politicien" }],
      description: mandateDesc || "Politicien français",
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
