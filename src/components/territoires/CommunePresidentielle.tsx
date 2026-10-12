import type { CommunePresidentielles } from "@/lib/data/territoires-presidentielle";

/** Territory published as one aggregate: say so, show no figure. */
export function PresidentielleAgregatNote({
  agregat,
}: {
  agregat: NonNullable<CommunePresidentielles["agregatTerritoire"]>;
}) {
  return (
    <p className="text-sm">
      <strong>{agregat.electionTitle} :</strong> le ministère de l{"'"}Intérieur publie un seul
      résultat pour l{"'"}ensemble de {agregat.territoire}, sans détail par circonscription. Aucun
      résultat propre à cette circonscription n{"'"}est donc affiché.
    </p>
  );
}
