import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { MissingData } from "@/components/ui/MissingData";
import { SourceLine } from "@/components/ui/SourceLine";
import { getDepartmentLocative } from "@/config/department-prepositions";
import {
  DELEGATES_BY_RIGHT_THRESHOLD,
  SUPPLEMENTARY_DELEGATE_FLOOR,
  SUPPLEMENTARY_DELEGATE_STEP,
} from "@/config/senatoriales";
import { COMMUNE_POPULATION_SOURCE } from "@/config/communes";
import { getCommuneCollege, getCommuneDataFetchedAt } from "@/lib/data/senatoriales";
import { inhabitantsPerDelegate } from "@/lib/senatoriales/college";
import { ELECTORAL_CODE_URL, GRANDS_ELECTEURS_TOTAL, SOURCE_ELECTORAL_CODE } from "../_content";

export const revalidate = 300;

/**
 * A city and a village of the same department, voting for the same seats. Both are in
 * série 2 (Gironde), so the comparison is not muddied by a difference of series.
 */
const CITY_INSEE = "33063"; // Bordeaux
const VILLAGE_INSEE = "33036"; // Bazas

export const metadata: Metadata = {
  title: "Le collège électoral sénatorial : qui vote à votre place",
  description:
    "Le nombre de grands électeurs d'une commune découle d'un barème, articles L. 284 et " +
    "L. 285 du code électoral. Le calcul posé sur une commune réelle, et la comparaison " +
    "ville contre village.",
  alternates: { canonical: "/elections/senatoriales-2026/college-electoral" },
};

function formatInt(value: number): string {
  return value.toLocaleString("fr-FR");
}

