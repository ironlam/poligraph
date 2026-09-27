import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ElectedSenator } from "@/lib/senatoriales/results-summary";

const STATUS_LABEL: Record<"reelected" | "newcomer", Record<"F" | "M", string>> = {
  reelected: { F: "Réélue", M: "Réélu" },
  newcomer: { F: "Nouvelle", M: "Nouveau" },
};

/**
 * People elected on 27 September, one list per constituency.
 *
 * The nuance is the Ministry's label, printed as text and never as a colour: a colour per
 * nuance would rank or group people by a classification the reader cannot check here.
 * No badge for someone not yet linked to a record, since "new" would be a claim we have
 * not established; no badge either when the civility is unknown, rather than a default
 * gender.
 */
export function ElectedByConstituency({
  elected,
  grouped = true,
}: {
  elected: ElectedSenator[];
  /** False when the caller already names the single constituency shown. */
  grouped?: boolean;
}) {
  const groups = new Map<string, ElectedSenator[]>();
  for (const person of elected) {
    const list = groups.get(person.constituencyCode) ?? [];
    list.push(person);
    groups.set(person.constituencyCode, list);
  }

  return (
    <div className={grouped ? "grid gap-4 sm:grid-cols-2" : undefined}>
      {[...groups.entries()].map(([code, people]) => (
        <div key={code} className={grouped ? "rounded-xl border border-border p-4" : undefined}>
          {grouped && <h3 className="font-semibold">{people[0]!.constituencyName}</h3>}
          <ul className={grouped ? "mt-2 space-y-2" : "space-y-2"}>
            {people.map((person) => {
              const badge =
                person.status !== "unresolved" && person.gender
                  ? STATUS_LABEL[person.status][person.gender]
                  : null;
              return (
                <li key={person.name}>
                  <div className="flex flex-wrap items-center gap-x-3">
                    {person.politicianSlug ? (
                      <Link
                        href={`/politiques/${person.politicianSlug}`}
                        className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                      >
                        {person.name}
                      </Link>
                    ) : (
                      <span className="inline-flex min-h-11 items-center font-medium">
                        {person.name}
                      </span>
                    )}
                    {badge && (
                      <Badge variant="outline" className="text-xs">
                        {badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {person.nuanceLabel ?? "Nuance non renseignée"}
                    {person.round === 2 ? " · élu au second tour" : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
