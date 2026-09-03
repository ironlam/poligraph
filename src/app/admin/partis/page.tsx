import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { POLITICAL_POSITION_LABELS, POLITICAL_POSITION_COLORS } from "@/config/labels";
import type { PoliticalPosition, Prisma } from "@/generated/prisma";
import { parsePageParam } from "@/lib/data/query-params";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    position?: string;
    page?: string;
  }>;
}

const ITEMS_PER_PAGE = 50;

async function getParties(params: { search?: string; position?: PoliticalPosition; page: number }) {
  const where: Prisma.PartyWhereInput = {};

  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { shortName: { contains: params.search, mode: "insensitive" } },
    ];
  }

  if (params.position) {
    where.politicalPosition = params.position;
  }

  const [parties, total] = await Promise.all([
    db.party.findMany({
      where,
      include: {
        _count: {
          select: {
            politicians: true,
            partyMemberships: true,
            affairsAtTime: true,
          },
        },
        predecessor: { select: { shortName: true } },
        successors: { select: { shortName: true } },
      },
      orderBy: [{ politicians: { _count: "desc" } }, { name: "asc" }],
      skip: (params.page - 1) * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,
    }),
    db.party.count({ where }),
  ]);

  return { parties, total, totalPages: Math.ceil(total / ITEMS_PER_PAGE) };
}

export default async function AdminPartiesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.q || "";
  const position = params.position as PoliticalPosition | undefined;
  const page = parsePageParam(params.page);

  const { parties, total, totalPages } = await getParties({ search, position, page });

  // Build query string helper
  function buildQuery(overrides: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { q: search, position: params.position, page: params.page, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && k !== "page") q.set(k, v);
    }
    if (overrides.page) q.set("page", overrides.page);
    const str = q.toString();
    return str ? `?${str}` : "";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Partis politiques</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {total} parti{total !== 1 ? "s" : ""} enregistré{total !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <input
                name="q"
                type="search"
                placeholder="Rechercher un parti..."
                defaultValue={search}
                className="w-full pl-4 pr-4 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/50"
                aria-label="Rechercher un parti"
              />
            </div>
            <select
              name="position"
              defaultValue={params.position || ""}
              className="text-sm bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/50"
              aria-label="Filtrer par position politique"
            >
              <option value="">Toutes positions</option>
              {Object.entries(POLITICAL_POSITION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Filtrer
            </button>
            {(search || position) && (
              <Link
                href="/admin/partis"
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Réinitialiser
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {parties.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Aucun parti trouvé</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground">Nom</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Position</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-center">
                      Membres
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-center">
                      Affiliations
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Évolution</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parties.map((party) => (
                    <tr key={party.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3.5 h-3.5 rounded-sm shrink-0"
                            style={{ backgroundColor: party.color || "#94a3b8" }}
                            aria-hidden="true"
                          />
                          <Link
                            href={`/admin/partis/${party.id}`}
                            className="font-medium hover:underline"
                          >
                            {party.name}
                          </Link>
                          <Badge variant="outline" className="text-xs">
                            {party.shortName}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {party.politicalPosition ? (
                          <Badge
                            className={`text-xs ${POLITICAL_POSITION_COLORS[party.politicalPosition]}`}
                          >
                            {POLITICAL_POSITION_LABELS[party.politicalPosition]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {party._count.politicians}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {party._count.partyMemberships}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {party.predecessor && <span>← {party.predecessor.shortName}</span>}
                        {party.predecessor && party.successors.length > 0 && " "}
                        {party.successors.length > 0 && (
                          <span>→ {party.successors.map((s) => s.shortName).join(", ")}</span>
                        )}
                        {!party.predecessor && party.successors.length === 0 && "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/partis/${party.id}`}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Voir
                          </Link>
                          <Link
                            href={`/admin/partis/${party.id}/edit`}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Modifier
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page}/{totalPages}
          </p>
          <div className="flex items-center gap-1">
            {page > 1 && (
              <Link
                href={`/admin/partis${buildQuery({ page: String(page - 1) })}`}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Précédent
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/partis${buildQuery({ page: String(page + 1) })}`}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Suivant
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
