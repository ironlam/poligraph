import Link from "next/link";
import { SectionCard } from "@/components/territoires/CommuneSections";
import {
  AGE_BANDS,
  REPERE_THEME_LABELS,
  repereIndicator,
  type RepereTheme,
} from "@/config/territoire-reperes";
import { repereMethodePath } from "@/config/territoire-methodes";
import type { CommuneChiffres } from "@/lib/data/territoire-chiffres";
import type { RepereRow, RepereState } from "@/lib/data/territoire-reperes";
import { formatPct, formatPopulation } from "@/lib/territoires/commune-display";
import { evolutionSentence, type EvolutionRefusal } from "@/lib/territoires/population-evolution";
import { populationVintageLabel, formatEffectiveDate } from "@/lib/territoires/population-label";
import { formatDate } from "@/lib/utils";

/**
 * "Le territoire en chiffres" (#1052, kit v3). Server component, no client state.
 *
 * It describes the territory and never its elected officials: its props carry no politician, no
 * mandate, no party. One neutral palette, no semantic colour, no score, no ranking. A figure that
 * is not established is said in words, with a dashed border, and is never rendered as a zero.
 */

const LINK = "underline underline-offset-2 hover:text-primary";
const TAP = "inline-flex min-h-11 items-center";

const STATE_WORDS: Record<Exclude<RepereState, "ETABLI">, string> = {
  PARTIEL: "Données partielles",
  NON_ETABLI: "Non établi",
  SECRET_STATISTIQUE: "Secret statistique",
  HORS_COUVERTURE: "Hors couverture de la source",
};

const REFUSAL_WORDS: Record<EvolutionRefusal, string> = {
  UN_SEUL_MILLESIME: "un seul millésime est disponible pour cette commune",
  PRODUCTEURS_DIFFERENTS: "les deux millésimes ne viennent pas du même producteur",
  MILLESIMES_INCOMPARABLES: "les deux millésimes ne sont pas comparables",
  SERIE_HORS_FICHIERS_NATIONAUX: "le périmètre n'est pas vérifié pour cette série",
};

