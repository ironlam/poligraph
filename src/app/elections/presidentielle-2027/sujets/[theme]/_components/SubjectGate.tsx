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
  const measureWord =
    data.pendingReviewMeasureCount === 1 ? "mesure extraite" : "mesures extraites";

  return (
    <section
      aria-labelledby="gate-heading"
      className="rounded-lg border border-border bg-muted/40 p-4"
    >
      <h2 id="gate-heading" className="text-base font-semibold">
        Comparaison pas encore disponible sur ce sujet
      </h2>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Ce qui manque pour comparer</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt>Candidatures avec mesure vérifiée</dt>
            <dd className="font-medium text-foreground">
              {data.candidaciesWithVerifiedMeasure} sur{" "}
              {data.requiredCandidaciesWithVerifiedMeasure} requises
            </dd>
          </div>
          <div>
            <dt>Taux de couverture</dt>
            <dd className="font-medium text-foreground">
              {formatCoverageRate(
                data.candidaciesWithVerifiedMeasure,
                data.totalSourcedCandidacies
              )}
            </dd>
          </div>
          <div>
            <dt>Relecture en attente</dt>
            <dd className="font-medium text-foreground">
              {data.pendingReviewMeasureCount} {measureWord} en attente de relecture
            </dd>
          </div>
          <div>
            <dt>Dernière revue publique</dt>
            <dd className="font-medium text-foreground">
              {data.lastReviewedAt !== null ? formatDate(data.lastReviewedAt) : "jamais relu"}
            </dd>
          </div>
          <div>
            <dt>Éditions de programme ne couvrant pas ce sujet</dt>
            <dd className="font-medium text-foreground">—</dd>
          </div>
          <div>
            <dt>Candidatures sans programme publié</dt>
            <dd className="font-medium text-foreground">—</dd>
          </div>
        </dl>
        <p className="text-xs">
          Donnée programme à venir : ces deux derniers compteurs dépendent des éditions de
          programme, pas encore disponibles.
        </p>
      </div>
      {data.fallbackPublishableTheme !== null && (
        <p className="mt-4 text-sm">
          Un sujet est comparable aujourd&apos;hui :{" "}
          <Link
            href={`/elections/presidentielle-2027/sujets/${data.fallbackPublishableTheme.slug}`}
            className="underline"
          >
            {data.fallbackPublishableTheme.label}
          </Link>
        </p>
      )}
    </section>
  );
}
