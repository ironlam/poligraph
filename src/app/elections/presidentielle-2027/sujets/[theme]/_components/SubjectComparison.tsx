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
 * Up to three measures per candidacy are quoted, the rest fold into a disclosure. The comparison
 * this page exists for happens between candidacies, not inside one.
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

/**
 * How precise a measure is, and whether a close text was ever voted.
 *
 * Both qualify ONE measure, so they sit with the measure they qualify. They used to be two columns
 * of the table, reading `measures[0]`, which was true only as long as a row quoted exactly one
 * measure; quoting three under a "Précision" column showing a single badge would have attributed
 * the first measure's qualification to the two below it.
 *
 * A null precision is NOT "pas encore relu". Publication requires `reviewedAt` to be set
 * (`PUBLIC_MEASURE_WHERE`), so a visible measure has been reviewed by construction and that label
 * would contradict the very predicate that let it appear.
 */
function MeasureQualifiers({ entry }: { entry: SubjectCandidateEntry["measures"][number] }) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
      {entry.measure.precision !== null ? (
        <MeasurePrecisionBadge precision={entry.measure.precision} />
      ) : (
        <QualifiedEmptyCell
          absence={{ kind: "not_applicable", reason: "Précision non renseignée" }}
          className="text-xs"
        />
      )}
      <VoteRelationBadge
        relation={entry.voteRelation}
        basisDetails={
          entry.voteReference !== null ? composeVoteBasis(entry.voteReference) : undefined
        }
      />
    </div>
  );
}

/** One quoted measure: its text, what qualifies it, its sources, and its withdrawal when there is one. */
function QuotedMeasure({ entry }: { entry: SubjectCandidateEntry["measures"][number] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm leading-relaxed">&laquo;&nbsp;{entry.measure.text}&nbsp;&raquo;</p>
      <MeasureQualifiers entry={entry} />
      <MeasureSources sources={entry.measure.sources} />
      {entry.measure.withdrawal !== null && (
        <WithdrawalLine withdrawal={entry.measure.withdrawal} />
      )}
    </div>
  );
}

/**
 * How many measures a row quotes before folding the rest.
 *
 * One exposed whichever measure happened to be imported first as if it were an editorial choice.
 * Three gives a broader view without turning the comparison into a full programme listing.
 */
const QUOTED_MEASURE_LIMIT = 3;

/**
 * The proposal cell: up to three measures quoted, the rest behind a disclosure.
 *
 * `<details>` rather than a state hook: the page is a server component, and the browser's own
 * disclosure is keyboard-operable and announced correctly without a line of JavaScript.
 */
