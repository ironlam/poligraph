import Link from "next/link";
import { ReportLink } from "@/components/feedback/ReportLink";
import { FOOTER_SECTIONS, DATA_SOURCES, RSS_FEEDS, SOCIAL_LINKS } from "@/config/navigation";
import { ExternalLink, Rss } from "lucide-react";
import { SocialIcon } from "./SocialIcon";
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
          <ReportLink className="text-xs text-muted-foreground hover:text-foreground transition-colors" />
        </div>
      </div>
    </footer>
  );
}
