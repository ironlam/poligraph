import Link from "next/link";
import { Collapsible } from "@/components/territoires/CommuneSections";
import { dateCourte } from "@/components/territoires/FilTerritoire";
import { getJuridictionFinanciere, RAPPORT_CRC_REPONSE } from "@/config/juridictions-financieres";
import type { FilEvenement } from "@/lib/data/territoire-fil";
import { phraseEvenement } from "@/lib/territoires/evenements";
import { TERRITOIRES_METHODE_RAPPORTS_CRC_PATH } from "@/lib/territoires/paths";

/** Reports shown before the rest folds. */
export const RAPPORTS_CRC_VISIBLES = 3;

function Rapport({ r }: { r: FilEvenement }) {
  return (
    <li className="pt-3 first:pt-0">
      <time dateTime={r.date} className="text-xs font-semibold tabular-nums text-muted-foreground">
        {dateCourte(r.date)}
      </time>
      <p className="text-sm font-medium">{phraseEvenement(r.evenement)}</p>
      <a
        href={r.source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center text-sm underline underline-offset-2 hover:text-primary"
      >
        Lire le rapport sur ccomptes.fr
        <span className="sr-only"> (publié le {dateCourte(r.date)}, nouvel onglet)</span>
      </a>
    </li>
  );
}

/**
 * « Rapports de la chambre régionale des comptes » under the accounts of a collectivity
 * (Territoires v2, lot C). One sentence per report, rendered by template, with the link to the
 * official report and the fixed notice that the collectivity can answer. No summary, no
 * appraisal, no count. Renders nothing while no report is published.
 */
export function RapportsCrc({ rapports }: { rapports: FilEvenement[] }) {
  if (rapports.length === 0) return null;
  const territoriale = rapports.every(
    (r) =>
      r.evenement.type === "RAPPORT_CRC" &&
      getJuridictionFinanciere(r.evenement.juridictionId)?.type === "CTC"
  );
  const visibles = rapports.slice(0, RAPPORTS_CRC_VISIBLES);
  const replies = rapports.slice(RAPPORTS_CRC_VISIBLES);
  return (
    <section aria-labelledby="rapports-crc" className="rounded-2xl border bg-card p-5">
      <h2 id="rapports-crc" className="font-display text-lg font-bold text-primary">
        Rapports de la chambre {territoriale ? "territoriale" : "régionale"} des comptes
      </h2>
      <ul className="mt-3 divide-y divide-border">
        {visibles.map((r) => (
          <Rapport key={r.id} r={r} />
        ))}
      </ul>
      {replies.length > 0 && (
        <div className="mt-3">
          <Collapsible
            summary={
              replies.length === 1
                ? "Un rapport plus ancien"
                : `${replies.length} rapports plus anciens`
            }
          >
            <ul className="divide-y divide-border">
              {replies.map((r) => (
                <Rapport key={r.id} r={r} />
              ))}
            </ul>
          </Collapsible>
        </div>
      )}
      <p className="mt-3 text-sm text-muted-foreground">{RAPPORT_CRC_REPONSE}</p>
      <Link
        href={TERRITOIRES_METHODE_RAPPORTS_CRC_PATH}
        prefetch={false}
        className="inline-flex min-h-11 items-center text-sm underline underline-offset-2 hover:text-primary"
      >
        Comment ces rapports sont repris
      </Link>
    </section>
  );
}
