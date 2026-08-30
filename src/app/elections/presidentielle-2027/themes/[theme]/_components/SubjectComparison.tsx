import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  CHAMBER_SHORT_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  SOURCE_TIER_LABELS,
  THEME_ACCENT_BAR,
  THEME_CATEGORY_LABELS,
  VOTE_RELATION_BASIS_LABELS,
} from "@/config/labels";
import { QualifiedEmptyCell } from "@/components/measures/QualifiedEmptyCell";
import { VoteRelationBadge } from "@/components/measures/VoteRelationBadge";
import type { ThemeCategory } from "@/generated/prisma";
import type { PublicMeasure } from "@/lib/data/measures";
import type { PublicVoteReference } from "@/lib/measures/vote-links";
import type { SubjectCandidateEntry, SubjectPageData } from "@/lib/data/subject-page";
import { themeToSlug } from "@/lib/presidentielle/themes";
import { formatDate } from "@/lib/utils";
import { SubjectGate } from "./SubjectGate";
import { SubjectSidebar } from "./SubjectSidebar";

/**
 * A public subject page: for one theme, every publicly visible candidacy on one row, with what it
 * proposes and whether a close text was ever voted.
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
    <ul
      aria-label="Sources de la mesure"
      className="space-y-0.5 text-xs leading-snug text-muted-foreground-strong"
    >
      {ordered.map((source) => (
        <li key={source.id}>
          <a
            href={source.url}
            className="rounded underline decoration-border underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            rel="nofollow noopener"
          >
            {MEASURE_SOURCE_KIND_LABELS[source.sourceKind]}
          </a>
          {" · "}
          {SOURCE_TIER_LABELS[source.tier]} · {formatDate(source.publishedAt)}
          {/* `page` is free text and editors put whole proposal titles in it, which makes it the
              longest run on the card and the least scanned. It moves to its own line so the part a
              reader actually scans, nature then niveau then date, stays one short line. Demoting it
              by colour instead was the obvious move and the wrong one: a lighter grey than
              --muted-foreground-strong drops 12 px text under 4,5:1, and this repo sets that floor
              itself. Position does the demotion, contrast stays where it was. */}
          {source.page !== null && <span className="block">{source.page}</span>}
        </li>
      ))}
    </ul>
  );
}

