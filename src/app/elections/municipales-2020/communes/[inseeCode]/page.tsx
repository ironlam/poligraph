import { Metadata } from "next";
import { getDepartmentName, formatDepartment } from "@/config/departments";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCommuneResults2020 } from "@/lib/data/elections";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CheckCircle2, Info } from "lucide-react";

export const revalidate = 86400; // ISR: 24h backstop; historical data changes on-demand only

// ISR only — too many communes for SSG
export async function generateStaticParams() {
  return [];
}

/** Paris, Lyon, Marseille have arrondissement-based elections (scrutin de secteur) */
const PLM_CODES = new Set(["75056", "69123", "13055"]);

interface PageProps {
  params: Promise<{ inseeCode: string }>;
}

/** Normalize ALL-CAPS list names to title case */
function normalizeLabel(raw: string): string {
  const letters = raw.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length === 0 || letters !== letters.toUpperCase()) return raw;
  return raw
    .toLowerCase()
    .replace(/(^|\s|['\-])([a-zà-ÿ])/g, (_, sep, char) => sep + char.toUpperCase());
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { inseeCode } = await params;
  const commune = await getCommuneResults2020(inseeCode);

  if (!commune) {
    return { title: "Commune non trouvée" };
  }

  const title = `Municipales 2020 à ${commune.communeName} — Résultats | Poligraph`;
  // Sous 1000 habitants le scrutin est plurinominal : il n'y a pas de liste, seulement des
  // candidats. Annoncer « N listes en compétition » y était faux sur environ 34 000 communes.
  const dept = getDepartmentName(commune.departmentCode) ?? commune.departmentCode;
  const ou = `à ${commune.communeName} (${dept})`;
  const description =
    commune.namedListCount > 0
      ? `Résultats des élections municipales 2020 ${ou} : ${commune.namedListCount} liste${commune.namedListCount > 1 ? "s" : ""} en compétition.`
      : commune.lists.length > 0
        ? `Résultats des élections municipales 2020 ${ou} : ${commune.lists.length} candidat${commune.lists.length > 1 ? "s" : ""}.`
        : `Résultats des élections municipales 2020 ${ou}.`;

  return {
    title,
    description,
    alternates: { canonical: `/elections/municipales-2020/communes/${inseeCode}` },
    // Don't index pages with no results
    ...(commune.lists.length === 0 && { robots: { index: false } }),
  };
}

export default async function Commune2020DetailPage({ params }: PageProps) {
  const { inseeCode } = await params;
  const commune = await getCommuneResults2020(inseeCode);

  if (!commune) {
    notFound();
  }

  return (
    <main className="container mx-auto px-4 pt-4 pb-8 max-w-6xl">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Municipales 2020", href: "/elections/municipales-2020" },
          { label: commune.communeName },
        ]}
      />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight mb-3">
          Municipales 2020 — {commune.communeName}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{formatDepartment(commune.departmentCode)}</Badge>
          {commune.population != null && (
            <Badge variant="outline">{commune.population.toLocaleString("fr-FR")} habitants</Badge>
          )}
          {commune.totalSeats != null && (
            <Badge variant="outline">{commune.totalSeats} sièges</Badge>
          )}
        </div>
      </div>

      {/* Lists / Results */}
      <section>
        <h2 className="text-lg font-semibold mb-4">
          {commune.namedListCount > 0
            ? `Résultats (${commune.namedListCount} liste${commune.namedListCount > 1 ? "s" : ""})`
            : `Candidats (${commune.lists.length})`}
        </h2>

        {commune.lists.length > 0 ? (
          <div className="space-y-4">
            {commune.lists.map((list) => (
              <Card
                key={list.listName}
                className={list.isElected ? "border-green-300 dark:border-green-800" : undefined}
              >
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold" title={list.listName}>
                          {normalizeLabel(list.listName)}
                        </h3>
                        {list.isElected && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Élue
                          </Badge>
                        )}
                      </div>
                      {list.partyLabel && (
                        <p className="text-sm text-muted-foreground mt-0.5">{list.partyLabel}</p>
                      )}
                      {list.isNamedList && (
                        <p className="text-sm text-muted-foreground">
                          Tête de liste : {list.candidateName}
                          {/* L'import 2020 ne garde qu'une ligne par liste, la tête : le compte de
                              colistiers vaut 1 et ne veut rien dire. On ne l'affiche que s'il informe. */}
                          {list.candidateCount > 1 && ` · ${list.candidateCount} candidats`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Round results */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {/* Round 1 */}
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="font-medium mb-1">1er tour</p>
                      <div className="flex items-baseline gap-3">
                        {list.round1Pct != null && (
                          <span className="text-xl font-bold tabular-nums">
                            {list.round1Pct.toFixed(2)} %
                          </span>
                        )}
                        {list.round1Votes != null && (
                          <span className="text-muted-foreground tabular-nums">
                            {list.round1Votes.toLocaleString("fr-FR")} voix
                          </span>
                        )}
                      </div>
                      {list.round1Qualified != null && (
                        <Badge
                          variant="outline"
                          className={
                            list.round1Qualified
                              ? "mt-1 text-green-700 border-green-300 dark:text-green-400 dark:border-green-800"
                              : "mt-1 text-muted-foreground"
                          }
                        >
                          {list.round1Qualified ? "Qualifiée" : "Non qualifiée"}
                        </Badge>
                      )}
                    </div>

                    {/* Round 2 */}
                    {list.round2Votes != null && (
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="font-medium mb-1">2nd tour</p>
                        <div className="flex items-baseline gap-3">
                          {list.round2Pct != null && (
                            <span className="text-xl font-bold tabular-nums">
                              {list.round2Pct.toFixed(2)} %
                            </span>
                          )}
                          <span className="text-muted-foreground tabular-nums">
                            {list.round2Votes.toLocaleString("fr-FR")} voix
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : PLM_CODES.has(inseeCode) ? (
          <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
            <CardContent className="pt-5">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Scrutin par arrondissement</p>
                  <p className="text-sm text-muted-foreground">
                    {commune.communeName} élit ses conseillers municipaux par arrondissement
                    (scrutin de secteur). Les résultats détaillés ne sont pas disponibles au niveau
                    de la commune dans nos données.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <p className="text-muted-foreground">Aucun résultat disponible pour cette commune.</p>
        )}
      </section>

      {/* Comparison link to 2026 */}
      <section className="mt-8">
        <Link href={`/elections/municipales-2026/communes/${commune.inseeCode}`} prefetch={false}>
          <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20 hover:shadow-sm transition-shadow">
            <CardContent className="pt-5 flex items-center gap-4">
              <div>
                <p className="font-semibold">Voir les candidatures 2026 à {commune.communeName}</p>
                <p className="text-sm text-muted-foreground">
                  Comparez avec les listes et candidats pour les prochaines municipales.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>
    </main>
  );
}
