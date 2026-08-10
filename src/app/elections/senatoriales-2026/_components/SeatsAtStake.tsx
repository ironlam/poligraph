import { SourceLine } from "@/components/ui/SourceLine";
import { MissingData } from "@/components/ui/MissingData";
import type { GroupExposure } from "@/lib/data/senatoriales";
import {
  SENATE_SEATS_AT_STAKE,
  SENATE_SEATS_TOTAL,
  SOURCE_SENAT,
  type BallotPhase,
} from "../_content";

/**
 * How exposed each Senate group is to this renewal.
 *
 * Computed from `Mandate.senateSeries`, so the Sénat is the only source needed: the
 * design quoted a press tally for the same figures, and this query reproduces them
 * (107 of 190 for the outgoing majority, 77 of 131 for Les Républicains, 4 of 18 for
 * the communists). A group's exposure follows the series its seats belong to, not its
 * size, which is the point worth showing.
 *
 * No projection of any kind: the bars measure seats *at stake*, never seats expected.
 */
export function SeatsAtStake({ groups, phase }: { groups: GroupExposure[]; phase: BallotPhase }) {
  const ranked = groups.filter((g) => g.held > 0).sort((a, b) => b.atStake - a.atStake);

  /**
   * After the ballot this query stops describing what it claims to.
   *
   * `getGroupExposure()` counts `isCurrent` mandates, so the first `sync:senat` that
   * follows 27 September replaces the outgoing senators with the incoming ones. The
   * bars would then show the *new* composition under the heading "remis en jeu",
   * turning a correct query into a false statement without anything failing.
   *
   * The block therefore withdraws instead of relabelling: nothing captured the
   * pre-ballot composition, so there is nothing honest to show yet. A snapshot taken
   * before 27 September is the real fix, and it has a deadline.
   */
  if (phase === "after") {
    return (
      <section aria-labelledby="enjeu-heading" className="space-y-4">
        <h2
          id="enjeu-heading"
          className="font-display text-xl font-bold tracking-tight md:text-2xl"
        >
          Ce qui était remis en jeu
        </h2>
        <MissingData title="Composition sortante non conservée">
          Le scrutin a eu lieu. La répartition par groupe que nous calculons décrit désormais le
          Sénat renouvelé, pas celui qui se présentait devant les grands électeurs : nous préférons
          ne rien afficher plutôt que de présenter l{"'"}une pour l{"'"}autre.
        </MissingData>
        <SourceLine sources={[SOURCE_SENAT]} reportHref={null} />
      </section>
    );
  }

  return (
    <section aria-labelledby="enjeu-heading" className="space-y-4">
      <div className="space-y-2">
        <h2
          id="enjeu-heading"
          className="font-display text-xl font-bold tracking-tight md:text-2xl"
        >
          Ce qui est remis en jeu
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
          {SENATE_SEATS_AT_STAKE} sièges sur {SENATE_SEATS_TOTAL} sont renouvelés. L{"'"}exposition
          d{"'"}un groupe dépend de la série à laquelle ses sièges appartiennent, pas de sa taille.
        </p>
      </div>

      {ranked.length === 0 ? (
        <MissingData title="Répartition par groupe indisponible">
          La série de renouvellement n{"'"}est pas encore renseignée sur les mandats sénatoriaux.
          Elle est reprise de l{"'"}open data du Sénat à chaque synchronisation.
        </MissingData>
      ) : (
        <ul className="space-y-2.5">
          {ranked.map((group) => {
            const share = group.held > 0 ? (group.atStake / group.held) * 100 : 0;
            return (
              <li key={group.groupName} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-medium">{group.groupName}</p>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{group.atStake}</span>
                    <span> sur {group.held} sièges</span>
                  </p>
                </div>
                {/* Proportion of the group's own seats being renewed. Decorative:
                    the figures above already state it for screen readers. */}
                <div
                  aria-hidden="true"
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-brand-on-surface"
                    style={{ width: `${Math.round(share)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SourceLine
        sources={[SOURCE_SENAT]}
        note="Sièges comptés par série sur les mandats sénatoriaux en cours"
      />
    </section>
  );
}
