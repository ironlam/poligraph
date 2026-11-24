import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { UserSearch, Vote, Scale, Landmark, MapPin, LocateFixed, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TERRITOIRES_PATH } from "@/lib/territoires/paths";

interface IntentCard {
  title: string;
  /** One line at 360px: the six cards have to fit on a phone's first screen. */
  description: string;
  href: string;
  icon: LucideIcon;
  /** The one card that speaks of the coming deadline. Accented, and only ever one. */
  accent?: boolean;
}

interface HomeIntentGridProps {
  enabledFlags: Set<string>;
  /**
   * Whole days before the first round of the presidential election, shown as a J-N pill on its
   * card. Null or past: no pill.
   */
  daysToPresidentialRound1?: number | null;
}

export function HomeIntentGrid({
  enabledFlags,
  daysToPresidentialRound1 = null,
}: HomeIntentGridProps) {
  const cards: IntentCard[] = [
    {
      // First while the campaign runs: this card is the only reminder of the election on the page.
      title: "Je veux comparer les candidats à la présidentielle 2027",
      description: "Programmes et votes par sujet",
      href: "/elections/presidentielle-2027",
      icon: Landmark,
      accent: true,
    },
    {
      title: "Je veux vérifier un élu",
      description: "Parcours, mandats, votes, affaires",
      href: "/politiques",
      icon: UserSearch,
    },
    {
      title: "Je veux comprendre un vote",
      description: "Assemblée et Sénat, qui a voté quoi",
      href: "/parlement/votes",
      icon: Vote,
    },
    {
      title: "Je veux comprendre la politique de ma ville",
      description: "Ma commune, ses élus, son département",
      href: TERRITOIRES_PATH,
      icon: MapPin,
    },
    {
      title: "Je veux trouver mon député",
      description: "Par code postal ou géolocalisation",
      href: "/mon-depute",
      icon: LocateFixed,
    },
    {
      title: "Je veux comparer les partis",
      description: "Leurs membres et leurs positions",
      href: enabledFlags.has("COMPARISON_TOOL") ? "/comparer" : "/partis",
      icon: Scale,
    },
  ];

  const showCountdown = daysToPresidentialRound1 !== null && daysToPresidentialRound1 > 0;

  return (
    <section>
      <h2 className="mb-2 text-lg font-display font-bold sm:mb-4">Que cherchez-vous ?</h2>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href + card.title} href={card.href} prefetch={false}>
              <Card
                // No outer padding: on a phone the six entries then fit on one screen.
                className={`group h-full cursor-pointer transition-all hover:shadow-md py-0 sm:hover:-translate-y-0.5 ${
                  card.accent ? "ring-1 ring-brand/25" : ""
                }`}
              >
                <CardContent className="flex items-center gap-3 px-3 py-1.5 sm:items-start sm:p-4">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      card.accent ? "bg-brand/12 text-brand" : "bg-primary/10 text-primary"
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-tight">{card.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {card.description}
                      {/* On the description line: beside the title it cost the title a third line
                          at 360px. */}
                      {card.accent && showCountdown && (
                        <span className="rounded-full bg-brand/12 px-2 font-display font-bold text-brand-on-surface">
                          J-{daysToPresidentialRound1}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                    aria-hidden="true"
                  />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
