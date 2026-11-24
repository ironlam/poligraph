import { ChevronDown } from "lucide-react";
import {
  AGIR_AVERTISSEMENT,
  AGIR_VERIFIE_LE,
  AGIR_VOIES_DEPARTEMENT,
  AGIR_VOIES_REGION,
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
 * only fact proper to the territory is the seat of its administrative court. Each way is one
 * folded line, its text and sources inside. The block informs; it gives no advice on a
 * particular case and says so.
 */
export function Agir(
  props:
    | { niveau?: "commune"; departmentCode: string }
    | { niveau: "departement"; departmentCode: string }
    | { niveau: "region" }
) {
  const niveau = props.niveau ?? "commune";
  const departmentCode = "departmentCode" in props ? props.departmentCode : null;
  // Without a commune there is neither a municipal council nor a town hall to write to.
  if (niveau === "commune" && !aUneMairie(departmentCode!)) return null;
  const voies =
    niveau === "region"
      ? AGIR_VOIES_REGION
      : niveau === "departement"
        ? AGIR_VOIES_DEPARTEMENT
        : voiesAgir(departmentCode!);
  // A commune and a departmental council sit in their department. The seat of a regional council
  // is not recorded here, so no court is named for a region.
  const siege = departmentCode ? siegeTribunalAdministratif(departmentCode) : null;
  const auteur = niveau === "departement" ? "du département" : "de la commune";
  return (
    <SectionCard id="agir" title="Agir">
      {/* One folded line per way: its title, and the fact proper to the territory when it has one. */}
      <ul className="divide-y divide-border border-y">
        {voies.map((voie) => {
          const tribunal = voie.id === "contester" ? siege : null;
          return (
            <li key={voie.id}>
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <h3 className="font-semibold">{voie.titre}</h3>
                    {tribunal && (
                      <span className="text-sm text-muted-foreground">
                        tribunal administratif siégeant à {tribunal}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>
                <div className="pb-3">
                  <p className="text-sm">{voie.texte}</p>
                  {tribunal && (
                    <p className="mt-2 text-sm">
                      Pour une décision {auteur}, le tribunal administratif compétent est en
                      principe celui qui siège à <strong>{tribunal}</strong>.
                    </p>
                  )}
                  <Liens liens={tribunal ? [...voie.liens, ...TRIBUNAL_SOURCES] : voie.liens} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 border-l-2 border-primary/20 pl-2 text-xs leading-relaxed text-muted-foreground">
        {AGIR_AVERTISSEMENT} Vérifié le {formatDateFrUTC(AGIR_VERIFIE_LE)}.
      </p>
    </SectionCard>
  );
}
