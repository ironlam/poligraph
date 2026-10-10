import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, X } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/button";
import { MissingData } from "@/components/ui/MissingData";
import { NoResultsState, StateCard } from "@/components/governments/CompositionStates";
import { CopyLinkButton } from "@/components/governments/CopyLinkButton";
import { FiltersPanel } from "@/components/governments/FiltersPanel";
import { StatusBadge } from "@/components/governments/GovernmentBadges";
import {
  GovernmentMemberCard,
  type MemberCardFunction,
} from "@/components/governments/GovernmentMemberCard";
import { PolitiquesLocalNav } from "@/components/governments/PolitiquesLocalNav";
import { ReturnScrollRestorer } from "@/components/governments/RememberReturn";
import {
  episodeDates,
  formatDay,
  formatMonth,
  isPartial,
  personsLabel,
  plural,
} from "@/components/governments/format";
import { getGovernmentEpisodes, getPublishedGovernments } from "@/lib/data/governments";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  filterMembers,
  membersCoverage,
  type MemberFunction,
  type MemberRow,
} from "@/lib/governments/members";
import {
  MAX_QUERY_LENGTH,
  MEMBERS_PAGE_SIZE,
  parseMembersQuery,
  type MembersFunctionFilter,
  type MembersQuery,
} from "@/lib/governments/params";
import { normalizeText } from "@/lib/name-matching";

const PATH = "/politiques/gouvernements/membres";
const RETURN_LABEL = "Retour à « Membres des gouvernements »";

const FUNCTION_LABEL: Record<MembersFunctionFilter, string> = {
  pm: "Premier ministre",
  ministre: "Ministre",
  delegue: "Ministre délégué",
  secretaire: "Secrétaire d'État",
};

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  searchParams: Promise<SearchParams>;
}

