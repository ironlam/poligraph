import { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CommuneSearch } from "@/components/elections/municipales/CommuneSearch";
import { ElectionParticipationCard } from "@/components/elections/ElectionParticipationCard";
import { getMunicipales2020Stats, getMunicipales2020Rounds } from "@/lib/data/elections";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Municipales 2020 — Résultats",
  description:
    "Résultats des élections municipales 2020 : participation, listes élues, résultats commune par commune.",
  alternates: { canonical: "/elections/municipales-2020" },
};

export default async function Municipales2020Page() {
  const [stats, rounds] = await Promise.all([
    getMunicipales2020Stats(),
    getMunicipales2020Rounds(),
  ]);

  return (
    <main id="main-content" className="container mx-auto px-4 pt-4 max-w-6xl">
      <Breadcrumb
        items={[{ label: "Élections", href: "/elections" }, { label: "Municipales 2020" }]}
      />

      {/* Hero */}
      <section className="py-4">
        <div className="mb-3">
          <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight">
            Municipales 2020
          </h1>
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 mt-1">
            Résultats définitifs
          </Badge>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Résultats complets des élections municipales de 2020. Scrutin marqué par la crise
          sanitaire du Covid-19, avec un 1er tour le 15 mars et un 2nd tour reporté au 28 juin.
        </p>
      </section>

      {/* Participation */}
      {rounds.length > 0 && (
        <section className="py-8">
          <h2 className="text-xl font-bold mb-4">Participation nationale</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rounds.map((round) => (
              <ElectionParticipationCard key={round.round} round={round} />
            ))}
          </div>
        </section>
      )}

      {/* Key stats */}
      {stats && (
        <section className="py-8">
          <h2 className="text-xl font-bold mb-4">En chiffres</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 text-center">
                <p className="text-2xl font-bold tabular-nums">
                  {stats.totalCandidacies.toLocaleString("fr-FR")}
                </p>
                <p className="text-sm text-muted-foreground">candidatures</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <p className="text-2xl font-bold tabular-nums">
                  {stats.totalCommunes.toLocaleString("fr-FR")}
                </p>
                <p className="text-sm text-muted-foreground">communes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <p className="text-2xl font-bold tabular-nums">
                  {stats.totalLists.toLocaleString("fr-FR")}
                </p>
                <p className="text-sm text-muted-foreground">listes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <p className="text-2xl font-bold tabular-nums">
                  {stats.electedMayorsCount.toLocaleString("fr-FR")}
                </p>
                <p className="text-sm text-muted-foreground">maires élus</p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Commune search */}
      <section className="py-8">
        <CommuneSearch basePath="/elections/municipales-2020" label="Résultats dans ma commune" />
      </section>

      {/* Comparison link */}
      <section className="py-8">
        <Link href="/elections/municipales-2026" prefetch={false}>
          <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20 hover:shadow-sm transition-shadow">
            <CardContent className="pt-5 flex items-center gap-4">
              <div>
                <p className="font-semibold">Comparez avec les Municipales 2026</p>
                <p className="text-sm text-muted-foreground">
                  Découvrez les candidats et listes pour les prochaines élections municipales.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>
    </main>
  );
}
