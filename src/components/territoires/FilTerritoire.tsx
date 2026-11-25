import { RAPPORT_CRC_REPONSE } from "@/config/juridictions-financieres";
import type { FilEvenement } from "@/lib/data/territoire-fil";
import { phraseEvenement } from "@/lib/territoires/evenements";
import { SECTION_TITRE, SECTION } from "@/components/territoires/classes";

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
    <section aria-labelledby="fil-territoire" className={SECTION}>
      <h2 id="fil-territoire" className={SECTION_TITRE}>
        Dernières nouvelles
      </h2>
      <ul className="mt-3 divide-y divide-border">
        {evenements.slice(0, 3).map((e) => (
          <li key={e.id} className="pt-3 first:pt-0">
            <time
              dateTime={e.date}
              className="inline-block rounded-md bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground"
            >
              {dateCourte(e.date)}
            </time>
            <p className="mt-1 text-sm font-medium">{phraseEvenement(e.evenement)}</p>
            {e.evenement.type === "RAPPORT_CRC" && (
              <p className="text-xs text-muted-foreground">{RAPPORT_CRC_REPONSE}</p>
            )}
            <a
              href={e.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center text-[0.75rem] text-muted-foreground hover:text-primary"
            >
              <span>
                Source :{" "}
                <span className="underline decoration-dotted underline-offset-2">
                  {e.source.label}
                </span>
                <span className="sr-only"> (nouvel onglet)</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
