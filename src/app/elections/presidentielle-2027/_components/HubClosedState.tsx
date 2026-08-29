import { PUBLICATION_GATES } from "@/config/publication-gates";

/**
 * The hub below its own gate.
 *
 * `hubPublishable` drove only `robots: noindex`, so a reader landing on the page saw the entry
 * cards and the field with nothing saying that no comparison is open yet. The state is now written
 * on the page, not only in a meta tag.
 *
 * It adds a block and hides nothing. The coverage route remains available from the final corpus
 * state, where the hub consistently locates it whether comparisons are open or closed.
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
          ? "Aucune mesure n'est encore publiée."
          : `${verifiedMeasureCount} ${verifiedMeasureCount === 1 ? "mesure publiée" : "mesures publiées"} à ce jour.`}{" "}
        Une thématique s&apos;ouvre à la comparaison quand au moins {required} candidatures y
        portent une mesure sourcée et relue, et aucune des {themeCount} thématiques n&apos;atteint
        ce seuil.
      </p>
    </section>
  );
}
