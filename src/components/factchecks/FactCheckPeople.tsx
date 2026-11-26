import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface FactCheckPerson {
  slug: string;
  fullName: string;
  partyShortName: string | null;
  /**
   * The person's fact-check landing, set for a subject on a confirmed mention only. A rumour page
   * stays noindex: this visible link is what carries it to the person's page, where the demand is.
   */
  landingHref?: string | null;
}

interface FactCheckPeopleProps {
  people: FactCheckPerson[];
  /**
   * `claimant`: the people who made the checked statement. `subject`: people the fact-check names
   * without them being its author, rendered dashed and muted so the two never read alike.
   */
  variant: "claimant" | "subject";
}

export function FactCheckPeople({ people, variant }: FactCheckPeopleProps) {
  if (people.length === 0) return null;
  const plural = people.length > 1;
  const isClaimant = variant === "claimant";

  return (
    <div>
      <h2 className={cn("text-sm font-semibold mb-2", !isClaimant && "text-muted-foreground")}>
        {isClaimant
          ? `Auteur${plural ? "s" : ""} de la déclaration`
          : `Politicien${plural ? "s" : ""} concerné${plural ? "s" : ""}`}
      </h2>
      {!isClaimant && (
        <p className="text-xs text-muted-foreground mb-2">
          Mentionné{plural ? "s" : ""} dans ce fact-check, mais pas auteur{plural ? "s" : ""} de la
          déclaration vérifiée.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {people.map((person) => (
          <Link
            prefetch={false}
            key={person.slug}
            href={`/politiques/${person.slug}`}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 min-h-11 hover:bg-muted transition-colors",
              !isClaimant && "border-dashed"
            )}
          >
            <span className={cn("text-sm", isClaimant ? "font-medium" : "text-muted-foreground")}>
              {person.fullName}
            </span>
            {person.partyShortName && (
              <Badge variant="outline" className="text-xs">
                {person.partyShortName}
              </Badge>
            )}
          </Link>
        ))}
      </div>
      {!isClaimant && people.some((person) => person.landingHref) && (
        <ul className="mt-2">
          {people
            .filter((person) => person.landingHref)
            .map((person) => (
              <li key={person.slug}>
                <Link
                  prefetch={false}
                  href={person.landingHref!}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                >
                  Toutes les vérifications sur {person.fullName}
                </Link>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
