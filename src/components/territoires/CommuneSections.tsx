import Link from "next/link";
import { ReportLink } from "@/components/feedback/ReportLink";
import { ChevronDown } from "lucide-react";
import { DATA_SOURCE_URLS } from "@/config/labels";
import { TERRITOIRES_SANS_COMMUNE } from "@/config/regions";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { IntercommunaliteCard } from "@/components/territoires/IntercommunaliteCard";
import { ConseilMembres } from "@/components/territoires/ConseilMembres";
import { PresidentielleAgregatNote } from "@/components/territoires/CommunePresidentielle";
import { ScrutinLine } from "@/components/territoires/CommuneElections";
import type { CommuneDossier, ParlementaireRef, SourceRef } from "@/lib/data/territoires";
import {
  deputeNoun,
  formatCirconscription,
  formatPopulation,
  maireSince,
} from "@/lib/territoires/commune-display";
import {
  communeScrutins,
  latestScrutinPerType,
  type CommuneScrutin,
} from "@/lib/territoires/commune-elections";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { formatDate } from "@/lib/utils";
import {
  TERRITOIRES_DONNEES_PATH,
  territoireCommuneElectionsPath,
  territoireDepartementPath,
} from "@/lib/territoires/paths";
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
          {dossier.conseilMunicipal.state === "DISPONIBLE" ? (
            <div className="mt-1">
              <ConseilMembres conseil={dossier.conseilMunicipal} groupLabel="" />
            </div>
          ) : (
            <>
              <p className="font-semibold">Composition actuelle non établie</p>
              <p className="mt-1 text-sm">
                Poligraph ne dispose pas de la liste à jour des conseillers municipaux. Les
                résultats de mars 2026 ne la remplacent pas : des élus ont pu démissionner ou être
                remplacés depuis.
              </p>
            </>
          )}
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

const ELECTION_MAX_LINES = 4;

export function ElectionsSection({
  dossier,
  scrutins,
}: {
  dossier: CommuneDossier;
  /** Every scrutin of the commune, history included. Falls back on what the dossier carries. */
  scrutins?: CommuneScrutin[];
}) {
  const { municipales2026: block, presidentielles } = dossier.elections;
  const { agregatTerritoire } = presidentielles;
  const code = dossier.identity.inseeCode;
  const all = scrutins ?? communeScrutins(dossier.elections, code);
  // One folded line per type, so the section never grows with the years (kit spec).
  const lines = latestScrutinPerType(all).slice(0, ELECTION_MAX_LINES);

  return (
    <SectionCard
      id="elections"
      title="Élections"
      action={
        all.length > 0 && (
          <Link
            href={territoireCommuneElectionsPath(code)}
            prefetch={false}
            className={`${TAP} ${LINK} text-sm`}
          >
            {`Tous les scrutins (${all.length})`}
          </Link>
        )
      }
    >
      {lines.length > 0 && (
        <ul className="space-y-2">
          {lines.map((scrutin) => (
            <li key={scrutin.slug}>
              <ScrutinLine scrutin={scrutin} />
            </li>
          ))}
        </ul>
      )}
      {(!block || block.state === "ABSENT") && (
        <p className="mt-3 text-sm">
          Aucun résultat des municipales 2026 n{"'"}est enregistré pour cette commune.
        </p>
      )}
      {block?.state === "NON_ETABLI" && (
        <p className="mt-3 text-sm">
          Des candidatures aux municipales 2026 sont enregistrées pour cette commune, mais pas les
          résultats par liste.{" "}
          <Link
            href={`/elections/municipales-2026/communes/${code}`}
            prefetch={false}
            className={LINK}
          >
            Voir les candidatures
          </Link>
        </p>
      )}
      {agregatTerritoire && (
        <div className="mt-4">
          <PresidentielleAgregatNote agregat={agregatTerritoire} />
        </div>
      )}

      {/* A territory published as one aggregate gets no promise of commune results. */}
      {!agregatTerritoire &&
        !presidentielles.blocks.some((p) => p.electionSlug === PRESIDENTIELLE_2027_SLUG) &&
        !TERRITOIRES_SANS_COMMUNE.has(dossier.identity.territoireHorsRegion?.code ?? "") && (
          <div className="mt-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-sm">
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
      <p className="text-sm">
        Les faits de cette page au format JSON, avec les mêmes réserves. L{"'"}historique des
        municipales 2014 et 2020 n{"'"}y figure pas.
      </p>
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
      <ReportLink className="mt-3 flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold hover:bg-muted" />
      <p className="mt-1 text-sm">
        <Link href="/methodologie" prefetch={false} className={`${TAP} ${LINK}`}>
          Sources et méthode
        </Link>
      </p>
    </>
  );
}

export function CommuneSidebar({ dossier }: { dossier: CommuneDossier }) {
  const { population, identity, surface } = dossier;
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
          {surface.hectares != null && (
            <>
              <p className="mt-4 text-sm text-muted-foreground">Superficie</p>
              <p className="font-display text-xl font-bold">
                {(surface.hectares / 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km²
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {surface.source.url ? (
                  <ExternalLink href={surface.source.url}>{surface.source.label}</ExternalLink>
                ) : (
                  surface.source.label
                )}
              </p>
            </>
          )}
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
