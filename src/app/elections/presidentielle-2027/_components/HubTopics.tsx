import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { FeaturedSubtopic } from "@/lib/data/themes-index";
import { cn } from "@/lib/utils";

/** Compact browse entry points inspired by documentary collections, with one stable visual weight. */
export function HubTopics({ subtopics }: { subtopics: FeaturedSubtopic[] }) {
  if (subtopics.length === 0) return null;

  return (
    <section aria-labelledby="hub-sous-themes" className="space-y-4">
      <div className="space-y-1.5">
        <h2
          id="hub-sous-themes"
          className="font-display text-xl font-bold tracking-tight md:text-2xl"
        >
          Explorer un sujet précis
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Accédez directement aux sous-thèmes validés dans les mesures publiées.
        </p>
      </div>

      <ul className="flex flex-wrap gap-2">
        {subtopics.map((subtopic) => (
          <li key={subtopic.slug}>
            <Link
              href={{
                pathname: "/elections/presidentielle-2027/recherche",
                query: { "sous-theme": subtopic.slug },
              }}
              prefetch={false}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-auto min-h-11 rounded-full px-4 py-2 text-left"
              )}
            >
              <span className="flex flex-col leading-tight">
                <span className="font-semibold">{subtopic.label}</span>
                <span className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                  {subtopic.themeLabel}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
