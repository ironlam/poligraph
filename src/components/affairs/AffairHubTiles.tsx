import Link from "next/link";

interface AffairHubTilesProps {
  etabliCount: number;
}

interface HubTile {
  href: string;
  title: string;
  subtitle: string;
  accent: boolean;
  count?: number;
}

/**
 * Entry band above the /affaires listing: 3 tiles routing strong intents
 * (condamnations, statistics, victim-mode) away from the bare list.
 * Replaces the two easily-missed inline text links.
 */
export function AffairHubTiles({ etabliCount }: AffairHubTilesProps) {
  const tiles: HubTile[] = [
    {
      href: "/affaires/condamnations",
      title: "Condamnations définitives",
      subtitle: "Vue par mandat et par peine",
      accent: true,
      count: etabliCount,
    },
    {
      href: "/statistiques",
      title: "Taux de condamnation par parti",
      subtitle: "Comparer les partis politiques",
      accent: false,
    },
    {
      href: "/affaires?mode=victime",
      title: "Violences contre les élus",
      subtitle: "Affaires où l'élu est victime",
      accent: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {tiles.map((tile) => (
        <Link
          key={tile.href}
          href={tile.href}
          prefetch={false}
          className="flex min-h-[44px] flex-col justify-center gap-0.5 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {tile.accent && (
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-700 dark:bg-red-400"
              />
            )}
            {tile.title}
            {tile.count !== undefined && (
              <span className="text-red-700 dark:text-red-400">({tile.count})</span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">{tile.subtitle}</span>
        </Link>
      ))}
    </div>
  );
}
