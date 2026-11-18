import Link from "next/link";
import { VOTING_RESULT_LABELS } from "@/config/labels";
import { ROUTES } from "@/config/routes";
import type { VotingResult } from "@/types";

export interface ScrutinLinkItem {
  slug: string | null;
  title: string;
  result: VotingResult;
  /** Shown before the result when the list spans several days. */
  votingDate?: Date | string;
}

function formatDay(d: Date | string): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

/**
 * A long list of scrutins as plain links, for the places that must name every one of them in the
 * server HTML (a dossier with 900 votes, a sitting day with 190 amendments).
 *
 * The styling sits on the list and reaches the rows through descendant selectors: a row then costs
 * its address and its title, where a class on each element would be repeated by the hundred, once
 * in the markup and once in the RSC payload.
 */
export function ScrutinLinkList({ items }: { items: ScrutinLinkItem[] }) {
  return (
    <ul className="divide-y text-sm [&_a]:block [&_a]:py-3 [&_a]:leading-snug [&_a:hover]:text-primary [&_span]:block [&_span]:text-xs [&_span]:text-muted-foreground">
      {items.map((s, i) =>
        s.slug ? (
          <li key={i}>
            <Link href={ROUTES.voteDetail(s.slug)} prefetch={false}>
              {s.title}
              <span>
                {s.votingDate ? `${formatDay(s.votingDate)} · ` : ""}
                {VOTING_RESULT_LABELS[s.result]}
              </span>
            </Link>
          </li>
        ) : (
          <li key={i} className="py-3 leading-snug">
            {s.title}
          </li>
        )
      )}
    </ul>
  );
}
