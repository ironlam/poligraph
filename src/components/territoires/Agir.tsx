import {
  AGIR_AVERTISSEMENT,
  AGIR_VERIFIE_LE,
  aUneMairie,
  siegeTribunalAdministratif,
  TRIBUNAL_SOURCES,
  voiesAgir,
  type AgirLien,
} from "@/config/territoires-agir";
import { SectionCard } from "@/components/territoires/CommuneSections";
import { formatDateFrUTC } from "@/lib/utils";

function Liens({ liens }: { liens: readonly AgirLien[] }) {
  return (
    <ul className="mt-1 text-sm">
      {liens.map((lien) => (
        <li key={lien.url}>
          <a
            href={lien.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-primary"
          >
            {lien.label}
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * « Agir »: the ways open to any inhabitant, in fixed text, each with its official source. The
 * only fact proper to the territory is the seat of its administrative court. The block informs;
 * it gives no advice on a particular case and says so.
 */
export function Agir({ departmentCode }: { departmentCode: string }) {
  // Without a commune there is neither a municipal council nor a town hall to write to.
  if (!aUneMairie(departmentCode)) return null;
  const siege = siegeTribunalAdministratif(departmentCode);
  return (
    <SectionCard id="agir" title="Agir">
      <ul className="divide-y divide-border">
        {voiesAgir(departmentCode).map((voie) => (
          <li key={voie.id} className="py-3 first:pt-0">
            <h3 className="font-semibold">{voie.titre}</h3>
            <p className="mt-1 text-sm">{voie.texte}</p>
            {voie.id === "contester" && siege && (
              <p className="mt-2 text-sm">
                Pour une décision de la commune, le tribunal administratif compétent est en principe
                celui qui siège à <strong>{siege}</strong>.
              </p>
            )}
            <Liens
              liens={
                voie.id === "contester" && siege ? [...voie.liens, ...TRIBUNAL_SOURCES] : voie.liens
              }
            />
          </li>
        ))}
      </ul>
      <p className="mt-3 border-l-2 border-primary/20 pl-2 text-xs leading-relaxed text-muted-foreground">
        {AGIR_AVERTISSEMENT} Vérifié le {formatDateFrUTC(AGIR_VERIFIE_LE)}.
      </p>
    </SectionCard>
  );
}
