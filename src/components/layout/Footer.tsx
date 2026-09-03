import Link from "next/link";
import { FOOTER_SECTIONS, DATA_SOURCES, RSS_FEEDS, SOCIAL_LINKS } from "@/config/navigation";
import { ExternalLink, Instagram, Github, Rss } from "lucide-react";
import { HexPattern } from "@/components/ui/HexPattern";
import { getEnabledFlags } from "@/lib/feature-flags";

export async function Footer() {
  const enabledFlags = await getEnabledFlags();

  // Filter footer links gated behind disabled feature flags
  const filteredSections = FOOTER_SECTIONS.map((section) => ({
    ...section,
    links: section.links.filter((link) => !link.featureFlag || enabledFlags.has(link.featureFlag)),
  })).filter((section) => section.links.length > 0);

  return (
    <footer role="contentinfo" className="relative overflow-hidden border-t bg-muted/30 mt-auto">
      <HexPattern className="absolute inset-0 text-primary opacity-[0.02] dark:opacity-[0.04] pointer-events-none" />
      <div className="relative z-10 container mx-auto px-4 py-8 md:py-10">
        {/* Main footer content */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-8 mb-8">
          {/* About */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <h3 className="font-display font-semibold text-sm mb-3">À propos</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Observatoire citoyen de la vie politique. Données publiques, fact-checking et regard
              indépendant.
            </p>
          </div>

          {/* Navigation sections (5 columns) */}
          {filteredSections.map((section) => (
            <nav key={section.title} aria-labelledby={`footer-nav-${section.title}`}>
              <h3
                id={`footer-nav-${section.title}`}
                // `brand-on-surface`, not `brand`: measured on the footer surface in dark, the base
                // token gives 4.21:1 at 14px, below AA. See globals.css.
                className={`font-display font-semibold text-sm mb-3 ${
                  section.highlight ? "text-brand-on-surface" : ""
                }`}
              >
                {section.title}
              </h3>
              <ul className="space-y-2 text-sm">
                {section.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${link.label} (s'ouvre dans un nouvel onglet)`}
                        className="text-muted-foreground hover:text-foreground transition-colors nav-link-underline inline-flex items-center gap-1"
                      >
                        {link.label}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        prefetch={false}
                        className="text-muted-foreground hover:text-foreground transition-colors nav-link-underline"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* Data Sources + RSS */}
          <div>
            <h3 className="font-display font-semibold text-sm mb-3">Sources</h3>
            <ul className="space-y-2 text-sm">
              {DATA_SOURCES.map((source) => (
                <li key={source.href}>
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    {source.label}
                    <ExternalLink className="h-3 w-3" />
                    <span className="sr-only">(ouvre un nouvel onglet)</span>
                  </a>
                </li>
              ))}
            </ul>

            {/* RSS Feeds */}
            <h4 className="font-display font-semibold text-sm mt-4 mb-2 flex items-center gap-1.5">
              <Rss className="h-3.5 w-3.5 text-orange-500" />
              Flux RSS
            </h4>
            <ul className="space-y-2 text-sm">
              {RSS_FEEDS.map((feed) => (
                <li key={feed.href}>
                  <a
                    href={feed.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {feed.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Legal disclaimers */}
        <div className="pt-6 border-t mb-6">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span
                className="text-amber-600 dark:text-amber-400 mt-px shrink-0"
                aria-hidden="true"
              >
                &#x2696;
              </span>
              La présomption d&apos;innocence s&apos;applique à toute personne mentionnée dans le
              cadre d&apos;une procédure judiciaire en cours.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary/60 mt-px shrink-0" aria-hidden="true">
                &#x26A0;
              </span>
              Les données présentées peuvent être incomplètes. L&apos;absence d&apos;information ne
              préjuge pas de la réalité.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary/60 mt-px shrink-0" aria-hidden="true">
                &#x2699;
              </span>
              Certains résumés sont générés automatiquement à partir de sources publiques.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary/60 mt-px shrink-0" aria-hidden="true">
                &#x2139;
              </span>
              Ce site est un outil d&apos;information citoyenne et ne constitue pas une source
              juridique.
            </li>
          </ul>
        </div>

        {/* Bottom bar */}
        <div className="pt-4 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              >
                <SocialIcon icon={link.icon} />
                <span className="sr-only">{link.label} (ouvre un nouvel onglet)</span>
              </a>
            ))}
          </div>
          <a
            href="https://github.com/ironlam/poligraph/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Signaler une erreur
            <span className="sr-only">(ouvre un nouvel onglet)</span>
          </a>
        </div>
      </div>
    </footer>
  );
}

function SocialIcon({ icon }: { icon: "x" | "bluesky" | "instagram" | "github" }) {
  const cls = "w-5 h-5";
  switch (icon) {
    case "x":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={cls} aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "bluesky":
      return (
        <svg viewBox="0 0 360 320" fill="currentColor" className={cls} aria-hidden="true">
          <path d="M180 141.964C163.699 110.262 119.308 51.1817 78.0347 22.044C38.4971-5.86834 23.414-1.03207 13.526 3.43594C2.08093 8.60755 0 26.1785 0 36.5164C0 46.8542 5.66748 121.272 9.36416 133.694C21.1014 178.38 53.7537 190.958 83.8013 186.269C78.04 187.065 46.4735 192.304 23.3596 225.469C-5.33722 266.626 52.2181 312.597 80.5765 278.729C100.076 255.206 117.158 225.469 126.354 209.867C130.017 203.593 132.968 198.757 134.544 196.049C138.036 190.147 157.11 155.42 180 141.964Z" />
          <path d="M180 141.964C196.301 110.262 240.692 51.1817 281.965 22.044C321.503-5.86834 336.586-1.03207 346.474 3.43594C357.919 8.60755 360 26.1785 360 36.5164C360 46.8542 354.333 121.272 350.636 133.694C338.899 178.38 306.246 190.958 276.199 186.269C281.96 187.065 313.527 192.304 336.64 225.469C365.337 266.626 307.782 312.597 279.424 278.729C259.924 255.206 242.842 225.469 233.646 209.867C229.983 203.593 227.032 198.757 225.456 196.049C221.964 190.147 202.89 155.42 180 141.964Z" />
        </svg>
      );
    case "instagram":
      return <Instagram className={cls} aria-hidden="true" />;
    case "github":
      return <Github className={cls} aria-hidden="true" />;
  }
}
