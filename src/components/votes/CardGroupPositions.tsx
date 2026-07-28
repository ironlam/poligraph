import { GROUP_POSITION_LABELS } from "@/config/labels";
import { getPartyColor } from "@/config/party-colors";
import type { ScrutinGroupPositionData } from "@/lib/data/groupes";
import type { GroupPosition } from "@/types";

interface CardGroupPositionsProps {
  positions: ScrutinGroupPositionData[];
}

const POSITION_ORDER: GroupPosition[] = ["POUR", "CONTRE", "ABSTENTION"];

const HEADER_DOT_VAR: Record<GroupPosition, string> = {
  POUR: "var(--vote-pour)",
  CONTRE: "var(--vote-contre)",
  ABSTENTION: "var(--vote-abstention)",
};

function MiniPill({ gp }: { gp: ScrutinGroupPositionData }) {
  const color = gp.group.color ?? getPartyColor(gp.group.code);
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border bg-card text-xs"
      title={`${gp.group.name} (${Math.round(gp.cohesionPct)}% de cohésion)`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="font-medium">{gp.group.shortName || gp.group.code}</span>
    </span>
  );
}

function PositionColumn({
  pos,
  groups,
}: {
  pos: GroupPosition;
  groups: ScrutinGroupPositionData[];
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: HEADER_DOT_VAR[pos] }}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-muted-foreground">
          {GROUP_POSITION_LABELS[pos]}
        </span>
      </div>
      <div
        className="flex flex-wrap gap-1"
        role="list"
        aria-label={`Groupes ayant voté ${GROUP_POSITION_LABELS[pos].toLowerCase()}`}
      >
        {groups.map((gp) => (
          <div key={gp.id} role="listitem">
            <MiniPill gp={gp} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardGroupPositions({ positions }: CardGroupPositionsProps) {
  if (positions.length === 0) return null;

  const byPosition = new Map<GroupPosition, ScrutinGroupPositionData[]>();
  for (const pos of POSITION_ORDER) {
    byPosition.set(
      pos,
      positions.filter((gp) => gp.position === pos)
    );
  }
  const nonEmpty = POSITION_ORDER.filter((pos) => (byPosition.get(pos) ?? []).length > 0);

  return (
    <div>
      {/* Desktop: 3 columns, empty columns omitted */}
      <div className="hidden md:grid md:grid-cols-3 gap-3">
        {nonEmpty.map((pos) => (
          <PositionColumn key={pos} pos={pos} groups={byPosition.get(pos) ?? []} />
        ))}
      </div>

      {/* Mobile: stacked */}
      <div className="md:hidden space-y-2">
        {nonEmpty.map((pos) => (
          <PositionColumn key={pos} pos={pos} groups={byPosition.get(pos) ?? []} />
        ))}
      </div>
    </div>
  );
}
