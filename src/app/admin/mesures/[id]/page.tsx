import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CANDIDACY_STATUS_LABELS,
  CHAMBER_SHORT_LABELS,
  MEASURE_ATTRIBUTION_LABELS,
  MEASURE_VOTE_LINK_KIND_LABELS,
  MEASURE_VOTE_RELATION_LABELS,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import { isAuthenticated } from "@/lib/auth";
import { getMeasureForModeration, getPublicMeasure } from "@/lib/data/measures";
import { deriveModerationState, type ModerationMeasureRow } from "@/lib/measures/moderation-state";
import { readEvidenceSnapshot } from "@/lib/measures/evidence-snapshot";
import { hasContextAttemptForRevision } from "@/lib/measures/context-generation";
import { AnomalyList } from "../_components/AnomalyList";
import { MeasureActionPanel } from "../_components/MeasureActionPanel";
import { MeasureMetadataPanel } from "../_components/MeasureMetadataPanel";
import { MeasureSubtopicsPanel } from "../_components/MeasureSubtopicsPanel";
import { MeasureReaderGuidesPanel } from "../_components/MeasureReaderGuidesPanel";
import { ModerationStateBadge } from "../_components/ModerationStateBadge";
import { PublicVisibilityCard } from "../_components/PublicVisibilityCard";
import { RevisionTimeline } from "../_components/RevisionTimeline";
import { VoteLinkForm } from "../_components/VoteLinkForm";
import { availableActions, hasAmbiguousPointers } from "../_data/available-actions";
import { getMeasureContext, listReaderGuidesForModeration } from "../_data/detail-query";
import { getMeasureVoteLinksForModeration } from "../_data/vote-links-query";

