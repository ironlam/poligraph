import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { DATA_SOURCE_URLS } from "@/config/labels";
import { TERRITOIRES_SANS_COMMUNE } from "@/config/regions";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { IntercommunaliteCard } from "@/components/territoires/IntercommunaliteCard";
import {
  PresidentielleAgregatNote,
  PresidentielleCommuneResults,
} from "@/components/territoires/CommunePresidentielle";
import type {
  CommuneDossier,
  MunicipalesBlock,
  MunicipalesListe,
  ParlementaireRef,
  SourceRef,
} from "@/lib/data/territoires";
import {
  deputeNoun,
  formatCirconscription,
  formatPct,
  formatPopulation,
  maireSince,
} from "@/lib/territoires/commune-display";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { formatDate } from "@/lib/utils";
import { TERRITOIRES_DONNEES_PATH, territoireDepartementPath } from "@/lib/territoires/paths";
import { populationVintageLabel } from "@/lib/territoires/population-label";

/**
 * Sections of the Territoires commune page (#1052). Server components only: no map, no client
 * state. Every fact carries its source; every missing fact is said in words.
 */

const LINK = "underline underline-offset-2 hover:text-primary";
const TAP = "inline-flex min-h-11 items-center";
const RNE_URL = DATA_SOURCE_URLS.RNE;

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}

function Source({ source, date }: { source: SourceRef | null; date?: string | null }) {
  if (!source) return null;
  return (
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
      Source :{" "}
      {source.url ? <ExternalLink href={source.url}>{source.label}</ExternalLink> : source.label}
      {date && <> · dernière confirmation le {formatDate(date)}</>}
    </p>
  );
}

