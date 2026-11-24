import { RAPPORT_CRC_REPONSE } from "@/config/juridictions-financieres";
import type { FilEvenement } from "@/lib/data/territoire-fil";
import { phraseEvenement } from "@/lib/territoires/evenements";

const MOIS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

/** "3 oct. 2026" from an ISO day. The year stays: the block has no time window. */
export function dateCourte(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day === 1 ? "1er" : day} ${MOIS[(month ?? 1) - 1]} ${year}`;
}

/**
 * « Dernières nouvelles » of a territory: three dated lines at most, each with its sentence
 * (rendered by template) and its source. Renders nothing while no event is published.
 */
export function FilTerritoire({ evenements }: { evenements: FilEvenement[] }) {
  if (evenements.length === 0) return null;
  return (
    <section aria-labelledby="fil-territoire" className="rounded-2xl border bg-card p-5">
      <h2 id="fil-territoire" className="font-display text-lg font-bold text-primary">
        Dernières nouvelles
      </h2>
      <ul className="mt-3 divide-y divide-border">
        {evenements.slice(0, 3).map((e) => (
          <li key={e.id} className="pt-3 first:pt-0">
            <time
              dateTime={e.date}
              className="text-xs font-semibold tabular-nums text-muted-foreground"
            >
              {dateCourte(e.date)}
            </time>
            <p className="text-sm font-medium">{phraseEvenement(e.evenement)}</p>
            {e.evenement.type === "RAPPORT_CRC" && (
              <p className="text-xs text-muted-foreground">{RAPPORT_CRC_REPONSE}</p>
            )}
            <a
              href={e.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center text-xs text-muted-foreground hover:text-primary"
            >
              <span>
                Source : <span className="underline underline-offset-2">{e.source.label}</span>
                <span className="sr-only"> (nouvel onglet)</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
