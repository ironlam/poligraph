import Link from "next/link";

export interface TerritoireOnglet {
  /** One word: the tabs share one line down to 320 px, without horizontal scroll. */
  label: string;
  /** Anchor of the page ("#elections") or path of a sub-page. */
  href: string;
}

const TAB =
  "flex min-h-11 min-w-11 items-center justify-center px-1 text-center text-xs font-bold text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:text-sm";

/**
 * Tabs of a Territoires page: one line of links that sticks under the site header. Server
 * component without client state, so no tab is marked as the one being read.
 */
export function TerritoireOnglets({ onglets }: { onglets: TerritoireOnglet[] }) {
  return (
    <nav aria-label="Sections de la page" className="sticky top-16 z-40 border-b bg-background">
      {/* Each tab takes its label plus an equal share of the free space: a long word
          ("Départements") must fit at 320 px beside three short ones. */}
      <ul className="container mx-auto flex max-w-6xl sm:px-4">
        {onglets.map((onglet) => (
          <li key={onglet.href} className="flex-auto">
            {onglet.href.startsWith("#") ? (
              <a href={onglet.href} className={TAB}>
                {onglet.label}
              </a>
            ) : (
              <Link href={onglet.href} prefetch={false} className={TAB}>
                {onglet.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
