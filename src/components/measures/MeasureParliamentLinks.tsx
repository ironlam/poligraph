import Link from "next/link";
import type { Chamber, GroupPosition, VotePosition } from "@/generated/prisma";
import { DOSSIER_STATUS_LABELS, VOTING_RESULT_LABELS } from "@/config/labels";
import type {
  MeasureParliamentFinalVote,
  MeasureParliamentLink,
} from "@/lib/data/measure-parliament-links";
import { formatDate } from "@/lib/utils";
import { MeasureFinalVoteChart } from "./MeasureFinalVoteChart";

const KIND_SENTENCE = {
  SAME_OBJECT: "Un texte porte précisément sur cette mesure.",
  BROADER_TEXT: "Un texte connexe aborde ce sujet, plus largement ou plus partiellement.",
} as const;

const BY_CHAMBER: Record<Chamber, string> = {
  AN: "l'Assemblée nationale",
  SENAT: "le Sénat",
};

// Gender-neutral wording: the candidate's vote is stated, never a gendered participle.
const CANDIDATE_VOTE: Record<VotePosition, string> = {
  POUR: "a voté pour",
  CONTRE: "a voté contre",
  ABSTENTION: "a choisi l'abstention",
  NON_VOTANT: "n'a pas pris part au vote",
  ABSENT: "n'a pas voté (absence)",
};

const GROUP_MAJORITY: Record<GroupPosition, string> = {
  POUR: "majorité pour",
  CONTRE: "majorité contre",
  ABSTENTION: "majorité abstention",
};

function headline(link: MeasureParliamentLink, latest: MeasureParliamentFinalVote | undefined) {
  if (!latest) return DOSSIER_STATUS_LABELS[link.status];
  return (
    VOTING_RESULT_LABELS[latest.result] +
    " par " +
    BY_CHAMBER[latest.chamber] +
    " le " +
    formatDate(latest.votingDate)
  );
}

function PositionLines({
  vote,
  candidateName,
}: {
  vote: MeasureParliamentFinalVote;
  candidateName: string;
}) {
  if (!vote.candidateVote && !vote.candidateGroup) return null;
  return (
    <>
      {vote.candidateVote && (
        <p>
          {candidateName} {CANDIDATE_VOTE[vote.candidateVote]}.
        </p>
      )}
      {vote.candidateGroup && (
        <p>
          Son groupe, {vote.candidateGroup.name}
          {vote.candidateGroup.position ? " : " + GROUP_MAJORITY[vote.candidateGroup.position] : ""}
          .
        </p>
      )}
    </>
  );
}

/**
 * Reviewed dossiers linked to a measure, led by what happened to the text. Vote lines are positions
 * on the TEXT, never on the measure: that statement stays with the human-recorded vote relation
 * (`VoteRelationBadge`).
 */
export function MeasureParliamentLinks({
  links,
  candidateName,
}: {
  links: MeasureParliamentLink[];
  candidateName: string;
}) {
  if (links.length === 0) return null;
  const showsPositions = links.some((link) =>
    link.finalVotes.some((vote) => vote.candidateVote || vote.candidateGroup)
  );
  return (
    <section aria-labelledby="parliament-links-title" className="border-t border-border py-8">
      <h2 id="parliament-links-title" className="font-display text-2xl font-extrabold">
        Cette mesure au Parlement
      </h2>
      <ul className="mt-4 space-y-3">
        {links.map((link) => {
          const latest = link.finalVotes.at(-1);
          const earlier = link.finalVotes.slice(0, -1);
          return (
            <li
              key={link.dossierSlug}
              className="rounded-2xl border border-border bg-card p-5"
              data-testid="parliament-link"
            >
              <p className="font-display text-xl font-extrabold">{headline(link, latest)}</p>
              <p className="mt-1 font-bold">{link.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{KIND_SENTENCE[link.linkKind]}</p>
              {latest && (
                <>
                  <div className="mt-3 space-y-1 text-sm">
                    <PositionLines vote={latest} candidateName={candidateName} />
                  </div>
                  <MeasureFinalVoteChart vote={latest} candidateName={candidateName} />
                </>
              )}
              {earlier.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
                  {earlier.map((vote) => (
                    <li key={vote.slug}>
                      Auparavant : {VOTING_RESULT_LABELS[vote.result].toLowerCase()} par{" "}
                      {BY_CHAMBER[vote.chamber]} le {formatDate(vote.votingDate)}
                      {vote.candidateVote
                        ? ", " + candidateName + " " + CANDIDATE_VOTE[vote.candidateVote]
                        : ""}
                      .
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={"/parlement/dossiers/" + link.dossierSlug}
                prefetch={false}
                className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Lire le texte
              </Link>
            </li>
          );
        })}
      </ul>
      {showsPositions && (
        <p className="mt-3 text-sm text-muted-foreground">
          Ces positions portent sur le texte, pas sur la mesure.
        </p>
      )}
    </section>
  );
}
