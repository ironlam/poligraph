import { VoteCard } from "./VoteCard";
import { ScrutinLinkList } from "./ScrutinLinkList";
import { CHAMBER_LABELS } from "@/config/labels";
import { Vote, CheckCircle, XCircle, Building2, Sparkles } from "lucide-react";
import type { Chamber } from "@/generated/prisma";
import type { DailyScrutin } from "@/lib/data/scrutins";
import { displayTitleOf, toPublicTitleView } from "@/lib/votes/to-public-title-view";

/** Amendments shown as full cards before the rest becomes a plain list of links. */
const AMENDMENT_CARD_COUNT = 10;

/**
 * Every scrutin of the day, rendered on the server.
 *
 * The page used to split texts and amendments into tabs read from `?type=` in a client component,
 * with the texts as the server fallback. The server never reads that parameter (it would make the
 * route dynamic), so no amendment of any day was ever in the HTML a crawler receives: a day made
 * only of amendments linked nothing. Both groups are now in the document. Amendments beyond the
 * first few are plain links, since a sitting day can hold close to 200 of them.
 */
export function DailyVotesContent({ scrutins }: { scrutins: DailyScrutin[] }) {
  const texts = scrutins.filter((s) => s.type !== "AMENDEMENT");
  const amendments = scrutins.filter((s) => s.type === "AMENDEMENT");
  const adopted = scrutins.filter((s) => s.result === "ADOPTED").length;
  const rejected = scrutins.length - adopted;

  const amendmentCards = amendments.slice(0, AMENDMENT_CARD_COUNT);
  const amendmentLinks = amendments.slice(AMENDMENT_CARD_COUNT).map((s) => ({
    slug: s.slug,
    title: displayTitleOf(toPublicTitleView(s)),
    result: s.result,
  }));

  return (
    <>
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg">
          <Vote className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium">
            {scrutins.length} scrutin{scrutins.length > 1 ? "s" : ""}
          </span>
        </div>
        {adopted > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-lg">
            <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              {adopted} adopté{adopted > 1 ? "s" : ""}
            </span>
          </div>
        )}
        {rejected > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 rounded-lg">
            <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />
            <span className="text-sm font-medium text-red-600 dark:text-red-400">
              {rejected} rejeté{rejected > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {(["AN", "SENAT"] as Chamber[]).map((chamber) => {
        const votes = texts.filter((s) => s.chamber === chamber);
        if (votes.length === 0) return null;
        return <ChamberSection key={chamber} chamber={chamber} scrutins={votes} />;
      })}

      {amendments.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">
            Amendements{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {amendments.length} scrutin{amendments.length > 1 ? "s" : ""}
            </span>
          </h2>
          <ScrutinCards scrutins={amendmentCards} />
          {amendmentLinks.length > 0 && (
            <div className="mt-6">
              <ScrutinLinkList items={amendmentLinks} />
            </div>
          )}
        </section>
      )}
    </>
  );
}

function ChamberSection({ chamber, scrutins }: { chamber: Chamber; scrutins: DailyScrutin[] }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2.5 mb-4">
        <Building2
          className={`h-4 w-4 ${chamber === "AN" ? "text-blue-700" : "text-rose-700"}`}
          aria-hidden="true"
        />
        <h2 className="text-lg font-semibold">{CHAMBER_LABELS[chamber]}</h2>
        <span className="text-sm text-muted-foreground">
          {scrutins.length} scrutin{scrutins.length > 1 ? "s" : ""}
        </span>
      </div>
      <ScrutinCards scrutins={scrutins} />
    </section>
  );
}

function ScrutinCards({ scrutins }: { scrutins: DailyScrutin[] }) {
  return (
    <div className="grid gap-4">
      {scrutins.map((s) => (
        <div key={s.id}>
          <VoteCard
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
            sourceUrl={s.sourceUrl}
            theme={s.theme}
            type={s.type}
            policy={s.policyTitle}
          />
          {s.summary && <SummaryExcerpt summary={s.summary} />}
        </div>
      ))}
    </div>
  );
}

function SummaryExcerpt({ summary }: { summary: string }) {
  const firstParagraph = summary.split("\n\n")[0]?.trim();
  if (!firstParagraph) return null;

  return (
    <div className="mt-2 ml-4 pl-3 border-l-2 border-primary/20 text-sm text-muted-foreground">
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles className="h-3 w-3 text-primary/50" aria-hidden="true" />
        <span className="text-xs font-medium text-primary/50 uppercase tracking-wider">
          Résumé IA
        </span>
      </div>
      <p className="line-clamp-2">{firstParagraph}</p>
    </div>
  );
}
