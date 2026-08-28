import Link from "next/link";
import type { SubjectPageData } from "@/lib/data/subject-page";
import { formatDate } from "@/lib/utils";

/**
 * The closed state of a subject page (spec §4.1): what is missing to compare, laid out as
 * distinct counters rather than a single placeholder sentence. The two `ProgramEdition`-backed
 * counters are out of scope here and render "—" with an explicit note, never a misleading zero.
 */

/**
 * `covered` (candidacies with a verified measure, published-extension only) is not a subset of
 * `total` (sourced candidacies of the election, extension not required): nothing forces the
 * source fields to publish an extension. So the ratio can exceed 100 %, which this clamps, and
 * at a zero denominator this renders "—" like the ProgramEdition counters beside it, never a
 * misleading "0 %".
 */
function formatCoverageRate(covered: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.min(100, Math.round((covered / total) * 100))} %`;
}

export function SubjectGate({ data }: { data: SubjectPageData }) {
  // "révision" and not "mesure extraite": the counter is on the active revision, and a revision
  // can be a correction to a measure that is already published. Saying "extraite" would also claim
  // an extraction step that the number does not attest.
  const revisionWord = data.pendingReviewRevisionCount === 1 ? "révision" : "révisions";

  return (
    <section
      aria-labelledby="gate-heading"
      className="rounded-lg border border-border bg-muted/40 p-4"
    >
      <h2 id="gate-heading" className="text-base font-bold">
        Comparaison pas encore disponible sur ce thème
      </h2>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        <p className="text-foreground">Ce qui manque pour comparer</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt>Candidatures avec mesure vérifiée</dt>
            <dd className="text-foreground">
              {data.candidaciesWithVerifiedMeasure} sur{" "}
              {data.requiredCandidaciesWithVerifiedMeasure} requises
            </dd>
          </div>
          <div>
            <dt>Taux de couverture</dt>
            <dd className="text-foreground">
              {formatCoverageRate(
                data.candidaciesWithVerifiedMeasure,
                data.totalSourcedCandidacies
              )}
            </dd>
          </div>
          <div>
            <dt>Révisions en attente de relecture</dt>
            <dd className="text-foreground">
              {data.pendingReviewRevisionCount} {revisionWord}
            </dd>
          </div>
          <div>
            <dt>Dernière revue publique</dt>
            <dd className="text-foreground">
              {data.lastReviewedAt !== null ? formatDate(data.lastReviewedAt) : "jamais relu"}
            </dd>
          </div>
          <div>
            <dt>Éditions de programme ne couvrant pas ce thème</dt>
            <dd className="text-foreground">Non calculable</dd>
          </div>
          <div>
            <dt>Candidatures sans programme publié</dt>
            <dd className="text-foreground">Non calculable</dd>
          </div>
        </dl>
        <p className="text-xs">
          Ces deux compteurs restent non calculables tant que le suivi des programmes publiés
          n&apos;est pas disponible.
        </p>
      </div>
      {data.fallbackPublishableTheme !== null && (
        <p className="mt-4 text-sm">
          Un thème est comparable aujourd&apos;hui :{" "}
          <Link
            href={`/elections/presidentielle-2027/themes/${data.fallbackPublishableTheme.slug}`}
            className="underline"
          >
            {data.fallbackPublishableTheme.label}
          </Link>
        </p>
      )}
    </section>
  );
}