export const metadata = {
  title: "Fiche de modération d'une mesure (admin) | Poligraph",
  robots: { index: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

type ModerationRead = NonNullable<Awaited<ReturnType<typeof getMeasureForModeration>>>;

/**
 * The moderation read carries the full source rows, so the source count is their length. The
 * shape is exhaustive by type, so adding a field to ModerationMeasureRow breaks this at compile
 * time rather than silently deriving from a missing value.
 */
function toRow(measure: ModerationRead): ModerationMeasureRow {
  return {
    id: measure.id,
    publicationStatus: measure.publicationStatus,
    latestRevisionId: measure.latestRevisionId,
    publishedRevisionId: measure.publishedRevisionId,
    withdrawnAt: measure.withdrawnAt,
    withdrawnSourceUrl: measure.withdrawnSourceUrl,
    withdrawnSourceLabel: measure.withdrawnSourceLabel,
    depublishedAt: measure.depublishedAt,
    depublicationReason: measure.depublicationReason,
    revisions: measure.revisions.map((revision) => ({
      id: revision.id,
      reviewedAt: revision.reviewedAt,
      publishedAt: revision.publishedAt,
      supersededAt: revision.supersededAt,
      discardedAt: revision.discardedAt,
      sourceCount: revision.sources.length,
    })),
  };
}

function shorten(text: string): string {
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

export default async function AdminMeasureDetailPage({ params }: PageProps) {
  if (!(await isAuthenticated())) redirect("/admin/login");

  const { id } = await params;

  // Three reads, three different questions: the moderation read applies no filter, the public
  // read applies both, and the context read carries who and which election.
  const [measure, context, publicMeasure, voteLinks, readerGuides] = await Promise.all([
    getMeasureForModeration(id),
    getMeasureContext(id),
    getPublicMeasure(id),
    getMeasureVoteLinksForModeration(id),
    listReaderGuidesForModeration(),
  ]);

  if (measure === null || context === null) notFound();

  const state = deriveModerationState(toRow(measure));
  const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

  // The published revision when there is one, the active draft otherwise. Same reference the
  // queue shows, so the two screens name the measure identically.
  const referenceRevisionId = measure.publishedRevisionId ?? measure.latestRevisionId;
  const referenceText =
    measure.revisions.find((revision) => revision.id === referenceRevisionId)?.text ?? null;

  const actions = availableActions({
    state,
    publishedRevisionId: measure.publishedRevisionId,
  });
  // The token comes from THIS read, the one that renders the forms below. Reading it again later
  // would defeat the point: it has to be the version the reviewer actually saw.
  const expectedUpdatedAt = measure.updatedAt.toISOString();
  const revisionTexts = Object.fromEntries(
    measure.revisions.map((revision) => [revision.id, revision.text])
  );
  const revisionDetails = Object.fromEntries(
    measure.revisions.map((revision) => [revision.id, revision.details])
  );
  const publishedRevision = measure.revisions.find(
    (revision) => revision.id === measure.publishedRevisionId
  );
  const publishedEvidence = readEvidenceSnapshot(publishedRevision?.evidenceSnapshot);
  const hasContextAttempt = await hasContextAttemptForRevision(measure.publishedRevisionId);
  const canGenerateContext =
    publishedRevision !== undefined &&
    !publishedRevision.details?.trim() &&
    measure.latestRevisionId === measure.publishedRevisionId &&
    !hasContextAttempt &&
    publishedEvidence.status === "VALID" &&
    publishedEvidence.snapshot.supportingIds.length > 0;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link href="/admin/mesures" prefetch={false} className="text-sm text-primary underline">
          Retour à la file
        </Link>
        {/* The measure is what this page is about, so it is the h1. Naming the politician
            instead read as a page about the person, who carries many measures. */}
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {referenceText ?? "Mesure sans révision saisie"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {context.politician.fullName} · {context.election.title}
        </p>
        <ModerationStateBadge state={state} />
      </header>

      <section
        aria-labelledby="context-heading"
        className="rounded-lg border border-border p-4 text-sm"
      >
        <h2 id="context-heading" className="text-base font-semibold">
          Contexte
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="font-medium">Élection</dt>
            <dd className="text-muted-foreground">{context.election.title}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">Thème</dt>
            <dd className="text-muted-foreground">{THEME_CATEGORY_LABELS[context.theme]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">Attribution</dt>
            <dd className="text-muted-foreground">
              {MEASURE_ATTRIBUTION_LABELS[context.attribution]}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">Candidature</dt>
            <dd className="text-muted-foreground">
              {context.candidacy === null
                ? "aucune candidature rattachée"
                : // status is nullable: before the official filing, no one is formally a
                  // candidate, and lot 0A kept that distinction rather than defaulting it.
                  `${context.candidacy.candidateName} · ${
                    context.candidacy.status === null
                      ? "statut non renseigné"
                      : CANDIDACY_STATUS_LABELS[context.candidacy.status]
                  }`}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">Édition de programme</dt>
            <dd className="text-muted-foreground">
              {context.programEdition === null
                ? "aucune édition rattachée"
                : `${context.programEdition.label} (version ${context.programEdition.version})`}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">Saisie le</dt>
            <dd className="text-muted-foreground">{dateFormat.format(context.createdAt)}</dd>
          </div>
        </dl>

        {state.depublication !== null && (
          <div className="mt-4 rounded border border-border bg-muted/40 p-3">
            <p className="font-medium">Dépubliée le {dateFormat.format(state.depublication.at)}</p>
            {state.depublication.reason === null ? (
              <p className="mt-1 text-red-700 dark:text-red-400">
                Aucun motif enregistré, alors que la dépublication en exige un.
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">{state.depublication.reason}</p>
            )}
          </div>
        )}
      </section>

      <PublicVisibilityCard state={state} publicMeasure={publicMeasure} />

      <section aria-labelledby="subtopics-heading">
        <h2 id="subtopics-heading" className="text-base font-semibold">
          Sous-thèmes
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            proposés automatiquement, publiés après validation
          </span>
        </h2>
        <div className="mt-3">
          <MeasureSubtopicsPanel
            measureId={id}
            revisionId={referenceRevisionId}
            assignments={(
              measure.revisions.find((revision) => revision.id === referenceRevisionId)
                ?.subtopics ?? []
            ).map((assignment) => ({
              subtopicId: assignment.subtopicId,
              label: assignment.subtopic.label,
              status: assignment.status,
              confidence: assignment.confidence,
            }))}
          />
        </div>
      </section>

      <section aria-labelledby="reader-guides-heading">
        <h2 id="reader-guides-heading" className="text-base font-semibold">
          Repères pour comprendre
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            termes techniques proposés par l’IA, définitions rédigées et validées séparément
          </span>
        </h2>
        <div className="mt-3">
          <MeasureReaderGuidesPanel
            measureId={id}
            revisionId={referenceRevisionId}
            mentions={(
              measure.revisions.find((revision) => revision.id === referenceRevisionId)
                ?.readerGuideMentions ?? []
            ).map((mention) => ({
              id: mention.id,
              term: mention.term,
              evidenceSpan: mention.evidenceSpan,
              reason: mention.reason,
              confidence: mention.confidence,
              status: mention.status,
              guideId: mention.guideId,
              guideLabel: mention.guide?.label ?? null,
              guidePublicationStatus: mention.guide?.publicationStatus ?? null,
              guideActive: mention.guide?.active ?? null,
            }))}
            guides={readerGuides}
          />
        </div>
      </section>

      <section aria-labelledby="anomalies-heading">
        <h2 id="anomalies-heading" className="text-base font-semibold">
          Anomalies
        </h2>
        <div className="mt-3">
          <AnomalyList anomalies={state.anomalies} />
        </div>
      </section>

      <section aria-labelledby="metadata-heading">
        <h2 id="metadata-heading" className="text-base font-semibold">
          Conclusions éditoriales
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            datées, attachées à une révision, jamais modifiées en place
          </span>
        </h2>
        <div className="mt-3">
          <MeasureMetadataPanel
            measureId={id}
            defaultRevisionId={referenceRevisionId}
            revisions={measure.revisions.map((revision) => ({
              id: revision.id,
              text: revision.text,
              validFrom: dateFormat.format(revision.validFrom),
            }))}
          />
        </div>
      </section>

      <section aria-labelledby="revisions-heading">
        <h2 id="revisions-heading" className="text-base font-semibold">
          {measure.revisions.length === 1 ? "1 révision" : `${measure.revisions.length} révisions`}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            brouillons et révisions abandonnées comprises
          </span>
        </h2>
        <div className="mt-3">
          <RevisionTimeline
            revisions={measure.revisions}
            publishedRevisionId={measure.publishedRevisionId}
            latestRevisionId={measure.latestRevisionId}
            documentLabel={context.programEdition?.label ?? null}
          />
        </div>
      </section>

      <section aria-labelledby="votelinks-heading">
        <h2 id="votelinks-heading" className="text-base font-semibold">
          Rattachement à des scrutins
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            manuel, jamais dérivé d&apos;un vote automatiquement
          </span>
        </h2>

        <div className="mt-3 space-y-4">
          {voteLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun scrutin rattaché. Tant qu&apos;aucun lien n&apos;existe, la relation aux votes
              s&apos;affiche comme « recherche non effectuée ».
            </p>
          ) : (
            <ul className="space-y-3">
              {voteLinks.map((link) => (
                <li key={link.id} className="rounded border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {MEASURE_VOTE_LINK_KIND_LABELS[link.linkKind]}
                    </span>
                    {link.relation !== null && (
                      <span className="text-muted-foreground">
                        · {MEASURE_VOTE_RELATION_LABELS[link.relation]}
                      </span>
                    )}
                    {link.isReference && (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                        référence
                      </span>
                    )}
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                    {link.scrutinId !== null && (
                      <div className="flex gap-2">
                        <dt className="font-medium">Scrutin</dt>
                        <dd>{link.scrutinId}</dd>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <dt className="font-medium">Révision visée</dt>
                      <dd>
                        {shorten(
                          revisionTexts[link.applicableRevisionId] ?? link.applicableRevisionId
                        )}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-medium">Vérifié le</dt>
                      <dd>{dateFormat.format(link.checkedAt)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-medium">Chambres</dt>
                      <dd>
                        {link.institutionScope.map((c) => CHAMBER_SHORT_LABELS[c]).join(", ") ||
                          "—"}
                      </dd>
                    </div>
                    {link.legislatureScope.length > 0 && (
                      <div className="flex gap-2">
                        <dt className="font-medium">Législatures</dt>
                        <dd>{link.legislatureScope.join(", ")}</dd>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <dt className="font-medium">Méthode</dt>
                      <dd>{link.searchMethod}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">{link.rationale}</p>
                </li>
              ))}
            </ul>
          )}

          <VoteLinkForm
            measureId={id}
            defaultRevisionId={referenceRevisionId}
            revisions={measure.revisions.map((revision) => ({
              id: revision.id,
              text: revision.text,
              validFrom: dateFormat.format(revision.validFrom),
            }))}
          />
        </div>
      </section>

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="text-base font-semibold">
          Actions éditoriales
        </h2>
        <div className="mt-3">
          <MeasureActionPanel
            measureId={id}
            expectedUpdatedAt={expectedUpdatedAt}
            actions={actions}
            revisionTexts={revisionTexts}
            revisionDetails={revisionDetails}
            canGenerateContext={canGenerateContext}
            isWithdrawn={state.withdrawal !== null}
            pointersAmbiguous={hasAmbiguousPointers(state)}
          />
        </div>
      </section>
    </div>
  );
}
