import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, FileText } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import {
  EstablishedAbsenceState,
  NotEstablishedState,
  OutOfRangeState,
} from "@/components/governments/CompositionStates";
import { CompositionDatePicker } from "@/components/governments/CompositionDatePicker";
import { CopyLinkButton } from "@/components/governments/CopyLinkButton";
import { GovernmentBadges, StatusBadge } from "@/components/governments/GovernmentBadges";
import {
  GovernmentMemberCard,
  type MemberCardFunction,
} from "@/components/governments/GovernmentMemberCard";
import { PolitiquesLocalNav } from "@/components/governments/PolitiquesLocalNav";
import { RememberReturn, ReturnScrollRestorer } from "@/components/governments/RememberReturn";
import {
  appointedOn,
  episodeDates,
  formatDay,
  FUNCTION_ORDER,
  FUNCTION_SECTION_LABEL,
  governmentDatesLine,
  isPartial,
  personsLabel,
  plural,
  safeExternalUrl,
} from "@/components/governments/format";
import { groupVisible, type PersonGroup } from "@/components/governments/view";
import { getGovernmentEpisodes, getPublishedGovernments } from "@/lib/data/governments";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { compositionAt, consultableRange, documentedChanges } from "@/lib/governments/composition";
import type {
  ActRef,
  GovernmentEpisode,
  PersonCard,
  PublishedGovernment,
} from "@/lib/governments/mapping";
import { parseCompositionDate } from "@/lib/governments/params";
import type { Change, CompositionResult, DateEvidence } from "@/lib/governments/types";

const BASE = "/politiques/gouvernements";

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const gov = (await getPublishedGovernments()).find((g) => g.slug === slug);
  if (!gov) return { title: "Gouvernement introuvable", robots: { index: false, follow: true } };
  return {
    title: `${gov.name} : composition et ministres`,
    description: `Composition du ${gov.name} date par date, avec la source officielle de chaque nomination, les changements documentés et la liste des participants.`,
    alternates: { canonical: `${BASE}/${gov.slug}` },
    ...(Object.keys(sp).length > 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

// --- Sources ----------------------------------------------------------------

function actDetails(act: ActRef): string {
  let text = `signé le ${formatDay(act.signedAt)}`;
  if (act.effectiveAt && act.effectiveAt !== act.signedAt) {
    text += `, effet le ${formatDay(act.effectiveAt)}`;
  }
  if (act.journalPublishedAt) {
    text += `, publié au Journal officiel le ${formatDay(act.journalPublishedAt)}`;
    if (act.journalNumber) text += ` (${act.journalNumber})`;
  }
  return text;
}

function ActLink({ act }: { act: ActRef }) {
  const href = safeExternalUrl(act.url);
  if (!href) return <>{act.label}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline-offset-4 hover:underline"
    >
      {act.label}
    </a>
  );
}

function ChangeSource({ change, acts }: { change: Change; acts: Map<string, ActRef> }) {
  const evidence: DateEvidence | null = change.evidence;
  if (evidence === "DATASET") {
    return (
      <>
        Date issue du jeu de données « Historique des gouvernements » (data.gouv) ; acte non vérifié
      </>
    );
  }
  if (evidence === "DERIVED") return <>Date estimée à partir des fonctions connues</>;
  if (evidence === "ACT" && safeExternalUrl(change.sourceUrl)) {
    const act = acts.get(change.sourceUrl!);
    if (act) {
      return (
        <>
          <ActLink act={act} />, {actDetails(act)}
        </>
      );
    }
    return (
      <a
        href={change.sourceUrl!}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-4 hover:underline"
      >
        Acte officiel
      </a>
    );
  }
  return null;
}

// --- Changes ----------------------------------------------------------------

const CHANGE_LABEL: Record<Change["kind"], string> = {
  formation: "Formation",
  entry: "Entrée",
  exit: "Sortie",
  titleChange: "Changement de fonction",
  resignation: "Démission",
  transition: "Transition à clarifier",
};

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
}

