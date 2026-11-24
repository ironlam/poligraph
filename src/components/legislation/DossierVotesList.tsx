import Link from "next/link";
import { VotingResultBadge } from "@/components/votes/VoteBadge";
import { ScrutinLinkList } from "@/components/votes/ScrutinLinkList";
import { ROUTES } from "@/config/routes";
import type { VotingResult, ScrutinType } from "@/types";

/** Rows shown as full cards, with the tally bar, before the rest folds into a plain list. */
const CARD_COUNT = 10;

interface DossierVote {
  slug: string | null;
  title: string;
  votingDate: Date | string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  result: VotingResult;
  type: ScrutinType | null;
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

function VoteCardRow({ scrutin }: { scrutin: DossierVote }) {
  const total = scrutin.votesFor + scrutin.votesAgainst + scrutin.votesAbstain;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const body = (
    <>
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm font-medium flex-1 min-w-0 leading-snug">{scrutin.title}</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{formatDate(scrutin.votingDate)}</span>
          <VotingResultBadge result={scrutin.result} />
        </div>
      </div>
      {total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden">
          <div className="bg-green-500" style={{ width: `${pct(scrutin.votesFor)}%` }} />
          <div className="bg-red-500" style={{ width: `${pct(scrutin.votesAgainst)}%` }} />
          <div className="bg-yellow-500" style={{ width: `${pct(scrutin.votesAbstain)}%` }} />
        </div>
      )}
    </>
  );
  const className = "block p-3 rounded-lg border";
  return scrutin.slug ? (
    <Link
      href={ROUTES.voteDetail(scrutin.slug)}
      prefetch={false}
      className={`${className} hover:bg-muted/50 transition-colors`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function VoteGroup({ votes, noun }: { votes: DossierVote[]; noun: string }) {
  const cards = votes.slice(0, CARD_COUNT);
  const rest = votes.slice(CARD_COUNT);
  return (
    <>
      <div className="space-y-3">
        {cards.map((scrutin, i) => (
          <VoteCardRow key={scrutin.slug ?? i} scrutin={scrutin} />
        ))}
      </div>
      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer py-3 text-sm font-medium text-primary hover:underline">
            Voir les {rest.length.toLocaleString("fr-FR")} autres {noun}
          </summary>
          <div className="max-h-[600px] overflow-y-auto pr-1">
            <ScrutinLinkList items={rest} />
          </div>
        </details>
      )}
    </>
  );
}

/**
 * Every vote of the dossier, in the server HTML.
 *
 * This used to be a client component holding the list in state: ten links were rendered, the
 * others appeared on a click, and with two tabs the amendments were not rendered at all. A
 * crawler never clicks, so a dossier of 844 votes linked ten of them and the rest had no inbound
 * link anywhere on the site. `<details>` keeps the page folded for the reader while the links stay
 * in the document.
 */
export function DossierVotesList({ votes }: { votes: DossierVote[] }) {
  const textVotes = votes.filter((v) => v.type !== "AMENDEMENT");
  const amendments = votes.filter((v) => v.type === "AMENDEMENT");

  if (textVotes.length === 0 || amendments.length === 0) {
    return <VoteGroup votes={votes} noun={amendments.length > 0 ? "amendements" : "votes"} />;
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold">
          Votes sur le texte ({textVotes.length.toLocaleString("fr-FR")})
        </h3>
        <VoteGroup votes={textVotes} noun="votes" />
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold">
          Amendements ({amendments.length.toLocaleString("fr-FR")})
        </h3>
        <VoteGroup votes={amendments} noun="amendements" />
      </section>
    </div>
  );
}
