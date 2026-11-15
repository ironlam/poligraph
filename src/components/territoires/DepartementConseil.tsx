import Link from "next/link";
import type { CollectiviteParticuliere } from "@/config/collectivites-particulieres";
import type { DepartementTerritoire } from "@/lib/data/territoires";
import { SectionCard } from "@/components/territoires/CommuneSections";
import { ConseilMembres } from "@/components/territoires/ConseilMembres";
import { Executif } from "@/components/territoires/Executif";
import { rangsExecutif } from "@/lib/territoires/executif";

/**
 * Collectivités that exercise the departmental competences in place of a departmental council:
 * on these pages no "conseil départemental" is named, only the collectivité and its legal note.
 * Lyon (Métropole on part of the Rhône) and Mayotte (a departmental council that also holds the
 * regional competences) keep their council block, with the note beside it.
 */
const REPLACING_COLLECTIVITES = new Set([
  "ville-de-paris",
  "collectivite-de-corse",
  "collectivite-europeenne-d-alsace",
  "collectivite-territoriale-de-guyane",
  "collectivite-territoriale-de-martinique",
]);

export function remplaceLeDepartement(collectivites: readonly CollectiviteParticuliere[]): boolean {
  return collectivites.some((c) => REPLACING_COLLECTIVITES.has(c.id));
}

/** Article L3211-1 CGCT, version in force since 23 February 2022, checked on 2026-10-11. */
const CGCT_COMPETENCES = {
  label: "Code général des collectivités territoriales, article L3211-1",
  url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000045212762",
};

/** COG page of the overseas collectivités, source of `TERRITOIRES_HORS_REGION`. */
const COG_SOURCE = {
  label: "Code officiel géographique (INSEE)",
  url: "https://www.insee.fr/fr/information/2560452",
};

function SourceLink({ source }: { source: { label: string; url: string | null } }) {
  return (
    <p className="text-xs text-muted-foreground">
      Source :{" "}
      {source.url ? (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
          aria-label={`${source.label} (nouvel onglet)`}
        >
          {source.label}
        </a>
      ) : (
        source.label
      )}
    </p>
  );
}

function CollectiviteNotes({ notes }: { notes: readonly CollectiviteParticuliere[] }) {
  return (
    <div id="collectivite" className="flex scroll-mt-32 flex-col gap-3">
      {notes.map((c) => (
        <div key={c.id} className="rounded-xl border bg-muted/40 p-4">
          <p className="font-bold">{c.collectivite}</p>
          <p className="mt-1 text-sm">{c.note}</p>
          <div className="mt-2">
            <SourceLink source={c.source} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * First block of the page, always open: the reader sees who presides and the first
 * vice-presidents without unfolding anything.
 */
function Bloc({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <SectionCard id={id} title={title}>
      <div className="flex flex-col gap-4">{children}</div>
    </SectionCard>
  );
}

interface DepartementConseilProps {
  territoire: DepartementTerritoire;
}

export function DepartementConseil({ territoire }: DepartementConseilProps) {
  const { territoireHorsRegion, collectivitesParticulieres, presidence, conseil } = territoire;

  if (territoireHorsRegion) {
    return (
      <Bloc id="statut" title="Statut du territoire">
        <p>
          {territoireHorsRegion.name} : {territoireHorsRegion.statut.toLowerCase()}. Ce territoire
          ne fait partie d{"'"}aucune région.
        </p>
        <SourceLink source={COG_SOURCE} />
      </Bloc>
    );
  }

  if (remplaceLeDepartement(collectivitesParticulieres)) {
    return (
      <Bloc id="collectivite-competente" title="Collectivité compétente">
        <CollectiviteNotes notes={collectivitesParticulieres} />
        <p className="text-sm">
          La composition de son assemblée n{"'"}est pas établie dans nos données.
        </p>
      </Bloc>
    );
  }

  return (
    <Bloc id="conseil" title="Conseil départemental">
      {collectivitesParticulieres.length > 0 && (
        <CollectiviteNotes notes={collectivitesParticulieres} />
      )}

      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Présidence du conseil départemental</p>
        {presidence.state === "ETABLI" && presidence.person ? (
          <>
            <p className="font-display text-lg font-bold">
              <Link
                href={`/politiques/${presidence.person.slug}`}
                prefetch={false}
                className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-primary"
              >
                {presidence.person.fullName}
              </Link>
            </p>
            {presidence.source ? (
              <SourceLink source={presidence.source} />
            ) : (
              <p className="text-xs text-muted-foreground">Source non précisée dans nos données.</p>
            )}
          </>
        ) : presidence.registre ? (
          <>
            <p className="font-display text-lg font-bold">{presidence.registre.fullName}</p>
            <p className="text-xs text-muted-foreground">
              D{"'"}après le registre national des élus, sans fiche Poligraph associée.
            </p>
          </>
        ) : (
          <p className="font-bold">Non établie dans nos données.</p>
        )}
      </div>

      {conseil.state === "DISPONIBLE" ? (
        <>
          <Executif
            titre="Vice-présidence du conseil départemental"
            rangs={rangsExecutif(conseil.membres)}
          />
          <ConseilMembres conseil={conseil} groupLabel="canton" />
        </>
      ) : (
        <p className="text-sm">
          La composition du conseil départemental n{"'"}est pas établie dans nos données.
        </p>
      )}

      <details className="rounded-xl border">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
          Compétences fixées par la loi
        </summary>
        <div className="flex flex-col gap-1.5 border-t px-4 py-3">
          <p className="text-sm">
            Le conseil départemental règle par ses délibérations les affaires du département dans
            les domaines que la loi lui attribue. Il est compétent pour prévenir et prendre en
            charge les situations de fragilité, pour le développement social, l{"'"}accueil des
            jeunes enfants et l{"'"}autonomie des personnes, et facilite l{"'"}accès aux droits des
            publics dont il a la charge. Il promeut aussi les solidarités, la cohésion territoriale
            et l{"'"}accès aux soins de proximité.
          </p>
          <SourceLink source={CGCT_COMPETENCES} />
        </div>
      </details>
    </Bloc>
  );
}
