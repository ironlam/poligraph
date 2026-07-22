import Link from "next/link";
import { getExplainedShowcase } from "@/lib/data/scrutins";
import { VoteCard } from "@/components/votes";

interface ExplainedVotesTeaserProps {
  excludeScrutinIds: string[];
}

/**
 * Hub teaser for "Votes expliqués": 3 compact cards, deduped against the
 * key-votes ids already shown above it on the same page. Falls back to an
 * unfiltered pick if excluding key votes leaves fewer than 3 candidates.
 */
export async function ExplainedVotesTeaser({ excludeScrutinIds }: ExplainedVotesTeaserProps) {
  let votes = await getExplainedShowcase({ count: 3, maxPerDossier: 1, excludeScrutinIds });
  if (votes.length < 3) {
    votes = await getExplainedShowcase({ count: 3, maxPerDossier: 1 });
  }
  if (votes.length === 0) return null;

  return (
    <section className="mb-8" aria-labelledby="votes-expliques-teaser-heading">
      <div className="flex items-center justify-between mb-3">
        <h2 id="votes-expliques-teaser-heading" className="text-lg font-semibold">
          Votes expliqués
        </h2>
        <Link
          href="/parlement/votes?filter=expliques"
          className="text-sm text-primary hover:underline"
        >
          Voir tous les votes expliqués →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {votes.map((s) => (
          <VoteCard
            key={s.id}
            id={s.id}
            externalId={s.externalId}
            slug={s.slug}
            title={s.title}
            votingDate={s.votingDate}
            legislature={s.legislature}
            chamber={s.chamber}
            votesFor={s.votesFor}
            votesAgainst={s.votesAgainst}
            votesAbstain={s.votesAbstain}
            result={s.result}
            theme={s.theme}
            type={s.type}
            dossier={s.dossierLegislatif}
            policy={s.policyTitle}
            compact
          />
        ))}
      </div>
    </section>
  );
}
