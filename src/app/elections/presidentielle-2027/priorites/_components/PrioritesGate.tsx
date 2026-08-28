import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PUBLICATION_GATES } from "@/config/publication-gates";
import type { PrioritesCandidacyRow, PrioritesData } from "@/lib/data/priorites";

/**
 * `/priorites` below its gate, per mockup `Etats limites.dc.html` § 3 (D4b).
 *
 * The rule this component exists to enforce: no bar, no percentage of distribution, no candidate
 * card is rendered below the threshold, not even greyed out. A distribution in percentages looks
 * like a scientific measurement, and a degraded one would still look like one. So the page renders
 * its own eligibility calculation instead, candidacy by candidacy, with every absence carrying its
 * reason.
 *
 * Every number here comes from `PrioritesData`. Nothing is hardcoded, including the thresholds,
 * which are read from `PUBLICATION_GATES` so that raising one cannot leave a stale figure on screen.
 */

const GATE = PUBLICATION_GATES.priorites;

function formatPercent(share: number): string {
  return `${Math.round(share * 100)} %`;
}

/** French decimal comma: "4,0", never "4.0". */
function formatRatio(ratio: number): string {
  return ratio.toFixed(1).replace(".", ",");
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/** "il en manque 3" under a figure below its threshold, "condition remplie" at or above it. */
function shortfall(value: number, threshold: number): string {
  return value >= threshold ? "condition remplie" : `il en manque ${threshold - value}`;
}

function ConditionState({ met }: { met: boolean }) {
  return (
    <Badge
      variant="outline"
      className={met ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}
    >
      {met ? "Remplie" : "Non remplie"}
    </Badge>
  );
}

/** The four cells of one candidacy, shared by the desktop table and the mobile card. */
function rowCells(row: PrioritesCandidacyRow) {
  return {
    measures: {
      value: String(row.verifiedMeasureCount),
      note: shortfall(row.verifiedMeasureCount, GATE.minVerifiedMeasures),
    },
    themes: {
      value: String(row.themesCoveredCount),
      note: shortfall(row.themesCoveredCount, GATE.minThemesCovered),
    },
    primary: {
      // A share needs a denominator. With no verified measure the cell reads "—", never "0 %",
      // which would state that the sources were checked and found wanting.
      value: row.primarySourceShare === null ? "—" : formatPercent(row.primarySourceShare),
      note:
        row.primarySourceShare === null
          ? "aucune mesure relue"
          : `${row.primarySourceMeasureCount} ${plural(row.primarySourceMeasureCount, "mesure", "mesures")} sur ${row.verifiedMeasureCount}`,
    },
    included: row.eligible ? "Incluse" : "Non incluse",
  };
}

/** How many of the three per-candidacy conditions this row fails. */
function unmetCount(row: PrioritesCandidacyRow): number {
  return [
    row.verifiedMeasureCount < GATE.minVerifiedMeasures,
    row.themesCoveredCount < GATE.minThemesCovered,
    row.primarySourceShare === null || row.primarySourceShare < GATE.minPrimarySourceShare,
  ].filter(Boolean).length;
}

/**
 * The mockup's 8×30 accent bar, coloured by how many conditions the row fails.
 *
 * It says how far OUR documentation is from the bar, never how good the candidate is, which is why
 * it carries a text label rather than colour alone: red beside a name reads as a verdict on the
 * person unless something says otherwise, and colour on its own would fail WCAG 1.4.1 anyway.
 */
function CoverageBar({ row }: { row: PrioritesCandidacyRow }) {
  const unmet = unmetCount(row);
  const tone =
    unmet === 0 ? "bg-primary" : unmet === 3 ? "bg-destructive" : "bg-amber-500 dark:bg-amber-400";

  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 h-7 w-2 shrink-0 rounded-sm ${tone}`}
      data-unmet={unmet}
    />
  );
}

function CandidateName({ row }: { row: PrioritesCandidacyRow }) {
  return (
    <>
      {row.politicianSlug !== null ? (
        <Link href={`/politiques/${row.politicianSlug}`} className="hover:underline">
          {row.candidateName}
        </Link>
      ) : (
        row.candidateName
      )}
      {row.partyLabel !== null && (
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          {row.partyLabel}
        </span>
      )}
    </>
  );
}

export function PrioritesGate({ data, evaluatedAt }: { data: PrioritesData; evaluatedAt: string }) {
  const { documentedRows, undocumentedCount, eligibleCount, coverageExtremes, coverageRatio } =
    data;

  // What today's state actually is, phrased from the numbers rather than asserted.
  const verdict =
    documentedRows.length === 0
      ? "aucune candidature ne porte encore de mesure vérifiée"
      : eligibleCount === 0
        ? "aucune candidature ne remplit les trois conditions"
        : eligibleCount < GATE.minEligibleCandidacies
          ? `une seule candidature les remplit, il en faut ${GATE.minEligibleCandidacies}`
          : "les conditions qui ne dépendent d'aucune candidature ne sont pas réunies";

  // "26 autres candidatures" is only true when some candidacy was detailed above. With no
  // documented row, "other" than what? The word is dropped rather than left to read as if a
  // detailed list had scrolled off.
  const aggregateLabel = [
    String(undocumentedCount),
    documentedRows.length > 0 ? plural(undocumentedCount, "autre", "autres") : null,
    plural(undocumentedCount, "candidature", "candidatures"),
  ]
    .filter((part) => part !== null)
    .join(" ");

  const globalConditions = [
    {
      key: "ratio",
      label: "Écart entre la candidature la mieux et la moins documentée",
      met: coverageRatio !== null && coverageRatio <= GATE.maxCoverageRatio,
      detail:
        coverageExtremes === null || coverageRatio === null
          ? `Pas encore calculable : l'écart demande ${GATE.minEligibleCandidacies} candidatures éligibles. Comparer 70 mesures à 8 produit une distribution qui a l'air rigoureuse et qui ne l'est pas.`
          : `Rapport de ${formatRatio(coverageRatio)} aujourd'hui (${coverageExtremes.most} mesures contre ${coverageExtremes.least}), pour un maximum de ${GATE.maxCoverageRatio}. Comparer 70 mesures à 8 produit une distribution qui a l'air rigoureuse et qui ne l'est pas.`,
    },
    {
      key: "corpus",
      label: "Corpus de même nature entre les candidatures comparées",
      met: data.corpusSameNature,
      detail:
        "La page ne compare que des programmes officiels complets. Quinze mesures tirées d'interviews et d'articles ne sont pas comparables à quarante-cinq mesures extraites d'un programme publié, même si les deux franchissent le seuil de sources primaires.",
    },
    {
      key: "doctrine",
      label: "Doctrine de segmentation publiée",
      met: data.segmentationDoctrinePublished,
      detail:
        "Travail éditorial en cours. Sans elle, le pourcentage par thème dépend autant de notre découpage des textes que de l'importance donnée au thème par la candidature.",
    },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="border-border text-muted-foreground">
            Page non indexée
          </Badge>
          <span>Seuils évalués le {evaluatedAt}</span>
        </div>
        <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight md:text-4xl">
          Corpus encore insuffisant pour comparer
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
          Cette page montre la part du programme de chaque candidature consacrée à chaque thème.
          Elle demande trois conditions par candidature incluse, au moins{" "}
          {GATE.minEligibleCandidacies} candidatures éligibles, et des conditions qui ne dépendent
          d&apos;aucune candidature. Aujourd&apos;hui : {verdict}.
        </p>
      </header>

      <section aria-labelledby="eligibilite" className="space-y-3">
        <h2 id="eligibilite" className="font-display text-lg font-bold tracking-tight">
          Le calcul d&apos;éligibilité, candidature par candidature
        </h2>

        {/* Desktop: the mockup's five-column table, inside its own panel. Mobile keeps stacked
            cards instead, so the panel stops at md rather than nesting a card inside a card. */}
        <div className="hidden overflow-x-auto rounded-xl border border-border bg-card p-5 md:block">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Éligibilité de chaque candidature à la comparaison des priorités, avec le seuil de
              chaque condition et l&apos;écart restant.
            </caption>
            <thead>
              <tr className="border-b border-border text-left align-bottom">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Candidature
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Ordre alphabétique
                  </span>
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Mesures vérifiées
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Seuil : {GATE.minVerifiedMeasures}
                  </span>
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Thématiques couvertes
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Seuil : {GATE.minThemesCovered} sur {GATE.totalThemes}
                  </span>
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Sources primaires
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Seuil : {formatPercent(GATE.minPrimarySourceShare)}
                  </span>
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Incluse
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Les trois conditions
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {documentedRows.map((row) => {
                const cells = rowCells(row);
                return (
                  <tr key={row.candidacyId} className="border-b border-border/60 align-top">
                    <th scope="row" className="py-3 pr-4 text-left font-semibold">
                      <span className="flex items-start gap-3">
                        <CoverageBar row={row} />
                        <span className="min-w-0">
                          <CandidateName row={row} />
                        </span>
                      </span>
                    </th>
                    {[cells.measures, cells.themes, cells.primary].map((cell, i) => (
                      <td key={i} className="py-3 pr-4">
                        <span className="font-semibold">{cell.value}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {cell.note}
                        </span>
                      </td>
                    ))}
                    <td className="py-3">
                      <ConditionState met={row.eligible} />
                    </td>
                  </tr>
                );
              })}

              {undocumentedCount > 0 && (
                <tr className="align-top">
                  <th scope="row" className="py-3 pr-4 text-left font-semibold">
                    <span className="flex items-start gap-3">
                      {/* Grey: these candidacies are not short of the bar, they are out of scope. */}
                      <span
                        aria-hidden="true"
                        className="mt-0.5 h-7 w-2 shrink-0 rounded-sm bg-border"
                      />
                      <span className="min-w-0 text-muted-foreground">
                        {aggregateLabel}
                        <span className="mt-0.5 block text-xs font-normal">
                          déclarées, pressenties ou envisagées
                        </span>
                      </span>
                    </span>
                  </th>
                  <td className="py-3 pr-4">
                    <span className="font-semibold">0</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      aucune mesure relue
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">Sans objet</td>
                  <td className="py-3 pr-4 text-muted-foreground">Sans objet</td>
                  <td className="py-3">
                    <Badge variant="outline" className="border-border text-muted-foreground">
                      Non incluses
                    </Badge>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: the same figures as stacked cards. A five-column table below md either overflows
            the viewport or shrinks the text past readability, so the layout changes rather than the
            content. */}
        <div className="space-y-3 md:hidden">
          {documentedRows.map((row) => {
            const cells = rowCells(row);
            return (
              <Card key={row.candidacyId}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex min-w-0 items-start gap-3 font-semibold leading-tight">
                      <CoverageBar row={row} />
                      <span className="min-w-0">
                        <CandidateName row={row} />
                      </span>
                    </p>
                    <ConditionState met={row.eligible} />
                  </div>
                  <dl className="space-y-2 text-sm">
                    {[
                      {
                        term: `Mesures vérifiées (seuil : ${GATE.minVerifiedMeasures})`,
                        ...cells.measures,
                      },
                      {
                        term: `Thématiques couvertes (seuil : ${GATE.minThemesCovered} sur ${GATE.totalThemes})`,
                        ...cells.themes,
                      },
                      {
                        term: `Sources primaires (seuil : ${formatPercent(GATE.minPrimarySourceShare)})`,
                        ...cells.primary,
                      },
                    ].map((cell) => (
                      <div key={cell.term} className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted-foreground">{cell.term}</dt>
                        <dd className="shrink-0 text-right">
                          <span className="font-semibold">{cell.value}</span>
                          <span className="block text-xs text-muted-foreground">{cell.note}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            );
          })}

          {undocumentedCount > 0 && (
            <Card>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">{aggregateLabel}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    déclarées, pressenties ou envisagées, aucune mesure relue
                  </p>
                </div>
                <Badge variant="outline" className="border-border text-muted-foreground">
                  {plural(undocumentedCount, "Non incluse", "Non incluses")}
                </Badge>
              </CardContent>
            </Card>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Une candidature non incluse voit son absence affichée avec sa raison. Elle n&apos;est
          jamais retirée silencieusement de la liste.
        </p>
      </section>

      <section aria-labelledby="conditions-globales" className="space-y-3">
        <h2 id="conditions-globales" className="font-display text-lg font-bold tracking-tight">
          Les conditions qui ne dépendent d&apos;aucune candidature
        </h2>
        <ul className="space-y-3">
          {globalConditions.map((condition) => (
            <li
              key={condition.key}
              className="rounded-lg border border-border p-4 sm:flex sm:items-start sm:gap-4"
            >
              <div className="shrink-0">
                <ConditionState met={condition.met} />
              </div>
              <div className="mt-2 min-w-0 sm:mt-0">
                <p className="text-sm font-semibold">{condition.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{condition.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="biais" className="space-y-3">
        <h2 id="biais" className="font-display text-lg font-bold tracking-tight">
          Le biais que les seuils chiffrés ne corrigent pas
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Un même passage de programme peut être découpé en une mesure, en deux, ou en cinq. Le même
          texte, trois lectures :
        </p>
        <ul className="space-y-2 rounded-xl border border-border bg-card p-4 sm:p-5">
          {[
            {
              reading: "« Rénover les écoles et recruter 5 000 enseignants »",
              weight: "1 mesure, Éducation 100 %",
            },
            {
              reading: "Rénovation d'un côté, recrutement de l'autre",
              weight: "2 mesures, Éducation 50 %, Logement 50 %",
            },
            {
              reading: "Bâtiments, normes, et trois catégories de recrutement",
              weight: "5 mesures, la même phrase pèse cinq fois plus",
            },
          ].map((row) => (
            <li
              key={row.reading}
              className="rounded-lg border border-border bg-muted/40 p-3 text-sm sm:flex sm:items-baseline sm:justify-between sm:gap-4"
            >
              <span>{row.reading}</span>
              <span className="mt-1 block shrink-0 font-semibold sm:mt-0 sm:text-right">
                {row.weight}
              </span>
            </li>
          ))}
        </ul>
        <p className="max-w-3xl text-sm text-muted-foreground">
          D&apos;où la doctrine de segmentation en prérequis, avec un échantillon relu par deux
          personnes indépendamment et une mesure de leur niveau d&apos;accord. La méthode sera
          publiée sur cette page le jour où elle s&apos;ouvre.
        </p>
      </section>

      <section aria-labelledby="en-attendant" className="space-y-3">
        <h2 id="en-attendant" className="font-display text-lg font-bold tracking-tight">
          En attendant, ce qui est consultable
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {data.publishableThemes.length > 0
            ? `Les mesures vérifiées, thématique par thématique, avec leur source et leur date de relecture. ${data.publishableThemes.length} ${plural(data.publishableThemes.length, "thématique franchit son seuil", "thématiques franchissent leur seuil")} aujourd'hui.`
            : "Aucune thématique n'est encore comparable. L'index des thématiques montre, pour chacune, le nombre de mesures vérifiées et ce qui manque pour ouvrir la comparaison."}
        </p>
        <div className="flex flex-wrap gap-2">
          {data.publishableThemes.map((theme) => (
            <Link
              key={theme.slug}
              href={`/elections/presidentielle-2027/themes/${theme.slug}`}
              className="inline-flex min-h-11 items-center rounded-full border border-primary/40 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              {theme.label}
            </Link>
          ))}
          <Link
            href="/elections/presidentielle-2027/themes"
            className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Les {GATE.totalThemes} thématiques
          </Link>
        </div>
      </section>
    </div>
  );
}
