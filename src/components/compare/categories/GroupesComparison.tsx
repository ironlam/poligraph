import { CHAMBER_LABELS } from "@/config/labels";
import { getJudicialMaturity } from "@/config/judicial-maturity";
import type { AffairStatus } from "@/types";
import { AffairsSection } from "../sections/AffairsSection";
import { FactchecksSection } from "../sections/FactchecksSection";
import type { GroupComparisonData } from "@/lib/data/compare";
import type { Chamber } from "@/types";

interface Props {
  left: GroupComparisonData;
  right: GroupComparisonData;
}

function countBy<T>(items: T[], key: keyof T): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const val = String(item[key]);
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

function countByMaturity(affairs: { status: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of affairs) {
    const level = getJudicialMaturity(a.status as AffairStatus);
    counts[level] = (counts[level] || 0) + 1;
  }
  return counts;
}

export function GroupesComparison({ left, right }: Props) {
  return (
    <div className="space-y-8">
      {/* Info block */}
      <section>
        <h3 className="text-lg font-display font-semibold mb-4">Informations</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <GroupInfoCard data={left} />
          <GroupInfoCard data={right} />
        </div>
      </section>

      {/* Participation & cohesion */}
      <section>
        <h3 className="text-lg font-display font-semibold mb-4">Participation et cohésion</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <GroupStatsCard data={left} />
          <GroupStatsCard data={right} />
        </div>
      </section>

      <AffairsSection
        left={{
          count: left.affairs.length,
          byStatus: countBy(left.affairs, "status"),
          byMaturity: countByMaturity(left.affairs),
        }}
        right={{
          count: right.affairs.length,
          byStatus: countBy(right.affairs, "status"),
          byMaturity: countByMaturity(right.affairs),
        }}
        leftLabel={left.group.shortName ?? left.group.code}
        rightLabel={right.group.shortName ?? right.group.code}
      />

      <FactchecksSection
        left={{
          count: left.factCheckMentions.length,
          byVerdict: countBy(
            left.factCheckMentions.map((m) => m.factCheck),
            "verdictRating"
          ),
        }}
        right={{
          count: right.factCheckMentions.length,
          byVerdict: countBy(
            right.factCheckMentions.map((m) => m.factCheck),
            "verdictRating"
          ),
        }}
        leftLabel={left.group.shortName ?? left.group.code}
        rightLabel={right.group.shortName ?? right.group.code}
      />
    </div>
  );
}

function GroupInfoCard({ data }: { data: GroupComparisonData }) {
  const { group } = data;

  return (
    <div className="bg-muted rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-semibold flex items-center gap-1.5">
            {group.color && (
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: group.color }}
              />
            )}
            <span>{group.shortName ?? group.code}</span>
          </p>
          <p className="text-sm text-muted-foreground">{group.name}</p>
        </div>
      </div>

      <ul className="space-y-1.5 text-sm">
        <li className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Chambre</span>
          <span className="font-medium">{CHAMBER_LABELS[group.chamber as Chamber]}</span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Membres</span>
          <span className="font-medium">{group.memberCount}</span>
        </li>
        {group.defaultParty && (
          <li className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Parti principal</span>
            <span className="font-medium flex items-center gap-1.5">
              {group.defaultParty.color && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: group.defaultParty.color }}
                />
              )}
              {group.defaultParty.shortName}
            </span>
          </li>
        )}
        {group.legislature && (
          <li className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Législature</span>
            <span className="font-medium">{group.legislature}e</span>
          </li>
        )}
      </ul>
    </div>
  );
}

function GroupStatsCard({ data }: { data: GroupComparisonData }) {
  const { group, stats } = data;
  const label = group.shortName ?? group.code;

  return (
    <div className="bg-muted rounded-lg p-4">
      <p className="text-xs font-medium text-muted-foreground mb-3">{label}</p>

      <div className="space-y-4">
        {/* Participation */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm text-muted-foreground">Participation moyenne</span>
            <span className="text-sm font-semibold text-muted-foreground">Indisponible</span>
          </div>
          {group.chamber === "SENAT" && (
            <p className="text-xs text-muted-foreground">
              Le Sénat ne publie pas actuellement une donnée permettant de mesurer la présence
              individuelle de façon suffisamment fiable.
            </p>
          )}
        </div>

        {/* Cohesion */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm text-muted-foreground">Cohésion interne</span>
            <span className="text-2xl font-bold">{stats.cohesionRate}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full bg-purple-500 transition-all"
              style={{ width: `${stats.cohesionRate}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Part des membres votant comme la majorité du groupe
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Basé sur {stats.totalVotes.toLocaleString("fr-FR")} votes individuels
        </p>
      </div>
    </div>
  );
}
