import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { UserSearch, Vote, Scale, Landmark, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface IntentCard {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** The one card that speaks of the coming deadline. Accented, and only ever one. */
  accent?: boolean;
}

interface HomeIntentGridProps {
  enabledFlags: Set<string>;
}

export function HomeIntentGrid({ enabledFlags }: HomeIntentGridProps) {
  const cards: IntentCard[] = [
    {
      title: "Je veux vérifier un élu",
      description: "Parcours, mandats, votes et affaires documentées d'un représentant.",
      href: "/politiques",
      icon: UserSearch,
    },
    {
      title: "Je veux comprendre un vote",
      description: "Le détail des scrutins à l'Assemblée et au Sénat, et qui a voté quoi.",
      href: "/parlement/votes",
      icon: Vote,
    },
    {
      title: "Je veux comparer les partis",
      description: "Les partis, leurs membres et leurs positions.",
      href: enabledFlags.has("COMPARISON_TOOL") ? "/comparer" : "/partis",
      icon: Scale,
    },
    {
      title: "Je veux comparer les candidats à 2027",
      description: "Programmes, votes et bilans mis côte à côte, sujet par sujet.",
      href: "/elections/presidentielle-2027",
      icon: Landmark,
      // Replaces "suivre les municipales", which pointed at a completed election. Aims at the
      // task, not at the event. The municipales pages stay reachable from the navigation, which
      // still gates them on the MUNICIPALES_2026 flag.
      accent: true,
    },
  ];

  return (
    <section>
      <h2 className="mb-4 text-lg font-display font-bold">Que cherchez-vous ?</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href + card.title} href={card.href} prefetch={false}>
              <Card
                className={`group h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  card.accent ? "ring-1 ring-brand/25" : ""
                }`}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      card.accent ? "bg-brand/12 text-brand" : "bg-primary/10 text-primary"
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-tight">{card.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{card.description}</div>
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
