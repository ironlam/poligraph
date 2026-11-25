import Link from "next/link";
import {
  ChevronDown,
  CloudRain,
  Home,
  Leaf,
  Shield,
  Thermometer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SectionCard } from "@/components/territoires/CommuneSections";
import { LigneSource, type LigneSourceItem } from "@/components/territoires/LigneSource";
import {
  AGE_BANDS,
  EAU_LIMIT_SENTENCE,
  EAU_MIN_ANALYSES,
  EAU_NITRATES_LIMIT_MG_L,
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
import { LIEN, SOUS_BLOC } from "@/components/territoires/classes";

/**
 * "Le territoire en chiffres" (#1052, kit v3). Server component, no client state.
 *
 * It describes the territory and never its elected officials: its props carry no politician, no
 * mandate, no party. One neutral palette, no semantic colour, no score, no ranking. A figure that
 * is not established is said in words, with a dashed border, and is never rendered as a zero.
 *
 * The age structure and the climate averages are read without a tap, as bars and tiles; the
 * population (already in the banner) and the water analyses are one tap away. Icons name a theme
 * and are decorative: every figure keeps its label in words.
 */

const LINK = LIEN;
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
    <div className={established ? "" : "rounded-xl border border-dashed p-4"}>
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

const METHODE = `${TAP} ${LINK}`;

const THEME_ICONS: Record<RepereTheme, LucideIcon> = {
  DEMOGRAPHIE: Users,
  LOGEMENT: Home,
  ENVIRONNEMENT: Leaf,
  SECURITE: Shield,
};

const CLIMAT_ICONS: Record<string, LucideIcon> = {
  climat_temp_moyenne: Thermometer,
  climat_precipitations: CloudRain,
};

/** Bars on the scale of the widest band: they compare the bands of one commune, nothing else. */
function AgeBars({ rows }: { rows: RepereRow[] }) {
  const byKey = new Map(rows.map((r) => [r.indicatorKey, r]));
  const first = rows[0];
  if (!first) return null;
  const valueOf = (key: string) => {
    const row = byKey.get(key);
    return row?.value != null && row.state !== "NON_ETABLI" ? row.value : null;
  };
  const max = Math.max(0, ...AGE_BANDS.map((band) => valueOf(band.key) ?? 0));
  return (
    <div>
      <h3 className="flex items-center gap-2 font-semibold">
        <Users className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        Structure par âge
      </h3>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">Part de chaque tranche d{"'"}âge dans la population</caption>
        <tbody>
          {AGE_BANDS.map((band) => {
            const value = valueOf(band.key);
            return (
              <tr key={band.key}>
                <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-normal">
                  {band.label}
                </th>
                <td className="w-full py-1">
                  {value !== null && max > 0 && (
                    <div
                      aria-hidden="true"
                      className="h-2 overflow-hidden rounded-full bg-primary/15"
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.round((value / max) * 100)}%` }}
                      />
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap py-1 pl-3 text-right font-semibold tabular-nums">
                  {value !== null ? formatPct(value) : "non établi"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Du {formatEffectiveDate(first.periodStart)} au {formatEffectiveDate(first.periodEnd)}.{" "}
        <Link href={repereMethodePath("structure-par-age")} prefetch={false} className={METHODE}>
          Méthode
        </Link>
      </p>
    </div>
  );
}

function valueText(row: RepereRow): string {
  const n = row.value;
  if (n == null) return STATE_WORDS[row.state === "ETABLI" ? "NON_ETABLI" : row.state];
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${row.unit}`;
}

/** One line per distribution unit: each is said on its own, never averaged with another. */
function EauCard({ rows }: { rows: RepereRow[] }) {
  const first = rows[0];
  if (!first) return null;
  return (
    <Card title="Eau du robinet, nitrates" methodSlug="eau-du-robinet">
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={`${row.scopeId}-${row.periodEnd}`} className="text-sm">
            <p className="font-semibold">Unité de distribution : {row.scopeLabel}</p>
            <p>{eauSentence(row)}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed">{EAU_LIMIT_SENTENCE}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Une unité de distribution peut desservir une partie seulement de la commune, ou plusieurs
        communes.
      </p>
    </Card>
  );
}

function eauSentence(row: RepereRow): string {
  const n = row.sampleSize ?? 0;
  const period = `Du ${formatEffectiveDate(row.periodStart)} au ${formatEffectiveDate(row.periodEnd)}`;
  if (row.state !== "ETABLI" || row.value === null) {
    return `${period} : non établi, ${n} analyse${n > 1 ? "s" : ""} de nitrates, moins de ${EAU_MIN_ANALYSES} nécessaires.`;
  }
  const above = row.value === 0 ? "aucune au-dessus" : `${row.value} au-dessus`;
  return `${period}, ${n} analyses de nitrates : ${above} de la limite de qualité (${EAU_NITRATES_LIMIT_MG_L} mg/L).`;
}

/** "1991-2020", or "2002-2020" for a station that measured over fewer years. */
function periodYears(row: RepereRow): string {
  return `${row.periodStart.slice(0, 4)}-${row.periodEnd.slice(0, 4)}`;
}

function ClimatTuiles({ rows }: { rows: RepereRow[] }) {
  if (rows.length === 0) return null;
  const station = rows.find((r) => r.scopeLabel)?.scopeLabel ?? null;
  return (
    <div>
      <h3 className="sr-only">Climat, moyennes de la station</h3>
      <ul className="grid grid-cols-2 gap-3">
        {rows.map((row) => {
          const Icon = CLIMAT_ICONS[row.indicatorKey];
          return (
            <li key={row.indicatorKey} className={SOUS_BLOC}>
              {Icon && <Icon className="mb-1 h-6 w-6 text-primary" aria-hidden="true" />}
              <p className="font-display text-2xl font-bold tabular-nums text-primary">
                {valueText(row)}
              </p>
              <p className="text-xs text-muted-foreground">
                {repereIndicator(row.indicatorKey)?.label ?? row.indicatorKey}
                {row.value !== null && ` (sur ${periodYears(row)})`}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        {station && `${station}. `}
        <Link href={repereMethodePath("climat")} prefetch={false} className={METHODE}>
          Méthode
        </Link>
      </p>
    </div>
  );
}

/**
 * Latest period of each indicator on each measured scope. The reader returns every published
 * period, newest first; a commune served by two water units keeps both, each at its latest period.
 */
function latestPerIndicator(rows: RepereRow[]): RepereRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.indicatorKey}|${r.scopeKind}|${r.scopeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rowsOf(chiffres: CommuneChiffres) {
  const latest = latestPerIndicator(chiffres.reperes);
  return {
    ageRows: latest.filter((r) => r.indicatorKey.startsWith("age_tranche_")),
    climatRows: latest.filter((r) => r.indicatorKey.startsWith("climat_")),
    eauRows: latest.filter((r) => r.indicatorKey === "eau_nitrates"),
  };
}

/** Whether the block has anything to show: the page links to it only then. */
export function hasChiffres(chiffres: CommuneChiffres | null): chiffres is CommuneChiffres {
  if (!chiffres) return false;
  const { ageRows, climatRows, eauRows } = rowsOf(chiffres);
  return (
    chiffres.population !== null ||
    ageRows.length > 0 ||
    climatRows.length > 0 ||
    eauRows.length > 0
  );
}

export interface ChiffresSourceLigne {
  label: string;
  row: RepereRow;
}

/**
 * One row per card for « Sources de cette page »: producer, licence, period and import date of
 * the figures shown. The block itself names its producers once, on its source line.
 */
export function chiffresSourceLignes(chiffres: CommuneChiffres): ChiffresSourceLigne[] {
  const { ageRows, climatRows, eauRows } = rowsOf(chiffres);
  const lignes: [string, RepereRow | undefined][] = [
    ["Structure par âge", ageRows[0]],
    ["Eau du robinet, nitrates", eauRows[0]],
    ["Climat", climatRows[0]],
  ];
  return lignes.flatMap(([label, row]) => (row ? [{ label, row }] : []));
}

/** Themes with at least one figure. A theme with nothing to show is not shown at all. */
export function TerritoireChiffres({ chiffres }: { chiffres: CommuneChiffres }) {
  const { ageRows, climatRows, eauRows } = rowsOf(chiffres);
  const themes: { theme: RepereTheme; cards: React.ReactNode }[] = [];

  // The population card also says in words that a population is not established.
  if (chiffres.population || ageRows.length > 0) {
    themes.push({
      theme: "DEMOGRAPHIE",
      cards: (
        <>
          <PopulationCard chiffres={chiffres} />
        </>
      ),
    });
  }
  if (eauRows.length > 0) {
    themes.push({
      theme: "ENVIRONNEMENT",
      cards: (
        <>
          <EauCard rows={eauRows} />
        </>
      ),
    });
  }
  if (themes.length === 0 && ageRows.length === 0 && climatRows.length === 0) return null;

  // Producers of the block, linked ones first. The population names its producer without a link,
  // and is not repeated when a linked row already names it ("INSEE", "Insee").
  const sources: LigneSourceItem[] = chiffresSourceLignes(chiffres).map(({ row }) => ({
    label: row.source.producer,
    url: row.source.resourceUrl,
  }));
  const producteur = chiffres.population?.producer;
  if (producteur && !sources.some((s) => s.label.toLowerCase() === producteur.toLowerCase())) {
    sources.push({ label: producteur });
  }

  return (
    <SectionCard id="chiffres" title="Le territoire en chiffres">
      <p className="mb-4 text-sm text-muted-foreground">
        Des repères sur le territoire, sans lien avec ses élus. Chaque chiffre porte sa période ;
        les sources sont détaillées dans « Sources de cette page ».
      </p>
      <div className="space-y-5">
        <AgeBars rows={ageRows} />
        <ClimatTuiles rows={climatRows} />
        {themes.map(({ theme, cards }) => {
          const Icon = THEME_ICONS[theme];
          return (
            // Folded: the commune page stays short on a phone, and the figures stay in the served
            // HTML.
            <details key={theme} className="group rounded-xl border">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <h3
                  id={`chiffres-${theme}`}
                  className="flex items-center gap-2 font-display text-lg font-bold"
                >
                  <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  {REPERE_THEME_LABELS[theme]}
                </h3>
                <ChevronDown
                  className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <div className="border-t p-4">{cards}</div>
            </details>
          );
        })}
      </div>
      <LigneSource className="mt-4" sources={sources} />
    </SectionCard>
  );
}