function ProposalCell({ entry, theme }: { entry: SubjectCandidateEntry; theme: ThemeCategory }) {
  if (entry.measures.length === 0) {
    return <QualifiedEmptyCell absence={{ kind: "no_measure_published", theme }} />;
  }
  const quoted = entry.measures.slice(0, QUOTED_MEASURE_LIMIT);
  const folded = entry.measures.slice(QUOTED_MEASURE_LIMIT);

  return (
    <div className="space-y-3">
      {quoted.map((measure) => (
        <QuotedMeasure key={measure.measure.id} entry={measure} />
      ))}
      {folded.length > 0 && (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid">
            + {folded.length} {folded.length === 1 ? "autre mesure" : "autres mesures"} sur ce sujet
          </summary>
          <div className="mt-2 space-y-3 border-l-2 border-border pl-3">
            {folded.map((other) => (
              <QuotedMeasure key={other.measure.id} entry={other} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function CandidateIdentity({ entry }: { entry: SubjectCandidateEntry }) {
  const { candidate, measures } = entry;
  // Currently defended, not "ever published". `measures` includes withdrawals so the proposal cell
  // can show them with their withdrawal line; this count says what the candidacy still stands on.
  const defended = measures.filter((m) => m.measure.withdrawal === null).length;
  return (
    <span className="flex items-start gap-2.5">
      {/* The colour code, and the neutral bar is a state of its own, not a failure: the accent is
          resolved by `resolveCandidateAccentColor`, which returns null rather than borrowing the
          colour of a party the candidacy is not filed under. Decorative (`aria-hidden`), because
          the party name is written on the line below: the colour never carries a fact alone. */}
      <span
        aria-hidden="true"
        data-accent={candidate.accentColor ?? "neutre"}
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
 * Two columns, and what used to be the other two now travels with the measure.
 *
 * "A exercé sur ce sujet" is gone: linking a mandate to a subject needs a mapping the model does not
 * carry, so the cell held the same sentence on every row. It distinguished nothing and took 190px
 * from the only column with content, which at anything under a very wide viewport squeezed the
 * quoted measure down to one word per line. It comes back the day the mapping exists.
 *
 * "Déjà soumis au vote ?" and "Précision de la mesure" are gone as COLUMNS, not as content: a column
 * holds one value per row, and a row now quotes up to three measures with a precision and a vote
 * relation each. Both are rendered by `MeasureQualifiers` under the sentence they qualify, which is
 * also where a reader looks for them. The vote states keep their nine values and their badge, so
 * they still start varying the moment a scrutin is linked to a measure.
 */
const COLUMNS = [
  { title: "Candidat·e", hint: "Par nom de famille" },
  // Not "du programme": a measure with no `programEditionId` was taken from a speech, an interview
  // or an article, and the source line under each quote names which.
  {
    title: "Ce qu'il ou elle propose",
    hint: "Jusqu'à trois mesures citées, chacune avec sa source, sa précision et sa relation aux votes",
  },
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
      {/* `min-w-[560px]` is what is left of the fix for a table that crushed itself. With
          `table-fixed` the identity column keeps its pixel width whatever happens, so on a narrow
          enough container the flexible column collapsed towards zero and wrapped the quote one word
          per line. A minimum width makes the wrapper scroll instead. The floor came down with the
          two side columns it used to have to fit. */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card lg:block">
        <table className="w-full min-w-[560px] table-fixed border-collapse text-left">
          <caption className="sr-only">
            Ce que chaque candidature propose sur {THEME_CATEGORY_LABELS[data.theme]}, chaque mesure
            citée avec sa source, sa précision et sa relation aux votes.
          </caption>
          <colgroup>
            <col className="w-[200px]" />
            <col />
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below lg: one card per candidacy. The two columns cannot be read side by side at 390px, and
          shrinking the type to fit would make the quote unreadable, so the layout changes rather
          than the content: the card carries exactly what the row carries, stacked.

          The definition list of vote relation and precision is gone from here too. It used to
          restate at the bottom of the card what the table said in its side columns; now that both
          travel under the sentence they qualify, repeating them per card would separate a
          qualification from the only measure it is true of. */}
      <ul className="space-y-3 lg:hidden">
        {data.candidates.map((entry) => (
          <li key={entry.candidate.id} className="rounded-xl border border-border bg-card p-4">
            <CandidateIdentity entry={entry} />
            <div className="mt-3">
              <ProposalCell entry={entry} theme={data.theme} />
            </div>
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
      ce sujet, pour {total} au total. Jusqu&apos;à {QUOTED_MEASURE_LIMIT} mesures sont citées par
      candidature&nbsp;; au-delà, les suivantes se déplient.
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
        En présidentielle, la plupart des mesures n&apos;ont jamais été soumises à un vote. La
        mention portée sous chaque mesure dit donc surtout où nous en sommes&nbsp;: «&nbsp;périmètre
        non examiné&nbsp;» tant que nous n&apos;avons pas cherché de scrutin proche,
        «&nbsp;périmètre examiné sans résultat&nbsp;» quand nous avons cherché sans rien trouver.
        Une position ne s&apos;affiche que pour une candidature qui siégeait au moment où un texte
        proche a été soumis.
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