function flatten(sp: SearchParams): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  return {
    title: "Membres des gouvernements",
    description:
      "Toutes les personnes ayant exercé une fonction dans un gouvernement publié, avec leurs fonctions, leurs dates et les sources officielles.",
    alternates: { canonical: PATH },
    ...(Object.keys(sp).length > 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

/** URL of the list with `query`, keeping only values that differ from the defaults. */
function hrefFor(query: MembersQuery, coverage: { from: string; to: string }): string {
  const params = new URLSearchParams();
  if (query.mode !== "periode") params.set("mode", query.mode);
  if (query.mode === "periode" && query.du !== coverage.from) params.set("du", query.du);
  if (query.au !== coverage.to) params.set("au", query.au);
  if (query.gouvernement) params.set("gouvernement", query.gouvernement);
  if (query.fonction) params.set("fonction", query.fonction);
  if (query.q) params.set("q", query.q);
  if (query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs ? `${PATH}?${qs}` : PATH;
}

function letterOf(row: MemberRow): string {
  const letter = normalizeText(row.person.lastName).charAt(0).toUpperCase();
  return /[A-Z]/.test(letter) ? letter : "#";
}

function functionBadge(fn: MemberFunction) {
  if (fn.status === "undocumented")
    return <StatusBadge tone="warning">Période à préciser</StatusBadge>;
  if (fn.status === "transition") {
    return <StatusBadge tone="warning">Transition à préciser</StatusBadge>;
  }
  if (fn.status === "currentAffairs") {
    return <StatusBadge tone="neutral">Affaires courantes</StatusBadge>;
  }
  return undefined;
}

function asideSummary(transitions: number, undocumented: number): string {
  const parts: string[] = [];
  if (transitions > 0) parts.push(`${personsLabel(transitions)} en transition à préciser`);
  if (undocumented > 0) parts.push(`${personsLabel(undocumented)} dont la période est à préciser`);
  return parts.length > 0
    ? `Listées à part : ${parts.join(" et ")}.`
    : "Aucune présence à préciser à cette date.";
}

/** Current URL as the browser shows it (form submissions keep empty fields), for the return. */
function currentUrl(raw: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (v !== undefined) params.append(k, v);
  const qs = params.toString();
  return qs ? `${PATH}?${qs}` : PATH;
}

/** Export URL carrying the filters of the page (the page number does not apply to a file). */
function exportHref(kind: "personnes" | "fonctions", selfUrl: string): string {
  const params = new URLSearchParams(selfUrl.split("?")[1] ?? "");
  params.delete("page");
  const qs = params.toString();
  return `/api/export/gouvernements/${kind}${qs ? `?${qs}` : ""}`;
}

export default async function MembresPage({ searchParams }: PageProps) {
  if (!(await isFeatureEnabled("gouvernements"))) notFound();

  const raw = flatten(await searchParams);
  const [govs, data] = await Promise.all([getPublishedGovernments(), getGovernmentEpisodes()]);
  const coverage = membersCoverage(govs);
  const govById = new Map(govs.map((g) => [g.id, g]));
  const anyPartial = govs.some(isPartial);

  const header = (
    <>
      <PolitiquesLocalNav current="gouvernements" />
      <ReturnScrollRestorer />
    </>
  );
  const breadcrumb = (
    <Breadcrumb
      items={[
        { label: "Politiques", href: "/politiques" },
        { label: "Gouvernements", href: "/politiques/gouvernements" },
        { label: "Membres" },
      ]}
    />
  );

  if (!coverage) {
    return (
      <>
        {header}
        <div className="container mx-auto flex flex-col gap-6 px-4 pb-10 pt-4">
          {breadcrumb}
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            Membres des gouvernements
          </h1>
          <MissingData title="Aucune composition documentée">
            Les membres seront listés ici dès qu&apos;un gouvernement publié aura une composition
            vérifiée.
          </MissingData>
        </div>
      </>
    );
  }

  const { query } = parseMembersQuery(raw, coverage, new Set(govs.map((g) => g.slug)));
  const result = filterMembers(govs, data, query);
  const selfUrl = currentUrl(raw);
  const reset = PATH;

  // Applied filters, each removable.
  const chips: { label: string; href: string }[] = [];
  if (query.mode === "present") {
    chips.push({
      label: `Présents au ${formatDay(query.au)}`,
      href: hrefFor({ ...query, mode: "periode", au: coverage.to, page: 1 }, coverage),
    });
  } else if (query.du !== coverage.from || query.au !== coverage.to) {
    chips.push({
      label: `Période : du ${formatDay(query.du)} au ${formatDay(query.au)}`,
      href: hrefFor({ ...query, du: coverage.from, au: coverage.to, page: 1 }, coverage),
    });
  }
  const selectedGov = govs.find((g) => g.slug === query.gouvernement);
  if (selectedGov) {
    chips.push({
      label: `Gouvernement : ${selectedGov.name}`,
      href: hrefFor({ ...query, gouvernement: null, page: 1 }, coverage),
    });
  }
  if (query.fonction) {
    chips.push({
      label: `Fonction : ${FUNCTION_LABEL[query.fonction]}`,
      href: hrefFor({ ...query, fonction: null, page: 1 }, coverage),
    });
  }
  const filterCount = chips.length;
  if (query.q) {
    chips.push({
      label: `Recherche : « ${query.q} »`,
      href: hrefFor({ ...query, q: "", page: 1 }, coverage),
    });
  }

  const ok = result.status === "ok" ? result : null;
  const main =
    ok && query.mode === "present"
      ? ok.persons.filter((p) => p.status === "established")
      : (ok?.persons ?? []);
  const transitionRows =
    ok && query.mode === "present" ? ok.persons.filter((p) => p.status === "transition") : [];
  const undocumentedRows =
    ok && query.mode === "present" ? ok.persons.filter((p) => p.status === "undocumented") : [];
  const shown = main.slice(0, query.page * MEMBERS_PAGE_SIZE);
  const letters = new Map<string, MemberRow[]>();
  for (const row of shown) {
    const l = letterOf(row);
    letters.set(l, [...(letters.get(l) ?? []), row]);
  }

  const toFunctions = (row: MemberRow): MemberCardFunction[] =>
    row.functions.map((fn) => {
      const gov = govById.get(fn.episode.governmentId);
      return {
        key: fn.episode.membershipId,
        title: fn.episode.title,
        detail: (
          <>
            {gov ? (
              <>
                <Link
                  href={`/politiques/gouvernements/${gov.slug}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {gov.name}
                </Link>{" "}
                ·{" "}
              </>
            ) : null}
            {episodeDates(fn.episode, row.person.gender)}
          </>
        ),
        badge: functionBadge(fn),
      };
    });

  const renderRows = (rows: MemberRow[]) => (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <GovernmentMemberCard
          key={row.person.id}
          person={row.person}
          functions={toFunctions(row)}
          returnUrl={selfUrl}
          returnLabel={RETURN_LABEL}
          nameClassName="font-display text-[17px] font-bold"
        />
      ))}
    </div>
  );

  const fieldClass = "h-11 w-full rounded-[10px] border border-input bg-background px-3 text-sm";

  return (
    <>
      {header}
      <div className="container mx-auto flex flex-col gap-6 px-4 pb-10 pt-4">
        {breadcrumb}

        <div className="max-w-2xl">
          <h1 className="text-balance font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            Membres des gouvernements
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Personnes ayant exercé une fonction dans un gouvernement publié. Périodes documentées :{" "}
            {formatMonth(coverage.from)} à {formatMonth(coverage.to)}
            {anyPartial ? ", couverture partielle." : "."}
          </p>
        </div>

        <form
          role="search"
          aria-label="Filtrer les membres"
          method="get"
          action={PATH}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="membres-q" className="text-sm font-medium">
              Rechercher une personne
            </label>
            <input
              id="membres-q"
              type="search"
              name="q"
              defaultValue={query.q}
              maxLength={MAX_QUERY_LENGTH}
              placeholder="Nom, avec ou sans accents"
              className={fieldClass}
            />
          </div>
          <FiltersPanel activeCount={filterCount}>
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1.2fr_1fr_auto] md:items-end">
              <div className="flex flex-col gap-1">
                <label htmlFor="membres-mode" className="text-sm font-medium">
                  Mode
                </label>
                <select
                  id="membres-mode"
                  name="mode"
                  defaultValue={query.mode}
                  className={fieldClass}
                >
                  <option value="periode">Fonctions exercées pendant la période</option>
                  <option value="present">Présents à une date</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="membres-du" className="text-sm font-medium">
                  Du
                </label>
                <input
                  id="membres-du"
                  type="date"
                  name="du"
                  defaultValue={query.du}
                  aria-describedby="membres-dates-aide"
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="membres-au" className="text-sm font-medium">
                  {query.mode === "present" ? "Présents au" : "Au"}
                </label>
                <input
                  id="membres-au"
                  type="date"
                  name="au"
                  defaultValue={query.au}
                  aria-describedby="membres-dates-aide"
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="membres-gouvernement" className="text-sm font-medium">
                  Gouvernement
                </label>
                <select
                  id="membres-gouvernement"
                  name="gouvernement"
                  defaultValue={query.gouvernement ?? ""}
                  className={fieldClass}
                >
                  <option value="">Tous</option>
                  {[...govs].reverse().map((g) => (
                    <option key={g.slug} value={g.slug}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="membres-fonction" className="text-sm font-medium">
                  Fonction
                </label>
                <select
                  id="membres-fonction"
                  name="fonction"
                  defaultValue={query.fonction ?? ""}
                  className={fieldClass}
                >
                  <option value="">Toutes</option>
                  {(Object.keys(FUNCTION_LABEL) as MembersFunctionFilter[]).map((f) => (
                    <option key={f} value={f}>
                      {FUNCTION_LABEL[f]}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="min-h-11">
                Appliquer
              </Button>
            </div>
            <p id="membres-dates-aide" className="mt-2 text-[12.5px] text-muted-foreground">
              En mode « Présents à une date », seule la seconde date compte.
            </p>
          </FiltersPanel>
        </form>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Filtres appliqués :</span>
            {chips.map((chip) => (
              <Link
                key={chip.label}
                href={chip.href}
                aria-label={`Retirer le filtre : ${chip.label}`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-3 hover:bg-muted"
              >
                {chip.label}
                <X className="size-3.5" aria-hidden="true" />
              </Link>
            ))}
            <Link
              href={reset}
              className="inline-flex min-h-11 items-center px-2 text-[13px] font-bold text-primary underline-offset-4 hover:underline"
            >
              Réinitialiser
            </Link>
          </div>
        )}

        {result.status === "not_established" ? (
          <StateCard
            tone="warning"
            title="Composition non établie à cette date"
            action={{ href: reset, label: "Réinitialiser les filtres" }}
          >
            Aucun gouvernement retenu n&apos;a de composition consultable au {formatDay(query.au)}.
            Ce n&apos;est pas une absence de membres.
          </StateCard>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
              <p>
                <span className="font-display text-[22px] font-extrabold">
                  {query.mode === "present"
                    ? plural(main.length, "personne présente", "personnes présentes")
                    : anyPartial
                      ? plural(main.length, "personne documentée", "personnes documentées")
                      : personsLabel(main.length)}
                </span>{" "}
                <span className="text-sm text-muted-foreground">
                  {query.mode === "present"
                    ? `de façon établie au ${formatDay(query.au)}.`
                    : `ayant exercé une fonction entre le ${formatDay(query.du)} et le ${formatDay(query.au)}.`}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {query.mode === "periode"
                  ? `${plural(ok!.establishedCount, "personne a", "personnes ont")} une fonction établie dans la période${
                      ok!.undocumentedCount > 0
                        ? ` ; pour ${plural(ok!.undocumentedCount, "autre", "autres")}, la période est à préciser (signalée sur la fiche).`
                        : "."
                    }`
                  : asideSummary(transitionRows.length, undocumentedRows.length)}
                {anyPartial ? " Couverture partielle : le total peut être incomplet." : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <CopyLinkButton />
                <Button asChild variant="outline" className="min-h-11">
                  <a href={exportHref("personnes", selfUrl)}>
                    <Download aria-hidden="true" />
                    Exporter les personnes
                  </a>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <a href={exportHref("fonctions", selfUrl)}>
                    <Download aria-hidden="true" />
                    Exporter les fonctions
                  </a>
                </Button>
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                « Exporter les personnes » : une ligne par personne. « Exporter les fonctions » :
                une ligne par épisode de fonction, avec dates et sources. Les deux suivent les
                filtres appliqués.
              </p>
            </div>

            <section aria-label="Résultats" className="flex flex-col gap-5">
              {main.length === 0 ? (
                <NoResultsState q={query.q} resetHref={reset} />
              ) : (
                [...letters].map(([letter, rows]) => (
                  <div key={letter} className="flex flex-col gap-3">
                    <h2 className="font-display text-xl font-extrabold text-primary">{letter}</h2>
                    {renderRows(rows)}
                  </div>
                ))
              )}

              {main.length > 0 && (
                <div className="flex flex-col items-start gap-2 text-sm">
                  <p className="text-muted-foreground">
                    {personsLabel(shown.length)} affichée{shown.length > 1 ? "s" : ""} sur{" "}
                    {main.length}
                  </p>
                  {shown.length < main.length && (
                    <Button asChild variant="outline" className="min-h-11">
                      <Link
                        href={hrefFor({ ...query, page: query.page + 1 }, coverage)}
                        scroll={false}
                      >
                        Afficher les personnes suivantes
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </section>

            {transitionRows.length > 0 && (
              <section aria-labelledby="membres-transition" className="flex flex-col gap-3">
                <h2 id="membres-transition" className="font-display text-xl font-bold">
                  Transition à préciser{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {personsLabel(transitionRows.length)}
                  </span>
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  Une sortie et une entrée datent de ce jour sans qu&apos;un acte ne les relie :
                  l&apos;ordre n&apos;est pas établi.
                </p>
                {renderRows(transitionRows)}
              </section>
            )}

            {undocumentedRows.length > 0 && (
              <section aria-labelledby="membres-a-preciser" className="flex flex-col gap-3">
                <h2 id="membres-a-preciser" className="font-display text-xl font-bold">
                  Période à préciser{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {personsLabel(undocumentedRows.length)}
                  </span>
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  Présence ni établie ni exclue à cette date : fin de fonction non documentée ou
                  date estimée.
                </p>
                {renderRows(undocumentedRows)}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