function describeChange(
  change: Change,
  gov: PublishedGovernment,
  byId: Map<string, GovernmentEpisode>,
  people: Record<string, PersonCard>
): string {
  const eps = change.membershipIds
    .map((id) => byId.get(id))
    .filter((e): e is GovernmentEpisode => e !== undefined);
  const visibleName = (ep: GovernmentEpisode) => {
    const p = people[ep.politicianId];
    return p && p.visibility !== "hidden" ? p.fullName : null;
  };
  const names = [...new Set(eps.map(visibleName).filter((n): n is string => n !== null))];

  switch (change.kind) {
    case "formation":
      return gov.formedAt && gov.formedAt !== gov.primeMinisterAppointedAt
        ? `Nomination du Premier ministre le ${formatDay(gov.primeMinisterAppointedAt)}, de l'équipe le ${formatDay(change.date)}.`
        : "Nomination de l'équipe gouvernementale.";
    case "entry": {
      const ep = eps[0];
      if (!ep) return "Entrée au gouvernement.";
      return names[0]
        ? `${names[0]} entre au gouvernement : ${ep.title}.`
        : `Entrée au gouvernement : ${ep.title}.`;
    }
    case "exit": {
      const ep = eps[0];
      if (!ep) return "Sortie du gouvernement.";
      return names[0]
        ? `${names[0]} quitte la fonction : ${ep.title}.`
        : `Fin de la fonction : ${ep.title}.`;
    }
    case "titleChange": {
      const [before, after] = eps;
      if (!before || !after) return "Changement d'intitulé.";
      const who = names[0] ? `${names[0]} : ` : "";
      return `${who}« ${before.title} » devient « ${after.title} ».`;
    }
    case "transition":
      return `Changements du même jour qu'aucun acte ne relie${names.length ? ` (${joinNames(names)})` : ""}. L'ordre n'est pas établi par les sources : ils sont signalés sans heure ni simultanéité supposées.`;
    case "resignation":
      return gov.currentAffairsAttested
        ? "Démission du gouvernement, chargé ensuite des affaires courantes (régime attesté par un acte)."
        : "Démission du gouvernement.";
  }
}

// --- Composition blocks -------------------------------------------------------

function previousTitle(ep: GovernmentEpisode, byId: Map<string, GovernmentEpisode>): string | null {
  const prev = ep.predecessorMembershipId ? byId.get(ep.predecessorMembershipId) : undefined;
  return prev && prev.politicianId === ep.politicianId && prev.title !== ep.title
    ? prev.title
    : null;
}

function MemberGrid({
  groups,
  fn,
  returnUrl,
  returnLabel,
}: {
  groups: PersonGroup[];
  fn: (ep: GovernmentEpisode, person: PersonCard) => MemberCardFunction;
  returnUrl: string;
  returnLabel: string;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {groups.map((g) => (
        <GovernmentMemberCard
          key={g.person.id}
          person={g.person}
          functions={g.episodes.map((ep) => fn(ep, g.person))}
          returnUrl={returnUrl}
          returnLabel={returnLabel}
        />
      ))}
    </div>
  );
}

// --- Page -------------------------------------------------------------------

