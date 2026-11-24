import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ROUTES } from "@/config/routes";
import { ScrutinLinkList } from "@/components/votes/ScrutinLinkList";
import { getVoteArchiveMonth, getVoteArchiveMonths } from "@/lib/data/vote-archives";
import { formatDateFrUTC } from "@/lib/utils";
import {
  formatArchiveMonth,
  parseArchiveMonth,
  voteArchiveMonthPath,
} from "@/lib/votes/vote-archive";

interface PageProps {
  params: Promise<{ annee: string; mois: string }>;
}

// Rendered on first request, then cached: the data functions are tagged "votes" and the route
// reads no searchParams.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { annee, mois } = await params;
  const month = parseArchiveMonth(annee, mois);
  if (!month) return {};
  const label = formatArchiveMonth(month);
  return {
    title: `Votes parlementaires de ${label}`,
    description: `Les scrutins publics de l'Assemblée nationale et du Sénat de ${label}, jour par jour : journées de vote, scrutins sur les textes et nombre d'amendements mis aux voix.`,
    alternates: { canonical: voteArchiveMonthPath(month) },
  };
}

export default async function VoteArchiveMonthPage({ params }: PageProps) {
  const { annee, mois } = await params;
  const month = parseArchiveMonth(annee, mois);
  if (!month) notFound();

  const [days, months] = await Promise.all([getVoteArchiveMonth(month), getVoteArchiveMonths()]);
  if (days.length === 0) notFound();

  // `months` is sorted most recent first: the previous month in time is the next row.
  const index = months.findIndex((m) => m.year === month.year && m.month === month.month);
  const newer = index > 0 ? months[index - 1] : undefined;
  const older = index >= 0 ? months[index + 1] : undefined;

  const label = formatArchiveMonth(month);
  const total = days.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumb
        items={[
          { label: "Parlement", href: "/parlement" },
          { label: "Votes", href: "/parlement/votes" },
          { label: "Archives", href: ROUTES.voteArchives },
          { label },
        ]}
      />
      <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">Votes de {label}</h1>
      <p className="text-muted-foreground mb-6">
        {total.toLocaleString("fr-FR")} scrutin{total > 1 ? "s" : ""} sur {days.length} journée
        {days.length > 1 ? "s" : ""} de vote.
      </p>

      <nav aria-label="Mois voisins" className="mb-8 flex flex-wrap justify-between gap-2 text-sm">
        {older ? (
          <Link
            href={voteArchiveMonthPath(older)}
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-muted-foreground hover:bg-muted/50 hover:text-foreground first-letter:uppercase"
          >
            ← {formatArchiveMonth(older)}
          </Link>
        ) : (
          <span />
        )}
        {newer && (
          <Link
            href={voteArchiveMonthPath(newer)}
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            {formatArchiveMonth(newer)} →
          </Link>
        )}
      </nav>

      {days.map((day) => (
        <section key={day.date} className="mb-8">
          <h2 className="text-lg font-semibold">
            <Link
              href={`/parlement/votes/${day.date}`}
              prefetch={false}
              className="inline-flex min-h-11 items-center hover:text-primary hover:underline"
            >
              {formatDateFrUTC(day.date)}
            </Link>
          </h2>
          <p className="text-sm text-muted-foreground">
            {day.total.toLocaleString("fr-FR")} scrutin{day.total > 1 ? "s" : ""}
            {day.amendments > 0 &&
              `, dont ${day.amendments.toLocaleString("fr-FR")} sur ${
                day.amendments > 1 ? "des amendements" : "un amendement"
              }`}
          </p>
          {day.texts.length > 0 && <ScrutinLinkList items={day.texts} />}
        </section>
      ))}
    </div>
  );
}
