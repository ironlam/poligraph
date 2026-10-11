import Link from "next/link";
import { BRAND_NAVY, BRAND_PAGE, BRAND_RED } from "@/config/brand";
import {
  DECISION_OUTCOME_LABELS,
  TERRITORIAL_SOURCE_KIND_LABELS,
} from "@/config/decisions-territoriales";
import type { CommuneDecisions, PublicDecision } from "@/lib/data/territoire-decisions";
import type { MayorPeriod } from "@/lib/territoires/decision-periods";
import { TERRITOIRES_PATH, territoireCommunePath } from "@/lib/territoires/paths";
import { formatDate } from "@/lib/utils";

/**
 * Decisions tab of a Territoires commune (#1052, lot 2; kit Decisions.html, DecisionsMobile.html).
 *
 * Every decision is collective. A mayor's name appears only as the institutional context of a
 * date, with the sentence that it says nothing about a personal vote. All texts are rendered as
 * plain React text: nothing here goes through dangerouslySetInnerHTML.
 */

const SUMMARY_CLASS =
  "flex min-h-11 cursor-pointer list-none flex-col items-start gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 font-display font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden";

export function periodAnchor(slug: string): string {
  return `periode-${slug}`;
}

function countLabel(n: number): string {
  if (n === 0) return "aucune décision référencée";
  return n === 1 ? "1 décision référencée" : `${n} décisions référencées`;
}

function dayLabel(day: string): string {
  return formatDate(new Date(`${day}T12:00:00Z`));
}

function spanLabel(start: string, end: string | null): string {
  return end ? `du ${dayLabel(start)} au ${dayLabel(end)}` : `depuis le ${dayLabel(start)}`;
}

function adoptionLabel(d: PublicDecision): string {
  if (d.adoptionDatePrecision === "YEAR") return String(d.adoptionDate.getUTCFullYear());
  if (d.adoptionDatePrecision === "MONTH") {
    return d.adoptionDate.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return formatDate(d.adoptionDate);
}

export function CommuneDecisionsBandeau({ inseeCode, name }: { inseeCode: string; name: string }) {
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
          {name} : décisions du conseil
        </h1>
      </div>
    </header>
  );
}

function DecisionCard({
  decision,
  mayor,
}: {
  decision: PublicDecision;
  mayor?: { fullName: string; slug: string };
}) {
  const facts: [string, string][] = [
    ["Autorité", decision.institution.name],
    ["Adoption", adoptionLabel(decision)],
    ...(decision.publicationDate
      ? ([["Publication", formatDate(decision.publicationDate)]] as [string, string][])
      : []),
    ...(decision.effectiveDate
      ? ([["Prise d'effet", formatDate(decision.effectiveDate)]] as [string, string][])
      : []),
    [
      "Résultat",
      decision.outcomeWording
        ? `${DECISION_OUTCOME_LABELS[decision.outcome]} (« ${decision.outcomeWording} »)`
        : DECISION_OUTCOME_LABELS[decision.outcome],
    ],
  ];
  const { source } = decision;

  return (
    <article id={`decision-${decision.id}`} className="rounded-xl border bg-card p-4 text-sm">
      <p className="text-xs text-muted-foreground">
        {decision.reference ?? TERRITORIAL_SOURCE_KIND_LABELS[source.kind]}
      </p>
      <h3 className="mt-1 break-words font-display text-base font-bold">{decision.title}</h3>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {mayor && (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2">
          Maire en fonction à cette date :{" "}
          <Link href={`/politiques/${mayor.slug}`} prefetch={false} className="underline">
            {mayor.fullName}
          </Link>
          . Relation calculée à partir des dates de mandat : elle n{"'"}indique pas un vote
          personnel.
        </p>
      )}
      <p className="mt-3">
        <span className="font-semibold">Participation individuelle :</span> aucune position
        individuelle n{"'"}est attribuée.
      </p>
      <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Source :</span>{" "}
        {TERRITORIAL_SOURCE_KIND_LABELS[source.kind]}, {source.title}, {decision.sourceLocator}.
        Producteur : {source.producer}. Document consulté le {formatDate(source.lastVerifiedAt)}
        {decision.reviewedAt && `, notice vérifiée le ${formatDate(decision.reviewedAt)}`}.{" "}
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Ouvrir le document source : ${source.title} (site externe)`}
          className="underline"
        >
          Ouvrir le document
        </a>
        {source.archiveUrl && (
          <>
            {" · "}
            <a
              href={source.archiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Copie archivée : ${source.title} (site externe)`}
              className="underline"
            >
              copie archivée
            </a>
          </>
        )}
      </p>
    </article>
  );
}

