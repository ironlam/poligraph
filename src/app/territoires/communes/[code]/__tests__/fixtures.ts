import type { CommuneDossier } from "@/lib/data/territoires";
import { getCollectivitesForCommune } from "@/config/collectivites-particulieres";

const RNE = {
  label: "Répertoire National des Élus",
  url: "https://www.data.gouv.fr/fr/datasets/repertoire-national-des-elus-1/",
};
const AN = { label: "Assemblée nationale", url: "https://www.assemblee-nationale.fr/dyn/deputes/" };
const COG = { label: "Code officiel géographique (INSEE), via geo.api.gouv.fr", url: null };
const POP = { label: "Population (INSEE), via geo.api.gouv.fr", url: null };
const RESULTS = {
  label: "Ministère de l'Intérieur, résultats des élections municipales 2026 (data.gouv.fr)",
  url: "https://www.data.gouv.fr/datasets/elections-municipales-2026-resultats-du-premier-tour",
};

/** A Rennes-like dossier with an established mayor, one deputy and first-round results. */
const NO_PRESIDENTIELLE = { blocks: [], agregatTerritoire: null };

export function dossier(overrides: Partial<CommuneDossier> = {}): CommuneDossier {
  return {
    decisionsPubliees: 0,
    identity: {
      inseeCode: "35238",
      name: "Rennes",
      postalCodes: ["35000", "35200", "35700"],
      department: { code: "35", name: "Ille-et-Vilaine", slug: "ille-et-vilaine" },
      region: { code: "53", name: "Bretagne", slug: "bretagne" },
      territoireHorsRegion: null,
      collectivitesParticulieres: [],
      coordinates: { lat: 48.1159, lon: -1.6884 },
      source: COG,
    },
    maire: {
      state: "ETABLI",
      person: {
        slug: "camille-exemple",
        fullName: "Camille Exemple",
        photoUrl: null,
        civility: null,
      },
      functionStart: "2026-03-22T00:00:00.000Z",
      mandateStart: "2026-03-22T00:00:00.000Z",
      lastConfirmedAt: null,
      source: RNE,
    },
    mairesSecteur: [],
    surface: {
      hectares: null,
      source: { label: "geo.api.gouv.fr, surface de la commune", url: null },
    },
    conseilMunicipal: {
      state: "NON_ETABLI",
      recordedCount: 0,
      membres: [],
      registerDate: null,
      source: null,
    },
    population: {
      value: 230890,
      vintage: null,
      importedAt: "2026-08-10T09:00:00.000Z",
      source: POP,
    },
    parlement: {
      deputes: {
        state: "DISPONIBLE",
        circonscriptionEnregistree: 1,
        couvertureCirconscriptions: "NON_VERIFIEE",
        reserve: "CIRCONSCRIPTION_NON_VERIFIEE",
        deputesCirconscriptionEnregistree: [],
        deputes: [
          {
            slug: "dominique-depute",
            fullName: "Dominique Député",
            photoUrl: null,
            civility: "Mme",
            constituency: "Ille-et-Vilaine (1)",
            lastConfirmedAt: null,
            source: AN,
          },
        ],
      },
      senateurs: { state: "DISPONIBLE", senateurs: [] },
    },
    elections: {
      presidentielles: NO_PRESIDENTIELLE,
      municipales2026: {
        state: "DISPONIBLE",
        electionSlug: "municipales-2026",
        round1Date: "2026-03-15T00:00:00.000Z",
        round2Date: "2026-03-22T00:00:00.000Z",
        listes: [
          {
            listName: "Liste A",
            teteDeListe: {
              name: "Camille Exemple",
              person: {
                slug: "camille-exemple",
                fullName: "Camille Exemple",
                photoUrl: null,
                civility: null,
              },
            },
            round1Votes: 1000,
            round1Pct: 54.2,
            round2Votes: null,
            round2Pct: null,
            elueAuPremierTour: true,
            electionAuPremierTour: "ELUE",
            elueAuSecondTour: false,
          },
          {
            listName: "Liste B",
            teteDeListe: { name: "Sacha Modèle", person: null },
            round1Votes: 845,
            round1Pct: 45.8,
            round2Votes: null,
            round2Pct: null,
            elueAuPremierTour: false,
            electionAuPremierTour: "NON_ELUE",
            elueAuSecondTour: false,
          },
        ],
        participation: [
          {
            round: 1,
            registeredVoters: 3000,
            actualVoters: 1900,
            validVotes: 1845,
            participationRate: 63.3,
          },
        ],
        source: RESULTS,
      },
    },
    intercommunalite: null,
    coverage: [
      { bloc: "identite", state: "DISPONIBLE", source: COG, date: null },
      { bloc: "maire", state: "DISPONIBLE", source: RNE, date: null },
      { bloc: "conseilMunicipal", state: "NON_ETABLI", source: null, date: null },
      { bloc: "population", state: "DISPONIBLE", source: POP, date: null },
      { bloc: "deputes", state: "DISPONIBLE", source: AN, date: null },
      { bloc: "senateurs", state: "DISPONIBLE", source: null, date: null },
      { bloc: "municipales2026", state: "DISPONIBLE", source: RESULTS, date: null },
    ],
    ...overrides,
  };
}

const NO_MAYOR = {
  person: null,
  functionStart: null,
  mandateStart: null,
  lastConfirmedAt: null,
  source: null,
};

