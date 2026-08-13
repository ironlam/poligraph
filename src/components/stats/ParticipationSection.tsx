import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HorizontalBars } from "./HorizontalBars";
import { MethodologyDisclaimer } from "./MethodologyDisclaimer";
import { ParliamentaryWorkCallout } from "./ParliamentaryWorkCallout";
import { ParticipationControls } from "./ParticipationControls";
import type {
  ParticipationRankingResult,
  GroupParticipationStats,
  GroupDissidenceStats,
} from "@/services/voteStats";
import type { Chamber } from "@/generated/prisma";

interface ParticipationSectionProps {
  ranking: ParticipationRankingResult;
  groupStatsAN: GroupParticipationStats[];
  groupStatsSENAT: GroupParticipationStats[];
  groupDissidenceAN: GroupDissidenceStats[];
  groupDissidenceSENAT: GroupDissidenceStats[];
  chamber?: Chamber;
  page: number;
  sortDirection: "ASC" | "DESC";
}

function dissidenceColor(rate: number): string {
  if (rate < 5) return "text-primary";
  if (rate < 15) return "text-green-600 dark:text-green-400";
  if (rate < 30) return "text-yellow-600 dark:text-yellow-400";
  return "text-orange-600 dark:text-orange-400";
}

function rateColor(rate: number): string {
  if (rate < 50) return "text-red-600 dark:text-red-400";
  if (rate < 75) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

function chamberLabel(mandateType: string): { label: string; variant: "default" | "secondary" } {
  if (mandateType === "DEPUTE") return { label: "AN", variant: "default" };
  if (mandateType === "SENATEUR") return { label: "Sénat", variant: "secondary" };
  return { label: mandateType, variant: "default" };
}

export function ParticipationSection({
  ranking,
  groupStatsAN,
  groupStatsSENAT: _groupStatsSENAT,
  groupDissidenceAN,
  groupDissidenceSENAT,
  chamber,
  page,
  sortDirection,
}: ParticipationSectionProps) {
  const sortedGroupsAN = [...groupStatsAN].sort(
    (a, b) => b.avgParticipationRate - a.avgParticipationRate
  );
  const allGroups = groupStatsAN;
  const avgRate =
    allGroups.length > 0
      ? allGroups.reduce((sum, g) => sum + g.avgParticipationRate, 0) / allGroups.length
      : 0;

  const totalParliamentarians = ranking.total;
  const totalPages = Math.ceil(ranking.total / 50);

  return (
    <section aria-labelledby="participation-heading" className="py-8">
      {/* Pedagogical callout */}
      <ParliamentaryWorkCallout />

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold tabular-nums">{avgRate.toFixed(0)}%</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">
              Participation moyenne
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold tabular-nums">
              {totalParliamentarians.toLocaleString("fr-FR")}
            </div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">
              Parlementaires suivis
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold tabular-nums">{allGroups.length}</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">Groupes représentés</div>
          </CardContent>
        </Card>
      </div>

      {/* Group participation */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-1">Participation par groupe</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Taux de présence moyen aux scrutins par groupe parlementaire
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Assemblée nationale</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedGroupsAN.length > 0 ? (
                <HorizontalBars
                  title="Groupes parlementaires AN"
                  maxValue={100}
                  bars={sortedGroupsAN.map((g) => ({
                    label: g.groupCode,
                    value: g.avgParticipationRate,
                    color: g.groupColor || undefined,
                    suffix: "%",
                  }))}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Aucune donnée</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sénat</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Le Sénat ne publie pas actuellement une donnée permettant de mesurer la présence
                individuelle de façon suffisamment fiable.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Group vote independence */}
      {(groupDissidenceAN.length > 0 || groupDissidenceSENAT.length > 0) && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-1">Dissidence</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Fréquence à laquelle les membres d{"'"}un groupe votent différemment de la majorité de
            leur groupe
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Assemblée nationale</CardTitle>
              </CardHeader>
              <CardContent>
                {groupDissidenceAN.length > 0 ? (
                  <HorizontalBars
                    title="Dissidence par groupe AN"
                    maxValue={100}
                    bars={groupDissidenceAN.map((g) => ({
                      label: g.groupCode,
                      value: g.avgDissidenceRate,
                      color: g.groupColor || undefined,
                      suffix: "%",
                    }))}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune donnée</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sénat</CardTitle>
              </CardHeader>
              <CardContent>
                {groupDissidenceSENAT.length > 0 ? (
                  <HorizontalBars
                    title="Dissidence par groupe Sénat"
                    maxValue={100}
                    bars={groupDissidenceSENAT.map((g) => ({
                      label: g.groupCode,
                      value: g.avgDissidenceRate,
                      color: g.groupColor || undefined,
                      suffix: "%",
                    }))}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune donnée</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Ranking table */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <CardTitle>Taux de présence aux scrutins</CardTitle>
            <ParticipationControls
              chamber={chamber}
              page={page}
              sortDirection={sortDirection}
              totalPages={totalPages}
            />
          </div>
        </CardHeader>
        <CardContent>
          {chamber === "SENAT" && (
            <p className="text-sm text-muted-foreground mb-4">
              La participation individuelle est indisponible pour le Sénat. Aucun sénateur
              n&apos;entre dans ce classement.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-2 w-10">#</th>
                  <th className="py-2 pr-2">Parlementaire</th>
                  <th className="py-2 pr-2">Groupe</th>
                  <th className="py-2 pr-2 text-right">Présences</th>
                  <th className="py-2 text-right">Taux</th>
                  <th
                    className="py-2 text-right hidden sm:table-cell"
                    title="Fréquence de vote différent de la majorité du groupe"
                  >
                    Dissidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranking.entries.map((entry, i) => {
                  const ch = chamberLabel(entry.mandateType);
                  const rank = (page - 1) * 50 + i + 1;
                  return (
                    <tr key={entry.politicianId} className="border-b last:border-0">
                      <td className="py-2 pr-2 tabular-nums text-muted-foreground">{rank}</td>
                      <td className="py-2 pr-2">
                        <Link
                          href={`/politiques/${entry.slug}`}
                          prefetch={false}
                          className="flex items-center gap-2 hover:underline"
                        >
                          {entry.photoUrl ? (
                            <Image
                              src={entry.photoUrl}
                              alt={`${entry.firstName} ${entry.lastName}`}
                              width={28}
                              height={28}
                              className="rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-muted" />
                          )}
                          <span className="font-medium">
                            {entry.firstName} {entry.lastName}
                          </span>
                          <Badge variant={ch.variant} className="text-xs shrink-0">
                            {ch.label}
                          </Badge>
                        </Link>
                      </td>
                      <td className="py-2 pr-2">
                        {entry.groupCode ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                            style={{
                              backgroundColor: entry.groupColor
                                ? `${entry.groupColor}33`
                                : "hsl(var(--muted))",
                              color: entry.groupColor || "hsl(var(--muted-foreground))",
                            }}
                          >
                            {entry.groupCode}
                          </span>
                        ) : entry.partyShortName ? (
                          <span className="text-xs text-muted-foreground">
                            {entry.partyShortName}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
                        {entry.votesCount}/{entry.eligibleScrutins}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums font-semibold ${rateColor(entry.participationRate)}`}
                      >
                        {entry.participationRate.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right tabular-nums hidden sm:table-cell">
                        {entry.dissidenceRate != null ? (
                          <span className={dissidenceColor(entry.dissidenceRate)}>
                            {entry.dissidenceRate}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <ParticipationControls
              chamber={chamber}
              page={page}
              sortDirection={sortDirection}
              totalPages={totalPages}
              paginationOnly
            />
          )}
        </CardContent>
      </Card>

      {/* Methodology disclaimer */}
      <MethodologyDisclaimer
        details={
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium mb-1">Sources et calcul</p>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                <li>Participation : scrutins publics de l&apos;Assemblée nationale uniquement</li>
                <li>Formule : votes enregistrés / scrutins éligibles durant le mandat × 100</li>
                <li>Les données Sénat ne permettent pas de mesurer assez fiablement la présence</li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-1">Limites de cet indicateur</p>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                <li>Ne mesure que les votes en séance plénière</li>
                <li>Le travail en commission n&apos;est pas comptabilisé</li>
                <li>
                  Certains parlementaires ont des fonctions qui les éloignent de l&apos;hémicycle
                  (ministres, questeurs, présidents de commission)
                </li>
                <li>Les votes par délégation ne sont pas toujours enregistrés individuellement</li>
              </ul>
            </div>
          </div>
        }
      >
        Le taux de participation est calculé en comparant le nombre de votes enregistrés pour chaque
        député au nombre total de scrutins de l&apos;Assemblée nationale pendant la durée de son
        mandat. Les taux du Sénat ne sont pas publiés. Source : data.assemblee-nationale.fr.
      </MethodologyDisclaimer>
    </section>
  );
}