function DecisionList({
  decisions,
  mayor,
}: {
  decisions: PublicDecision[];
  mayor?: { fullName: string; slug: string };
}) {
  return (
    <ul className="space-y-3">
      {decisions.map((d) => (
        <li key={d.id}>
          <DecisionCard decision={d} mayor={mayor} />
        </li>
      ))}
    </ul>
  );
}

function MayorPeriodBlock({
  period,
  open,
}: {
  period: MayorPeriod<PublicDecision>;
  open: boolean;
}) {
  const first = period.mandates[0]!;
  const last = period.mandates[period.mandates.length - 1]!;
  const split = period.mandates.length > 1;
  return (
    <details
      id={periodAnchor(period.person.slug)}
      open={open}
      className="rounded-xl border bg-card"
    >
      <summary className={SUMMARY_CLASS}>
        <span className="min-w-0 break-words">
          {period.person.fullName}, maire{" "}
          <span className="font-sans text-sm font-normal text-muted-foreground">
            {spanLabel(first.start, last.end)}
          </span>
        </span>
        <span className="shrink-0 text-sm font-normal">{countLabel(period.decisionCount)}</span>
      </summary>
      <div className="space-y-4 px-2 pb-2 sm:px-4 sm:pb-4">
        {period.mandates.map((m) => (
          <section key={m.mandateId} aria-label={`Mandat ${spanLabel(m.start, m.end)}`}>
            {split && (
              <h3 className="mb-2 text-sm font-semibold">
                Mandat {spanLabel(m.start, m.end)} · {countLabel(m.decisions.length)}
              </h3>
            )}
            {m.decisions.length > 0 ? (
              <DecisionList decisions={m.decisions} mayor={period.person} />
            ) : (
              !split && <p className="text-sm text-muted-foreground">Aucune décision référencée.</p>
            )}
          </section>
        ))}
      </div>
    </details>
  );
}

export function CommuneDecisionsSections({ data }: { data: CommuneDecisions }) {
  const { periods, intercommunal } = data;
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm md:text-base">
        Chaque décision est rattachée à l{"'"}autorité qui l{"'"}a adoptée et placée dans la période
        où elle a été prise. Être en fonction à une date n{"'"}est pas avoir voté.
      </p>

      {(periods.mayors.length > 0 || periods.unestablished.length > 0) && (
        <section aria-labelledby="periodes" className="space-y-3">
          <h2 id="periodes" className="font-display text-xl font-bold text-primary">
            Conseil municipal, par période
          </h2>
          {periods.mayors.map((period, i) => (
            <MayorPeriodBlock key={period.politicianId} period={period} open={i === 0} />
          ))}
          {periods.unestablished.length > 0 && (
            <details className="rounded-xl border border-dashed bg-card">
              <summary className={SUMMARY_CLASS}>
                <span>Période institutionnelle non établie</span>
                <span className="shrink-0 text-sm font-normal">
                  {countLabel(periods.unestablished.length)}
                </span>
              </summary>
              <div className="space-y-3 px-4 pb-4">
                <p className="text-sm text-muted-foreground">
                  La date d{"'"}adoption ou la succession des maires enregistrée ne permet pas de
                  rattacher ces décisions à un mandat avec certitude.
                </p>
                <DecisionList decisions={periods.unestablished} />
              </div>
            </details>
          )}
        </section>
      )}

      {intercommunal.length > 0 && (
        <section aria-labelledby="intercommunales" className="space-y-3">
          <h2 id="intercommunales" className="font-display text-xl font-bold text-primary">
            Décisions intercommunales concernant la commune
          </h2>
          <p className="text-sm text-muted-foreground">
            Elles restent attribuées au conseil communautaire qui les a adoptées, jamais au maire de
            la commune.
          </p>
          <DecisionList decisions={intercommunal} />
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Classement par date d{"'"}adoption. Sélection documentée selon un protocole publié, pas un
        relevé exhaustif : le nombre de décisions ne mesure pas l{"'"}activité du conseil.
        {data.truncated &&
          ` Seules les ${periods.mayors.reduce((n, p) => n + p.decisionCount, 0) + periods.unestablished.length + intercommunal.length} décisions les plus récentes sur ${data.total} sont affichées.`}
      </p>
    </div>
  );
}
