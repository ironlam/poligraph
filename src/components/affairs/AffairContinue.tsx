import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * "Poursuivre" — the reading continuation at the end of an affair page, three
 * tiles in place of the former stacked "← …" footer links. Its arrows point
 * forward (lateral journeys), never back: the only "←" on the page is the return.
 */
interface AffairContinueProps {
  politicianSlug: string;
  politicianName: string;
  affairCount: number;
  party: { name: string; shortName: string; slug: string | null } | null;
  partyAffairCount: number | null;
}

interface Tile {
  eyebrow: string;
  title: string;
  subtitle: string;
  href: string;
}

export function AffairContinue({
  politicianSlug,
  politicianName,
  affairCount,
  party,
  partyAffairCount,
}: AffairContinueProps) {
  const tiles: Tile[] = [
    {
      eyebrow: "La personne suivie",
      title: politicianName,
      subtitle:
        affairCount > 1
          ? `Ses ${affairCount} affaires, mandats et votes`
          : "Mandats, votes et patrimoine",
      href: `/politiques/${politicianSlug}`,
    },
  ];

  if (party?.slug) {
    tiles.push({
      eyebrow: "Le parti",
      title: party.name,
      subtitle:
        partyAffairCount && partyAffairCount > 0
          ? `${partyAffairCount.toLocaleString("fr-FR")} affaire${partyAffairCount > 1 ? "s" : ""} documentée${partyAffairCount > 1 ? "s" : ""}`
          : "Affaires du parti",
      href: `/affaires/parti/${party.slug}`,
    });
  }

  tiles.push({
    eyebrow: "Méthode",
    title: "Comment nous qualifions",
    subtitle: "Statuts, certitude et sources",
    href: "/methodologie",
  });

  return (
    <section className="mt-8" aria-labelledby="poursuivre-heading">
      <h2 id="poursuivre-heading" className="mb-3 text-lg font-semibold">
        Poursuivre
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="group flex min-h-11 flex-col gap-1 rounded-xl border bg-card p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tile.eyebrow}
            </span>
            <span className="flex items-center gap-1 font-semibold text-foreground">
              <span className="min-w-0 truncate">{tile.title}</span>
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
            <span className="text-sm text-muted-foreground">{tile.subtitle}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
