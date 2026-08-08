import Link from "next/link";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { NavIconBar } from "./NavIconBar";
import { NAV_PRIMARY, NAV_TOOLS } from "@/config/navigation";
import { BarChart3, Users, Scale, Vote, Landmark, BookOpen, Compass } from "lucide-react";
import { getEnabledFlags } from "@/lib/feature-flags";
import { getPastElectionSlugs } from "@/lib/data/elections";
import type { LucideIcon } from "lucide-react";

const PRIMARY_ICONS: Record<string, LucideIcon> = {
  barChart: BarChart3,
  users: Users,
  scale: Scale,
  vote: Vote,
  landmark: Landmark,
  bookOpen: BookOpen,
  compass: Compass,
};

export async function Header() {
  const [enabledFlags, pastElectionSlugs] = await Promise.all([
    getEnabledFlags(),
    getPastElectionSlugs(),
  ]);

  const filteredPrimary = NAV_PRIMARY.filter(
    (item) => !item.featureFlag || enabledFlags.has(item.featureFlag)
  );

  const filteredTools = NAV_TOOLS.filter(
    (item) => !item.featureFlag || enabledFlags.has(item.featureFlag)
  );

  return (
    <header
      role="banner"
      className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60"
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" aria-label="Poligraph, accueil" className="flex items-center gap-3 group">
            <Logo
              size={40}
              withWordmark
              priority
              className="group-hover:scale-105 transition-transform duration-300"
            />
          </Link>

          {/* Desktop navigation - flat links, no dropdowns */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Navigation principale">
            {filteredPrimary.map((item) => {
              const Icon = item.icon ? PRIMARY_ICONS[item.icon] : null;
              // Shorten "Municipales 2026" to "Municipales" for desktop space
              const displayLabel = item.label.startsWith("Municipales")
                ? "Municipales"
                : item.label;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    item.highlight
                      ? "flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                      : "flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-foreground/80 hover:text-primary rounded-lg hover:bg-muted/50 transition-colors"
                  }
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {displayLabel}
                </Link>
              );
            })}

            {/* Separator between nav and tools */}
            <div className="h-6 w-px bg-border mx-1.5" aria-hidden="true" />

            {/* Icon tool rail (search + theme toggle + boussole) */}
            <NavIconBar
              tools={filteredTools}
              boussoleEnabled={enabledFlags.has("BOUSSOLE_ENABLED")}
            />
          </nav>

          {/* Mobile navigation */}
          <MobileMenu enabledFlags={[...enabledFlags]} pastElectionSlugs={pastElectionSlugs} />
        </div>
      </div>
    </header>
  );
}
