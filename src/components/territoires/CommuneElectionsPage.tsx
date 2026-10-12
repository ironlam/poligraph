import Link from "next/link";
import { BRAND_NAVY, BRAND_PAGE, BRAND_RED } from "@/config/brand";
import { ScrutinLine } from "@/components/territoires/CommuneElections";
import type { CommuneElections } from "@/lib/data/territoire-elections";
import { formatPct } from "@/lib/territoires/commune-display";
import {
  decidingTour,
  SCRUTIN_TYPE_LABELS,
  SCRUTIN_TYPE_PARAMS,
  type CommuneScrutin,
  type ScrutinType,
} from "@/lib/territoires/commune-elections";
import {
  TERRITOIRES_DONNEES_PATH,
  TERRITOIRES_PATH,
  territoireCommuneElectionsPath,
  territoireCommunePath,
} from "@/lib/territoires/paths";
import { formatDate } from "@/lib/utils";

/**
 * Dedicated elections page of a commune (#1052; kit ElectionsHistorique.html and its mobile
 * version). Server components only: the filter is a set of links, the detail a native `<details>`.
 */

const LINK = "underline underline-offset-2 hover:text-primary";
const TAP = "inline-flex min-h-11 items-center";

export function CommuneElectionsBandeau({ inseeCode, name }: { inseeCode: string; name: string }) {
  return (
    <header className="text-white" style={{ backgroundColor: BRAND_NAVY }}>
      <div className="flex h-1" aria-hidden="true">
        <div className="flex-1" style={{ backgroundColor: BRAND_NAVY }} />
        <div className="flex-1" style={{ backgroundColor: BRAND_PAGE }} />
        <div className="flex-1" style={{ backgroundColor: BRAND_RED }} />
      </div>
      <div className="container mx-auto max-w-6xl px-4 py-4 md:py-6">
        <nav aria-label="Fil d'Ariane" className="text-sm text-white/85">
          <ol className="flex flex-wrap items-center gap-x-2">
            <li>
              <Link
                href={TERRITOIRES_PATH}
                prefetch={false}
                className="inline-flex min-h-11 items-center underline underline-offset-2 md:min-h-0"
              >
                Territoires
              </Link>
            </li>
            <li aria-hidden="true">›</li>
            <li>
              <Link
                href={territoireCommunePath(inseeCode)}
                prefetch={false}
                className="inline-flex min-h-11 items-center underline underline-offset-2 md:min-h-0"
              >
                {name}
              </Link>
            </li>
          </ol>
        </nav>
        <h1 className="mt-2 break-words font-display text-2xl font-extrabold tracking-tight md:text-4xl">
          Élections à {name}
        </h1>
      </div>
    </header>
  );
}

/** Reads the `type` query value; anything unknown means "all". */
export function scrutinTypeFromParam(value: string | undefined): ScrutinType | null {
  const found = (Object.keys(SCRUTIN_TYPE_PARAMS) as ScrutinType[]).find(
    (t) => SCRUTIN_TYPE_PARAMS[t] === value
  );
  return found ?? null;
}

function years(scrutins: CommuneScrutin[]): string {
  const ys = scrutins.map((s) => s.date?.slice(0, 4)).filter((y): y is string => !!y);
  if (ys.length === 0) return "";
  const min = ys.reduce((a, b) => (a < b ? a : b));
  const max = ys.reduce((a, b) => (a > b ? a : b));
  return min === max ? ` en ${min}` : ` entre ${min} et ${max}`;
}

