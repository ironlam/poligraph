import Link from "next/link";
import { ROUTES } from "@/config/routes";
import { formatDateShort } from "@/lib/utils";
import type { VotesDeputes } from "@/lib/data/territoire-votes";
import { decompteEnMots, positionEnMots } from "@/lib/territoires/votes-parlementaires";

const LINK = "underline underline-offset-2 hover:text-primary";

export type VotesMode =
  /** Commune with one established deputy: the name and the position in words. */
  | { kind: "depute"; depute: { slug: string; fullName: string } }
  /** Department: a tally of its deputies, without any name. */
  | { kind: "decompte" }
  /** Commune whose deputy is not established (several constituencies...): no name. */
  | { kind: "renvoi" };

function Scrutins({
  votes,
  mode,
  decompteLabel,
}: {
  votes: VotesDeputes;
  mode: VotesMode;
  decompteLabel: string;
}) {
  return (
    <ul className="mt-3 divide-y divide-border">
      {votes.scrutins.map((s) => (
        <li key={s.slug} className="py-3 first:pt-0">
          <Link
            href={ROUTES.voteDetail(s.slug)}
            prefetch={false}
            className={`flex min-h-11 items-center text-sm font-medium ${LINK}`}
          >
            {/* An official title starts in lower case (« l'ensemble du projet de loi... »). */}
            <span className="block first-letter:uppercase">{s.titre}</span>
          </Link>
          <p className="text-xs text-muted-foreground">
            {s.nature && `${s.nature} · `}
            {s.resultat} · <time dateTime={s.date}>{formatDateShort(s.date)}</time>
          </p>
          {mode.kind === "depute" && (
            <p className="mt-1 text-sm">
              <Link
                href={`/politiques/${mode.depute.slug}/votes`}
                prefetch={false}
                className={`inline-flex min-h-11 items-center ${LINK}`}
              >
                {mode.depute.fullName}
              </Link>{" "}
              :{" "}
              {positionEnMots(s.positions[mode.depute.slug], s.sansVote.includes(mode.depute.slug))}
            </p>
          )}
          {mode.kind === "decompte" && (
            <p className="mt-1 text-sm">
              {decompteLabel} : {decompteEnMots(s.positions, votes.deputeSlugs, s.sansVote)}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * « Vos parlementaires ont voté » (D26): the three latest scrutins of the Assemblée nationale
 * on a whole text or a motion, and of the Sénat when `senat` is given. Same selection and same presentation on every territory, no
 * colour by position. Renders nothing without a scrutin.
 */
export function VotesParlementaires({
  votes,
  mode,
  senat,
}: {
  votes: VotesDeputes;
  mode: VotesMode;
  /** Scrutins of the Sénat with the senators of the department: a tally, on the department page. */
  senat?: VotesDeputes;
}) {
  if (votes.scrutins.length === 0) return null;
  if (mode.kind === "decompte" && votes.deputeSlugs.length === 0) return null;
  return (
    <section
      id="votes"
      aria-labelledby="votes-titre"
      className="scroll-mt-32 rounded-2xl border bg-card p-5 md:p-6"
    >
      <h2 id="votes-titre" className="font-display text-xl font-bold text-primary md:text-2xl">
        Vos parlementaires ont voté
      </h2>
      {senat && senat.scrutins.length > 0 && senat.deputeSlugs.length > 0 ? (
        <>
          <h3 className="mt-3 text-sm font-semibold">À l{"'"}Assemblée nationale</h3>
          <Scrutins votes={votes} mode={mode} decompteLabel="Députés du département" />
          <h3 className="mt-4 border-t pt-4 text-sm font-semibold">Au Sénat</h3>
          <Scrutins
            votes={senat}
            mode={{ kind: "decompte" }}
            decompteLabel="Sénateurs du département"
          />
        </>
      ) : (
        <Scrutins votes={votes} mode={mode} decompteLabel="Députés du département" />
      )}
      {mode.kind === "renvoi" && (
        <p className="text-sm text-muted-foreground">
          Le député dépend de votre adresse. Pour retrouver le vôtre et ses positions, utilisez{" "}
          <Link
            href="/mon-depute"
            prefetch={false}
            className={`inline-flex min-h-11 items-center ${LINK}`}
          >
            Mon député
          </Link>
          .
        </p>
      )}
      <p className="text-sm">
        <Link
          href={ROUTES.votes}
          prefetch={false}
          className={`inline-flex min-h-11 items-center ${LINK}`}
        >
          Tous les votes
        </Link>
      </p>
    </section>
  );
}
