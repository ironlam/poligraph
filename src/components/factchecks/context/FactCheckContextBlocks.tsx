import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { ProportionBar } from "@/components/stats/ProportionBar";
import {
  CANDIDACY_STATUS_LABELS,
  FACTCHECK_RATING_COLORS,
  FACTCHECK_RATING_LABELS,
  MANDATE_TYPE_LABELS,
  VERDICT_GROUP_COLORS,
  VERDICT_GROUP_LABELS,
  VOTE_POSITION_LABELS,
  VOTING_RESULT_LABELS,
  feminizeRole,
} from "@/config/labels";
import { ROUTES } from "@/config/routes";
import type { FactCheckContext, VerdictGroup } from "@/lib/data/factcheck-context";
import { formatDate } from "@/lib/utils";
import { buildClaimDaySegments } from "./claim-day-text";

/**
 * One server component per context block. Each awaits the same context promise inside its own
 * Suspense boundary, so the page header streams first. A block whose data is `null` renders
 * nothing: no empty card, no placeholder.
 */
type ContextProps = { context: Promise<FactCheckContext> };

const VERDICT_GROUP_ORDER: VerdictGroup[] = ["vrai", "trompeur", "faux", "inverifiable"];

const linkClass = "inline-flex items-center min-h-11 font-medium text-primary hover:underline";
const buttonClass =
  "inline-flex items-center justify-center min-h-11 px-4 rounded-lg border text-sm font-medium hover:bg-muted transition-colors";

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card p-5 mb-6 space-y-4">
      <h2 id={id} className="text-lg font-display font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function percent(value: number, total: number): string {
  return `${Math.round((value / total) * 100)} %`;
}

