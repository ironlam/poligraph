import { TERRITOIRES_SANS_COMMUNE } from "@/config/regions";
import type { CommuneDossier, SourceRef } from "@/lib/data/territoires";
import type { IntercommunaliteBlock } from "@/lib/data/territoires-intercommunalites";
import { formatDateFrUTC } from "@/lib/utils";
import { SOUS_BLOC } from "@/components/territoires/classes";

/**
 * Intercommunality of a commune (#1052, lot 1.8): name, nature in words, situation date and
 * source. No link (Poligraph has no intercommunality page) and no competence: membership alone
 * says nothing about who exercises what.
 */

/** "2026-01-01T00:00:00.000Z" -> "1er janvier 2026". The date is a calendar date: read in UTC. */
export function formatSituation(iso: string): string {
  return formatDateFrUTC(iso.slice(0, 10)).replace(/^1 /, "1er ");
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Sources of the block, for the source line of the section and for « Sources de cette page ». */
export function intercommunaliteSources(block: IntercommunaliteBlock): SourceRef[] {
  return block.intercommunalites.length > 0
    ? block.intercommunalites.map((b) => b.source)
    : [block.source];
}

export function IntercommunaliteCard({ dossier }: { dossier: CommuneDossier }) {
  const block = dossier.intercommunalite;
  if (!block) return null;
  const { identity } = dossier;
  const situation = block.situationDate ? formatSituation(block.situationDate) : null;
  const lyon = block.intercommunalites.find((b) => b.nature === "MET69");
  // Lyon itself already carries a sourced note on the Métropole: saying it twice adds nothing.
  if (
    lyon &&
    identity.collectivitesParticulieres.some((c) => c.id === "metropole-de-lyon-commune")
  ) {
    return null;
  }

  let label = "Intercommunalité";
  let body: React.ReactNode;
  if (lyon) {
    label = "Collectivité à statut particulier";
    body = (
      <>
        <p className="font-semibold">{lyon.name}</p>
        <p className="mt-1 text-sm">
          {identity.name} est sur le territoire de la Métropole de Lyon, une collectivité
          territoriale à statut particulier et non une intercommunalité. Situation au {situation}.
        </p>
      </>
    );
  } else if (block.state === "DISPONIBLE") {
    body = (
      <ul className="space-y-2">
        {block.intercommunalites.map((b) => (
          <li key={b.siren}>
            <p className="font-semibold">{b.name}</p>
            <p className="text-sm">
              {capitalize(b.natureLabel)}, situation au {situation}
            </p>
          </li>
        ))}
      </ul>
    );
  } else if (block.state === "AUCUNE") {
    body = (
      <>
        <p className="font-semibold">Aucune intercommunalité à fiscalité propre</p>
        <p className="mt-1 text-sm">
          Selon l{"'"}INSEE, {identity.name} n{"'"}appartient à aucune intercommunalité à fiscalité
          propre. Situation au {situation}.
        </p>
      </>
    );
  } else {
    const territoire = identity.territoireHorsRegion;
    body = (
      <>
        <p className="font-semibold">Non établie</p>
        <p className="mt-1 text-sm">
          {territoire && TERRITOIRES_SANS_COMMUNE.has(territoire.code)
            ? `${identity.name} n'est pas une commune au sens usuel : aucun fichier national ne lui rattache d'intercommunalité.`
            : territoire
              ? `Ce territoire (${territoire.name}) ne figure pas dans les fichiers nationaux de l'INSEE : l'intercommunalité de ${identity.name} n'est pas établie dans Poligraph.`
              : `${identity.name} ne figure pas dans le fichier de l'INSEE : son intercommunalité n'est pas établie dans Poligraph.`}
        </p>
      </>
    );
  }

  return (
    <div className={SOUS_BLOC}>
      <p className="text-sm text-muted-foreground">{label}</p>
      {body}
    </div>
  );
}