export default async function GovernmentPage({ params, searchParams }: PageProps) {
  if (!(await isFeatureEnabled("gouvernements"))) notFound();

  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const [govs, data] = await Promise.all([getPublishedGovernments(), getGovernmentEpisodes()]);
  const index = govs.findIndex((g) => g.slug === slug);
  if (index === -1) notFound();
  const gov = govs[index]!;
  const prev = govs[index - 1];
  const next = govs[index + 1];

  const own = data.episodes.filter((e) => e.governmentId === gov.id);
  const byId = new Map(own.map((e) => [e.membershipId, e]));
  const range = consultableRange(gov);
  const requested = parseCompositionDate(first(sp.date));
  const date = requested ?? range?.to ?? null;

  // Every dated case goes through compositionAt; only a missing date needs a hand-built state.
  const result: CompositionResult = date
    ? compositionAt(gov, own, date)
    : { status: "not_established", reason: gov.formedAt ? "not_verified" : "no_formation_date" };

  const selfUrl = `${BASE}/${gov.slug}`;
  const returnUrl = requested ? `${selfUrl}?date=${requested}` : selfUrl;
  const returnLabel = date
    ? `Retour à la composition du ${gov.name} au ${formatDay(date)}`
    : `Retour au ${gov.name}`;

  const changes = documentedChanges(gov, own);
  const actsByUrl = new Map<string, ActRef>();
  for (const act of [
    ...own.flatMap((e) => [e.startAct, e.endAct, e.currentAffairsEndAct]),
    ...Object.values(gov.acts),
  ]) {
    if (act) actsByUrl.set(act.url, act);
  }
  // Resignation changes carry no URL in the pure layer: the government act completes them.
  const changeRows = changes
    .map((c) =>
      c.kind === "resignation" && !c.sourceUrl && gov.acts.resigned
        ? { ...c, sourceUrl: gov.acts.resigned.url }
        : c
    )
    .reverse();

  // Shortcuts: formation, each documented change day, last documented composition.
  const shortcuts: { date: string; label: string }[] = [];
  if (range) {
    shortcuts.push({ date: range.from, label: "Formation" });
    const days = new Map<string, Set<Change["kind"]>>();
    for (const c of changes) {
      if (c.date <= range.from || c.date >= range.to) continue;
      days.set(c.date, (days.get(c.date) ?? new Set()).add(c.kind));
    }
    for (const [day, kinds] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
      shortcuts.push({
        date: day,
        label: kinds.has("transition")
          ? "Transition"
          : kinds.has("resignation") && kinds.size === 1
            ? "Démission"
            : "Changement",
      });
    }
    if (range.to !== range.from) {
      shortcuts.push({ date: range.to, label: "Dernière composition documentée" });
    }
  }

  const ok = result.status === "ok" ? result : null;
  const partial = isPartial(gov);
  const establishedEpisodes = ok
    ? [...ok.byCategory.established, ...ok.byCategory.currentAffairs]
    : [];
  const currentAffairsIds = new Set(ok?.byCategory.currentAffairs.map((e) => e.membershipId));
  const establishedVisible = groupVisible(establishedEpisodes, byId, data.people);
  const transitionGroups = ok ? groupVisible(ok.byCategory.transition, byId, data.people) : [];
  const undocumentedGroups = ok ? groupVisible(ok.byCategory.undocumented, byId, data.people) : [];
  const dayShortcuts =
    ok && range && ok.byCategory.transition.length > 0
      ? [
          { date: addDays(ok.date, -1), label: "Veille" },
          { date: addDays(ok.date, 1), label: "Lendemain" },
        ].filter((s) => s.date >= range.from && s.date <= range.to)
      : [];

  const participants = groupVisible(own, byId, data.people).sort(
    (a, b) =>
      (a.episodes[0]?.start ?? "").localeCompare(b.episodes[0]?.start ?? "") ||
      a.person.lastName.localeCompare(b.person.lastName, "fr")
  );
  const shownParticipants = participants.slice(0, 10);
  const moreParticipants = participants.slice(10);

  const pmPerson = Object.values(data.people).find((p) => p.slug === gov.primeMinister.slug);
  const pmLinked = pmPerson?.visibility === "published";

  const sourceActs = [
    gov.acts.primeMinisterAppointed,
    gov.acts.formed,
    gov.acts.resigned,
    gov.acts.currentAffairs,
    gov.acts.ended,
  ].filter((a, i, all): a is ActRef => a !== null && all.findIndex((b) => b?.url === a.url) === i);

  const composedFn =
    (category: "established" | "transition" | "undocumented") =>
    (ep: GovernmentEpisode, person: PersonCard): MemberCardFunction => {
      if (category === "established") {
        const previous = previousTitle(ep, byId);
        return {
          key: ep.membershipId,
          title: ep.title,
          detail: `${appointedOn(person.gender, ep.start)}${previous ? ` · intitulé précédent : ${previous}` : ""}`,
          badge: currentAffairsIds.has(ep.membershipId) ? (
            <StatusBadge tone="neutral">Affaires courantes</StatusBadge>
          ) : undefined,
        };
      }
      return {
        key: ep.membershipId,
        title: ep.title,
        detail: episodeDates(ep, person.gender),
        badge:
          category === "transition" ? (
            <StatusBadge tone="warning">
              Transition le {formatDay(ok!.date)} : ordre non établi
            </StatusBadge>
          ) : (
            <StatusBadge tone="warning">Période à préciser</StatusBadge>
          ),
      };
    };

  return (
    <>
      <PolitiquesLocalNav current="gouvernements" />
      <ReturnScrollRestorer />
      <div className="container mx-auto flex flex-col gap-6 px-4 pb-10 pt-4">
        <Breadcrumb
          items={[
            { label: "Politiques", href: "/politiques" },
            { label: "Gouvernements", href: BASE },
            { label: gov.name },
          ]}
        />

        <header className="flex flex-col gap-3">
          <h1 className="text-balance font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            {gov.name}
          </h1>
          <p className="text-sm">
            {gov.primeMinister.gender === "F" ? "Première ministre" : "Premier ministre"} :{" "}
            {pmLinked ? (
              <RememberReturn
                targetSlug={gov.primeMinister.slug}
                returnUrl={returnUrl}
                label={returnLabel}
                className="font-bold text-primary underline-offset-4 hover:underline"
              >
                {gov.primeMinister.fullName}
              </RememberReturn>
            ) : (
              <strong>{gov.primeMinister.fullName}</strong>
            )}
          </p>
          <p className="text-[13px] text-muted-foreground">{governmentDatesLine(gov)}</p>
          <div className="flex flex-wrap gap-2">
            <GovernmentBadges gov={gov} detail />
            {range && (
              <StatusBadge tone="neutral">
                Période consultable : du {formatDay(range.from)} au {formatDay(range.to)}
              </StatusBadge>
            )}
          </div>
          {gov.acts.formed && (
            <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
              <FileText className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Source de référence : <ActLink act={gov.acts.formed} />,{" "}
                {actDetails(gov.acts.formed)}
              </span>
            </p>
          )}
        </header>

        <nav aria-label="Sur cette page">
          <ul className="flex flex-wrap gap-2">
            {[
              ["#composition", "Composition"],
              ["#changements", "Changements"],
              ["#participants", "Tous les participants"],
              ["#sources", "Sources"],
            ].map(([href, label]) => (
              <li key={href}>
                <a
                  href={href}
                  className="inline-flex min-h-11 items-center rounded-full border bg-card px-4 text-sm font-medium hover:bg-muted"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {(prev || next) && (
          <nav
            aria-label="Gouvernements précédent et suivant"
            className="flex flex-wrap justify-between gap-3 text-sm font-bold text-primary"
          >
            {prev ? (
              <Link
                href={`${BASE}/${prev.slug}`}
                className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:underline"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Gouvernement précédent : {prev.name}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link
                href={`${BASE}/${next.slug}`}
                className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:underline"
              >
                Gouvernement suivant : {next.name}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </nav>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-8">
            <section
              id="composition"
              aria-labelledby="composition-title"
              className="flex flex-col gap-5"
            >
              <h2 id="composition-title" className="sr-only">
                Composition
              </h2>
              <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
                {range && date ? (
                  <CompositionDatePicker
                    action={selfUrl}
                    date={date}
                    min={range.from}
                    max={range.to}
                    label={
                      date === range.to ? "Dernière composition documentée, au" : "Composition au"
                    }
                  />
                ) : (
                  <p className="font-display text-[17px] font-bold">Composition</p>
                )}
                {(shortcuts.length > 0 || dayShortcuts.length > 0) && (
                  <div
                    role="group"
                    aria-label="Raccourcis : formation et changements documentés"
                    className="flex flex-wrap gap-2"
                  >
                    {[...shortcuts, ...dayShortcuts].map((s) => {
                      const active = s.date === date;
                      return (
                        <Link
                          key={`${s.label}-${s.date}`}
                          href={`${selfUrl}?date=${s.date}`}
                          aria-current={active ? "true" : undefined}
                          className={
                            active
                              ? "inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
                              : "inline-flex min-h-11 items-center rounded-full border bg-card px-4 text-sm hover:bg-muted"
                          }
                        >
                          {formatDay(s.date)} · {s.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
                {range && date === range.to && (
                  <p className="text-[13px] text-muted-foreground">
                    Cette date est la dernière couverte par la documentation ; elle ne décrit pas
                    forcément l&apos;état présent. Les membres partis avant cette date figurent dans
                    « Tous les participants ».
                  </p>
                )}
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <CopyLinkButton />
                </div>
              </div>

              {result.status === "out_of_range" && date && (
                <OutOfRangeState
                  govName={gov.name}
                  date={date}
                  range={result.range}
                  baseHref={selfUrl}
                />
              )}
              {result.status === "not_established" && (
                <NotEstablishedState
                  reason={result.reason}
                  date={date}
                  formedAt={gov.formedAt}
                  baseHref={selfUrl}
                />
              )}

              {ok && (
                <>
                  {ok.caretaker && (
                    <div
                      role="note"
                      className="rounded-2xl border border-warning-border bg-warning px-4 py-3 text-sm text-warning-foreground"
                    >
                      <strong>Gouvernement démissionnaire chargé des affaires courantes</strong>
                      {gov.resignedAt ? ` (démission le ${formatDay(gov.resignedAt)}).` : "."}
                    </div>
                  )}
                  <p>
                    <span className="font-display text-[22px] font-extrabold">
                      {partial ? "au moins " : ""}
                      {plural(
                        establishedVisible.length,
                        "personne présente",
                        "personnes présentes"
                      )}
                    </span>{" "}
                    <span className="text-sm text-muted-foreground">
                      de façon établie au {formatDay(ok.date)}
                    </span>
                  </p>

                  {establishedVisible.length === 0 && (
                    <EstablishedAbsenceState date={ok.date} partial={partial} />
                  )}

                  {FUNCTION_ORDER.map((type) => {
                    const groups = groupVisible(
                      establishedEpisodes.filter((e) => e.type === type),
                      byId,
                      data.people
                    );
                    if (groups.length === 0) return null;
                    return (
                      <section
                        key={type}
                        aria-labelledby={`rang-${type}`}
                        className="flex flex-col gap-3"
                      >
                        <h3 id={`rang-${type}`} className="font-display text-[17px] font-bold">
                          {FUNCTION_SECTION_LABEL[type]}{" "}
                          <span className="text-[13px] font-normal text-muted-foreground">
                            {personsLabel(groups.length)}
                          </span>
                        </h3>
                        <MemberGrid
                          groups={groups}
                          fn={composedFn("established")}
                          returnUrl={returnUrl}
                          returnLabel={returnLabel}
                        />
                      </section>
                    );
                  })}

                  {transitionGroups.length > 0 && (
                    <section
                      aria-labelledby="bloc-transition"
                      className="flex flex-col gap-3 rounded-2xl border border-dashed p-4"
                    >
                      <h3 id="bloc-transition" className="font-display text-[17px] font-bold">
                        Transition du {formatDay(ok.date)}{" "}
                        <span className="text-[13px] font-normal text-muted-foreground">
                          {plural(
                            transitionGroups.length,
                            "personne concernée",
                            "personnes concernées"
                          )}
                        </span>
                      </h3>
                      <p className="text-[13px] text-muted-foreground">
                        Une sortie et une entrée datent de ce jour sans qu&apos;un acte ne les
                        relie. L&apos;ordre n&apos;est pas établi : ces personnes ne comptent pas
                        dans l&apos;effectif établi.
                      </p>
                      <MemberGrid
                        groups={transitionGroups}
                        fn={composedFn("transition")}
                        returnUrl={returnUrl}
                        returnLabel={returnLabel}
                      />
                    </section>
                  )}

                  {undocumentedGroups.length > 0 && (
                    <section
                      aria-labelledby="bloc-a-preciser"
                      className="flex flex-col gap-3 rounded-2xl border border-dashed p-4"
                    >
                      <h3 id="bloc-a-preciser" className="font-display text-[17px] font-bold">
                        Période à préciser{" "}
                        <span className="text-[13px] font-normal text-muted-foreground">
                          {personsLabel(undocumentedGroups.length)}
                        </span>
                      </h3>
                      <p className="text-[13px] text-muted-foreground">
                        Présence ni établie ni exclue au {formatDay(ok.date)} : fin de fonction non
                        documentée ou date estimée. Ces personnes ne comptent pas dans
                        l&apos;effectif établi.
                      </p>
                      <MemberGrid
                        groups={undocumentedGroups}
                        fn={composedFn("undocumented")}
                        returnUrl={returnUrl}
                        returnLabel={returnLabel}
                      />
                    </section>
                  )}
                </>
              )}
            </section>

            <section
              id="changements"
              aria-labelledby="changements-title"
              className="flex flex-col gap-3"
            >
              <h2 id="changements-title" className="font-display text-xl font-bold">
                Changements documentés
              </h2>
              {changeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun changement documenté.</p>
              ) : (
                <ul className="divide-y rounded-2xl border bg-card">
                  {changeRows.map((c) => (
                    <li
                      key={`${c.date}-${c.kind}-${c.membershipIds.join(",")}`}
                      className="grid grid-cols-[110px_1fr] gap-3 p-4"
                    >
                      <span className="text-[13px] font-bold">{formatDay(c.date)}</span>
                      <div className="min-w-0 text-sm">
                        <p>
                          <strong>{CHANGE_LABEL[c.kind]}</strong> ·{" "}
                          {describeChange(c, gov, byId, data.people)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <ChangeSource change={c} acts={actsByUrl} />
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              id="participants"
              aria-labelledby="participants-title"
              className="flex flex-col gap-3"
            >
              <h2 id="participants-title" className="font-display text-xl font-bold">
                Tous les participants
              </h2>
              <p className="text-sm text-muted-foreground">
                {partial
                  ? `Au moins ${plural(participants.length, "personne documentée a", "personnes documentées ont")} participé à ce gouvernement, y compris celles parties avant la date choisie.`
                  : `${plural(participants.length, "personne a", "personnes ont")} participé à ce gouvernement, y compris celles parties avant la date choisie.`}
              </p>
              {participants.length > 0 && (
                <div className="rounded-2xl border bg-card">
                  <ParticipantList
                    groups={shownParticipants}
                    returnUrl={returnUrl}
                    returnLabel={returnLabel}
                  />
                  {moreParticipants.length > 0 && (
                    <details className="group border-t">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-4 text-sm font-bold text-primary [&::-webkit-details-marker]:hidden">
                        <ChevronRight
                          className="size-4 shrink-0 transition-transform group-open:rotate-90"
                          aria-hidden="true"
                        />
                        Afficher les{" "}
                        {plural(moreParticipants.length, "autre personne", "autres personnes")}
                      </summary>
                      <ParticipantList
                        groups={moreParticipants}
                        returnUrl={returnUrl}
                        returnLabel={returnLabel}
                      />
                    </details>
                  )}
                </div>
              )}
            </section>
          </div>

          <aside
            id="sources"
            aria-label="Sources et méthode"
            className="h-fit rounded-2xl border bg-card p-4 text-[13px] lg:sticky lg:top-4"
          >
            <h2 className="font-display text-base font-bold">Sources</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              {sourceActs.map((act) => (
                <li key={act.url}>
                  <ActLink act={act} /> : {actDetails(act)}.
                </li>
              ))}
              {gov.compositionVerifiedAt && (
                <li>
                  Composition vérifiée au {formatDay(gov.compositionVerifiedAt)}
                  {safeExternalUrl(gov.compositionVerifiedSourceUrl) ? (
                    <>
                      {" "}
                      d&apos;après{" "}
                      <a
                        href={safeExternalUrl(gov.compositionVerifiedSourceUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        la source officielle
                      </a>
                    </>
                  ) : null}
                  .
                </li>
              )}
              <li>
                Les nominations et cessations de chaque fonction citent leur acte dans « Changements
                documentés ».
              </li>
              <li>
                Parti politique non affiché : l&apos;affiliation à la date n&apos;est pas établie.
              </li>
              {gov.coverageNote && <li>{gov.coverageNote}</li>}
            </ul>
            <details className="group mt-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-bold [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-4 shrink-0 transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                Méthode et conventions de dates
              </summary>
              <div className="space-y-2 text-muted-foreground">
                <p>
                  Date retenue d&apos;un fait : la date de signature de l&apos;acte, sauf si
                  l&apos;acte fixe une date d&apos;effet différente. La date de publication au
                  Journal officiel figure dans la source ; elle ne sert pas au calcul.
                </p>
                <p>
                  Composition à une date : PoliGraph affiche la « composition après les changements
                  du jour » lorsque l&apos;acte établit le remplacement ou l&apos;ordre des
                  changements. Une sortie et une entrée du même jour qu&apos;aucun acte ne relie
                  sont signalées dans « Transition », sans heure supposée, et ne comptent pas dans
                  l&apos;effectif établi.
                </p>
                <p>
                  Une fonction dont la fin n&apos;est pas documentée au-delà de la dernière
                  vérification figure dans « Période à préciser » : elle n&apos;est jamais présentée
                  comme en cours.
                </p>
                <p>
                  Une date déduite des fonctions connues, sans acte, est signalée « Dates estimées
                  ».
                </p>
              </div>
            </details>
            {gov.compositionCheckedAt && (
              <p className="mt-3 text-[11.5px] text-muted-foreground">
                Dernière vérification : {formatDay(gov.compositionCheckedAt)}
              </p>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

function ParticipantList({
  groups,
  returnUrl,
  returnLabel,
}: {
  groups: PersonGroup[];
  returnUrl: string;
  returnLabel: string;
}) {
  return (
    <ul className="divide-y">
      {groups.map(({ person, episodes }) => (
        <li
          key={person.id}
          className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4"
        >
          <span>
            {person.visibility === "published" ? (
              <RememberReturn
                targetSlug={person.slug}
                returnUrl={returnUrl}
                label={returnLabel}
                className="font-bold text-primary underline-offset-4 hover:underline"
              >
                {person.fullName}
              </RememberReturn>
            ) : (
              <strong>{person.fullName}</strong>
            )}{" "}
            · {episodes.map((e) => e.title).join(" ; ")}
          </span>
          <span className="text-[13px] text-muted-foreground sm:text-right">
            {episodes.map((e) => episodeDates(e, person.gender)).join(" ; ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
