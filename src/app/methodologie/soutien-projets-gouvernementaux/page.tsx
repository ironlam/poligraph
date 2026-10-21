import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ASSEMBLY_ORGANE_REFS_SOURCE_URL } from "@/config/parliamentaryGroups";
import { ROUTES } from "@/config/routes";

export const metadata: Metadata = {
  title: "Positions sur les projets gouvernementaux",
  description:
    "Périmètre, calcul et limites des parts de pour, d’abstention et de contre des groupes de députés.",
  alternates: { canonical: ROUTES.governmentProjectsMethodology },
};

export default function GovernmentProjectsMethodologyPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 pt-4 pb-12">
      <Breadcrumb
        items={[
          { label: "Méthodologie", href: "/methodologie" },
          { label: "Projets gouvernementaux" },
        ]}
      />
      <h1 className="text-3xl font-display font-extrabold tracking-tight">
        Positions sur les projets gouvernementaux
      </h1>
      <p className="mt-3 text-muted-foreground">
        Cet indicateur décrit séparément la part des positions POUR, ABSTENTION et CONTRE de chaque
        groupe de l{"'"}Assemblée nationale. Ces trois parts ne sont pas fusionnées en un score.
      </p>

      <section className="mt-10" aria-labelledby="scope-title">
        <h2 id="scope-title" className="text-xl font-semibold">
          Scrutins retenus
        </h2>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>
            Le périmètre comprend les votes portant sur l{"'"}ensemble d{"'"}un projet de loi dont l
            {"'"}origine gouvernementale est établie par le dossier législatif officiel. Chaque
            lecture constitue une observation distincte, y compris lorsqu{"'"}un même projet est
            voté plusieurs fois.
          </p>
          <p>
            Le code de procédure du scrutin, par exemple SPS pour un scrutin public solennel, reste
            affiché comme information. Il ne sert pas de filtre : SPS décrit une procédure, pas l
            {"'"}objet du vote.
          </p>
          <p>
            Sont exclus les propositions de loi parlementaires, les amendements, les articles, les
            parties de texte, les motions et les rattachements de dossier qui ne peuvent pas être
            confirmés par une référence officielle.
          </p>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="calculation-title">
        <h2 id="calculation-title" className="text-xl font-semibold">
          Position du groupe et calcul
        </h2>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>
            Pour chaque scrutin, Poligraph utilise la ventilation officielle du groupe à la date du
            vote. La position retenue est celle qui obtient strictement le plus de voix parmi POUR,
            ABSTENTION et CONTRE. Les non-votants et absents ne définissent pas une position.
          </p>
          <p>
            Une égalité au maximum ne permet pas de choisir une position : le scrutin est alors
            écarté pour ce groupe. Il est aussi écarté si les décomptes sont absents, incomplets,
            ambigus ou incompatibles avec les totaux officiels.
          </p>
          <div className="rounded-lg border p-4 text-foreground">
            <p>Part POUR = positions POUR / positions déterminées</p>
            <p className="mt-1">Part ABSTENTION = positions ABSTENTION / positions déterminées</p>
            <p className="mt-1">Part CONTRE = positions CONTRE / positions déterminées</p>
          </div>
          <p>
            Les trois parts partagent donc le même dénominateur. L{"'"}abstention reste visible,
            mais elle n{"'"}est pas comptée comme un soutien au Gouvernement.
          </p>
          <p>
            En 17e législature, le corpus ne comprend actuellement que quelques dizaines de scrutins
            candidats. Les parts reposent donc sur quelques dizaines d{"'"}observations au plus par
            groupe, avec un nombre retenu qui varie selon les références disponibles, les données
            incomplètes et les égalités écartées. Chaque lecture d{"'"}un même projet compte comme
            un scrutin distinct. Les non-inscrits sont exclus, car ils ne forment pas un groupe
            parlementaire.
          </p>
          <p>
            La position dominante est calculée par PoliGraph à partir des décomptes officiels par
            groupe. Elle ne constitue pas une position ou une consigne officielle du groupe.
          </p>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="excluded-title">
        <h2 id="excluded-title" className="text-xl font-semibold">
          49.3, motions de censure et soutien indirect
        </h2>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>
            Le recours à l{"'"}article 49, alinéa 3 de la Constitution et les motions de censure
            restent hors périmètre : ils ne constituent pas un vote sur l{"'"}ensemble du texte.
          </p>
          <p>
            Cette première version ne calcule pas de soutien indirect décisif. Elle ne cherche pas à
            simuler le résultat qu{"'"}aurait produit un vote différent du groupe. Une abstention
            peut faciliter une adoption sans exprimer une approbation politique, raison pour
            laquelle elle reste une catégorie autonome.
          </p>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="sources-title">
        <h2 id="sources-title" className="text-xl font-semibold">
          Sources et traçabilité
        </h2>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>
            Les scrutins, les ventilations par groupe, les identifiants d{"'"}organes et les
            dossiers proviennent des données ouvertes officielles de l{"'"}Assemblée nationale. Les
            références sont conservées afin de relier chaque valeur à son scrutin et à son dossier.
          </p>
          <p>
            Les périodes de validité des organes viennent de l{"'"}archive historique officielle des
            acteurs, mandats et organes de l{"'"}Assemblée nationale (AMO30).
          </p>
          <p>
            <a
              href="https://data.assemblee-nationale.fr/travaux-parlementaires/votes"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Données officielles des votes de l’Assemblée nationale, nouvelle fenêtre"
              className="inline-flex min-h-11 items-center text-primary hover:underline"
            >
              Données officielles des scrutins
            </a>
            {" · "}
            <a
              href="https://data.assemblee-nationale.fr/travaux-parlementaires/dossiers-legislatifs"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Données officielles des dossiers législatifs, nouvelle fenêtre"
              className="inline-flex min-h-11 items-center text-primary hover:underline"
            >
              Données officielles des dossiers
            </a>
            {" · "}
            <a
              href={ASSEMBLY_ORGANE_REFS_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Archive historique officielle des acteurs, mandats et organes de l’Assemblée nationale (AMO30), nouvelle fenêtre"
              className="inline-flex min-h-11 items-center text-primary hover:underline"
            >
              Archive historique des acteurs, mandats et organes (AMO30)
            </a>
          </p>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="limits-title">
        <h2 id="limits-title" className="text-xl font-semibold">
          Limite d{"'"}interprétation
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Un projet gouvernemental peut être amendé pendant son examen. Un vote POUR indique une
          position favorable à la version effectivement soumise au scrutin, sans prouver un accord
          avec toutes les positions défendues auparavant par le Gouvernement. L{"'"}indicateur
          décrit un comportement de vote, pas une intention.
        </p>
      </section>

      <p className="mt-10 text-sm">
        <Link
          href={ROUTES.groupes}
          className="inline-flex min-h-11 items-center text-primary hover:underline"
        >
          Consulter les groupes parlementaires
        </Link>
      </p>
    </main>
  );
}
