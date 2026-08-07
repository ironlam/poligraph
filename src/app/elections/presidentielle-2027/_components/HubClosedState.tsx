import Link from "next/link";
import { PUBLICATION_GATES } from "@/config/publication-gates";

/**
 * The hub below its own gate.
 *
 * `hubPublishable` drove only `robots: noindex`, so a reader landing on the page saw the entry
 * cards and the field with nothing saying that no comparison is open yet. The state is now written
 * on the page, not only in a meta tag.
 *
 * It adds a block and hides nothing: the field, the provenance and the route to the themes index
 * all stay. The index is legitimate while closed, since it shows the coverage of each subject and
 * what is missing.
 */
export function HubClosedState({
  verifiedMeasureCount,
  themeCount,
}: {
  verifiedMeasureCount: number;
  themeCount: number;
}) {
  const required = PUBLICATION_GATES.pageSujet.minCandidaciesWithVerifiedMeasure;

  return (
    <section
      aria-labelledby="hub-closed"
      className="rounded-lg border border-border bg-muted/40 p-4"
    >
      <h2 id="hub-closed" className="text-base font-semibold">
        Les comparaisons ne sont pas encore ouvertes
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        {verifiedMeasureCount === 0
          ? "Aucune mesure vérifiée n'est encore publiée."
          : `${verifiedMeasureCount} ${verifiedMeasureCount === 1 ? "mesure vérifiée" : "mesures vérifiées"} à ce jour.`}{" "}
        Un sujet s&apos;ouvre à la comparaison quand {required} candidatures y portent une mesure
        vérifiée, et aucun des {themeCount} sujets n&apos;atteint ce seuil.{" "}
        <Link
          href="/elections/presidentielle-2027/sujets"
          className="underline underline-offset-2 hover:text-foreground"
        >
          L&apos;index des sujets
        </Link>{" "}
        montre, pour chacun, ce qui manque.
      </p>
    </section>
  );
}
