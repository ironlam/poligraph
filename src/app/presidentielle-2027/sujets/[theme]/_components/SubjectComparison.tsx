import {
  CANDIDACY_STATUS_LABELS,
  CHAMBER_SHORT_LABELS,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import { QualifiedEmptyCell } from "@/components/measures/QualifiedEmptyCell";
import { VoteRelationBadge } from "@/components/measures/VoteRelationBadge";
import type { ThemeCategory } from "@/generated/prisma";
import type { PublicVoteReference } from "@/lib/measures/vote-links";
import type { SubjectCandidateEntry, SubjectPageData } from "@/lib/data/subject-page";

/**
 * A public subject page: for one theme, the candidates and their measures, side by side.
 *
 * No ranking and no proximity score: candidates come in the alphabetical order the authority returns, and
 * the page says so. A candidate with no published measure on the theme is not silent, it gets a qualified
 * absence. Below the publication gate the page renders an explicit state, never a one-candidate comparison
 * dressed up as a comparison.
 */

function formatDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function composeVoteBasis(reference: PublicVoteReference): string {
  const parts: string[] = [];
  if (reference.scrutinId !== null) parts.push(`scrutin ${reference.scrutinId}`);
  if (reference.institutionScope.length > 0) {
    parts.push(
      reference.institutionScope.map((chamber) => CHAMBER_SHORT_LABELS[chamber]).join(", ")
    );
  }
  if (reference.legislatureScope.length > 0) {
    parts.push(`législature ${reference.legislatureScope.join(", ")}`);
  }
  parts.push(`vérifié le ${formatDateFr(reference.checkedAt)}`);
  return parts.join(" · ");
}

function CandidateColumn({ entry, theme }: { entry: SubjectCandidateEntry; theme: ThemeCategory }) {
  const { candidate, measures } = entry;
  const statusLabel = candidate.status === null ? null : CANDIDACY_STATUS_LABELS[candidate.status];

  return (
    <article className="rounded-lg border border-border p-4">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {candidate.candidateName}
      </h2>
      {statusLabel !== null && (
        <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{statusLabel}</p>
      )}

      <div className="mt-3 space-y-4">
        {measures.length === 0 ? (
          <QualifiedEmptyCell absence={{ kind: "no_measure_published", theme }} />
        ) : (
          measures.map(({ measure, voteRelation, voteReference }) => (
            <div key={measure.id} className="space-y-2">
              <p className="text-sm">{measure.text}</p>
              {measure.withdrawal !== null && (
                <p className="text-xs text-muted-foreground">
                  Mesure retirée le {formatDateFr(measure.withdrawal.withdrawnAt)}
                  {measure.withdrawal.sourceUrl !== null &&
                    measure.withdrawal.sourceLabel !== null && (
                      <>
                        {" · "}
                        <a
                          href={measure.withdrawal.sourceUrl}
                          className="underline"
                          rel="nofollow noopener"
                        >
                          {measure.withdrawal.sourceLabel}
                        </a>
                      </>
                    )}
                </p>
              )}
              <VoteRelationBadge
                relation={voteRelation}
                basisDetails={voteReference !== null ? composeVoteBasis(voteReference) : undefined}
              />
            </div>
          ))
        )}
      </div>
    </article>
  );
}

export function SubjectComparison({ data }: { data: SubjectPageData }) {
  const themeLabel = THEME_CATEGORY_LABELS[data.theme];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">Présidentielle 2027</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">{themeLabel}</h1>
        <p className="text-sm text-muted-foreground">
          Candidats par ordre alphabétique, sans classement ni score de proximité.
        </p>
      </header>

      {!data.publishable ? (
        <section
          aria-labelledby="gate-heading"
          className="rounded-lg border border-border bg-muted/40 p-4"
        >
          <h2 id="gate-heading" className="text-base font-semibold">
            Comparaison pas encore disponible sur ce sujet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Une comparaison n&apos;est publiée que lorsqu&apos;au moins deux candidatures portent
            une mesure vérifiée sur ce sujet. Ce seuil n&apos;est pas encore atteint, la page reste
            hors des index tant qu&apos;il ne l&apos;est pas.
          </p>
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.candidates.map((entry) => (
            <CandidateColumn key={entry.candidate.id} entry={entry} theme={data.theme} />
          ))}
        </div>
      )}
    </div>
  );
}
