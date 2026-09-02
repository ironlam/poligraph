import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HubCandidacy } from "@/lib/data/hub";
import { matchesPublishedProposals } from "@/lib/presidentielle/candidacy-filters";

const BASE_PATH = "/elections/presidentielle-2027";

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

  const paths = [
    {
      title: "Voir les candidats",
      description: `${publishedTotal} ${publishedTotal === 1 ? "a déjà" : "ont déjà"} des propositions publiées, sur ${candidacies.length} ${candidacies.length === 1 ? "candidature suivie" : "candidatures suivies"}.`,
      href: `${BASE_PATH}/candidats`,
    },
    {
      title: "Explorer les thèmes",
      description: `${themeCount} thèmes pour parcourir les mesures publiées.`,
      href: `${BASE_PATH}/themes`,
    },
    {
      title: "Comparer deux candidats",
      description: "Leurs mesures publiées, thème par thème et sans classement.",
      href: `${BASE_PATH}/comparer`,
    },
  ];

  return (
    <nav aria-labelledby="hub-primary-paths-title">
      <h2 id="hub-primary-paths-title" className="font-display text-xl font-bold md:text-2xl">
        Explorer la présidentielle
      </h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-3">
        {paths.map((path) => (
          <li key={path.href}>
            <Link
              href={path.href}
              prefetch={false}
              className="flex h-full min-h-20 items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/50 hover:bg-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span>
                <span className="block font-display font-bold">{path.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {path.description}
                </span>
              </span>
              <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
