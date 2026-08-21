import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";

/**
 * Three entry points into the hub. The third, "Suivi et questions", is deliberately not a
 * link: there is nothing behind it yet, and pointing it at /sujets would pass off the themes
 * index as a substitute for a feature that doesn't exist (arbitrage #13). It keeps the same
 * accent border as its siblings but no call to action, and signals its inactive state through
 * muted text and the "À venir" label, never through opacity.
 *
 * The mockup treats mobile and desktop as different layouts, not one reflowed grid: a compact
 * row (border-left accent, ~72 px, chevron) below md, a tall card (border-top accent,
 * description, call-to-action link) at md and above. Both render in the DOM; only one is
 * visible at a given width.
 */
export function HubEntryCards({ summary }: { summary: string }) {
  return (
    <>
      <div className="flex flex-col gap-3 md:hidden">
        <Link href="/elections/presidentielle-2027/sujets" prefetch={false}>
          <Card className="min-h-[72px] flex-row items-center gap-3 border-l-4 border-l-primary p-4 transition-colors hover:bg-muted/40">
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold leading-tight">
                Explorer les propositions par thème
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Comparez les propositions déjà publiées, sujet par sujet.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Card>
        </Link>

        <Link href="/elections/presidentielle-2027/candidats" prefetch={false}>
          <Card className="min-h-[72px] flex-row items-center gap-3 border-l-4 border-l-brand p-4 transition-colors hover:bg-muted/40">
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold leading-tight">
                Voir les candidatures et personnalités suivies
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{summary}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Card>
        </Link>
      </div>

      <div className="hidden gap-5 md:grid md:grid-cols-2">
        <Link href="/elections/presidentielle-2027/sujets" prefetch={false} className="group">
          <Card className="h-full min-h-[200px] cursor-pointer border-t-4 border-t-primary transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="flex h-full flex-col gap-3">
              <h3 className="font-display text-xl font-bold tracking-tight">
                Explorer les propositions par thème
              </h3>
              <p className="flex-1 text-sm text-muted-foreground">
                Comparez les propositions déjà publiées, sujet par sujet.
              </p>
              <span className="text-sm font-semibold text-primary group-hover:underline">
                Explorer les thèmes →
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/elections/presidentielle-2027/candidats" prefetch={false} className="group">
          <Card className="h-full min-h-[200px] cursor-pointer border-t-4 border-t-brand transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="flex h-full flex-col gap-3">
              <h3 className="font-display text-xl font-bold tracking-tight">
                Voir les candidatures et personnalités suivies
              </h3>
              <p className="flex-1 text-sm text-muted-foreground">{summary}</p>
              <span className="text-sm font-semibold text-primary group-hover:underline">
                Ouvrir l&apos;annuaire →
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}