function Filters({
  inseeCode,
  scrutins,
  active,
}: {
  inseeCode: string;
  scrutins: CommuneScrutin[];
  active: ScrutinType | null;
}) {
  const base = territoireCommuneElectionsPath(inseeCode);
  const types = (Object.keys(SCRUTIN_TYPE_LABELS) as ScrutinType[]).filter((t) =>
    scrutins.some((s) => s.type === t)
  );
  const items = [
    { href: base, label: "Tous", count: scrutins.length, current: active === null },
    ...types.map((t) => ({
      href: `${base}?type=${SCRUTIN_TYPE_PARAMS[t]}`,
      label: SCRUTIN_TYPE_LABELS[t],
      count: scrutins.filter((s) => s.type === t).length,
      current: active === t,
    })),
  ];
  const chip =
    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return (
    <nav aria-label="Filtrer par type de scrutin" className="mt-4">
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.label}>
            <Link
              href={i.href}
              prefetch={false}
              aria-current={i.current ? "page" : undefined}
              className={`${chip} ${
                i.current
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary/30 bg-card text-primary hover:bg-primary/5"
              }`}
            >
              {`${i.label} (${i.count})`}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function leadText(s: CommuneScrutin): { label: string; pct: string | null } {
  const lead = decidingTour(s).rows[0];
  return {
    label: lead?.label ?? "Non établi",
    pct: lead?.pct != null ? formatPct(lead.pct) : null,
  };
}

/** One table per type: the ballots side by side. Hidden on a phone, where the lines replace it. */
function ComparisonTable({ type, scrutins }: { type: ScrutinType; scrutins: CommuneScrutin[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-left text-sm">
        <caption className="mb-2 text-left font-display text-lg font-bold text-primary">
          {SCRUTIN_TYPE_LABELS[type]}
        </caption>
        <thead>
          <tr className="border-b text-muted-foreground">
            <th scope="col" className="py-2 pr-4 font-semibold">
              Scrutin
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Participation
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              En tête
            </th>
            <th scope="col" className="py-2 font-semibold">
              Part des exprimés
            </th>
          </tr>
        </thead>
        <tbody>
          {scrutins.map((s) => {
            const tour = decidingTour(s);
            const lead = leadText(s);
            return (
              <tr key={s.slug} className="border-b">
                <th scope="row" className="py-2 pr-4 font-semibold">
                  {s.title}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {tour.round === 1 ? "1er tour" : "2d tour"}
                    {tour.date && `, ${formatDate(tour.date)}`}
                  </span>
                </th>
                <td className="py-2 pr-4 tabular-nums">
                  {tour.participationRate != null
                    ? formatPct(tour.participationRate)
                    : "non établi"}
                </td>
                <td className="py-2 pr-4">{lead.label}</td>
                <td className="py-2 tabular-nums">{lead.pct ?? "non établi"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CommuneElectionsSections({
  data,
  active,
}: {
  data: CommuneElections;
  active: ScrutinType | null;
}) {
  const { commune, scrutins } = data;
  const shown = active ? scrutins.filter((s) => s.type === active) : scrutins;
  const types = (Object.keys(SCRUTIN_TYPE_LABELS) as ScrutinType[]).filter((t) =>
    shown.some((s) => s.type === t)
  );
  const n = scrutins.length;
  return (
    <>
      <p className="max-w-3xl text-sm leading-relaxed">
        {n === 1 ? "1 scrutin enregistré" : `${n} scrutins enregistrés`}
        {years(scrutins)} pour cette commune. Les résultats viennent des fichiers officiels du
        ministère de l{"'"}Intérieur, sans étiquette ni lecture politique.
      </p>
      <Filters inseeCode={commune.inseeCode} scrutins={scrutins} active={active} />

      <div className="mt-6 space-y-8">
        {types.map((type) => {
          const group = shown.filter((s) => s.type === type);
          return (
            <section key={type} aria-labelledby={`type-${type}`}>
              <h2
                id={`type-${type}`}
                className="font-display text-xl font-bold text-primary md:sr-only"
              >
                {SCRUTIN_TYPE_LABELS[type]}
              </h2>
              {group.length > 1 && <ComparisonTable type={type} scrutins={group} />}
              <ul className="mt-3 space-y-2">
                {group.map((s) => (
                  <li key={s.slug}>
                    <ScrutinLine scrutin={s} defaultOpen={s === shown[0]} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="mt-8 max-w-3xl text-sm text-muted-foreground">
        Les scrutins absents de cette page ne sont pas importés au niveau de la commune : ils sont
        non établis, jamais comptés comme zéro.{" "}
        <a href={`/api/v1/territoires/communes/${commune.inseeCode}`} className={`${TAP} ${LINK}`}>
          Données de la commune (JSON)
        </a>{" "}
        <Link href={TERRITOIRES_DONNEES_PATH} prefetch={false} className={`${TAP} ${LINK}`}>
          Fichiers CSV et licences
        </Link>
      </p>
    </>
  );
}
