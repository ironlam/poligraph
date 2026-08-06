import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GOVERNMENT_GROUP_CODE, SENATE_GOVERNMENT_GROUP_CODE } from "@/config/scrutin-importance";
import type { GroupDynamicsStats } from "@/services/voteStats";

interface GroupDynamicsProps {
  dynamicsAN: GroupDynamicsStats[];
  dynamicsSENAT: GroupDynamicsStats[];
}

function AlignmentSpectrum({
  groups,
  chamberLabel,
}: {
  groups: GroupDynamicsStats[];
  chamberLabel: string;
}) {
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune donnée disponible</p>;
  }

  const sorted = [...groups].sort((a, b) => b.governmentAlignmentPct - a.governmentAlignmentPct);
  const descId = `alignment-desc-${chamberLabel.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div
      role="img"
      aria-label={`Concordance des votes - ${chamberLabel}`}
      aria-describedby={descId}
    >
      {/* Zone labels */}
      <div className="flex justify-between text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 px-1">
        <span>Opposition</span>
        <span>Coalition</span>
      </div>

      {/* Spectrum visualization */}
      <div className="relative h-28 mb-2">
        {/* Two-tone background: opposition (left) / coalition (right) */}
        <div className="absolute inset-0 rounded-lg overflow-hidden flex">
          <div className="w-1/2 bg-red-50 dark:bg-red-950/20" />
          <div className="w-1/2 bg-green-50 dark:bg-green-950/20" />
        </div>

        {/* 50% center line */}
        <div className="absolute top-0 h-full w-px bg-border" style={{ left: "calc(5% + 45%)" }} />

        {/* Group badges staggered across 3 rows */}
        {assignRows(sorted).map(({ group: g, row }) => {
          const leftPct = 5 + (g.governmentAlignmentPct / 100) * 90;
          const topPx = 8 + row * 34;
          return (
            <Link
              key={g.groupId}
              href={g.groupSlug ? `/parlement/groupes/${g.groupSlug}` : "#"}
              prefetch={false}
              className="absolute -translate-x-1/2 transition-transform hover:scale-110 hover:z-10"
              style={{ left: `${leftPct}%`, top: `${topPx}px` }}
              title={`${g.groupName}: ${g.governmentAlignmentPct.toFixed(0)}% de concordance`}
              aria-label={`${g.groupName}: ${g.governmentAlignmentPct.toFixed(0)}% de concordance des votes`}
            >
              <div
                className="px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-tight whitespace-nowrap shadow-sm border border-background/50"
                style={{
                  backgroundColor: g.groupColor || "#888",
                  color: isLightColor(g.groupColor) ? "#1a1a1a" : "#fff",
                }}
              >
                {g.groupCode}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Scale markers */}
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums px-1">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>

      {/* Screen reader table */}
      <div className="sr-only">
        <table id={descId}>
          <caption>Concordance des votes par groupe - {chamberLabel}</caption>
          <thead>
            <tr>
              <th>Groupe</th>
              <th>Concordance</th>
              <th>Cohésion</th>
              <th>Participation</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => (
              <tr key={g.groupId}>
                <td>{g.groupName}</td>
                <td>{g.governmentAlignmentPct.toFixed(1)}%</td>
                <td>{g.cohesionPct.toFixed(1)}%</td>
                <td>{g.averageParticipationPct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricsList({
  groups,
  referenceCode,
}: {
  groups: GroupDynamicsStats[];
  referenceCode: string;
}) {
  const sorted = [...groups].sort((a, b) => b.governmentAlignmentPct - a.governmentAlignmentPct);

  return (
    <div className="mt-4 divide-y">
      {sorted.map((g) => {
        const isReference = g.groupCode === referenceCode;
        return (
          <div
            key={g.groupId}
            className={`flex items-center gap-2 py-1.5 text-sm ${isReference ? "bg-primary/5 -mx-2 px-2 rounded" : ""}`}
          >
            <Link
              href={g.groupSlug ? `/parlement/groupes/${g.groupSlug}` : "#"}
              prefetch={false}
              className="flex items-center gap-2 min-w-0 flex-1 hover:underline"
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: g.groupColor || "#888" }}
                aria-hidden="true"
              />
              <span className="font-medium shrink-0">{g.groupCode}</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">{g.groupName}</span>
            </Link>
            <span
              className={`tabular-nums shrink-0 ${alignmentColor(g.governmentAlignmentPct)}`}
              title="Concordance des votes"
            >
              {g.governmentAlignmentPct.toFixed(0)}%
            </span>
            <span
              className="tabular-nums text-xs text-muted-foreground shrink-0 hidden sm:inline w-12 text-right"
              title="Cohésion interne du groupe"
            >
              {g.cohesionPct.toFixed(0)}% coh.
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ChamberCard({
  groups,
  chamberLabel,
  referenceCode,
}: {
  groups: GroupDynamicsStats[];
  chamberLabel: string;
  referenceCode: string;
}) {
  const refGroup = groups.find((g) => g.groupCode === referenceCode);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{chamberLabel}</CardTitle>
        {refGroup && (
          <p className="text-xs text-muted-foreground">
            Référence : {refGroup.groupCode} ({refGroup.groupName})
          </p>
        )}
      </CardHeader>
      <CardContent>
        <AlignmentSpectrum groups={groups} chamberLabel={chamberLabel} />
        <MetricsList groups={groups} referenceCode={referenceCode} />
      </CardContent>
    </Card>
  );
}

export function GroupDynamics({ dynamicsAN, dynamicsSENAT }: GroupDynamicsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <ChamberCard
        groups={dynamicsAN}
        chamberLabel="Assemblée nationale"
        referenceCode={GOVERNMENT_GROUP_CODE}
      />
      <ChamberCard
        groups={dynamicsSENAT}
        chamberLabel="Sénat"
        referenceCode={SENATE_GOVERNMENT_GROUP_CODE}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function isLightColor(hex: string | null): boolean {
  if (!hex) return false;
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 160;
}

/**
 * Assign groups to 3 vertical rows (0, 1, 2) to prevent badge overlap.
 * Groups sorted by alignment; each group is placed on the row that maximizes
 * horizontal distance from existing groups on that row.
 */
function assignRows(groups: GroupDynamicsStats[]): { group: GroupDynamicsStats; row: number }[] {
  const sorted = [...groups].sort((a, b) => a.governmentAlignmentPct - b.governmentAlignmentPct);
  const rows: number[][] = [[], [], []];
  const result: { group: GroupDynamicsStats; row: number }[] = [];

  for (const g of sorted) {
    const x = g.governmentAlignmentPct;
    let bestRow = 0;
    let bestDist = -1;
    for (let r = 0; r < 3; r++) {
      const minDist =
        rows[r]!.length === 0 ? Infinity : Math.min(...rows[r]!.map((px) => Math.abs(px - x)));
      if (minDist > bestDist) {
        bestDist = minDist;
        bestRow = r;
      }
    }
    rows[bestRow]!.push(x);
    result.push({ group: g, row: bestRow });
  }

  return result;
}

function alignmentColor(pct: number): string {
  if (pct >= 80) return "text-green-600 dark:text-green-400 font-semibold";
  if (pct >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}
