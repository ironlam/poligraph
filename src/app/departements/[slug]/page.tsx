import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { ensureContrast } from "@/lib/contrast";
import { getDepartmentBySlug, DEPARTMENTS } from "@/config/departments";
import { getDeputesByDepartment, getSenateursByDepartment } from "@/lib/data/departments";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

export const revalidate = 3600; // ISR: revalidate every hour

export function generateStaticParams() {
  return Object.keys(DEPARTMENTS).map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const dept = getDepartmentBySlug(slug);

  if (!dept) {
    return missingEntityMetadata("Département introuvable");
  }

  const { name } = dept;

  return {
    title: name,
    description: `Députés et sénateurs du département ${name}. Liste complète des représentants politiques.`,
    openGraph: {
      title: `${name} | Poligraph`,
      description: `Découvrez les députés et sénateurs du département ${name}.`,
    },
    alternates: {
      canonical: `/departements/${slug}`,
    },
  };
}

export default async function DepartmentPage({ params }: PageProps) {
  const { slug } = await params;
  const dept = getDepartmentBySlug(slug);

  if (!dept) {
    notFound();
  }

  const departmentName = dept.name;

  const [deputies, senators] = await Promise.all([
    getDeputesByDepartment(dept.code),
    getSenateursByDepartment(dept.code),
  ]);

  if (deputies.length === 0 && senators.length === 0) {
    notFound();
  }

  // Sort deputies by constituency number
  deputies.sort((a, b) => {
    const numA = a.mandates[0]?.constituency?.match(/\((\d+)\)/)?.[1];
    const numB = b.mandates[0]?.constituency?.match(/\((\d+)\)/)?.[1];
    if (numA && numB) {
      return parseInt(numA) - parseInt(numB);
    }
    return 0;
  });

  return (
    <div className="container mx-auto px-4 pt-4 pb-8">
      <Breadcrumb
        items={[{ label: "Départements", href: "/departements" }, { label: departmentName }]}
      />

      <div className="mb-8">
        <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">
          {departmentName}
        </h1>
        <p className="text-muted-foreground">
          {deputies.length} député{deputies.length > 1 ? "s" : ""} · {senators.length} sénateur
          {senators.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Deputies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Députés</span>
              <Badge variant="outline">{deputies.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deputies.length > 0 ? (
              <div className="space-y-3">
                {deputies.map((deputy) => (
                  <Link
                    key={deputy.id}
                    href={`/politiques/${deputy.slug}`}
                    className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <PoliticianAvatar
                      photoUrl={deputy.photoUrl}
                      firstName={deputy.firstName}
                      lastName={deputy.lastName}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium group-hover:text-primary transition-colors">
                        {deputy.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {deputy.mandates[0]?.constituency || "Député"}
                      </p>
                    </div>
                    {deputy.currentParty && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-xs"
                        title={deputy.currentParty.name}
                        style={{
                          backgroundColor: deputy.currentParty.color
                            ? `${deputy.currentParty.color}15`
                            : undefined,
                          color: deputy.currentParty.color
                            ? ensureContrast(deputy.currentParty.color, "#ffffff")
                            : undefined,
                        }}
                      >
                        {deputy.currentParty.shortName}
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Aucun député enregistré pour ce département.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Senators */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Sénateurs</span>
              <Badge variant="outline">{senators.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {senators.length > 0 ? (
              <div className="space-y-3">
                {senators.map((senator) => (
                  <Link
                    key={senator.id}
                    href={`/politiques/${senator.slug}`}
                    className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <PoliticianAvatar
                      photoUrl={senator.photoUrl}
                      firstName={senator.firstName}
                      lastName={senator.lastName}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium group-hover:text-primary transition-colors">
                        {senator.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground">Sénateur</p>
                    </div>
                    {senator.currentParty && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-xs"
                        title={senator.currentParty.name}
                        style={{
                          backgroundColor: senator.currentParty.color
                            ? `${senator.currentParty.color}15`
                            : undefined,
                          color: senator.currentParty.color
                            ? ensureContrast(senator.currentParty.color, "#ffffff")
                            : undefined,
                        }}
                      >
                        {senator.currentParty.shortName}
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Aucun sénateur enregistré pour ce département.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
