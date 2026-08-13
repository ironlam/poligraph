import Image from "next/image";
import { formatDate } from "@/lib/utils";
import { getJudicialMaturity } from "@/config/judicial-maturity";
import type { AffairStatus } from "@/types";
import { AffairsSection } from "../sections/AffairsSection";
import { FactchecksSection } from "../sections/FactchecksSection";
import { VoteConcordanceSection } from "../sections/VoteConcordanceSection";
import { PatrimoineSection } from "../sections/PatrimoineSection";
import { computeVoteConcordance, type PoliticianComparisonData } from "@/lib/data/compare";

interface Props {
  left: PoliticianComparisonData;
  right: PoliticianComparisonData;
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

export function SenateursComparison({ left, right }: Props) {
  const concordance = computeVoteConcordance(left.votes, right.votes);

  return (
    <div className="space-y-8">
      {/* Info block */}
      <section>
        <h3 className="text-lg font-display font-semibold mb-4">Informations</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <SenateurInfoCard data={left} />
          <SenateurInfoCard data={right} />
        </div>
      </section>

      <section aria-labelledby="senat-participation-heading">
        <h3 id="senat-participation-heading" className="text-lg font-display font-semibold mb-2">
          Participation aux votes
        </h3>
        <p className="text-sm text-muted-foreground">
          Le Sénat ne publie pas actuellement une donnée permettant de mesurer la présence
          individuelle de façon suffisamment fiable.
        </p>
      </section>

      {concordance.stats.total > 0 && (
        <VoteConcordanceSection
          stats={concordance.stats}
          recentDivergent={concordance.recentDivergent}
          compareVotesUrl={`/comparer/votes?cat=senateurs&a=${left.slug}&b=${right.slug}`}
          leftLabel={left.fullName}
          rightLabel={right.fullName}
        />
      )}

      <PatrimoineSection
        left={{ declarations: left.declarations }}
        right={{ declarations: right.declarations }}
        leftLabel={left.fullName}
        rightLabel={right.fullName}
      />

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
        leftLabel={left.fullName}
        rightLabel={right.fullName}
      />

      <FactchecksSection
        left={{
          count: left._count.factCheckMentions,
          byVerdict: countBy(
            left.factCheckMentions.map((m) => m.factCheck),
            "verdictRating"
          ),
        }}
        right={{
          count: right._count.factCheckMentions,
          byVerdict: countBy(
            right.factCheckMentions.map((m) => m.factCheck),
            "verdictRating"
          ),
        }}
        leftLabel={left.fullName}
        rightLabel={right.fullName}
      />
    </div>
  );
}

function SenateurInfoCard({ data }: { data: PoliticianComparisonData }) {
  const group = data.currentMandate.parliamentaryData?.parliamentaryGroup;

  return (
    <div className="bg-muted rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        {data.photoUrl && (
          <Image
            src={data.photoUrl}
            alt={data.fullName}
            width={48}
            height={48}
            className="rounded-full object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="font-semibold">{data.fullName}</p>
          {data.currentParty && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: data.currentParty.color || "#888" }}
              />
              {data.currentParty.shortName}
            </p>
          )}
        </div>
      </div>

      <ul className="space-y-1.5 text-sm">
        {group && (
          <li className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Groupe</span>
            <span className="font-medium text-right flex items-center gap-1.5">
              {group.color && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: group.color }}
                />
              )}
              {group.shortName ?? group.name}
            </span>
          </li>
        )}
        {data.currentMandate.departmentCode && (
          <li className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Département</span>
            <span className="font-medium text-right">{data.currentMandate.departmentCode}</span>
          </li>
        )}
        {data.currentMandate.constituency && (
          <li className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Circonscription</span>
            <span className="font-medium text-right">{data.currentMandate.constituency}</span>
          </li>
        )}
        <li className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Depuis le</span>
          <span className="font-medium">{formatDate(data.currentMandate.startDate)}</span>
        </li>
      </ul>
    </div>
  );
}