export default async function CollegeElectoralPage() {
  const [city, village, fetchedAt] = await Promise.all([
    getCommuneCollege(CITY_INSEE),
    getCommuneCollege(VILLAGE_INSEE),
    getCommuneDataFetchedAt(),
  ]);

  const cityLocative = getDepartmentLocative(city?.departmentCode);
  const populationSource = {
    label: `${COMMUNE_POPULATION_SOURCE.label}, via ${COMMUNE_POPULATION_SOURCE.via}`,
    url: COMMUNE_POPULATION_SOURCE.url,
  };

  return (
    <main id="main-content" className="container mx-auto max-w-3xl px-4 pt-4 pb-12">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Sénatoriales 2026", href: "/elections/senatoriales-2026" },
          { label: "Le collège électoral" },
        ]}
      />

      <div className="space-y-10">
        <header className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-on-surface">
            Le collège électoral sénatorial
          </p>
          <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight md:text-4xl">
            Qui vote à votre place
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-lg">
            Le nombre de grands électeurs d{"'"}une commune n{"'"}est ni négocié ni politique : c
            {"'"}est une formule, fixée aux articles L. 284 et L. 285 du code électoral.
            {city ? ` Appliquons-la à ${city.name}.` : ""}
          </p>
        </header>

        {/* ─── The calculation, laid out ─── */}
        {city === null || city.college === null ? (
          <MissingData title="Calcul indisponible">
            Il manque la population municipale ou l{"'"}effectif du conseil de la commune servant d
            {"'"}exemple. Nous ne remplaçons pas ces valeurs par une estimation.
          </MissingData>
        ) : (
          <section aria-labelledby="calcul-heading" className="space-y-4">
            <h2 id="calcul-heading" className="sr-only">
              Le calcul appliqué à {city.name}
            </h2>

            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {city.departmentName}
                {city.renewal === "renewed" ? " · série renouvelée le 27 septembre" : ""}
              </p>
              <p className="font-display text-2xl font-extrabold tracking-tight">{city.name}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  {/* muted-foreground-strong, not muted-foreground: 12px text on the
                      tinted bg-muted/50 measures 4.4:1 in dark with the base token. */}
                  <dt className="text-xs text-muted-foreground-strong">habitants</dt>
                  <dd className="font-display text-xl font-extrabold tabular-nums">
                    {formatInt(city.college.population)}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground-strong">conseillers municipaux</dt>
                  <dd className="font-display text-xl font-extrabold tabular-nums">
                    {formatInt(city.college.councilSeats)}
                  </dd>
                </div>
              </dl>
            </div>

            <ol className="space-y-3">
              <li className="flex gap-3 rounded-xl border border-border p-4">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted font-semibold tabular-nums"
                >
                  1
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {city.name} compte {formatInt(DELEGATES_BY_RIGHT_THRESHOLD)} habitants ou plus
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Les {formatInt(city.college.councilSeats)} conseillers municipaux sont donc{" "}
                    <strong className="font-semibold text-foreground">délégués de droit</strong>.
                    Ils n{"'"}ont pas à être élus une seconde fois. (art. L. 285)
                  </p>
                </div>
                <p className="shrink-0 font-display text-xl font-extrabold tabular-nums">
                  {formatInt(city.college.councilSeats)}
                </p>
              </li>

              <li className="flex gap-3 rounded-xl border border-border p-4">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted font-semibold tabular-nums"
                >
                  2
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {city.name} dépasse {formatInt(SUPPLEMENTARY_DELEGATE_FLOOR)} habitants
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Le conseil élit un délégué supplémentaire par tranche complète de{" "}
                    {SUPPLEMENTARY_DELEGATE_STEP} habitants au-delà de{" "}
                    {formatInt(SUPPLEMENTARY_DELEGATE_FLOOR)} : (
                    {formatInt(city.college.population)} − {formatInt(SUPPLEMENTARY_DELEGATE_FLOOR)}
                    ) ÷ {SUPPLEMENTARY_DELEGATE_STEP} ={" "}
                    {formatInt(city.college.supplementaryBrackets)} tranches complètes. Ces
                    délégués-là{" "}
                    <strong className="font-semibold text-foreground">ne sont pas des élus</strong>{" "}
                    : n{"'"}importe quel électeur de la commune peut l{"'"}être.
                  </p>
                </div>
                <p className="shrink-0 font-display text-xl font-extrabold tabular-nums">
                  + {formatInt(city.college.supplementaryDelegates)}
                </p>
              </li>

              <li className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                >
                  <Check className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {city.name} envoie {formatInt(city.college.total)} grands électeurs
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Sur les {formatInt(GRANDS_ELECTEURS_TOTAL)} qui votent le 27 septembre. Le vote
                    est obligatoire : un grand électeur qui s{"'"}abstient sans excuse encourt une
                    amende.
                  </p>
                </div>
                <p className="shrink-0 font-display text-xl font-extrabold tabular-nums">
                  {formatInt(city.college.total)}
                </p>
              </li>
            </ol>

            <SourceLine
              sources={[SOURCE_ELECTORAL_CODE, populationSource]}
              consultedAt={fetchedAt}
              note={
                fetchedAt
                  ? undefined
                  : "Date d'import du référentiel communal non enregistrée : geo.api.gouv.fr ne publie pas de millésime de population"
              }
            />
          </section>
        )}

        {/* ─── City against village ─── */}
        <section aria-labelledby="comparaison-heading" className="space-y-4">
          <div className="space-y-2">
            <h2
              id="comparaison-heading"
              className="font-display text-xl font-bold tracking-tight md:text-2xl"
            >
              La même formule, appliquée à un village
            </h2>
            {city && village && (
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                {village.name} est dans le même département que {city.name}
                {cityLocative ? "" : ""}, et vote pour les mêmes sièges.
              </p>
            )}
          </div>

          {city?.college && village?.college ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {[city, village].map((commune) => {
                  const ratio = inhabitantsPerDelegate(commune.college);
                  return (
                    <div key={commune.id} className="rounded-xl border border-border p-4">
                      <p className="font-display text-lg font-extrabold tracking-tight">
                        {commune.name}
                      </p>
                      <dl className="mt-2 space-y-1 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Habitants</dt>
                          <dd className="tabular-nums">{formatInt(commune.college!.population)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Conseillers municipaux</dt>
                          <dd className="tabular-nums">
                            {formatInt(commune.college!.councilSeats)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Grands électeurs</dt>
                          <dd className="tabular-nums">{formatInt(commune.college!.total)}</dd>
                        </div>
                      </dl>
                      {ratio !== null && (
                        <p className="mt-3 rounded-lg bg-muted/50 p-3">
                          <span className="font-display text-lg font-extrabold tabular-nums">
                            1 pour {formatInt(Math.round(ratio))}
                          </span>
                          <span className="block text-xs text-muted-foreground-strong">
                            habitants
                          </span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed">
                Cet écart est dans la loi, pas dans son application : le barème de l{"'"}article L.
                284 attribue des délégués par paliers de taille de conseil, et le supplément de l
                {"'"}article L. 285 ne compense qu{"'"}au-delà de{" "}
                {formatInt(SUPPLEMENTARY_DELEGATE_FLOOR)} habitants. C{"'"}est ce qui vaut au Sénat
                sa réputation de chambre des territoires ruraux.
              </p>
            </>
          ) : (
            <MissingData title="Comparaison indisponible">
              Il manque la population ou l{"'"}effectif du conseil de l{"'"}une des deux communes.
            </MissingData>
          )}
        </section>

        {/* ─── The remaining 5 % ─── */}
        <section aria-labelledby="autres-heading" className="space-y-4">
          <h2
            id="autres-heading"
            className="font-display text-xl font-bold tracking-tight md:text-2xl"
          >
            Et les grands électeurs qui ne sont pas des délégués municipaux
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
            Les délégués des conseils municipaux forment 95,2 % du collège. Le reste siège de droit.
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              ["Les députés", "Membres de droit du collège de leur département."],
              ["Les sénateurs", "Y compris ceux dont le siège n'est pas renouvelé cette année."],
              [
                "Les conseillers régionaux",
                "Au titre de la section départementale de leur liste d'élection.",
              ],
              ["Les conseillers départementaux", "L'ensemble du conseil départemental."],
            ].map(([term, detail]) => (
              <div key={term} className="rounded-xl border border-border p-4">
                <dt className="font-semibold">{term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
          <SourceLine
            sources={[
              { label: "Code électoral, art. L. 280 à L. 293", url: ELECTORAL_CODE_URL },
              { label: "Sénat", url: "https://senatoriales2026.senat.fr/" },
            ]}
          />
        </section>

        <Link
          href="/elections/senatoriales-2026"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour aux sénatoriales 2026
        </Link>
      </div>
    </main>
  );
}
