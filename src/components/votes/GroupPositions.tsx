import Link from "next/link";
import { GROUP_POSITION_LABELS } from "@/config/labels";
import { ROUTES } from "@/config/routes";
import type { ScrutinGroupPositionData } from "@/lib/data/groupes";
import { COMPUTED_POSITIONS_TITLE, computedPositionsNote } from "@/lib/votes/scrutin-provenance";
import type { GroupPosition } from "@/types";
import type { Chamber } from "@/generated/prisma";

interface GroupPositionsProps {
  positions: ScrutinGroupPositionData[];
  chamber: Chamber;
}

const POSITION_ORDER: GroupPosition[] = ["POUR", "CONTRE", "ABSTENTION"];

const SECTION_STYLES: Record<GroupPosition, { heading: string; dot: string }> = {
  POUR: { heading: "text-green-700 dark:text-green-400", dot: "bg-green-500" },
  CONTRE: { heading: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
  ABSTENTION: { heading: "text-yellow-700 dark:text-yellow-400", dot: "bg-yellow-500" },
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

function GroupPill({ gp }: { gp: ScrutinGroupPositionData }) {
  const detail = `${gp.forCount} pour, ${gp.againstCount} contre, ${plural(gp.abstainCount, "abstention", "abstentions")}`;
  const href = gp.group.slug ? ROUTES.groupeDetail(gp.group.slug) : null;
  const content = (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-card text-sm hover:bg-muted transition-colors">
      {gp.group.color && (
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: gp.group.color }}
          aria-hidden="true"
        />
      )}
      <span className="font-medium">{gp.group.shortName || gp.group.code}</span>
      <span className="text-xs text-muted-foreground">{Math.round(gp.cohesionPct)}%</span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} prefetch={false} title={`${gp.group.name} : ${detail}`}>
        {content}
      </Link>
    );
  }
  return <span title={`${gp.group.name} : ${detail}`}>{content}</span>;
}

export function GroupPositions({ positions, chamber }: GroupPositionsProps) {
  if (positions.length === 0) return null;

  const byPosition = new Map<GroupPosition, ScrutinGroupPositionData[]>();
  for (const p of POSITION_ORDER) {
    byPosition.set(
      p,
      positions.filter((gp) => gp.position === p)
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{COMPUTED_POSITIONS_TITLE}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{computedPositionsNote(chamber)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Chaque groupe figure sous sa position dominante. Le pourcentage indique la part du groupe
          qui a voté ainsi ; le détail des voix s&apos;affiche au survol.
        </p>
      </div>

      {/* Desktop: 3 columns */}
      <div className="hidden md:grid md:grid-cols-3 gap-6">
        {POSITION_ORDER.map((pos) => {
          const groups = byPosition.get(pos) ?? [];
          const style = SECTION_STYLES[pos];
          return (
            <div key={pos}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${style.dot}`} aria-hidden="true" />
                <h4 className={`text-sm font-semibold ${style.heading}`}>
                  {GROUP_POSITION_LABELS[pos]}
                </h4>
              </div>
              <div
                className="flex flex-wrap gap-1.5"
                role={groups.length > 0 ? "list" : undefined}
                aria-label={
                  groups.length > 0
                    ? `Groupes dont la position calculée est ${GROUP_POSITION_LABELS[pos].toLowerCase()}`
                    : undefined
                }
              >
                {groups.length > 0 ? (
                  groups.map((gp) => (
                    <div key={gp.id} role="listitem">
                      <GroupPill gp={gp} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun groupe</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: stacked with vote bar */}
      <div className="md:hidden space-y-4">
        <div
          className="flex h-3 rounded-full overflow-hidden"
          role="img"
          aria-label={`${byPosition.get("POUR")?.length ?? 0} groupes pour, ${byPosition.get("CONTRE")?.length ?? 0} contre, ${byPosition.get("ABSTENTION")?.length ?? 0} abstention`}
        >
          {POSITION_ORDER.map((pos) => {
            const count = byPosition.get(pos)?.length ?? 0;
            const total = positions.length;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={pos} className={SECTION_STYLES[pos].dot} style={{ width: `${pct}%` }} />
            );
          })}
        </div>

        {POSITION_ORDER.map((pos) => {
          const groups = byPosition.get(pos) ?? [];
          if (groups.length === 0) return null;
          const style = SECTION_STYLES[pos];
          return (
            <div key={pos}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2 h-2 rounded-full ${style.dot}`} aria-hidden="true" />
                <h4 className={`text-sm font-semibold ${style.heading}`}>
                  {GROUP_POSITION_LABELS[pos]}
                </h4>
              </div>
              <div
                className="flex flex-wrap gap-1.5"
                role="list"
                aria-label={`Groupes dont la position calculée est ${GROUP_POSITION_LABELS[pos].toLowerCase()}`}
              >
                {groups.map((gp) => (
                  <div key={gp.id} role="listitem">
                    <GroupPill gp={gp} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