function WithdrawalLine({ withdrawal }: { withdrawal: NonNullable<PublicMeasure["withdrawal"]> }) {
  return (
    <p className="text-xs text-muted-foreground-strong">
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

/** The parliamentary comparison status belongs to the exact measure it qualifies. */
function MeasureVoteRelation({ entry }: { entry: SubjectCandidateEntry["measures"][number] }) {
  return (
    <VoteRelationBadge
      relation={entry.voteRelation}
      basisDetails={
        entry.voteReference !== null ? composeVoteBasis(entry.voteReference) : undefined
      }
    />
  );
}

/**
 * One quoted measure: its text, what qualifies it, its sources, and its withdrawal when there is one.
 *
 * Two measurements decide the layout here.
 *
 * `max-w-[64ch]` caps the line. The flexible column has no width of its own, so on a wide viewport
 * the arithmetic of the container (1536 at the 2xl stop, less the page padding, the sidebar, the
 * gutter, the identity column and the cell padding) left about 990 px for a single line of text:
 * roughly 120 to 130 characters where the readable band is 45 to 75. That is the defect a reader
 * feels as "hard to read" and it has nothing to do with the typeface. It is invisible on mobile,
 * which is how it survived.
 *
 * The spacing is uneven on purpose. Everything used to sit at `space-y-1.5`, so the sentence, its
 * qualifiers and its sources read as six equidistant blocks with nothing to group them. A wider gap
 * before the metadata and a tighter one inside it lets proximity do what it is for: one statement,
 * then the apparatus that backs it.
 */
function QuotedMeasure({
  entry,
  electionSlug,
}: {
  entry: SubjectCandidateEntry["measures"][number];
  electionSlug: string;
}) {
  return (
    <div className="max-w-[64ch]">
      <Link
        href={`/elections/${electionSlug}/mesures/${entry.measure.slug}`}
        prefetch={false}
        className="rounded text-[0.9375rem] leading-[1.55] text-foreground underline decoration-border underline-offset-2 hover:text-primary hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        &laquo;&nbsp;{entry.measure.text}&nbsp;&raquo;
      </Link>
      <div className="mt-2.5 space-y-1">
        <MeasureVoteRelation entry={entry} />
        <MeasureSources sources={entry.measure.sources} />
        {entry.measure.withdrawal !== null && (
          <WithdrawalLine withdrawal={entry.measure.withdrawal} />
        )}
      </div>
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
 *
 * The folded measures are rendered exactly like the quoted ones, in the same divided column. They
 * used to sit in an indented block with its own left rule, which read as a quotation inside the
 * quotation: opening the disclosure broke the reading of one candidacy in two, the first three
 * measures at one indent and the rest at another, when the two groups are the same kind of thing
 * and the split between them is an arbitrary display limit. One hairline between every measure,
 * folded or not, and the disclosure becomes one more row of that column instead of a seam.
 *
 * The summary states both directions, because a control that keeps saying "voir les 2 autres" once
 * they are already on screen leaves the reader with no visible way back to the short form.
 */
function ProposalCell({
  entry,
  theme,
  electionSlug,
}: {
  entry: SubjectCandidateEntry;
  theme: ThemeCategory;
  electionSlug: string;
}) {
  if (entry.measures.length === 0) {
    return <QualifiedEmptyCell absence={{ kind: "no_measure_published", theme }} />;
  }
  const quoted = entry.measures.slice(0, QUOTED_MEASURE_LIMIT);
  const folded = entry.measures.slice(QUOTED_MEASURE_LIMIT);

  return (
    <div className="divide-y divide-border/70">
      {quoted.map((measure) => (
        <div key={measure.measure.id} className="py-3 first:pt-0 last:pb-0">
          <QuotedMeasure entry={measure} electionSlug={electionSlug} />
        </div>
      ))}
      {folded.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
            />
            <span className="group-open:hidden">
              {folded.length === 1
                ? "Lire la dernière mesure sur ce thème"
                : `Lire les ${folded.length} autres mesures sur ce thème`}
            </span>
            <span className="hidden group-open:inline">
              {folded.length === 1
                ? "Replier cette mesure"
                : `Replier ces ${folded.length} mesures`}
            </span>
          </summary>
          <div className="divide-y divide-border/70">
            {folded.map((other) => (
              <div key={other.measure.id} className="py-3 last:pb-0">
                <QuotedMeasure entry={other} electionSlug={electionSlug} />
              </div>
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
        {/* The count is dropped when the candidacy has nothing at all, because the cell beside it
            already says "Aucune mesure publiée sur <thème>" and that sentence is the whole content
            of the row: saying it twice made the emptiest card the most repetitive one. It stays
            when measures exist but none is still defended, where "aucune mesure sur ce sujet" is
            not a repetition but the distinction between a withdrawn measure and no measure. */}
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground-strong">
          {candidate.partyLabel}
          {candidate.partyLabel !== null && measures.length > 0 && " · "}
          {measures.length > 0 &&
            (defended === 0
              ? "aucune mesure sur ce thème"
              : `${defended} ${defended === 1 ? "mesure" : "mesures"} sur ce thème`)}
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
 * "Déjà soumis au vote ?" is gone as a column: a row now quotes up to three measures with a vote
 * relation each. That relation is rendered under the sentence it qualifies, which is also where a
 * reader looks for it. The vote states keep their nine values and their badge, so they still start
 * varying the moment a scrutin is linked to a measure.
 */
const COLUMNS = [
  { title: "Candidat·e", hint: "Par nom de famille" },
  // Not "du programme": a measure with no `programEditionId` was taken from a speech, an interview
  // or an article, and the source line under each quote names which.
  {
    title: "Ce qu'il ou elle propose",
    hint: "Jusqu'à trois mesures citées, chacune avec sa source et sa relation aux votes",
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
            {themeLabel} : comparer les mesures pour 2027
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            {data.totalMeasuresOnTheme}{" "}
            {data.totalMeasuresOnTheme === 1 ? "mesure documentée" : "mesures documentées"} sur ce
            thème, réparties entre {documented} {documented === 1 ? "candidature" : "candidatures"}.
            Classées par nom de famille.
          </p>
          {data.publishable && (
            <Link
              href={`/elections/${data.electionSlug}/comparer?theme=${themeToSlug(data.theme)}`}
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-2 font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Choisir deux candidats à comparer
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          )}
        </header>

        {!data.publishable ? (
          <SubjectGate data={data} />
        ) : (
          <>
            <ComparisonTable data={data} />
            <MeasureMentionsGuide />
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
      title: "Les leviers d'un président sur ce thème",
      body: "Ce qu'un président décide réellement ici, et ce qui relève du Parlement, des collectivités ou de l'Union européenne. À écrire thème par thème.",
    },
    {
      title: "Les votes au Parlement sur ce thème",
      body: "Les scrutins de l'Assemblée nationale et du Sénat portant sur ce thème, avec leur issue et leur date. Le rattachement des scrutins aux thématiques reste à construire.",
    },
    {
      title: "Les fonctions exercées sur ce thème",
      body: "Le ministère ou la commission qu'une candidature a occupé en rapport avec ce thème. Demande de relier les mandats aux thématiques, ce que la base ne fait pas encore.",
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
            <dt className="text-sm font-bold">{p.title}</dt>
            <dd className="mt-1 text-sm text-muted-foreground">{p.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * What the mentions under every measure mean, available after the results on demand.
 *
 * The mention is the state of a rapprochement we are still building, measure by measure: which
 * scrutins of the Assemblée nationale and the Sénat bear on the same object as a proposal. Nothing
 * on the page said that work existed, so "à vérifier" under a measure had no antecedent, and a
 * reader could take it for a reservation about the candidacy rather than about our own coverage.
 *
 * A native disclosure keeps this long explanation keyboard-operable without pushing the comparison
 * below the fold, especially on mobile.
 */
function MeasureMentionsGuide() {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-primary hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        Comprendre les mentions sous les mesures
      </summary>
      <div className="space-y-3 border-t border-border px-5 py-4 text-sm text-muted-foreground">
        <p>
          Nous rapprochons chaque mesure des scrutins de l&apos;Assemblée nationale et du Sénat sur
          le même objet. «&nbsp;{VOTE_RELATION_BASIS_LABELS.SEARCH_NOT_DONE}&nbsp;» signifie que ce
          rapprochement reste à faire. «&nbsp;{VOTE_RELATION_BASIS_LABELS.NO_VOTE_IN_SCOPE}&nbsp;»
          signifie que la recherche a été menée sans scrutin proche dans le périmètre indiqué.
        </p>
        <p>
          Les candidatures affichées ont un statut sourcé.{" "}
          <Link
            href="/elections/presidentielle-2027#candidatures"
            className="underline hover:text-foreground"
          >
            Voir les sources de candidature
          </Link>
        </p>
      </div>
    </details>
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
            citée avec sa source et sa relation aux votes.
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
                  <ProposalCell entry={entry} theme={data.theme} electionSlug={data.electionSlug} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below lg: one card per candidacy. The two columns cannot be read side by side at 390px, and
          shrinking the type to fit would make the quote unreadable, so the layout changes rather
          than the content: the card carries exactly what the row carries, stacked.

          The definition list of vote relations is gone from here too. It used to restate at the
          bottom of the card what the table said in its side columns; now that the relation travels
          under the sentence it qualifies, repeating it per card would separate it from the only
          measure it is true of. */}
      <ul className="space-y-3 lg:hidden">
        {data.candidates.map((entry) => (
          <li key={entry.candidate.id} className="rounded-xl border border-border bg-card p-4">
            <CandidateIdentity entry={entry} />
            <div className="mt-3">
              <ProposalCell entry={entry} theme={data.theme} electionSlug={data.electionSlug} />
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
      ce thème, pour {total} au total. Jusqu&apos;à {QUOTED_MEASURE_LIMIT} mesures sont citées par
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
      {/* What the two search states mean is stated by `MeasureMentionsGuide`. What is left here is
          the rule that decides
          whether a POSITION can appear at all, which is a different fact and belongs next to the
          link to the method page. */}
      <p className="max-w-3xl text-sm text-muted-foreground">
        En présidentielle, la plupart des mesures n&apos;ont jamais été soumises à un vote, et une
        position pour ou contre ne s&apos;affiche que pour une candidature qui siégeait au moment où
        un texte proche a été soumis. Une mesure sans position n&apos;est donc pas une mesure sans
        travail de notre part.
      </p>
      <Link
        href="/methodologie/mesures-presidentielle-2027"
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Voir la méthode
      </Link>
    </section>
  );
}