export function SectionCard({
  id,
  title,
  action,
  children,
}: {
  id?: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const headingId = id ? `${id}-titre` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-20 rounded-2xl border bg-card p-5 md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="font-display text-xl font-bold md:text-2xl text-primary">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Collapsed block: a full-width summary row, 44 px high, with a visible focus ring. */
function Collapsible({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t px-4 py-3">{children}</div>
    </details>
  );
}

// ─── Élus et institutions ─────────────────────────────────────────────

function MaireBlock({
  maire,
  communeName,
}: {
  maire: CommuneDossier["maire"];
  communeName: string;
}) {
  if (maire.state === "ETABLI" && maire.person) {
    const since = maireSince(maire);
    return (
      <div className="flex gap-4">
        <PoliticianAvatar
          photoUrl={maire.person.photoUrl}
          blobPhotoUrl={null}
          fullName={maire.person.fullName}
          size="md"
          className="shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Maire</p>
          <p className="font-display text-xl font-bold">
            <Link
              href={`/politiques/${maire.person.slug}`}
              prefetch={false}
              className={`${TAP} ${LINK}`}
            >
              {maire.person.fullName}
            </Link>
          </p>
          {since && <p className="mt-1 text-sm">En fonction depuis le {formatDate(since)}.</p>}
          <Source source={maire.source} date={maire.lastConfirmedAt} />
        </div>
      </div>
    );
  }

  if (maire.state === "NON_ETABLI") {
    return (
      <div className="rounded-xl border border-warning-border bg-warning p-4 text-warning-foreground">
        <p className="text-sm text-muted-foreground-strong">Maire</p>
        <p className="font-semibold">Le maire en fonction n{"'"}est pas établi dans Poligraph.</p>
        <p className="mt-1 text-sm">
          Les données enregistrées pour {communeName} ne permettent pas de désigner le titulaire
          avec certitude. Aucun nom n{"'"}est donc affiché.
        </p>
        <p className="mt-2 text-sm">
          <ExternalLink href={RNE_URL}>Répertoire national des élus (data.gouv.fr)</ExternalLink>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">Maire</p>
      <p className="font-semibold">
        Aucun maire en fonction n{"'"}est enregistré pour {communeName} dans Poligraph.
      </p>
      <p className="mt-2 text-sm">
        <ExternalLink href={RNE_URL}>Répertoire national des élus (data.gouv.fr)</ExternalLink>
      </p>
    </div>
  );
}

export function QuiDecideSection({ dossier }: { dossier: CommuneDossier }) {
  const { maire, mairesSecteur, identity } = dossier;
  const sansCommune = TERRITOIRES_SANS_COMMUNE.has(identity.territoireHorsRegion?.code ?? "");
  return (
    <SectionCard id="qui-decide" title="Élus et institutions">
      <MaireBlock maire={maire} communeName={identity.name} />

      {mairesSecteur.length > 0 && (
        <div className="mt-4">
          <Collapsible summary={`Maires d'arrondissement ou de secteur (${mairesSecteur.length})`}>
            <ul className="divide-y">
              {mairesSecteur.map((m) => (
                <li key={m.person.slug} className="py-2">
                  {m.sectorLabel && (
                    <span className="block text-xs text-muted-foreground">{m.sectorLabel}</span>
                  )}
                  <Link
                    href={`/politiques/${m.person.slug}`}
                    prefetch={false}
                    className={`${TAP} font-semibold ${LINK}`}
                  >
                    {m.person.fullName}
                  </Link>
                  {m.functionStart && (
                    <span className="block text-xs text-muted-foreground">
                      En fonction depuis le {formatDate(m.functionStart)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <Source source={mairesSecteur[0]!.source} />
          </Collapsible>
        </div>
      )}

      {sansCommune ? (
        <div className="mt-4 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Conseil municipal</p>
          <p className="font-semibold">Pas de conseil municipal</p>
          <p className="mt-1 text-sm">
            {identity.territoireHorsRegion?.name} : {identity.territoireHorsRegion?.statut}. Ce
            territoire figure au code officiel géographique sans être une commune au sens usuel.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Conseil municipal</p>
          <p className="font-semibold">Composition actuelle non établie</p>
          <p className="mt-1 text-sm">
            Poligraph ne dispose pas de la liste à jour des conseillers municipaux. Les résultats de
            mars 2026 ne la remplacent pas : des élus ont pu démissionner ou être remplacés depuis.
          </p>
        </div>
      )}

      {dossier.intercommunalite && (
        <div className="mt-4">
          <IntercommunaliteCard dossier={dossier} />
        </div>
      )}

      {identity.collectivitesParticulieres.length > 0 && (
        <div className="mt-4 space-y-3">
          {identity.collectivitesParticulieres.map((c) => (
            <div key={c.id} className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Statut particulier</p>
              <p className="font-semibold">{c.collectivite}</p>
              <p className="mt-1 text-sm">{c.note}</p>
              <Source source={c.source} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Au Parlement ───────────────────────────────────────────────

const MON_DEPUTE = (
  <Link href="/mon-depute" prefetch={false} className={LINK}>
    Mon député
  </Link>
);

function DeputeCard({
  depute,
  circo,
  reserve,
}: {
  depute: ParlementaireRef;
  circo: number;
  reserve: boolean;
}) {
  const noun = deputeNoun(depute.civility);
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">
        {formatCirconscription(circo)}, enregistrée pour la commune
      </p>
      {reserve && (
        <p className="mt-1 text-sm">
          Rien n{"'"}établit que la commune relève de cette seule circonscription : selon votre
          adresse, une autre peut s{"'"}appliquer. Vérifiez avec {MON_DEPUTE}.
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p>
          <Link
            href={`/politiques/${depute.slug}`}
            prefetch={false}
            className={`${TAP} font-display text-lg font-bold ${LINK}`}
          >
            {depute.fullName}
          </Link>
          <span className="text-sm text-muted-foreground">
            {noun ? ` · ${noun} de cette circonscription` : " · Assemblée nationale"}
          </span>
        </p>
        <Link
          href={`/politiques/${depute.slug}/votes`}
          prefetch={false}
          className={`${TAP} text-sm ${LINK}`}
        >
          Votes et activité
        </Link>
      </div>
      <Source source={depute.source} date={depute.lastConfirmedAt} />
    </div>
  );
}

export function ParlementSection({ dossier }: { dossier: CommuneDossier }) {
  const { deputes } = dossier.parlement;
  const { department } = dossier.identity;
  const circo = deputes.circonscriptionEnregistree;
  const depute = deputes.state === "DISPONIBLE" ? deputes.deputes[0] : undefined;
  // Named with an explicit reservation when the base does not establish the commune's deputy.
  const recorded =
    !depute && deputes.deputesCirconscriptionEnregistree.length === 1
      ? deputes.deputesCirconscriptionEnregistree[0]
      : undefined;

  return (
    <SectionCard id="parlement" title="Au Parlement">
      {deputes.couvertureCirconscriptions === "PLUSIEURS" ? (
        <p className="text-sm">
          Plusieurs circonscriptions législatives couvrent {dossier.identity.name} : la vôtre dépend
          de l{"'"}adresse. Pour la trouver, utilisez {MON_DEPUTE}.
        </p>
      ) : depute && circo != null ? (
        <>
          <DeputeCard depute={depute} circo={circo} reserve={false} />
          <p className="mt-3 text-sm text-muted-foreground">
            Selon votre adresse, une autre circonscription peut s{"'"}appliquer : vérifiez avec{" "}
            {MON_DEPUTE}.
          </p>
        </>
      ) : recorded && circo != null ? (
        <DeputeCard depute={recorded} circo={circo} reserve />
      ) : circo != null ? (
        <p className="text-sm">
          La commune est enregistrée dans la {formatCirconscription(circo)}, mais la personne qui y
          siège n{"'"}est pas établie dans Poligraph. Vérifiez avec {MON_DEPUTE}.
        </p>
      ) : (
        <p className="text-sm">
          Aucune circonscription législative n{"'"}est enregistrée pour cette commune. Vérifiez avec{" "}
          {MON_DEPUTE}.
        </p>
      )}

      {department.slug && department.name && (
        <p className="mt-3 text-sm">
          <Link
            href={territoireDepartementPath(department.slug)}
            prefetch={false}
            className={`${TAP} ${LINK}`}
          >
            {department.name} ({department.code}) : sénateurs et députés
          </Link>
        </p>
      )}
    </SectionCard>
  );
}

// ─── Élections ──────────────────────────────────────────────────

function ResultRow({
  liste,
  pct,
  status,
}: {
  liste: MunicipalesListe;
  pct: number;
  status: string | null;
}) {
  const tete = liste.teteDeListe;
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <p className="min-w-0">
          <span className="font-semibold">{liste.listName ?? `Liste de ${tete.name}`}</span>
          {liste.listName && (
            <span className="text-muted-foreground">
              {" · tête de liste "}
              {tete.person ? (
                <Link href={`/politiques/${tete.person.slug}`} prefetch={false} className={LINK}>
                  {tete.name}
                </Link>
              ) : (
                tete.name
              )}
            </span>
          )}
        </p>
        <p className="shrink-0 tabular-nums">
          <span className="font-semibold">{formatPct(pct)}</span>
          {status && <span className="text-muted-foreground"> · {status}</span>}
        </p>
      </div>
      <div className="mt-1.5 h-2 w-full rounded-full bg-muted" aria-hidden="true">
        <div
          className={`h-2 rounded-full ${status ? "bg-primary" : "bg-primary/45"}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </li>
  );
}

/** Lists shown before the rest is folded: the long tail of a big city stays one tap away. */
const VISIBLE_LISTS = 5;

function participationText(block: MunicipalesBlock, round: number): string | null {
  const row = block.participation.find((p) => p.round === round);
  if (row?.participationRate == null) return null;
  return `Participation : ${formatPct(row.participationRate)}`;
}

function RoundResults({ block, round }: { block: MunicipalesBlock; round: 1 | 2 }) {
  const date = round === 1 ? block.round1Date : block.round2Date;
  const rows = block.listes
    .map((l) => ({ liste: l, pct: round === 1 ? l.round1Pct : l.round2Pct }))
    .filter((r): r is { liste: MunicipalesListe; pct: number } => r.pct != null)
    .sort((a, b) => b.pct - a.pct);
  if (rows.length === 0) return null;
  const participation = participationText(block, round);
  const renderRow = ({ liste, pct }: { liste: MunicipalesListe; pct: number }, i: number) => (
    <ResultRow
      key={`${liste.listName ?? liste.teteDeListe.name}-${i}`}
      liste={liste}
      pct={pct}
      status={
        round === 1 && liste.electionAuPremierTour === "ELUE"
          ? "élue au 1er tour"
          : round === 2 && liste.elueAuSecondTour
            ? "élue au 2d tour"
            : null
      }
    />
  );
  return (
    <div className="mt-2">
      <h3 className="font-semibold">
        Municipales 2026, {round === 1 ? "1er tour" : "2d tour"}
        {date && ` (${formatDate(date)})`}
      </h3>
      <ul className="mt-1">{rows.slice(0, VISIBLE_LISTS).map(renderRow)}</ul>
      {rows.length > VISIBLE_LISTS && (
        <div className="mt-2">
          <Collapsible summary={`Autres listes (${rows.length - VISIBLE_LISTS})`}>
            <ul>{rows.slice(VISIBLE_LISTS).map(renderRow)}</ul>
          </Collapsible>
        </div>
      )}
      {participation && <p className="mt-1 text-sm text-muted-foreground">{participation}</p>}
    </div>
  );
}

export function ElectionsSection({ dossier }: { dossier: CommuneDossier }) {
  const block = dossier.elections.municipales2026;
  const code = dossier.identity.inseeCode;
  const detailHref = `/elections/municipales-2026/communes/${code}`;
  const hasRound2 = block?.listes.some((l) => l.round2Pct != null) ?? false;
  // Most recent first: a presidential election held after the municipales goes above them.
  const { blocks: presidentielles, agregatTerritoire } = dossier.elections.presidentielles;
  const after = (p: { round1Date: string | null }) =>
    p.round1Date != null && block?.round1Date != null && p.round1Date > block.round1Date;
  const renderPresidentielle = (p: (typeof presidentielles)[number]) => (
    <div key={p.electionSlug} className={after(p) ? "mb-4 border-b pb-4" : "mt-4 border-t pt-4"}>
      <PresidentielleCommuneResults block={p} communeName={dossier.identity.name} />
    </div>
  );

  return (
    <SectionCard id="elections" title="Élections dans la commune">
      {presidentielles.filter(after).map(renderPresidentielle)}
      {!block || block.state === "ABSENT" ? (
        <p className="text-sm">
          Aucun résultat des municipales 2026 n{"'"}est enregistré pour cette commune.
        </p>
      ) : block.state === "NON_ETABLI" ? (
        <p className="text-sm">
          Des candidatures aux municipales 2026 sont enregistrées pour cette commune, mais pas les
          résultats par liste.{" "}
          <Link href={detailHref} prefetch={false} className={LINK}>
            Voir les candidatures
          </Link>
        </p>
      ) : (
        <>
          <RoundResults block={block} round={1} />
          {hasRound2 && (
            <div className="mt-4">
              <RoundResults block={block} round={2} />
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Part des suffrages exprimés, têtes de liste uniquement, sans étiquette politique. Source
            :{" "}
            {block.source.url ? (
              <ExternalLink href={block.source.url}>{block.source.label}</ExternalLink>
            ) : (
              block.source.label
            )}
          </p>
          <p className="mt-2 text-sm">
            <Link href={detailHref} prefetch={false} className={`${TAP} ${LINK}`}>
              Listes complètes et candidats à {dossier.identity.name}
            </Link>
          </p>
        </>
      )}

      {presidentielles.filter((p) => !after(p)).map(renderPresidentielle)}
      {agregatTerritoire && (
        <div className="mt-4">
          <PresidentielleAgregatNote agregat={agregatTerritoire} />
        </div>
      )}

      {/* A territory published as one aggregate gets no promise of commune results. */}
      {!agregatTerritoire &&
        !presidentielles.some((p) => p.electionSlug === PRESIDENTIELLE_2027_SLUG) &&
        !TERRITOIRES_SANS_COMMUNE.has(dossier.identity.territoireHorsRegion?.code ?? "") && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <strong>Présidentielle 2027 :</strong> les résultats de la commune apparaîtront ici
            après leur publication officielle.
          </div>
        )}
    </SectionCard>
  );
}

// ─── Colonne latérale ───────────────────────────────────────────

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-3 font-display text-lg font-bold text-primary">{title}</h2>
      {children}
    </section>
  );
}

function ReutiliserContent({ code }: { code: string }) {
  return (
    <>
      <p className="text-sm">Les mêmes faits, avec les mêmes réserves, au format JSON.</p>
      <p className="mt-2 text-sm">
        <a href={`/api/v1/territoires/communes/${code}`} className={`${TAP} ${LINK}`}>
          Données de la commune (API v1, JSON)
        </a>
      </p>
      <p className="text-sm">
        <Link href="/docs/api" prefetch={false} className={`${TAP} ${LINK}`}>
          Documentation de l{"'"}API
        </Link>
      </p>
      <p className="text-sm">
        <Link href={TERRITOIRES_DONNEES_PATH} prefetch={false} className={`${TAP} ${LINK}`}>
          Fichiers CSV et licences
        </Link>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Identifiant : code INSEE {code}</p>
    </>
  );
}

function ErreurContent() {
  return (
    <>
      <p className="text-sm">Toute personne citée peut demander une correction.</p>
      <Link
        href="/support"
        prefetch={false}
        className="mt-3 flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold hover:bg-muted"
      >
        Signaler une erreur
      </Link>
      <p className="mt-1 text-sm">
        <Link href="/methodologie" prefetch={false} className={`${TAP} ${LINK}`}>
          Sources et méthode
        </Link>
      </p>
    </>
  );
}

export function CommuneSidebar({ dossier }: { dossier: CommuneDossier }) {
  const { population, identity } = dossier;
  return (
    <aside id="sources" aria-label="Sources et réutilisation" className="scroll-mt-20 space-y-4">
      {/* Population is already the second fact of the banner: on a phone it is not repeated. */}
      <div className="hidden md:block">
        <SideCard title="Quelques repères">
          <p className="text-sm text-muted-foreground">Population</p>
          <p className="font-display text-xl font-bold">
            {population.value != null ? formatPopulation(population.value) : "Non disponible"}
          </p>
          {population.vintage && (
            <p className="text-xs">{populationVintageLabel(population.vintage)}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {population.source.url ? (
              <ExternalLink href={population.source.url}>{population.source.label}</ExternalLink>
            ) : (
              population.source.label
            )}
            {population.importedAt && (
              <>
                , {population.vintage ? "vérifiée" : "importée"} le{" "}
                {formatDate(population.importedAt)}
              </>
            )}
          </p>
        </SideCard>
      </div>

      <div className="hidden md:block">
        <SideCard title="Réutiliser ces données">
          <ReutiliserContent code={identity.inseeCode} />
        </SideCard>
      </div>
      <div className="md:hidden">
        <Collapsible summary="Réutiliser ces données">
          <ReutiliserContent code={identity.inseeCode} />
        </Collapsible>
      </div>

      <SideCard title="Une erreur ?">
        <ErreurContent />
      </SideCard>
    </aside>
  );
}