export function withMaire(state: "NON_ETABLI" | "ABSENT"): CommuneDossier {
  const base = dossier();
  return {
    ...base,
    maire: { state, ...NO_MAYOR },
    coverage: base.coverage.map((c) => (c.bloc === "maire" ? { ...c, state, source: null } : c)),
  };
}

/** Saint-Denis de La Réunion: a region, no outline. */
export function reunion(): CommuneDossier {
  const base = dossier();
  return {
    ...base,
    identity: {
      ...base.identity,
      inseeCode: "97411",
      name: "Saint-Denis",
      postalCodes: ["97400"],
      department: { code: "974", name: "La Réunion", slug: "la-reunion" },
      region: { code: "04", name: "La Réunion", slug: "la-reunion" },
      coordinates: { lat: -20.9434, lon: 55.4444 },
    },
  };
}

/** Papeete: a COM, outside any region, no recorded constituency, no mayor. */
export function papeete(): CommuneDossier {
  const base = withMaire("ABSENT");
  return {
    ...base,
    identity: {
      ...base.identity,
      inseeCode: "98735",
      name: "Papeete",
      postalCodes: ["98714"],
      department: { code: "987", name: "Polynésie française", slug: "polynesie-francaise" },
      region: null,
      territoireHorsRegion: {
        code: "987",
        name: "Polynésie française",
        statut: "Collectivité d'outre-mer",
      },
      coordinates: { lat: -17.5572, lon: -149.5555 },
    },
    population: { ...base.population, value: 26654 },
    parlement: {
      deputes: {
        state: "NON_ETABLI",
        circonscriptionEnregistree: null,
        couvertureCirconscriptions: "NON_VERIFIEE",
        deputes: [],
        deputesCirconscriptionEnregistree: [],
        reserve: "CIRCONSCRIPTION_NON_VERIFIEE",
      },
      senateurs: { state: "DISPONIBLE", senateurs: [] },
    },
    elections: { municipales2026: null, presidentielles: NO_PRESIDENTIELLE },
  };
}

/** Paris: PLM, several constituencies, sector mayors and the Ville de Paris note. */
export function paris(): CommuneDossier {
  const base = dossier();
  return {
    ...base,
    identity: {
      ...base.identity,
      inseeCode: "75056",
      name: "Paris",
      postalCodes: ["75001", "75002", "75003", "75004", "75005"],
      department: { code: "75", name: "Paris", slug: "paris" },
      region: { code: "11", name: "Île-de-France", slug: "ile-de-france" },
      collectivitesParticulieres: getCollectivitesForCommune("75056"),
      coordinates: { lat: 48.8589, lon: 2.347 },
    },
    mairesSecteur: [
      {
        person: { slug: "alex-secteur", fullName: "Alex Secteur", photoUrl: null, civility: null },
        sectorLabel: "Paris Centre",
        functionStart: "2026-04-01T00:00:00.000Z",
        lastConfirmedAt: null,
        source: RNE,
      },
    ],
    parlement: {
      deputes: {
        state: "NON_ETABLI",
        circonscriptionEnregistree: 1,
        couvertureCirconscriptions: "PLUSIEURS",
        deputes: [],
        deputesCirconscriptionEnregistree: [],
        reserve: "PLUSIEURS_CIRCONSCRIPTIONS",
      },
      senateurs: { state: "DISPONIBLE", senateurs: [] },
    },
  };
}

/**
 * A commune of 20 000 inhabitants or more: the deputy of the recorded constituency is not
 * established as the commune's own, and is given only with the reservation.
 */
export function grandeCommune(civility: string | null = "Mme"): CommuneDossier {
  const base = dossier();
  const recorded = { ...base.parlement.deputes.deputes[0]!, civility };
  return {
    ...base,
    parlement: {
      ...base.parlement,
      deputes: {
        ...base.parlement.deputes,
        state: "NON_ETABLI",
        deputes: [],
        deputesCirconscriptionEnregistree: [recorded],
      },
    },
    coverage: base.coverage.map((c) =>
      c.bloc === "deputes"
        ? { ...c, state: "NON_ETABLI", reserve: "CIRCONSCRIPTION_NON_VERIFIEE" }
        : c
    ),
  };
}

const INSEE_URL = "https://www.insee.fr/fr/information/2510634";
const EPCI_SRC = { label: "INSEE, EPCI à fiscalité propre au 1er janvier 2026", url: INSEE_URL };
const EPT_SRC = {
  label: "INSEE, établissements publics territoriaux au 1er janvier 2026",
  url: INSEE_URL,
};

type Interco = NonNullable<CommuneDossier["intercommunalite"]>;

/** Intercommunality block as the reader builds it after an import. */
export function interco(
  state: Interco["state"],
  bodies: {
    siren: string;
    name: string;
    nature: Interco["intercommunalites"][number]["nature"];
    natureLabel: string;
  }[] = []
): Interco {
  return {
    state,
    intercommunalites: bodies.map((b) => ({
      ...b,
      source: b.nature === "EPT" ? EPT_SRC : EPCI_SRC,
    })),
    situationDate: state === "NON_ETABLI" ? null : "2026-01-01T00:00:00.000Z",
    source: EPCI_SRC,
    lastCheckedAt: "2026-10-12T08:00:00.000Z",
  };
}
