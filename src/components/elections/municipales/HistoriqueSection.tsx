import { Card, CardContent } from "@/components/ui/card";
import { getPartyColor } from "@/config/party-colors";
import type { Historique2014, Historique2020 } from "@/lib/data/municipales";

/**
 * The "what happened here last time" card, shared by every past municipal election.
 *
 * 2014 and 2020 had a copy each. They drifted on one line: 2014 agreed the mayor label in the
 * feminine ("Maire élue"), 2020 did not. One component, one label, both years.
 */
interface HistoriqueSectionProps {
  /** The two payloads are structurally identical; the year only picks the heading. */
  data: Historique2014 | Historique2020;
  year: number;
}

/** Normalize ALL-CAPS list names to title case */
function normalizeLabel(raw: string): string {
  const letters = raw.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length === 0 || letters !== letters.toUpperCase()) return raw;
  return raw.replace(/[A-Za-zÀ-ÿ]+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** "Maire élue" when we know she is a woman, "Maire élu" otherwise. */
function mayorLabel(gender: string | null): string {
  return gender === "F" ? "Maire élue" : "Maire élu";
}

export function HistoriqueSection({ data, year }: HistoriqueSectionProps) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="pt-6">
        <h3 className="text-lg font-semibold mb-4">En {year}</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {/* Participation T1 */}
          <div>
            <dt className="text-sm text-muted-foreground">Participation</dt>
            <dd className="text-2xl font-bold tabular-nums">{data.participationT1.toFixed(1)} %</dd>
          </div>

          {/* Winning list */}
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-sm text-muted-foreground">Liste gagnante</dt>
            <dd className="flex items-center gap-2">
              {data.winningList.nuance && (
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: getPartyColor(data.winningList.nuance) }}
                  aria-hidden="true"
                />
              )}
              <span className="font-semibold" title={data.winningList.name}>
                {normalizeLabel(data.winningList.name)}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums shrink-0">
                {data.winningList.pct.toFixed(1)} %
              </span>
            </dd>
          </div>

          {/* Elected mayor */}
          {data.electedMayor && (
            <div>
              <dt className="text-sm text-muted-foreground">
                {mayorLabel(data.electedMayor.gender)}
              </dt>
              <dd className="font-semibold">{data.electedMayor.fullName}</dd>
            </div>
          )}

          {/* Total lists */}
          <div>
            <dt className="text-sm text-muted-foreground">Listes</dt>
            <dd className="text-2xl font-bold tabular-nums">{data.totalLists}</dd>
          </div>

          {/* Second round */}
          {data.hadSecondRound && data.participationT2 != null && (
            <div>
              <dt className="text-sm text-muted-foreground">2nd tour</dt>
              <dd className="text-2xl font-bold tabular-nums">
                {data.participationT2.toFixed(1)} %
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
