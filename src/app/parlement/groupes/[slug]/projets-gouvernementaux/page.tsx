import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { GOVERNMENT_PROJECT_EXCLUSION_LABELS } from "@/config/labels";
import { ROUTES } from "@/config/routes";
import {
  getGovernmentProjectPositionsForGroup,
  type GovernmentProjectPositionRow,
} from "@/lib/data/government-project-positions";
import { getGroupeDetail } from "@/lib/data/groupes";
import { missingEntityMetadata } from "@/lib/seo/not-found-metadata";

export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const group = await getGroupeDetail(slug);
  if (!group || group.chamber !== "AN" || group.code === "NI") {
    return missingEntityMetadata("Groupe non trouvé");
  }
  return {
    title: "Projets gouvernementaux : " + group.name,
    description:
      "Scrutins retenus et exclus pour les positions de " +
      group.name +
      " sur les projets gouvernementaux.",
    alternates: { canonical: ROUTES.groupeGovernmentProjects(slug) },
  };
}

function ScrutinRow({ row }: { row: GovernmentProjectPositionRow }) {
  const date = row.scrutin.votingDate.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
  const title = row.scrutin.slug ? (
    <Link
      href={ROUTES.voteDetail(row.scrutin.slug)}
      prefetch={false}
      className="inline-flex min-h-11 items-center font-medium hover:underline"
    >
      {row.scrutin.title}
    </Link>
  ) : (
    <span className="font-medium">{row.scrutin.title}</span>
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{date}</p>
            <p className="mt-1 text-sm">{title}</p>
          </div>
          {row.position ? (
            <Badge variant="outline">{row.position}</Badge>
          ) : (
            <Badge variant="outline">Exclu</Badge>
          )}
        </div>

        {row.position && (
          <p className="mt-3 text-xs text-muted-foreground">
            POUR : {row.forCount}, ABSTENTION : {row.abstainCount}, CONTRE : {row.againstCount}
          </p>
        )}
        {row.exclusion && (
          <p className="mt-3 text-sm text-muted-foreground">
            Motif : {GOVERNMENT_PROJECT_EXCLUSION_LABELS[row.exclusion]}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {row.dossier?.slug && (
            <Link
              href={ROUTES.dossierDetail(row.dossier.slug)}
              prefetch={false}
              className="inline-flex min-h-11 items-center text-primary hover:underline"
            >
              Dossier législatif
            </Link>
          )}
          {row.scrutin.sourceUrl && (
            <a
              href={row.scrutin.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Voir le scrutin sur le site de l’Assemblée nationale, nouvelle fenêtre"
              className="inline-flex min-h-11 items-center text-primary hover:underline"
            >
              Source Assemblée nationale
            </a>
          )}
          <span className="text-muted-foreground">
            Type officiel : {row.scrutin.codeTypeVote ?? "non renseigné"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function GovernmentProjectsPage({ params }: PageProps) {
  const { slug } = await params;
  const group = await getGroupeDetail(slug);
  if (!group || group.chamber !== "AN" || group.code === "NI") notFound();

  const data = await getGovernmentProjectPositionsForGroup(group.code);
  if (!data) notFound();
  const retained = data.rows.filter((row) => row.position !== null);
  const excluded = data.rows.filter((row) => row.position === null);

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <Breadcrumb
        items={[
          { label: "Parlement", href: ROUTES.parlement },
          { label: "Groupes", href: ROUTES.groupes },
          { label: group.name, href: ROUTES.groupeDetail(slug) },
          { label: "Projets gouvernementaux" },
        ]}
      />

      <h1 className="text-3xl font-display font-extrabold tracking-tight">
        Positions sur les projets gouvernementaux
      </h1>
      <p className="mt-2 text-muted-foreground">{group.name}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        Chaque ligne correspond à un vote sur l{"'"}ensemble d{"'"}un projet de loi d{"'"}origine
        gouvernementale. Plusieurs lectures du même projet comptent séparément. Le type officiel du
        scrutin, dont SPS, est affiché mais ne filtre pas la liste.
      </p>
      <p className="mt-2 text-sm">
        <Link
          href={ROUTES.governmentProjectsMethodology}
          className="inline-flex min-h-11 items-center text-primary hover:underline"
        >
          Lire la méthodologie complète
        </Link>
      </p>

      <section className="mt-8" aria-labelledby="retained-title">
        <h2 id="retained-title" className="text-xl font-semibold">
          Positions retenues ({retained.length})
        </h2>
        <div className="mt-4 space-y-3">
          {retained.length > 0 ? (
            retained.map((row) => <ScrutinRow key={row.scrutin.externalId} row={row} />)
          ) : (
            <p className="text-sm text-muted-foreground">Aucune position calculable.</p>
          )}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="excluded-title">
        <h2 id="excluded-title" className="text-xl font-semibold">
          Scrutins écartés ({excluded.length})
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ces scrutins candidats ne contribuent à aucune des trois parts affichées.
        </p>
        <div className="mt-4 space-y-3">
          {excluded.map((row) => (
            <ScrutinRow key={row.scrutin.externalId} row={row} />
          ))}
        </div>
      </section>
    </main>
  );
}
