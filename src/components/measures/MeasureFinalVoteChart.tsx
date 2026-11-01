import type { GroupPosition } from "@/generated/prisma";
import { GROUP_POSITION_LABELS } from "@/config/labels";
import { getPartyColor } from "@/config/party-colors";
import type { MeasureParliamentFinalVote } from "@/lib/data/measure-parliament-links";
import { PositionCountBar } from "@/components/votes/PositionCountBar";

const POSITIONS: GroupPosition[] = ["POUR", "CONTRE", "ABSTENTION"];

const DOT: Record<GroupPosition, string> = {
  POUR: "var(--vote-pour)",
  CONTRE: "var(--vote-contre)",
  ABSTENTION: "var(--vote-abstention)",
};

/**
 * Result of a final vote and where every parliamentary group stood, the candidate's own group
 * highlighted. The bar is decorative (counts are written beside it) and the highlight is carried by
 * a border and a text label, never by colour alone.
 */
export function MeasureFinalVoteChart({
  vote,
  candidateName,
}: {
  vote: MeasureParliamentFinalVote;
  candidateName: string;
}) {
  const { counts, groups, candidateGroup } = vote;
  if (counts.for + counts.against + counts.abstain === 0 && groups.length === 0) return null;
  return (
    <div className="mt-4 space-y-3" data-testid="final-vote-chart">
      <div>
        <PositionCountBar
          forCount={counts.for}
          againstCount={counts.against}
          abstainCount={counts.abstain}
          className="!h-3"
        />
        <p className="mt-1 text-sm">
          <strong>{counts.for}</strong> pour, <strong>{counts.against}</strong> contre,{" "}
          <strong>{counts.abstain}</strong> abstention{counts.abstain > 1 ? "s" : ""}
        </p>
      </div>
      {groups.length > 0 && (
        <div className="space-y-2">
          {POSITIONS.map((position) => {
            const inPosition = groups.filter((g) => g.position === position);
            if (inPosition.length === 0) return null;
            return (
              <div key={position} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="flex w-24 shrink-0 items-center gap-1.5 font-medium text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: DOT[position] }}
                  />
                  {GROUP_POSITION_LABELS[position]}
                </span>
                <ul
                  className="flex flex-wrap gap-1.5"
                  aria-label={"Groupes : " + GROUP_POSITION_LABELS[position].toLowerCase()}
                >
                  {inPosition.map((group) => {
                    const mine = candidateGroup?.code === group.code;
                    return (
                      <li
                        key={group.id}
                        title={group.name}
                        className={
                          "inline-flex min-h-7 items-center gap-1 rounded-full border bg-card px-2 py-0.5 " +
                          (mine ? "border-2 border-primary font-bold" : "border-border")
                        }
                      >
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: group.color ?? getPartyColor(group.code) }}
                        />
                        {group.shortName ?? group.code}
                        {mine && <span className="sr-only"> (groupe de {candidateName})</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {candidateGroup && groups.some((g) => g.code === candidateGroup.code) && (
            <p className="text-xs text-muted-foreground">
              Le groupe de {candidateName} est entouré.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
