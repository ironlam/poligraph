import Link from "next/link";
import {
  CHAMBER_SHORT_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  SOURCE_TIER_LABELS,
  THEME_ACCENT_BAR,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import { MeasurePrecisionBadge } from "@/components/measures/MeasurePrecisionBadge";
import { QualifiedEmptyCell } from "@/components/measures/QualifiedEmptyCell";
import { VoteRelationBadge } from "@/components/measures/VoteRelationBadge";
import type { ThemeCategory } from "@/generated/prisma";
import type { PublicMeasure } from "@/lib/data/measures";
import type { PublicVoteReference } from "@/lib/measures/vote-links";
import type { SubjectCandidateEntry, SubjectPageData } from "@/lib/data/subject-page";
import { formatDate } from "@/lib/utils";
import { SubjectGate } from "./SubjectGate";
import { SubjectSidebar } from "./SubjectSidebar";

/**
 * A public subject page: for one theme, every publicly visible candidacy on one row, with what it
 * proposes, whether a close text was ever voted, and how precise the measure is.
 *
 * One measure per candidacy is quoted, the rest fold into a disclosure. Six rows each carrying a
 * dozen measures is a wall, and the comparison this page exists for happens between candidacies,
 * not inside one.
 *
 * Candidates come in the alphabetical order the authority returns. Below the publication gate the
 * page renders an explicit closed state.
 */

function composeVoteBasis(reference: PublicVoteReference): string {
  const parts: string[] = [];
  if (reference.scrutinId !== null) parts.push(`scrutin ${reference.scrutinId}`);
  if (reference.institutionScope.length > 0) {
    parts.push(
      reference.institutionScope.map((chamber) => CHAMBER_SHORT_LABELS[chamber]).join(", ")
    );
  }
  if (reference.legislatureScope.length > 0) {
    parts.push(`législature ${reference.legislatureScope.join(", ")}`);
  }
  parts.push(`vérifié le ${formatDate(reference.checkedAt)}`);
  return parts.join(" · ");
}

/**
 * Every source of a measure, primary first, on one compact line each.
 *
 * All of them and not just the first: a measure text without its evidence on screen asks the reader
 * to trust it, and the whole point is that they do not have to. The tier is named because the
 * 60 % primary-source threshold of the priorities page is computed from it, so a reader comparing
 * two candidacies needs to see which side of that line each source falls on.
 */
function MeasureSources({ sources }: { sources: PublicMeasure["sources"] }) {
  if (sources.length === 0) return null;
  const ordered = [...sources].sort(
    (a, b) => (a.tier === "PRIMARY" ? 0 : 1) - (b.tier === "PRIMARY" ? 0 : 1)
  );

  return (
    <ul aria-label="Sources de la mesure" className="space-y-0.5 text-xs text-muted-foreground">
      {ordered.map((source) => (
        <li key={source.id}>
          <a href={source.url} className="font-semibold underline" rel="nofollow noopener">
            {MEASURE_SOURCE_KIND_LABELS[source.sourceKind]}
          </a>
          {source.page !== null && `, ${source.page}`} · {SOURCE_TIER_LABELS[source.tier]} ·{" "}
          {formatDate(source.publishedAt)}
        </li>
      ))}
    </ul>
  );
}

function WithdrawalLine({ withdrawal }: { withdrawal: NonNullable<PublicMeasure["withdrawal"]> }) {
  return (
    <p className="text-xs text-muted-foreground">
      Mesure retirée le {formatDate(withdrawal.withdrawnAt)}
      {withdrawal.sourceUrl !== null && withdrawal.sourceLabel !== null && (
        <>
          {" · "}
          <a href={withdrawal.sourceUrl} className="underline" rel="nofollow noopener">
            {withdrawal.sourceLabel}
          </a>
        </>
      )}
    </p>
  );
}

/** One quoted measure: its text, its source, and its withdrawal when there is one. */
function QuotedMeasure({ entry }: { entry: SubjectCandidateEntry["measures"][number] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm leading-relaxed">&laquo;&nbsp;{entry.measure.text}&nbsp;&raquo;</p>
      <MeasureSources sources={entry.measure.sources} />
      {entry.measure.withdrawal !== null && (
        <WithdrawalLine withdrawal={entry.measure.withdrawal} />
      )}
    </div>
  );
}

/**
 * The proposal cell: the first measure quoted, the others behind a disclosure.
 *
 * `<details>` rather than a state hook: the page is a server component, and the browser's own
 * disclosure is keyboard-operable and announced correctly without a line of JavaScript.
 */
function ProposalCell({ entry, theme }: { entry: SubjectCandidateEntry; theme: ThemeCategory }) {
  const [first, ...rest] = entry.measures;
  if (first === undefined) {
    return <QualifiedEmptyCell absence={{ kind: "no_measure_published", theme }} />;
  }

  return (
    <div className="space-y-2">
      <QuotedMeasure entry={first} />
      {rest.length > 0 && (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid">
            + {rest.length} {rest.length === 1 ? "autre mesure" : "autres mesures"} sur ce sujet
          </summary>
          <div className="mt-2 space-y-3 border-l-2 border-border pl-3">
            {rest.map((other) => (
              <QuotedMeasure key={other.measure.id} entry={other} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Both cells describe THE MEASURE, so with no measure they have no subject to describe.
 *
 * The absence they state has to stay about this cell. An earlier version answered "N'a jamais
 * siégé", which is a claim about a career derived from the emptiness of one theme: false for
 * everyone who has sat, and not deducible from anything this page reads.
 */
function VoteCell({ entry }: { entry: SubjectCandidateEntry }) {
  const first = entry.measures[0];
  if (first === undefined) {
    return (
      <QualifiedEmptyCell
        absence={{
          kind: "not_applicable",
          reason: "Pas de mesure publiée à rapprocher d'un scrutin",
        }}
      />
    );
  }
  return (
    <VoteRelationBadge
      relation={first.voteRelation}
      basisDetails={
        first.voteReference !== null ? composeVoteBasis(first.voteReference) : undefined
      }
    />
  );
}

/**
 * Nothing at all when there is no measure: the proposal cell on the same row already says no measure
 * is published, and repeating it in a second column adds a line without adding a fact.
 *
 * A null precision is NOT "pas encore relu". Publication requires `reviewedAt` to be set
 * (`PUBLIC_MEASURE_WHERE`), so a visible measure has been reviewed by construction and that label
 * would contradict the very predicate that let the row appear.
 */
function PrecisionCell({ entry }: { entry: SubjectCandidateEntry }) {
  const first = entry.measures[0];
  if (first === undefined) return null;
  if (first.measure.precision === null) {
    return (
      <QualifiedEmptyCell
        absence={{ kind: "not_applicable", reason: "Précision non renseignée" }}
      />
    );
  }
  return <MeasurePrecisionBadge precision={first.measure.precision} />;
}

function CandidateIdentity({ entry }: { entry: SubjectCandidateEntry }) {
  const { candidate, measures } = entry;
  // Currently defended, not "ever published". `measures` includes withdrawals so the proposal cell
  // can show them with their withdrawal line; this count says what the candidacy still stands on.
  const defended = measures.filter((m) => m.measure.withdrawal === null).length;
  return (
    <span className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="mt-0.5 h-7 w-2 shrink-0 rounded-sm bg-border"
        style={candidate.accentColor !== null ? { backgroundColor: candidate.accentColor } : {}}
      />
      <span className="min-w-0">
        {candidate.politicianSlug !== null ? (
          <Link
            href={`/politiques/${candidate.politicianSlug}`}
            prefetch={false}
            className="text-sm font-bold hover:underline"
          >
            {candidate.candidateName}
          </Link>
        ) : (
          <span className="text-sm font-bold">{candidate.candidateName}</span>
        )}
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          {candidate.partyLabel !== null && <>{candidate.partyLabel} · </>}
          {defended === 0
            ? "aucune mesure sur ce sujet"
            : `${defended} ${defended === 1 ? "mesure" : "mesures"} sur ce sujet`}
        </span>
      </span>
    </span>
  );
}

/**
 * Four columns, and the office one is deliberately not among them.
 *
 * "A exercé sur ce sujet" is gone: linking a mandate to a subject needs a mapping the model does not
 * carry, so the cell held the same sentence on every row. It distinguished nothing and took 190px
 * from the only column with content, which at anything under a very wide viewport squeezed the
 * quoted measure down to one word per line. It comes back the day the mapping exists.
 *
 * "Déjà soumis au vote ?" stays although it is empty today, and the difference is not arbitrary:
 * its nine states and their badge already exist, so the column starts varying the moment a scrutin
 * is linked to a measure.
 */
const COLUMNS = [
  { title: "Candidat·e", hint: "Par nom de famille" },
  // Not "du programme": a measure with no `programEditionId` was taken from a speech, an interview
  // or an article, and the source line under each quote names which.
  { title: "Ce qu'il ou elle propose", hint: "Phrase citée, avec sa source" },
  {
    title: "Déjà soumis au vote ?",
    hint: "Seulement si un texte proche a été voté et que la personne siégeait",
  },
  // The enum holds two values, "Chiffrée" and "Objectif sans chiffre". There is no dated or funded
  // criterion anywhere in the model, so naming them here promised a qualification we never make.
  { title: "Précision de la mesure", hint: "Chiffrée ou objectif sans chiffre" },
];

export function SubjectComparison({ data }: { data: SubjectPageData }) {
  const themeLabel = THEME_CATEGORY_LABELS[data.theme];
  // From the authority, not recomputed here. `entry.measures` carries withdrawn measures on purpose
  // (`includeWithdrawn: true`), so counting rows with `measures.length > 0` would say a candidacy
  // "porte une mesure" when every one of them has been withdrawn. The data layer already made that
  // distinction on `withdrawal === null`, and it is the same distinction `totalMeasuresOnTheme` uses.
  const documented = data.candidaciesWithVerifiedMeasure;
  const withoutMeasure = data.candidates.length - documented;

  return (
    <div className="grid gap-6 lg:grid-cols-[248px_1fr] lg:gap-8">
      <SubjectSidebar themes={data.siblingThemes} current={data.theme} />

      <div className="min-w-0 space-y-6">
        <header className="space-y-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-bold`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${THEME_ACCENT_BAR[data.theme]}`}
            />
            {themeLabel}
          </span>
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
            Quelles solutions proposent-ils&nbsp;?
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            {data.totalMeasuresOnTheme}{" "}
            {data.totalMeasuresOnTheme === 1 ? "mesure documentée" : "mesures documentées"} sur ce
            sujet, réparties entre {documented} {documented === 1 ? "candidature" : "candidatures"}.
            Classées par nom de famille.
          </p>
          {/* The candidacy's own declaration source used to sit in the first column, where six
              labels of a hundred characters each became the tallest thing on the page and buried
              the comparison. Here the evidence that matters is the measure's, which has its own
              cell; the declaration belongs to the field, which lists it candidacy by candidacy. */}
          <p className="text-xs text-muted-foreground">
            Chaque candidature affichée a un statut sourcé.{" "}
            <Link
              href="/elections/presidentielle-2027#candidatures"
              className="underline hover:text-foreground"
            >
              Voir les sources de candidature
            </Link>
          </p>
        </header>

        {!data.publishable ? (
          <SubjectGate data={data} />
        ) : (
          <>
            <ComparisonTable data={data} />
            <FooterCard
              documented={documented}
              withoutMeasure={withoutMeasure}
              total={data.totalMeasuresOnTheme}
            />
            <MethodCard />
            <PlannedSections />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * What this page will hold and does not yet.
 *
 * Announced rather than hidden, because both are planned and a reader who sees the gap named can
 * tell "not built" from "nothing to say". The wording states the content, not the schedule: neither
 * has a date, and promising one would be worse than promising nothing.
 */
function PlannedSections() {
  const planned = [
    {
      title: "Les leviers d'un président sur ce sujet",
      body: "Ce qu'un président décide réellement ici, et ce qui relève du Parlement, des collectivités ou de l'Union européenne. À écrire sujet par sujet.",
    },
    {
      title: "Les votes au Parlement sur ce sujet",
      body: "Les scrutins de l'Assemblée nationale et du Sénat portant sur ce sujet, avec leur issue et leur date. Le rattachement des scrutins aux sujets reste à construire.",
    },
    {
      title: "Les fonctions exercées sur ce sujet",
      body: "Le ministère ou la commission qu'une candidature a occupé en rapport avec ce sujet. Demande de relier les mandats aux sujets, ce que la base ne fait pas encore.",
    },
  ];

  return (
    <section
      aria-labelledby="a-venir"
      className="rounded-xl border border-dashed border-border p-5"
    >
      <h2 id="a-venir" className="font-display text-base font-bold">
        Ce que cette page ne montre pas encore
      </h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-3">
        {planned.map((p) => (
          <div key={p.title}>
            <dt className="text-sm font-semibold">{p.title}</dt>
            <dd className="mt-1 text-sm text-muted-foreground">{p.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ComparisonTable({ data }: { data: SubjectPageData }) {
  return (
    <>
      {/* lg and up: the full table. `table-fixed` with explicit widths, so a long quote
          widens its own cell's line count instead of stretching the table past the viewport. */}
      {/* `min-w-[860px]` is the fix for a table that crushed itself. With `table-fixed`, the three
          side columns keep their pixel widths whatever happens, so on a container narrower than
          their sum the flexible column collapsed towards zero and wrapped the quote one word per
          line, headers overlapping. A minimum width makes the wrapper scroll instead. */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card lg:block">
        <table className="w-full min-w-[860px] table-fixed border-collapse text-left">
          <caption className="sr-only">
            Ce que chaque candidature propose sur {THEME_CATEGORY_LABELS[data.theme]}, avec sa
            source, sa relation aux votes et la précision de la mesure.
          </caption>
          <colgroup>
            <col className="w-[200px]" />
            <col />
            <col className="w-[180px]" />
            <col className="w-[150px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/50 align-top">
              {COLUMNS.map((c) => (
                <th key={c.title} scope="col" className="px-4 py-3.5">
                  <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {c.title}
                  </span>
                  <span className="mt-1 block text-[11px] font-normal leading-snug text-muted-foreground">
                    {c.hint}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.candidates.map((entry) => (
              <tr
                key={entry.candidate.id}
                className="border-b border-border/60 align-top last:border-b-0"
              >
                <th scope="row" className="px-4 py-4 text-left font-normal">
                  <CandidateIdentity entry={entry} />
                </th>
                <td className="px-4 py-4">
                  <ProposalCell entry={entry} theme={data.theme} />
                </td>
                <td className="px-4 py-4">
                  <VoteCell entry={entry} />
                </td>
                <td className="px-4 py-4">
                  <PrecisionCell entry={entry} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below lg: one card per candidacy. Five columns cannot be read at 390px, and shrinking the
          type to fit would make the quote unreadable, so the layout changes rather than the content. */}
      <ul className="space-y-3 lg:hidden">
        {data.candidates.map((entry) => (
          <li key={entry.candidate.id} className="rounded-xl border border-border bg-card p-4">
            <CandidateIdentity entry={entry} />
            <div className="mt-3">
              <ProposalCell entry={entry} theme={data.theme} />
            </div>
            {/* The precision pair drops out entirely when there is no measure. On the table an
                empty cell sits under a header that explains it; here the term would stand alone
                facing nothing, which reads as a value we failed to load. */}
            <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
              {[
                { term: COLUMNS[2]!.title, cell: <VoteCell entry={entry} /> },
                ...(entry.measures.length > 0
                  ? [{ term: COLUMNS[3]!.title, cell: <PrecisionCell entry={entry} /> }]
                  : []),
              ].map(({ term, cell }) => (
                <div key={term} className="flex flex-wrap items-start justify-between gap-2">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{term}</dt>
                  <dd className="min-w-0 text-right">{cell}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function FooterCard({
  documented,
  withoutMeasure,
  total,
}: {
  documented: number;
  withoutMeasure: number;
  total: number;
}) {
  return (
    <p className="rounded-xl border border-border bg-card px-5 py-3.5 text-sm text-muted-foreground">
      {documented} {documented === 1 ? "candidature porte" : "candidatures portent"} une mesure sur
      ce sujet, pour {total} au total. Une seule est citée par candidature&nbsp;; les autres se
      déplient.
      {withoutMeasure > 0 && (
        <>
          {" "}
          {withoutMeasure} {withoutMeasure === 1 ? "candidature" : "candidatures"} n&apos;en{" "}
          {withoutMeasure === 1 ? "porte" : "portent"} aucune, et{" "}
          {withoutMeasure === 1 ? "elle" : "elles"} {withoutMeasure === 1 ? "figure" : "figurent"}{" "}
          quand même dans le tableau.
        </>
      )}
    </p>
  );
}

function MethodCard() {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      {/* The two states quoted here are the ones the badge actually renders today
          (VOTE_RELATION_BASIS_LABELS). An earlier version quoted "aucun vote sur cet objet", a
          string that exists nowhere: a reader would have looked for a wording they never meet. */}
      <p className="max-w-3xl text-sm text-muted-foreground">
        En présidentielle, la plupart des mesures n&apos;ont jamais été soumises à un vote. Cette
        colonne dit donc surtout où nous en sommes&nbsp;: «&nbsp;périmètre non examiné&nbsp;» tant
        que nous n&apos;avons pas cherché de scrutin proche, «&nbsp;périmètre examiné sans
        résultat&nbsp;» quand nous avons cherché sans rien trouver. Une position ne s&apos;affiche
        que pour une candidature qui siégeait au moment où un texte proche a été soumis.
      </p>
      <Link
        href="/methodologie"
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Voir la méthode
      </Link>
    </section>
  );
}
