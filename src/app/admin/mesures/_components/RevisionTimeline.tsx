import {
  MEASURE_EXTRACTION_METHOD_LABELS,
  MEASURE_PRECISION_LABELS,
  MEASURE_REJECTION_REASON_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  QUALIFICATION_KIND_LABELS,
  SOURCE_TIER_LABELS,
} from "@/config/labels";
import type { getMeasureForModeration } from "@/lib/data/measures";
import { EvidenceSnapshotPanel } from "./EvidenceSnapshotPanel";
import { ReviewReadinessPanel } from "./ReviewReadinessPanel";

type ModerationMeasure = NonNullable<Awaited<ReturnType<typeof getMeasureForModeration>>>;
type ModerationRevision = ModerationMeasure["revisions"][number];

/**
 * Every revision of the measure, drafts and discarded ones included.
 *
 * The moderation read applies no filter, and this component shows all of it: a screen that
 * only listed the published revision would make the editorial history invisible, which is the
 * one thing versioning was introduced for.
 */

const CHIP = "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium";

function dateOf(formatter: Intl.DateTimeFormat, value: Date | null): string {
  return value === null ? "non" : formatter.format(value);
}

function RevisionCard({
  revision,
  isPublished,
  isLatest,
  formatter,
  documentLabel,
}: {
  revision: ModerationRevision;
  isPublished: boolean;
  isLatest: boolean;
  formatter: Intl.DateTimeFormat;
  documentLabel: string | null;
}) {
  const state = revision.rejectedAt
    ? "Rejetée"
    : revision.discardedAt
      ? "Abandonnée"
      : revision.supersededAt
        ? "Remplacée"
        : revision.publishedAt
          ? "Publiée"
          : revision.reviewedAt
            ? "Relue, non publiée"
            : "Brouillon";

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${CHIP} bg-muted text-muted-foreground border-border`}>{state}</span>
        {isPublished && (
          <span
            className={`${CHIP} border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300`}
          >
            Révision désignée comme publiée
          </span>
        )}
        {isLatest && (
          <span
            className={`${CHIP} border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300`}
          >
            Dernière révision
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Identifiant de révision : <code className="select-all font-mono">{revision.id}</code>
      </p>

      {revision.reviewReadiness !== null && (
        <div className="mt-3">
          <ReviewReadinessPanel
            readiness={revision.reviewReadiness}
            warnings={revision.reviewWarnings}
          />
        </div>
      )}

      {revision.rejectedAt !== null && revision.rejectionReason !== null && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <p className="font-medium">
            Rejet humain : {MEASURE_REJECTION_REASON_LABELS[revision.rejectionReason]}
          </p>
          <p className="mt-1 text-xs">
            {formatter.format(revision.rejectedAt)}
            {revision.rejectedBy !== null && ` · ${revision.rejectedBy}`}
          </p>
          {revision.rejectionDetail !== null && <p className="mt-2">{revision.rejectionDetail}</p>}
        </div>
      )}

      <EvidenceSnapshotPanel
        formulation={revision.text}
        classification={revision.precision === "OBJECTIF_SANS_CHIFFRE" ? "OBJECTIVE" : "MEASURE"}
        snapshotValue={revision.evidenceSnapshot}
        documentLabel={documentLabel}
      />

      {revision.details !== null && (
        <div className="mt-3 rounded border border-border bg-muted/30 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Détails documentés
          </h4>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{revision.details}</p>
        </div>
      )}

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="flex gap-1">
          <dt className="font-medium">En vigueur au</dt>
          <dd>{formatter.format(revision.validFrom)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-medium">Précision</dt>
          <dd>
            {revision.precision === null
              ? "non qualifiée"
              : MEASURE_PRECISION_LABELS[revision.precision]}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-medium">Extraction</dt>
          <dd>
            {MEASURE_EXTRACTION_METHOD_LABELS[revision.extractionMethod]}
            {revision.extractionConfidence !== null &&
              ` · confiance ${revision.extractionConfidence.toFixed(2)}`}
            {revision.extractorVersion !== null && ` · ${revision.extractorVersion}`}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-medium">Relue</dt>
          <dd>
            {dateOf(formatter, revision.reviewedAt)}
            {revision.reviewedBy !== null && ` · ${revision.reviewedBy}`}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-medium">Publiée</dt>
          <dd>{dateOf(formatter, revision.publishedAt)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-medium">Remplacée</dt>
          <dd>{dateOf(formatter, revision.supersededAt)}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {revision.sources.length === 1 ? "1 source" : `${revision.sources.length} sources`}
        </h4>
        {revision.sources.length === 0 ? (
          <p className="mt-1 text-xs text-red-700 dark:text-red-400">
            Aucune source : cette révision ne peut pas être publiée.
          </p>
        ) : (
          <ul className="mt-1 space-y-1 text-xs">
            {revision.sources.map((source) => (
              <li key={source.id}>
                <a
                  href={source.url}
                  className="text-primary underline break-all"
                  rel="noreferrer"
                  target="_blank"
                >
                  {MEASURE_SOURCE_KIND_LABELS[source.sourceKind]}
                </a>
                <span className="text-muted-foreground">
                  {" "}
                  · {SOURCE_TIER_LABELS[source.tier]} · {formatter.format(source.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {revision.qualifications.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Qualifications
          </h4>
          <ul className="mt-1 space-y-1 text-xs">
            {revision.qualifications.map((qualification) => (
              <li key={qualification.id}>
                <span className="font-medium">{QUALIFICATION_KIND_LABELS[qualification.kind]}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatter.format(qualification.assessedAt)} · {qualification.assessedBy}
                </span>
                <p className="text-muted-foreground">{qualification.rationale}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {revision.assessments.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Évaluations de similarité
          </h4>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {revision.assessments.map((assessment) => (
              <li key={assessment.id}>
                {assessment.conclusion} · corpus {assessment.comparedCorpusVersion} ·{" "}
                {formatter.format(assessment.assessedAt)} ·{" "}
                {assessment.matches.length === 1
                  ? "1 rapprochement"
                  : `${assessment.matches.length} rapprochements`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function RevisionTimeline({
  revisions,
  publishedRevisionId,
  latestRevisionId,
  documentLabel,
}: {
  revisions: ModerationRevision[];
  publishedRevisionId: string | null;
  latestRevisionId: string | null;
  documentLabel: string | null;
}) {
  const formatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

  if (revisions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Cette mesure n&apos;a aucune révision. Rien n&apos;a encore été saisi.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {revisions.map((revision) => (
        <RevisionCard
          key={revision.id}
          revision={revision}
          isPublished={revision.id === publishedRevisionId}
          isLatest={revision.id === latestRevisionId}
          formatter={formatter}
          documentLabel={documentLabel}
        />
      ))}
    </ol>
  );
}
