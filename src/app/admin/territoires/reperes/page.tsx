import { Prisma } from "@/generated/prisma";
import { Card } from "@/components/ui/card";
import { repereIndicator } from "@/config/territoire-reperes";
import { db } from "@/lib/db";
import { isMissingTableError } from "@/lib/data/commune-population";
import { availableTransitions } from "@/lib/territoires/decisions";
import { formatDate } from "@/lib/utils";
import { LotTransitions } from "./LotTransitions";

export const metadata = { title: "Le territoire en chiffres (admin)", robots: { index: false } };

const SAMPLE_SIZE = 12;

const LOT_STATUS_LABELS = {
  DRAFT: "Brouillon",
  IN_REVIEW: "En revue",
  PUBLISHED: "Publié",
  REJECTED: "Rejeté",
} as const;

interface SampleRow {
  territoryCode: string;
  indicatorKey: string;
  value: number | null;
  unit: string;
  state: string;
}

/** A stable pseudo-random sample: the same lot shows the same rows at every reload. */
async function sampleOf(lotId: string): Promise<SampleRow[]> {
  return db.$queryRaw<SampleRow[]>(Prisma.sql`
    SELECT "territoryCode", "indicatorKey", "value", "unit", "state"::text AS "state"
    FROM "TerritoireRepere" WHERE "importId" = ${lotId}
    ORDER BY md5("id") LIMIT ${SAMPLE_SIZE}
  `);
}

async function loadLots() {
  try {
    const [lots, counts] = await Promise.all([
      db.repereImport.findMany({
        orderBy: { importedAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          rowCount: true,
          importedAt: true,
          reviewedBy: true,
          reviewedAt: true,
          source: { select: { producer: true, methodSlug: true } },
        },
      }),
      db.territoireRepere.groupBy({ by: ["importId", "state"], _count: { _all: true } }),
    ]);
    const samples = await Promise.all(lots.map((l) => sampleOf(l.id)));
    return lots.map((lot, i) => ({
      ...lot,
      byState: counts.filter((c) => c.importId === lot.id),
      sample: samples[i] ?? [],
    }));
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export default async function AdminReperesPage() {
  const lots = await loadLots();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Le territoire en chiffres
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lots importés. Un lot se relit sur un échantillon et sur ses comptes, puis se publie en
          entier. La publication ne rafraîchit aucune page : elles suivent leur cache de 24 h.
        </p>
      </header>

      {lots.length === 0 && <p className="text-sm">Aucun lot importé.</p>}

      {lots.map((lot) => (
        <Card key={lot.id} className="space-y-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-bold">
              {lot.source.producer} : {lot.source.methodSlug}
            </h2>
            <p className="text-sm font-semibold">{LOT_STATUS_LABELS[lot.status]}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Lot {lot.id}, importé le {formatDate(lot.importedAt)},{" "}
            {lot.rowCount.toLocaleString("fr-FR")} lignes.
            {lot.reviewedBy && lot.reviewedAt && (
              <>
                {" "}
                Relu par {lot.reviewedBy} le {formatDate(lot.reviewedAt)}.
              </>
            )}
          </p>

          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {lot.byState.map((c) => (
              <li key={c.state}>
                {c.state} :{" "}
                <span className="tabular-nums">{c._count._all.toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-1 text-left text-xs text-muted-foreground">
                Échantillon de {SAMPLE_SIZE} lignes, tiré de façon stable
              </caption>
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th scope="col" className="py-1 pr-4 font-semibold">
                    Commune
                  </th>
                  <th scope="col" className="py-1 pr-4 font-semibold">
                    Indicateur
                  </th>
                  <th scope="col" className="py-1 pr-4 font-semibold">
                    Valeur
                  </th>
                  <th scope="col" className="py-1 font-semibold">
                    État
                  </th>
                </tr>
              </thead>
              <tbody>
                {lot.sample.map((r) => (
                  <tr key={`${r.territoryCode}-${r.indicatorKey}`} className="border-b">
                    <td className="py-1 pr-4 tabular-nums">{r.territoryCode}</td>
                    <td className="py-1 pr-4">
                      {repereIndicator(r.indicatorKey)?.label ?? r.indicatorKey}
                    </td>
                    <td className="py-1 pr-4 tabular-nums">
                      {r.value === null
                        ? "non établi"
                        : `${r.value.toLocaleString("fr-FR")} ${r.unit}`}
                    </td>
                    <td className="py-1">{r.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <LotTransitions lotId={lot.id} actions={availableTransitions(lot.status)} />
        </Card>
      ))}
    </div>
  );
}
