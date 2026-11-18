import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ROUTES } from "@/config/routes";
import { getVoteArchiveMonths } from "@/lib/data/vote-archives";
import { formatArchiveMonth, voteArchiveMonthPath } from "@/lib/votes/vote-archive";

export const metadata: Metadata = {
  title: "Archives des votes parlementaires, mois par mois",
  description:
    "Tous les scrutins publics de l'Assemblée nationale et du Sénat depuis 2022, classés par mois. Chaque mois donne accès aux journées de vote et aux scrutins sur les textes.",
  alternates: { canonical: ROUTES.voteArchives },
};

export default async function VoteArchivesPage() {
  const months = await getVoteArchiveMonths();
  const years = [...new Set(months.map((m) => m.year))];

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumb
        items={[
          { label: "Parlement", href: "/parlement" },
          { label: "Votes", href: "/parlement/votes" },
          { label: "Archives" },
        ]}
      />
      <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">
        Archives des votes
      </h1>
      <p className="text-muted-foreground mb-8 max-w-2xl">
        Les scrutins publics de l{"'"}Assemblée nationale et du Sénat, mois par mois. Un mois liste
        ses journées de vote et les scrutins portant sur un texte.
      </p>

      {years.map((year) => (
        <section key={year} className="mb-8">
          <h2 className="text-xl font-display font-bold mb-3">{year}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {months
              .filter((m) => m.year === year)
              .map((m) => (
                <li key={m.month}>
                  <Link
                    href={voteArchiveMonthPath(m)}
                    prefetch={false}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-medium first-letter:uppercase">
                      {formatArchiveMonth(m)}
                    </span>
                    <span className="text-muted-foreground">
                      {m.scrutins.toLocaleString("fr-FR")} scrutin{m.scrutins > 1 ? "s" : ""}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
