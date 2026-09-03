import { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ParityChart } from "@/components/elections/municipales/ParityChart";
import { getMunicipalesStats, getParityBySize, getParityOutliers } from "@/lib/data/municipales";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Parité femmes-hommes — Municipales 2026",
  description:
    "Analyse de la parité femmes-hommes dans les candidatures aux élections municipales 2026 par parti, par taille de commune et par liste.",
  alternates: { canonical: "/elections/municipales-2026/parite" },
};

function parityColor(rate: number): string {
  if (rate >= 0.45) return "text-green-600 dark:text-green-400";
  if (rate >= 0.3) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export default async function ParitePage() {
  // Sequential queries to respect DB pool limit of 2
  const stats = await getMunicipalesStats();
  const parityBySize = await getParityBySize();
  const outliers = await getParityOutliers();

  const globalParityRate = stats?.parityRate ?? 0;

  // Transform parityByParty into chart data
  const parityByPartyData = stats?.parityByParty
    ? Object.entries(stats.parityByParty)
        .map(([label, rate]) => ({
          label,
          femaleRate: rate,
          totalCount: 0, // Not available from snapshot, but not displayed
        }))
        .sort((a, b) => Math.abs(0.5 - a.femaleRate) - Math.abs(0.5 - b.femaleRate))
    : [];

  // Transform parityBySize into chart data
  const paritySizeData = parityBySize.map((row) => ({
    label: row.bracket,
    femaleRate: row.femaleRate,
    totalCount: row.totalCount,
  }));

  return (
    <div className="container mx-auto px-4 max-w-6xl">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Municipales 2026", href: "/elections/municipales-2026" },
          { label: "Parité" },
        ]}
      />

      {/* Hero — global parity rate */}
      <section className="py-4">
        <div className="bg-gradient-to-br from-pink-50 via-background to-blue-50 dark:from-pink-950/20 dark:to-blue-950/20 border rounded-2xl p-6 md:p-8">
          <h1 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight mb-2">
            Parité femmes-hommes
          </h1>
          <p className="text-muted-foreground text-lg mb-6">
            Analyse de la représentation des femmes dans les candidatures aux municipales 2026
          </p>

          <div className="flex items-baseline gap-2">
            <span className={`tabular-nums text-5xl font-bold ${parityColor(globalParityRate)}`}>
              {(globalParityRate * 100).toFixed(1)}%
            </span>
            <span className="text-muted-foreground text-lg">de femmes candidates</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {globalParityRate >= 0.45
              ? "La parité est globalement respectée au niveau national."
              : globalParityRate >= 0.3
                ? "La parité reste insuffisante au niveau national."
                : "La parité est très loin d'être atteinte au niveau national."}
          </p>
        </div>
      </section>

      {/* Par parti politique */}
      {parityByPartyData.length > 0 && (
        <section className="py-8">
          <ParityChart data={parityByPartyData} title="Par parti politique" />
        </section>
      )}

      {/* Par taille de commune */}
      {paritySizeData.length > 0 && (
        <section className="py-8 border-t">
          <ParityChart data={paritySizeData} title="Par taille de commune" />
        </section>
      )}

      {/* Champions de la parité */}
      {outliers.best.length > 0 && (
        <section className="py-8 border-t">
          <h2 className="text-xl font-bold mb-2">Les champions de la parité</h2>
          <p className="text-muted-foreground mb-6">
            Les listes les plus proches de la parité parfaite (50/50)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {outliers.best.map((list, i) => {
              const femalePct = Math.round(list.femaleRate * 100);
              const malePct = 100 - femalePct;
              return (
                <Card key={`${list.communeId}-${list.listName}-${i}`}>
                  <CardContent className="pt-5">
                    <p className="font-semibold" title={list.listName}>
                      {list.listName}
                    </p>
                    <Link
                      href={`/elections/municipales-2026/communes/${list.communeId}`}
                      prefetch={false}
                      className="text-sm text-primary hover:underline"
                    >
                      {list.communeName} ({list.departmentCode})
                    </Link>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{femalePct}% femmes</span>
                        <span>{malePct}% hommes</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden flex bg-muted">
                        <div
                          className="bg-pink-500 transition-all"
                          style={{ width: `${femalePct}%` }}
                        />
                        <div
                          className="bg-blue-500 transition-all"
                          style={{ width: `${malePct}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {list.candidateCount} candidats
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Listes les moins paritaires */}
      {outliers.worst.length > 0 && (
        <section className="py-8 border-t">
          <h2 className="text-xl font-bold mb-2">Les listes les moins paritaires</h2>
          <p className="text-muted-foreground mb-6">
            Les listes les plus éloignées de la parité (au moins 10 candidats)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {outliers.worst.map((list, i) => {
              const femalePct = Math.round(list.femaleRate * 100);
              const malePct = 100 - femalePct;
              return (
                <Card key={`${list.communeId}-${list.listName}-${i}`}>
                  <CardContent className="pt-5">
                    <p className="font-semibold" title={list.listName}>
                      {list.listName}
                    </p>
                    <Link
                      href={`/elections/municipales-2026/communes/${list.communeId}`}
                      prefetch={false}
                      className="text-sm text-primary hover:underline"
                    >
                      {list.communeName} ({list.departmentCode})
                    </Link>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{femalePct}% femmes</span>
                        <span>{malePct}% hommes</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden flex bg-muted">
                        <div
                          className="bg-pink-500 transition-all"
                          style={{ width: `${femalePct}%` }}
                        />
                        <div
                          className="bg-blue-500 transition-all"
                          style={{ width: `${malePct}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {list.candidateCount} candidats
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
