import {
  POLIGRAPH_DATA_LICENCE,
  type TerritoireSource,
  TERRITOIRES_SOURCES,
} from "@/config/territoires-sources";
import { REGIONS, TERRITOIRES_HORS_REGION } from "@/config/regions";
import type { TerritoireRelease } from "@/lib/territoires/export-query";
import type { DepartementExportRow } from "@/lib/territoires/exports";
import { formatCompte, formatNombre } from "@/lib/territoires/format";
import { formatDateFrUTC } from "@/lib/utils";

/** Server-only sections of /territoires/donnees (#1052, lot 3.2). No client state. */

const CARD = "rounded-xl border border-border bg-card p-4 sm:p-6";
const LINK = "underline underline-offset-4 hover:text-primary";
const TAP = "inline-flex min-h-11 items-center";
const H2 = "font-display text-xl font-extrabold text-primary";

export interface DownloadFile {
  label: string;
  href: string;
  rows: number;
  bytes: number;
}

/** "10,3 Mo", "17 ko". Decimal units, as file managers show them. */
export function formatTaille(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  }
  return `${formatNombre(Math.max(1, Math.round(bytes / 1000)))} ko`;
}

function External({
  href,
  children,
  className = LINK,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only"> (site externe)</span>
    </a>
  );
}

