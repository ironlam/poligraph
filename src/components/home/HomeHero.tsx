import { FOLLOW_LINKS } from "@/config/navigation";
import { SocialIcon } from "@/components/layout/SocialIcon";
import { HomeHeroSearch } from "./HomeHeroSearch";

export function HomeHero() {
  return (
    <section className="flex items-end justify-between gap-8">
      <div className="min-w-0 flex-1 space-y-3 sm:space-y-5">
        <div className="space-y-3">
          <h1 className="text-2xl font-display font-bold tracking-tight md:text-4xl">
            Comprendre la vie politique française par les faits
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground max-sm:sr-only md:text-base">
            Poligraph vous aide à explorer les représentants politiques, leurs votes, les affaires
            judiciaires documentées, les fact-checks et les données publiques.
          </p>
        </div>

        <div className="max-w-xl">
          <HomeHeroSearch />
        </div>
      </div>

      {/* From lg up only: below it the same accounts sit in the menu, one tap from the tab bar. */}
      <nav aria-labelledby="home-follow-title" className="hidden shrink-0 lg:block">
        <h2 id="home-follow-title" className="mb-2 text-right text-xs text-muted-foreground">
          Suivre Poligraph
        </h2>
        <ul className="flex gap-2">
          {FOLLOW_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.label} (s'ouvre dans un nouvel onglet)`}
                title={link.label}
                className="flex h-11 w-11 items-center justify-center rounded-xl border bg-card text-foreground/80 outline-none transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                <SocialIcon icon={link.icon} />
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
