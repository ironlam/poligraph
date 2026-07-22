import { getExplainedShowcase } from "@/lib/data/scrutins";
import { VoteCard } from "@/components/votes";
import { EXPLAINED_LISTING_SHOWCASE_COUNT } from "@/config/votes";

interface ExplainedVotesModuleProps {
  count?: number;
  maxPerDossier?: number;
}

export async function ExplainedVotesModule({
  count = EXPLAINED_LISTING_SHOWCASE_COUNT,
  maxPerDossier = 2,
}: ExplainedVotesModuleProps) {
  const votes = await getExplainedShowcase({ count, maxPerDossier });
  if (votes.length === 0) return null;

  return (
    <section className="mb-8" aria-labelledby="votes-expliques-heading">
      <h2 id="votes-expliques-heading" className="text-lg font-semibold mb-1">
        Votes expliqués
      </h2>
      <p className="text-sm text-muted-foreground mb-3">
        Des votes récents traduits en langage clair.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          />
        ))}
      </div>
    </section>
  );
}
