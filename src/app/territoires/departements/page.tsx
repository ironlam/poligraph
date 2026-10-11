import { Metadata } from "next";
import Link from "next/link";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DEPARTMENTS, getDepartmentSlug } from "@/config/departments";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import {
  TERRITOIRES_PATH,
  territoireDepartementPath,
  TERRITOIRES_DEPARTEMENTS_PATH,
} from "@/lib/territoires/paths";

export const revalidate = 3600; // 1 hour — static department listing

export const metadata: Metadata = {
  title: "Départements",
  description:
    "Liste des départements français et leurs représentants politiques - députés et sénateurs par département.",
  alternates: { canonical: TERRITOIRES_DEPARTEMENTS_PATH },
};

async function getDepartmentStats() {
  "use cache";
  cacheTag("departments", "politicians");
  cacheLife("synced");

  // Aggregate counts directly in the database using groupBy
  const grouped = await db.mandate.groupBy({
    by: ["departmentCode", "type"],
    where: {
      type: { in: ["DEPUTE", "SENATEUR"] },
      isCurrent: true,
      departmentCode: { not: null },
    },
    _count: { id: true },
  });

  // Build stats keyed by department name (to match what the page expects)
  const stats: Record<string, { deputes: number; senateurs: number }> = {};

  for (const row of grouped) {
    const code = row.departmentCode!;
    const dept = DEPARTMENTS[code];
    if (!dept) continue;

    const name = dept.name;
    if (!stats[name]) {
      stats[name] = { deputes: 0, senateurs: 0 };
    }

    if (row.type === "DEPUTE") {
      stats[name].deputes += row._count.id;
    } else if (row.type === "SENATEUR") {
      stats[name].senateurs += row._count.id;
    }
  }

  return stats;
}

export default async function DepartementsPage() {
  const stats = await getDepartmentStats();

  // Group departments by region (simplified: by first letter for now)
  const departmentList = Object.entries(DEPARTMENTS).map(([code, { name }]) => ({
    code,
    name,
    deputes: stats[name]?.deputes || 0,
    senateurs: stats[name]?.senateurs || 0,
    total: (stats[name]?.deputes || 0) + (stats[name]?.senateurs || 0),
  }));

  // Sort by name
  departmentList.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  // Calculate totals
  const totalDeputes = departmentList.reduce((acc, d) => acc + d.deputes, 0);
  const totalSenateurs = departmentList.reduce((acc, d) => acc + d.senateurs, 0);

  return (
    <>
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb
          items={[{ label: "Territoires", href: TERRITOIRES_PATH }, { label: "Départements" }]}
        />
        <div className="mb-8">
          <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">Départements</h1>
          <p className="text-muted-foreground">
            {departmentList.length} départements · {totalDeputes} députés · {totalSenateurs}{" "}
            sénateurs
          </p>
        </div>

        {/* Quick search hint */}
        <div className="mb-6 p-4 bg-muted rounded-lg">
          <p className="text-sm">
            Vous cherchez votre député ?{" "}
            <Link href="/mon-depute" className="text-primary hover:underline font-medium">
              Utilisez la recherche par code postal →
            </Link>
          </p>
        </div>

        {/* Grid of departments */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {departmentList.map((dept) => (
            <Link
              key={dept.code}
              href={territoireDepartementPath(getDepartmentSlug(dept.name))}
              prefetch={false}
              className="block group"
            >
              <Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold group-hover:text-primary transition-colors">
                        {dept.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{dept.code}</p>
                    </div>
                    {dept.total > 0 && (
                      <div className="flex gap-1 shrink-0">
                        {dept.deputes > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {dept.deputes} dép.
                          </Badge>
                        )}
                        {dept.senateurs > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {dept.senateurs} sén.
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
