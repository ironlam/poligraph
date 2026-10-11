import Link from "next/link";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { NavIconBar } from "./NavIconBar";
import { ElectionSpotlightMenu, type ElectionSpotlightLink } from "./ElectionSpotlightMenu";
import { NAV_PRIMARY, NAV_TOOLS, filterNavItems } from "@/config/navigation";
import {
  BarChart3,
  Users,
  Scale,
  Vote,
  Landmark,
  BookOpen,
  Compass,
  MapPin,
  SearchCheck,
} from "lucide-react";
import { getEnabledFlags } from "@/lib/feature-flags";
import { getPastElectionSlugs } from "@/lib/data/elections";
import { getElectionSpotlight } from "@/lib/data/election-spotlight";
import type { LucideIcon } from "lucide-react";

const PRIMARY_ICONS: Record<string, LucideIcon> = {
  barChart: BarChart3,
  users: Users,
  scale: Scale,
  vote: Vote,
  landmark: Landmark,
  bookOpen: BookOpen,
  compass: Compass,
  mapPin: MapPin,
  searchCheck: SearchCheck,
};

export async function Header() {
  const [enabledFlags, pastElectionSlugs, spotlight] = await Promise.all([
    getEnabledFlags(),
    getPastElectionSlugs(),
    getElectionSpotlight(),
  ]);

  const filteredPrimary = filterNavItems(NAV_PRIMARY, enabledFlags).filter(
    (item) => !item.mobileOnly
  );

  const spotlightLinks: ElectionSpotlightLink[] = [
    ...(enabledFlags.has("PROGRAMMES_ENABLED")
      ? [
          {
            href: "/programmes",
            label: "Programmes",
            description: "Programmes des partis par thème",
          },
        ]
      : []),
    { href: "/elections", label: "Toutes les élections" },
  ];

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
          <Link
            href="/"
            aria-label="Poligraph, accueil"
            className="mr-4 flex shrink-0 items-center gap-3 group"
          >
            <Logo
              size={40}
              withWordmark
              // Between lg and xl the six sections and the election pill need the room; the mark
              // stays, and the link keeps its accessible name.
              wordmarkClassName="lg:max-xl:hidden"
              priority
              className="group-hover:scale-105 transition-transform duration-300"
            />
          </Link>

          {/* Desktop navigation - flat links, no dropdowns */}
          <nav
            className="hidden lg:flex items-center gap-0.5 xl:gap-1"
            aria-label="Navigation principale"
          >
            {filteredPrimary.map((item) => {
              const Icon = item.icon ? PRIMARY_ICONS[item.icon] : null;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    item.highlight
                      ? "flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm font-semibold rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                      : "flex items-center gap-1 whitespace-nowrap px-1 py-2 text-xs font-semibold min-[1100px]:text-[13px] xl:gap-1.5 xl:px-2.5 xl:text-sm text-foreground/80 hover:text-primary rounded-lg hover:bg-muted/50 transition-colors"
                  }
                >
                  {Icon && <Icon className="h-3.5 w-3.5 xl:h-4 xl:w-4" aria-hidden="true" />}
                  {item.label}
                </Link>
              );
            })}

            {spotlight && (
              <div className="ml-1.5">
                <ElectionSpotlightMenu
                  election={{
                    href: spotlight.href,
                    label: spotlight.label,
                    description: spotlight.description,
                  }}
                  links={spotlightLinks}
                />
              </div>
            )}

            {/* Separator between nav and tools */}
            <div className="hidden h-6 w-px bg-border mx-1.5 xl:block" aria-hidden="true" />

            {/* Icon tool rail (search + theme toggle + boussole) */}
            <NavIconBar
              tools={filteredTools}
              boussoleEnabled={enabledFlags.has("BOUSSOLE_ENABLED")}
            />
          </nav>

          {/* Mobile navigation */}
          <MobileMenu
            enabledFlags={[...enabledFlags]}
            pastElectionSlugs={pastElectionSlugs}
            spotlightSlug={spotlight?.slug ?? null}
          />
        </div>
      </div>
    </header>
  );
}
