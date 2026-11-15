import type { CommuneDossier, CoverageBloc, SourceRef } from "@/lib/data/territoires";
import { formatDate } from "@/lib/utils";

/**
 * Rows of the « Sources de cette page » panel of a commune: every block of the coverage matrix,
 * with its source and the date it refers to, or its absence said in words. Pure.
 */

export interface SourceLigne {
  bloc: CoverageBloc;
  label: string;
  /** "dernière confirmation le 1 octobre 2026", or the state when nothing is shown. */
  etat: string;
  source: SourceRef | null;
}

/** Label of the block and what its date means: a confirmation, an import, a ballot. */
const BLOCS: Partial<Record<CoverageBloc, [label: string, date: string]>> = {
  identite: ["Identité de la commune", "synchronisée le"],
  maire: ["Maire", "dernière confirmation le"],
  mairesSecteur: ["Maires d'arrondissement ou de secteur", "dernière confirmation le"],
  conseilMunicipal: ["Conseil municipal", "registre du"],
  population: ["Population", "importée le"],
  deputes: ["Circonscription législative", "dernière confirmation le"],
  senateurs: ["Sénateurs du département", "dernière confirmation le"],
  municipales2026: ["Résultats des municipales 2026", "scrutin du"],
  intercommunalite: ["Intercommunalité", "situation au"],
  presidentielle: ["Résultats de la présidentielle", "importés le"],
};

export function communeSources(dossier: CommuneDossier): SourceLigne[] {
  return dossier.coverage.flatMap((entry) => {
    const bloc = BLOCS[entry.bloc];
    if (!bloc) return [];
    const [label, dateLabel] = bloc;
    if (entry.state !== "DISPONIBLE") {
      const etat =
        entry.state === "NON_ETABLI" ? "non établi dans nos données" : "aucune donnée enregistrée";
      return [{ bloc: entry.bloc, label, etat, source: null }];
    }
    // A vintage population was checked against the INSEE series, not merely imported.
    const verbe =
      entry.bloc === "population" && dossier.population.vintage ? "vérifiée le" : dateLabel;
    const etat = entry.date ? `${verbe} ${formatDate(entry.date)}` : "date non enregistrée";
    return [{ bloc: entry.bloc, label, etat, source: entry.source }];
  });
}