/** Department part of "Val-de-Marne (10)". */
function constituencyLabel(constituency: string | null): string | null {
  return constituency?.match(/^([^(]+)/)?.[1]?.trim() || null;
}

export async function AuthorBlock({ context }: ContextProps) {
  const { author } = await context;
  if (!author) return null;

  const role =
    author.mandateTitle ??
    (author.mandateType
      ? feminizeRole(MANDATE_TYPE_LABELS[author.mandateType], author.civility)
      : null);
  const territory = constituencyLabel(author.constituency);
  const sitsInParliament = author.mandateType === "DEPUTE" || author.mandateType === "SENATEUR";

  return (
    <Block id="fc-author" title="Qui parle">
      <div className="flex items-start gap-4">
        <PoliticianAvatar
          photoUrl={author.photoUrl}
          blobPhotoUrl={author.blobPhotoUrl}
          fullName={author.fullName}
          size="md"
        />
        <div className="min-w-0">
          <p className="font-display font-extrabold text-xl">{author.fullName}</p>
          {role && <p>{territory ? `${role}, ${territory}` : role}</p>}
        </div>
      </div>
      {(author.group || author.party) && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {author.group && (
            <div>
              <dt className="text-xs text-muted-foreground">Groupe parlementaire</dt>
              <dd className="font-medium">
                {author.group.name} ({author.group.code})
              </dd>
            </div>
          )}
          {author.party && (
            <div>
              <dt className="text-xs text-muted-foreground">Parti actuel</dt>
              <dd className="font-medium">
                {author.party.name} ({author.party.shortName})
              </dd>
            </div>
          )}
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={`/politiques/${author.slug}`} className={buttonClass}>
          Sa fiche
        </Link>
        {sitsInParliament && (
          <Link href={`/politiques/${author.slug}/votes`} className={buttonClass}>
            Ses votes au Parlement
          </Link>
        )}
      </div>
    </Block>
  );
}

export async function RecordBlock({ context }: ContextProps) {
  const { author, record } = await context;
  if (!author || !record) return null;

  return (
    <Block id="fc-record" title="Ses déclarations vérifiées">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <p className="flex flex-col">
          <span className="font-display font-extrabold text-3xl tabular-nums">
            {record.total.toLocaleString("fr-FR")}
          </span>
          <span className="text-sm text-muted-foreground">
            déclaration{record.total > 1 ? "s" : ""} vérifiée{record.total > 1 ? "s" : ""}
          </span>
        </p>
        <p className="flex flex-col">
          <span className="font-display font-extrabold text-3xl tabular-nums">
            {record.sources.length.toLocaleString("fr-FR")}
          </span>
          <span className="text-sm text-muted-foreground">
            rédaction{record.sources.length > 1 ? "s" : ""}
          </span>
        </p>
      </div>
      <div className="space-y-3">
        <ProportionBar breakdown={record.breakdown} />
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {VERDICT_GROUP_ORDER.filter((g) => record.breakdown[g] > 0).map((group) => (
            <li key={group} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: VERDICT_GROUP_COLORS[group] }}
              />
              <span className="text-muted-foreground">{VERDICT_GROUP_LABELS[group]}</span>
              <span className="font-bold tabular-nums">{record.breakdown[group]}</span>
              <span className="text-muted-foreground">
                ({percent(record.breakdown[group], record.total)})
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Rédactions : {record.sources.map((s) => `${s.name} (${s.count})`).join(", ")}.
      </p>
      {record.recent.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1">
            Ses {record.recent.length > 1 ? `${record.recent.length} derniers` : "dernier"}{" "}
            fact-check{record.recent.length > 1 ? "s" : ""}
          </h3>
          <ul className="divide-y">
            {record.recent.map((item) => (
              <li key={item.slug}>
                <Link
                  prefetch={false}
                  href={`/factchecks/${item.slug}`}
                  className="flex flex-col gap-1 py-3 min-h-11 group"
                >
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                    <Badge className={FACTCHECK_RATING_COLORS[item.verdictRating]}>
                      {FACTCHECK_RATING_LABELS[item.verdictRating]}
                    </Badge>
                    <span>{item.source}</span>
                    <span>{formatDate(item.publishedAt)}</span>
                  </span>
                  <span className="font-medium group-hover:underline">{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href={`/factchecks/politique/${author.slug}`} className={linkClass}>
        Voir ses {record.total.toLocaleString("fr-FR")} déclaration
        {record.total > 1 ? "s" : ""} vérifiée{record.total > 1 ? "s" : ""}
      </Link>
    </Block>
  );
}

export async function CandidacyBlock({ context }: ContextProps) {
  const { author, candidacy } = await context;
  if (!author || !candidacy) return null;
  const fiche = `/elections/presidentielle-2027/candidats/${author.slug}`;

  return (
    <Block id="fc-candidacy" title="Présidentielle 2027">
      <p>{CANDIDACY_STATUS_LABELS[candidacy.status]}</p>
      <div className="flex flex-wrap gap-2">
        <Link href={fiche} className={buttonClass}>
          Sa fiche de candidature
        </Link>
      </div>
    </Block>
  );
}

export async function ClaimDayBlock({ context }: ContextProps) {
  const { author, claimDay } = await context;
  if (!author || !claimDay) return null;
  const { participation } = claimDay;
  const date = formatDate(new Date(`${claimDay.day}T12:00:00.000Z`));

  return (
    <Block id="fc-claim-day" title="Le jour de la déclaration">
      <p className="text-xs text-muted-foreground -mt-2">{date}</p>
      <p>
        {buildClaimDaySegments(claimDay.chambers, author.fullName, participation.total).map(
          (segment, i) =>
            segment.href ? (
              <Link
                key={i}
                prefetch={false}
                href={segment.href}
                className="text-primary hover:underline"
              >
                {segment.text}
              </Link>
            ) : (
              <span key={i}>{segment.text}</span>
            )
        )}
      </p>
      <p className="text-sm">
        Ses positions ce jour-là :{" "}
        {(["POUR", "CONTRE", "ABSTENTION"] as const)
          .filter((p) => participation[p] > 0)
          .map((p) => `${VOTE_POSITION_LABELS[p].toLowerCase()} ${participation[p]}`)
          .join(", ")}
        .
      </p>
      {claimDay.sample.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {claimDay.sample.map((vote, i) => (
            <li key={vote.scrutinSlug ?? i} className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="font-bold text-xs rounded-md border px-2">
                {VOTE_POSITION_LABELS[vote.position]}
              </span>
              {vote.scrutinSlug ? (
                <Link
                  prefetch={false}
                  href={ROUTES.voteDetail(vote.scrutinSlug)}
                  className="text-primary hover:underline"
                >
                  {vote.scrutinTitle}
                </Link>
              ) : (
                <span>{vote.scrutinTitle}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {VOTING_RESULT_LABELS[vote.result]}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Les scrutins du même jour ne portent pas forcément sur le sujet de la déclaration.
      </p>
      <Link href={ROUTES.voteDetail(claimDay.day)} className={linkClass}>
        Tous les scrutins du {date}
      </Link>
    </Block>
  );
}

export async function PartyBlock({ context }: ContextProps) {
  const { author, party } = await context;
  if (!author || !party) return null;

  return (
    <Block id="fc-party" title="Son parti">
      <p>
        Parti actuel de {author.fullName} : <strong>{party.name}</strong>. Les rédactions suivies
        par Poligraph ont vérifié {party.factCheckCount.toLocaleString("fr-FR")} déclaration
        {party.factCheckCount > 1 ? "s" : ""} de {party.personCount.toLocaleString("fr-FR")}{" "}
        personnalité{party.personCount > 1 ? "s" : ""} rattachée{party.personCount > 1 ? "s" : ""} à
        ce parti.
      </p>
      {party.slug && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/partis/${party.slug}`} className={buttonClass}>
            Page du parti
          </Link>
        </div>
      )}
    </Block>
  );
}

/** Method note: always shown, with the counting rule only when a record is on the page. */
export async function MethodNote({ context, source }: ContextProps & { source: string }) {
  const { author, record } = await context;
  return (
    <footer className="mt-8 pt-4 border-t text-xs text-muted-foreground leading-relaxed space-y-2">
      <p>
        Le verdict ci-dessus provient de {source}. Poligraph ne produit pas ses propres
        vérifications.
      </p>
      {author && record && (
        <p>
          Les effectifs comptent les déclarations attribuées à {author.fullName} et rattachées à sa
          fiche, dans les fact-checks des rédactions suivies par Poligraph. Une rédaction vérifie
          surtout ce qui circule : ces chiffres ne mesurent pas la fiabilité d{"'"}une personne.
        </p>
      )}
      <p>
        <Link href="/methodologie" className="text-primary hover:underline">
          Notre méthode
        </Link>
      </p>
    </footer>
  );
}
