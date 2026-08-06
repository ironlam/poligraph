import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, ListChecks, Radio, UserSearch } from "lucide-react";

/**
 * Three entry points into the hub. The third, "Suivi et questions", is deliberately not a
 * link: there is nothing behind it yet, and pointing it at /sujets would pass off the themes
 * index as a substitute for a feature that doesn't exist (arbitrage #13). It stays a plain,
 * non-interactive card labelled "à venir".
 */
export function HubEntryCards() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Link href="/elections/presidentielle-2027/sujets" prefetch={false}>
        <Card className="group h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ListChecks className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-tight">Partir d&apos;un sujet</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Le logement, la santé, l&apos;environnement et les mesures documentées par thème.
              </div>
            </div>
            <ChevronRight
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
            />
          </CardContent>
        </Card>
      </Link>

      <a href="#candidatures">
        <Card className="group h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserSearch className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-tight">Chercher une personne</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Les candidatures sourcées, avec leur statut et leur origine.
              </div>
            </div>
            <ChevronRight
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
            />
          </CardContent>
        </Card>
      </a>

      <Card className="h-full border-dashed">
        <CardContent className="flex items-start gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Radio className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-tight">Suivi et questions</div>
            <div className="mt-0.5 text-xs text-muted-foreground">À venir.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
