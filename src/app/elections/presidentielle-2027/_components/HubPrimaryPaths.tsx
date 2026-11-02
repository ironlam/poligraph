import Link from "next/link";
import { ArrowRight, Columns2, LayoutGrid, Users, type LucideIcon } from "lucide-react";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import type { HubCandidacy } from "@/lib/data/hub";
import { matchesPublishedProposals } from "@/lib/presidentielle/candidacy-filters";

const BASE_PATH = "/elections/presidentielle-2027";

type Path = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tile: string;
  showsFaces: boolean;
};

/**
 * Every running candidacy, never a selection: the field arrives sorted by name, and showing only
 * the first faces would promote them. Withdrawn candidacies stay out, they no longer run.
 */
function RunningFaces({ candidacies }: { candidacies: HubCandidacy[] }) {
  const running = candidacies.filter((candidacy) => candidacy.status !== "RETIRE");
  if (running.length === 0) return null;
  return (
    <span className="mt-3 block">
      <span aria-hidden="true" className="flex flex-wrap gap-1">
        {running.map((candidacy) => (
          <PoliticianAvatar
            key={candidacy.id}
            photoUrl={candidacy.photoUrl}
            blobPhotoUrl={candidacy.blobPhotoUrl}
            fullName={candidacy.candidateName}
            size="sm"
            fixedPx={28}
            className="h-7 w-7 text-[10px]"
          />
        ))}
      </span>
      <span className="mt-1.5 block text-[11.5px] text-muted-foreground">
        Candidatures en cours, par ordre alphabétique
      </span>
    </span>
  );
}

export function HubPrimaryPaths({
  candidacies,
  themeCount,
}: {
  candidacies: HubCandidacy[];
  themeCount: number;
}) {
  const publishedTotal = candidacies.filter((candidacy) =>
    matchesPublishedProposals(candidacy, true)
  ).length;

  const paths: Path[] = [
    {
      title: "Voir les candidats",
      description: `${publishedTotal} ${publishedTotal === 1 ? "a déjà" : "ont déjà"} des propositions publiées, sur ${candidacies.length} ${candidacies.length === 1 ? "candidature suivie" : "candidatures suivies"}.`,
      href: `${BASE_PATH}/candidats`,
      icon: Users,
      tile: "bg-primary/10 text-primary",
      showsFaces: true,
    },
    {
      title: "Explorer les thèmes",
      description: `${themeCount} thèmes pour parcourir les mesures publiées.`,
      href: `${BASE_PATH}/themes`,
      icon: LayoutGrid,
      tile: "bg-brand/10 text-brand-on-surface",
      showsFaces: false,
    },
    {
      title: "Comparer deux candidats",
      description: "Leurs mesures publiées, thème par thème et sans classement.",
      href: `${BASE_PATH}/comparer`,
      icon: Columns2,
      tile: "bg-success text-success-foreground",
      showsFaces: false,
    },
  ];

  return (
    <nav aria-labelledby="hub-primary-paths-title">
      <h2 id="hub-primary-paths-title" className="font-display text-xl font-bold md:text-2xl">
        Explorer la présidentielle
      </h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-3">
        {paths.map((path) => {
          const Icon = path.icon;
          return (
            <li key={path.href}>
              <Link
                href={path.href}
                prefetch={false}
                className="flex h-full min-h-20 items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${path.tile}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-bold">{path.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {path.description}
                  </span>
                  {path.showsFaces && <RunningFaces candidacies={candidacies} />}
                </span>
                <ArrowRight aria-hidden="true" className="mt-3 h-5 w-5 shrink-0 text-primary" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