function Card({
  title,
  methodSlug,
  children,
  established = true,
}: {
  title: string;
  methodSlug: string;
  children: React.ReactNode;
  established?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${established ? "" : "border-dashed"}`}>
      <h4 className="text-sm text-muted-foreground">{title}</h4>
      {children}
      <p className="mt-2 text-sm">
        <Link href={repereMethodePath(methodSlug)} prefetch={false} className={`${TAP} ${LINK}`}>
          Méthode
        </Link>
      </p>
    </div>
  );
}

function sourceLine(row: RepereRow) {
  return (
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
      Source :{" "}
      <a href={row.source.resourceUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
        {row.source.producer}
        <span className="sr-only"> (nouvel onglet)</span>
      </a>
      , licence{" "}
      <a href={row.source.licenceUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
        {row.source.licenceName}
        <span className="sr-only"> (nouvel onglet)</span>
      </a>
      . Période du {formatEffectiveDate(row.periodStart)} au {formatEffectiveDate(row.periodEnd)},
      importé le {formatDate(row.source.importedAt)}.
    </p>
  );
}

function PopulationCard({ chiffres }: { chiffres: CommuneChiffres }) {
  const { population, evolution } = chiffres;
  return (
    <Card title="Population" methodSlug="population" established={population !== null}>
      {population ? (
        <>
          <p className="font-display text-xl font-bold">{formatPopulation(population.value)}</p>
          <p className="text-xs text-muted-foreground">{populationVintageLabel(population)}.</p>
          <p className="mt-2 text-sm">
            {evolution.ok
              ? evolutionSentence(evolution)
              : `Évolution non établie : ${REFUSAL_WORDS[evolution.reason]}.`}
          </p>
        </>
      ) : (
        <p className="font-semibold">Non établi</p>
      )}
    </Card>
  );
}

function AgeCard({ rows }: { rows: RepereRow[] }) {
  const byKey = new Map(rows.map((r) => [r.indicatorKey, r]));
  const first = rows[0];
  if (!first) return null;
  return (
    <Card title="Structure par âge" methodSlug="structure-par-age">
      <table className="mt-1 w-full text-sm">
        <caption className="sr-only">Part de chaque tranche d{"'"}âge dans la population</caption>
        <tbody>
          {AGE_BANDS.map((band) => {
            const row = byKey.get(band.key);
            return (
              <tr key={band.key} className="border-b last:border-0">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {band.label}
                </th>
                <td className="py-1 text-right tabular-nums">
                  {row?.value != null && row.state !== "NON_ETABLI"
                    ? formatPct(row.value)
                    : "non établi"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sourceLine(first)}
    </Card>
  );
}

function valueText(row: RepereRow): string {
  const n = row.value;
  if (n == null) return STATE_WORDS[row.state === "ETABLI" ? "NON_ETABLI" : row.state];
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${row.unit}`;
}

function ClimatCard({ rows }: { rows: RepereRow[] }) {
  if (rows.length === 0) return null;
  const station = rows.find((r) => r.scopeLabel)?.scopeLabel ?? null;
  return (
    <Card title="Climat, normales 1991-2020" methodSlug="climat">
      {station && <p className="text-sm">{station}</p>}
      <ul className="mt-1 space-y-1">
        {rows.map((row) => (
          <li key={row.indicatorKey} className="text-sm">
            <span className="text-muted-foreground">
              {repereIndicator(row.indicatorKey)?.label ?? row.indicatorKey} :{" "}
            </span>
            <span className="font-semibold tabular-nums">{valueText(row)}</span>
          </li>
        ))}
      </ul>
      {sourceLine(rows[0] as RepereRow)}
    </Card>
  );
}

function rowsOf(chiffres: CommuneChiffres) {
  return {
    ageRows: chiffres.reperes.filter((r) => r.indicatorKey.startsWith("age_tranche_")),
    climatRows: chiffres.reperes.filter((r) => r.indicatorKey.startsWith("climat_")),
  };
}

/** Whether the block has anything to show: the page links to it only then. */
export function hasChiffres(chiffres: CommuneChiffres | null): chiffres is CommuneChiffres {
  if (!chiffres) return false;
  const { ageRows, climatRows } = rowsOf(chiffres);
  return chiffres.population !== null || ageRows.length > 0 || climatRows.length > 0;
}

/** Themes with at least one figure. A theme with nothing to show is not shown at all. */
export function TerritoireChiffres({ chiffres }: { chiffres: CommuneChiffres }) {
  const { ageRows, climatRows } = rowsOf(chiffres);
  const themes: { theme: RepereTheme; cards: React.ReactNode }[] = [];

  if (chiffres.population || ageRows.length > 0) {
    themes.push({
      theme: "DEMOGRAPHIE",
      cards: (
        <>
          <PopulationCard chiffres={chiffres} />
          <AgeCard rows={ageRows} />
        </>
      ),
    });
  }
  if (climatRows.length > 0) {
    themes.push({ theme: "ENVIRONNEMENT", cards: <ClimatCard rows={climatRows} /> });
  }
  if (themes.length === 0) return null;

  return (
    <SectionCard id="chiffres" title="Le territoire en chiffres">
      <p className="mb-4 text-sm text-muted-foreground">
        Des repères sur le territoire, sans lien avec ses élus. Chaque chiffre porte sa source et sa
        période.
      </p>
      <div className="space-y-5">
        {themes.map(({ theme, cards }) => (
          <section key={theme} aria-labelledby={`chiffres-${theme}`}>
            <h3 id={`chiffres-${theme}`} className="mb-2 font-display text-lg font-bold">
              {REPERE_THEME_LABELS[theme]}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">{cards}</div>
          </section>
        ))}
      </div>
    </SectionCard>
  );
}
