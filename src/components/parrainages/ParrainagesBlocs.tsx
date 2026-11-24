import Link from "next/link";
import { LigneSource } from "@/components/territoires/LigneSource";
import {
  MENTION_PRESENTATION,
  PARRAINAGES_ELECTIONS,
  parrainagesCandidatPath,
  parrainagesMethodePath,
} from "@/config/parrainages";
import type { ParrainageLigne } from "@/lib/data/parrainages";
import { formatDatePublication, mandatPublie, nomElu } from "@/lib/parrainages/gabarits";
import { generateSlug } from "@/lib/utils";

/**
 * Blocks shared by the presentation pages. Server components. One tint for every candidate:
 * navy, full or softened, never a party colour.
 */

const LINK = "underline underline-offset-2 hover:text-primary";
/** A link standing alone on its line: 44 px tall, the touch target of the project. */
export const LIEN_LIGNE = `inline-flex min-h-11 items-center ${LINK}`;

export function Bloc({
  titre,
  id,
  children,
}: {
  titre: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 id={id} className="font-display text-lg font-bold text-primary">
        {titre}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export interface Barre {
  cle: string;
  label: string;
  /** Second line under the label, in muted text. */
  detail?: string;
  valeur: string;
  /** Width of the bar, 0 to 100. */
  part: number;
  /** False for the softened tint (below the threshold the scale stands for). */
  pleine: boolean;
  /** Position (0 to 100) of a vertical mark drawn across the bar, explained once under the block. */
  repere?: number;
  href?: string;
}

/** One bar: label on the left, figure on the right, the bar under both. */
export function BarreLigne({ barre }: { barre: Barre }) {
  return (
    <>
      <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
        {barre.href ? (
          <Link
            href={barre.href}
            prefetch={false}
            className={`min-w-0 break-words font-semibold ${LIEN_LIGNE}`}
          >
            {barre.label}
          </Link>
        ) : (
          <span className="min-w-0 break-words font-semibold">{barre.label}</span>
        )}
        <span className="shrink-0 text-right">
          <span className="block font-semibold tabular-nums">{barre.valeur}</span>
          {barre.detail && (
            <span className="block text-xs text-muted-foreground">{barre.detail}</span>
          )}
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted" aria-hidden="true">
        <div
          className={`h-2 rounded-full ${barre.pleine ? "bg-primary" : "bg-primary/45"}`}
          style={{ width: `${Math.min(100, Math.max(0, barre.part))}%` }}
        />
        {barre.repere !== undefined && (
          <span
            data-repere
            className="absolute -top-1 h-4 w-0.5 bg-foreground"
            style={{ left: `${Math.min(100, Math.max(0, barre.repere))}%` }}
          />
        )}
      </div>
    </>
  );
}

export function Barres({ barres }: { barres: Barre[] }) {
  return (
    <ul className="space-y-2">
      {barres.map((barre) => (
        <li key={barre.cle}>
          <BarreLigne barre={barre} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Native disclosure: the content stays in the server HTML and opens without JavaScript. The
 * summary is the whole first line, 44 px tall at least.
 */
export function Depliant({
  resume,
  children,
}: {
  resume: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{resume}</span>
        <span
          aria-hidden="true"
          className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
        >
          ▾
        </span>
      </summary>
      <div className="pb-2 pt-1">{children}</div>
    </details>
  );
}

/** Presentations, one per line: the elected official, the mandate as published, the candidate. */
export function Lignes({
  electionSlug,
  lignes,
  avecCandidat,
}: {
  electionSlug: string;
  lignes: ParrainageLigne[];
  /** False on a candidate page, where every line names the same candidate. */
  avecCandidat: boolean;
}) {
  return (
    <ul className="divide-y">
      {lignes.map((ligne) => (
        <li key={ligne.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
          <p className="min-w-0 break-words">
            {ligne.politicianSlug ? (
              <Link
                href={`/politiques/${ligne.politicianSlug}`}
                prefetch={false}
                className={`font-semibold ${LIEN_LIGNE}`}
              >
                {nomElu(ligne)}
              </Link>
            ) : (
              <span className="font-semibold">{nomElu(ligne)}</span>
            )}
            <span className="block text-xs text-muted-foreground">{mandatPublie(ligne)}</span>
          </p>
          <p className="shrink-0 text-right text-xs text-muted-foreground">
            {avecCandidat && (
              <Link
                href={parrainagesCandidatPath(electionSlug, generateSlug(ligne.candidateName))}
                prefetch={false}
                className={`justify-end text-sm text-foreground ${LIEN_LIGNE}`}
              >
                {ligne.candidateName}
              </Link>
            )}
            <span className="block">{formatDatePublication(ligne.publishedOn)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Update date of a page, visible and machine-readable. For a page of presentations it is the
 * latest publication by the Conseil constitutionnel, not the day the page was rendered.
 */
export function MiseAJour({ iso, precision }: { iso: string; precision?: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      Mis à jour le <time dateTime={iso}>{formatDatePublication(iso)}</time>
      {precision && `, ${precision}`}.
    </p>
  );
}

export const PRECISION_PUBLICATION = "date de la dernière publication du Conseil constitutionnel";

/** Closing lines of every page: the fixed sentence, once, then the date, source and method. */
export function Pied({
  electionSlug,
  methode = true,
  miseAJour,
  precision = PRECISION_PUBLICATION,
}: {
  electionSlug: string;
  methode?: boolean;
  /** ISO date shown as the update date of the page. */
  miseAJour?: string | null;
  precision?: string;
}) {
  const election = PARRAINAGES_ELECTIONS[electionSlug];
  if (!election) return null;
  return (
    <footer className="space-y-2 text-sm">
      <p>{MENTION_PRESENTATION}</p>
      {miseAJour && <MiseAJour iso={miseAJour} precision={precision} />}
      <LigneSource
        sources={[{ label: election.sourceLabel, url: election.sourceUrl }]}
        periode={`Liste des présentations, ${election.titre.toLowerCase()}`}
      />
      {methode && (
        <p>
          <Link href={parrainagesMethodePath(electionSlug)} prefetch={false} className={LIEN_LIGNE}>
            Méthode et limites
          </Link>
        </p>
      )}
    </footer>
  );
}