export function DonneesReleases({ releases }: { releases: TerritoireRelease[] }) {
  return (
    <section aria-labelledby="national-titre" className={CARD}>
      <h2 id="national-titre" className={H2}>
        Toutes les communes de France
      </h2>
      {releases.length === 0 ? (
        <p className="mt-2 text-sm">
          Aucune version datée n{"'"}est encore publiée. Les fichiers par département, plus bas, ont
          les mêmes colonnes.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Une version par date de publication. Un fichier publié n{"'"}est jamais modifié.
          </p>
          <ul className="mt-3 divide-y divide-border">
            {releases.map((r) => (
              <li key={r.day} className="py-2">
                <a href={r.url} className={`${TAP} font-semibold ${LINK}`}>
                  Communes au {formatDateFrUTC(r.day)} (CSV)
                </a>
                <p className="text-sm text-muted-foreground">
                  {formatCompte(r.rowCount, "ligne", "lignes")}, {formatTaille(r.byteSize)}
                </p>
                <p className="text-xs break-all text-muted-foreground">SHA-256 : {r.sha256}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function DonneesFichiers({ files }: { files: DownloadFile[] }) {
  return (
    <section aria-labelledby="fichiers-titre" className={CARD}>
      <h2 id="fichiers-titre" className={H2}>
        Départements et régions
      </h2>
      <ul className="mt-3 divide-y divide-border">
        {files.map((f) => (
          <li key={f.href} className="py-2">
            <a href={f.href} className={`${TAP} font-semibold ${LINK}`}>
              {f.label} (CSV)
            </a>
            <p className="text-sm text-muted-foreground">
              {formatCompte(f.rows, "ligne", "lignes")}, {formatTaille(f.bytes)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DepartementLink({ row }: { row: DepartementExportRow }) {
  if (!row.fichier_communes) return null;
  return (
    <li>
      <a href={row.fichier_communes} className={`${TAP} ${LINK}`}>
        {row.nom} ({row.code}), {formatCompte(row.communes_en_base, "ligne", "lignes")}
      </a>
    </li>
  );
}

/** Commune files grouped by region, then the overseas collectivities outside any region. */
export function DonneesParDepartement({ departements }: { departements: DepartementExportRow[] }) {
  const byCode = new Map(departements.map((d) => [d.code, d]));
  const regions = [...REGIONS].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const horsRegion = Object.keys(TERRITOIRES_HORS_REGION)
    .map((code) => byCode.get(code))
    .filter((d): d is DepartementExportRow => !!d?.fichier_communes);

  return (
    <section aria-labelledby="departements-titre" className={CARD}>
      <h2 id="departements-titre" className={H2}>
        Communes d{"'"}un département
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Un fichier par département ou collectivité d{"'"}outre-mer, généré à la demande. Les Terres
        australes et antarctiques françaises et Clipperton n{"'"}ont pas de commune.
      </p>
      <div className="mt-3 divide-y divide-border">
        {regions.map((region) => (
          <details key={region.code} className="py-1">
            <summary className={`${TAP} cursor-pointer font-semibold`}>{region.name}</summary>
            <ul className="pb-2 pl-4 text-sm">
              {region.departmentCodes.map((code) => {
                const row = byCode.get(code);
                return row ? <DepartementLink key={code} row={row} /> : null;
              })}
            </ul>
          </details>
        ))}
        <details className="py-1">
          <summary className={`${TAP} cursor-pointer font-semibold`}>
            Collectivités d{"'"}outre-mer
          </summary>
          <ul className="pb-2 pl-4 text-sm">
            {horsRegion.map((row) => (
              <DepartementLink key={row.code} row={row} />
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}

const COMMUNE_COLUMN_DOCS: Array<[string, string]> = [
  ["code_insee", "Code officiel géographique de la commune (ex. 35238, 2A004, 97411)."],
  ["nom", "Nom de la commune."],
  ["code_departement, departement", "Département ou collectivité d'outre-mer."],
  [
    "code_region, region",
    "Région du Code officiel géographique. Vide pour les collectivités d'outre-mer, qui ne relèvent d'aucune région.",
  ],
  ["population", "Population municipale. Vide quand elle n'est pas connue, jamais 0."],
  ["population_source", "Source de la population. Son millésime n'est pas publié par l'API."],
  [
    "maire_etat",
    "ETABLI : un seul maire en fonction, dont la fiche Poligraph est publiée. NON_ETABLI : les données ne permettent pas de nommer un titulaire. ABSENT : aucun maire en fonction dans la base.",
  ],
  [
    "maire_nom, maire_poligraph_id, maire_url",
    "Nom, identifiant stable et fiche Poligraph du maire. Remplis seulement si maire_etat vaut ETABLI.",
  ],
  ["maire_source", "Source du mandat de maire."],
  [
    "maire_confirme_le",
    "Date à laquelle la dernière synchronisation du Répertoire national des élus a confirmé le mandat. Vide tant qu'aucune synchronisation ne l'a fait.",
  ],
  [
    "circonscription_enregistree",
    "Circonscription législative enregistrée pour la commune. Une commune peut s'étendre sur plusieurs circonscriptions : ce numéro n'est pas présenté comme le seul.",
  ],
  [
    "circonscription_couverture",
    "PLUSIEURS pour Paris, Lyon et Marseille (aucun numéro donné), NON_VERIFIEE sinon.",
  ],
  ["url_page", "Page de la commune sur Poligraph."],
  ["communes_importees_le", "Date du dernier import de la liste des communes."],
];

export function DonneesFormat() {
  return (
    <section aria-labelledby="format-titre" className={CARD}>
      <h2 id="format-titre" className={H2}>
        Format et colonnes
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>CSV encodé en UTF-8 avec BOM, séparateur virgule, une ligne d{"'"}en-têtes.</li>
        <li>Dates au format AAAA-MM-JJ. Une cellule vide signale une information absente.</li>
        <li>
          Une cellule qui commencerait par =, +, -, @, une tabulation ou un retour chariot est
          précédée d{"'"}une apostrophe, pour qu{"'"}un tableur ne l{"'"}exécute pas comme une
          formule.
        </li>
        <li>
          Les fichiers par département, des départements et des régions sont générés à la demande et
          mis en cache 24 heures. Cinq téléchargements par minute au plus depuis une même adresse.
        </li>
      </ul>
      <h3 className="mt-4 font-semibold">Communes</h3>
      <dl className="mt-2 space-y-2 text-sm">
        {COMMUNE_COLUMN_DOCS.map(([name, doc]) => (
          <div key={name}>
            <dt className="font-mono text-xs break-words">{name}</dt>
            <dd>{doc}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-4 font-semibold">Départements</h3>
      <p className="mt-1 text-sm">
        Code, nom, statut, région, nombre de communes en base, nombre de députés et de sénateurs en
        fonction dont la fiche est publiée, page du département et lien vers le fichier de ses
        communes.
      </p>
      <h3 className="mt-4 font-semibold">Régions</h3>
      <p className="mt-1 text-sm">
        Code, nom, outre-mer (oui ou non), codes des départements séparés par un point-virgule,
        chef-lieu et son code INSEE, nombre de communes en base, page de la région.
      </p>
    </section>
  );
}

export function DonneesLicence() {
  return (
    <section aria-labelledby="licence-titre" className={CARD}>
      <h2 id="licence-titre" className={H2}>
        Licence
      </h2>
      <p className="mt-2 text-sm">
        Poligraph publie ces fichiers sous{" "}
        <External href={POLIGRAPH_DATA_LICENCE.url}>{POLIGRAPH_DATA_LICENCE.name}</External>.
      </p>
      <p className="mt-2 text-sm">
        Les données reprises restent soumises à la licence de leur producteur. Chaque source, sa
        licence et la mention d{"'"}attribution qu{"'"}elle demande figurent ci-dessous.
      </p>
      <p className="mt-2 text-sm">
        Si vous réutilisez ces fichiers, citez Poligraph et la date du fichier.
      </p>
    </section>
  );
}

function SourceCard({ source }: { source: TerritoireSource }) {
  const { licence } = source;
  return (
    <li className="py-3">
      <h4 className="font-semibold">
        <External href={source.url} className={`${TAP} ${LINK}`}>
          {source.name}
        </External>
      </h4>
      <dl className="mt-1 space-y-1 text-sm">
        <div>
          <dt className="inline font-medium">Producteur : </dt>
          <dd className="inline">{source.producer}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Licence : </dt>
          <dd className="inline">
            {licence.name && licence.url ? (
              <External href={licence.url}>{licence.name}</External>
            ) : (
              (licence.name ?? "non établie")
            )}
            , vérifiée le {formatDateFrUTC(licence.verifiedAt)} sur{" "}
            <External href={licence.verifiedOn}>la page de référence</External>.
          </dd>
          {licence.note && <dd className="text-muted-foreground">{licence.note}</dd>}
        </div>
        <div>
          <dt className="inline font-medium">Attribution demandée : </dt>
          <dd className="inline">{source.attribution ?? "non précisée par la source"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Ce que Poligraph reprend : </dt>
          <dd className="inline">{source.reuse}</dd>
        </div>
      </dl>
    </li>
  );
}

export function DonneesSources() {
  const enService = TERRITOIRES_SOURCES.filter((s) => s.status === "EN_SERVICE");
  const prevues = TERRITOIRES_SOURCES.filter((s) => s.status === "PREVU");
  return (
    <section aria-labelledby="sources-titre" className={CARD}>
      <h2 id="sources-titre" className={H2}>
        Sources et licences
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Données des communes, départements, régions, maires et résultats municipaux. Les députés et
        sénateurs affichés sur les pages portent leur propre source.
      </p>
      <h3 className="mt-4 font-semibold">Sources utilisées</h3>
      <ul className="divide-y divide-border">
        {enService.map((s) => (
          <SourceCard key={s.id} source={s} />
        ))}
      </ul>
      <details className="mt-4">
        <summary className={`${TAP} cursor-pointer font-semibold`}>
          Sources en préparation ({prevues.length})
        </summary>
        <p className="text-sm text-muted-foreground">
          Pas encore reprises. Leur licence sera vérifiée de nouveau sur le fichier importé.
        </p>
        <ul className="divide-y divide-border">
          {prevues.map((s) => (
            <SourceCard key={s.id} source={s} />
          ))}
        </ul>
      </details>
    </section>
  );
}
