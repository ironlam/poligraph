/**
 * Editorial snapshot of the thematic booklets ("Les Carnets", 2026) published by Nouvelle Énergie
 * for David Lisnard's presidential candidacy.
 *
 * Why a seed and not the program import pipeline: `runProgramImport()` fetches a `ProgramEdition`
 * document and extracts its propositions with an LLM. The carnets are PDF booklets whose
 * proposition pages are laid out in two columns of bullet lists interleaved with editorial essays
 * and infographics; the propositions were transcribed by hand from the booklet, one sentence per
 * bullet, which is what `MeasureExtractionMethod.MANUAL` records.
 *
 * Kept apart from `scripts/seed-lisnard-carnets.ts` so the regression test can import it without
 * pulling in the Prisma singleton, which throws when DATABASE_URL is absent (as it is in CI).
 * Type-only imports below keep this module free of runtime deps.
 *
 * WHAT IS RECORDED, AND WHAT IS NOT
 * - `text` is the proposition as the booklet states it, condensed into one self-contained
 *   sentence. Nothing is added, and the figures the booklet gives are kept verbatim.
 * - `page` is the page of the booklet the sentence was read on, so a reviewer can check it.
 * - `sourceUrl` is the theme page of the programme, which is the public location the booklet is
 *   distributed from and the URL the existing Lisnard measures already carry. The booklets
 *   themselves have no stable public URL that could be verified, so none is invented here: the
 *   seed script refuses to write until each URL below answers 200.
 */

import type {
  MeasureAttribution,
  MeasureSourceKind,
  MeasurePrecision,
  ThemeCategory,
} from "../../src/generated/prisma";

export interface ProgramMeasureSeed {
  /** The proposition, one self-contained sentence, as stated by the document. */
  text: string;
  theme: ThemeCategory;
  /** CHIFFREE only when the commitment itself carries a figure, a target or a deadline. */
  precision: MeasurePrecision;
  /** Page of the document the sentence was read on, recorded on the measure source. */
  page: string;
}

export interface ProgramEditionSeed {
  /** Stable label: it is also the idempotency key used to find the edition again. */
  label: string;
  /** Document the edition designates, fetched by the program import pipeline. */
  documentUrl: string;
  /** Date the edition was collected; the booklets carry a year, no publication date. */
  publishedAt: Date;
  sourceKind: MeasureSourceKind;
  /** URL recorded on every measure source of this edition. */
  sourceUrl: string;
  measures: ProgramMeasureSeed[];
}

export interface ProgramSeed {
  electionSlug: string;
  politicianSlug: string;
  attribution: MeasureAttribution;
  /** When the candidate's formulation applies, carried by every revision of this seed. */
  validFrom: Date;
  editions: ProgramEditionSeed[];
}

/** The day the booklets were read. The booklets are dated 2026 and carry no finer date. */
const COLLECTED_AT = new Date("2026-08-21T00:00:00.000Z");

const SANTE_MEASURES: ProgramMeasureSeed[] = [
  // Rubrique « Lutter contre les déserts médicaux », page 8.
  {
    text: "Adapter le concours national classant aux besoins réels de soins et non aux seules capacités universitaires.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Donner une réelle autonomie aux facultés de médecine pour contractualiser librement avec les structures de soins.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Développer des centres de formation dans les zones rurales pour y favoriser l'implantation de professionnels de santé.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Permettre au patient d'accéder librement à tout professionnel compétent, spécialiste, infirmier en pratique avancée ou kinésithérapeute, avec un remboursement plein.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Exonérer de cotisation foncière des entreprises les médecins libéraux en zone sous-dense, réduire leurs prélèvements sociaux pendant les cinq premières années et accélérer la déductibilité des investissements du cabinet.",
    theme: "SANTE",
    precision: "CHIFFREE",
    page: "8",
  },
  {
    text: "Faciliter la transmission de patientèle libérale, notamment par l'exonération des plus-values professionnelles lors de la cession en zone sous-dense.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  // Rubrique « Redonner de l'attractivité aux métiers de santé », page 8.
  {
    text: "Réduire drastiquement la charge administrative des soignants, en ville comme à l'hôpital, pour leur redonner du temps médical.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Faire de la santé un ascenseur social en élargissant les conditions d'accès aux formations et en développant la promotion interne et les reconversions qualifiantes.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Rétablir et pérenniser l'exonération de cotisations sociales pour l'ensemble des soignants libéraux en cumul emploi-retraite.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Exonérer fiscalement les heures supplémentaires des soignants en établissement sanitaire, médico-social, social, éducatif ou en lieu d'exercice coordonné.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  // Rubrique « Prévention et santé mentale », page 9.
  {
    text: "Adopter une politique nationale de prévention évaluable par indicateurs, notamment le taux de dépistage et la réduction des facteurs de risque.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Confier aux infirmiers et aux pharmaciens des actions de prévention menées directement auprès des populations concernées : vaccination des personnes vulnérables et des seniors, dépistage de l'hypertension et prévention du diabète.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Intégrer l'éducation à la santé aux programmes scolaires, sous pilotage conjoint avec l'Éducation nationale et avec une évaluation sur des indicateurs de long terme.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Engager un plan de recrutement d'infirmiers scolaires et leur confier les bilans de santé à des âges clés ainsi que le premier niveau de prévention psychologique.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Mettre en place une stratégie nationale de santé mentale associant dépistage précoce, accès simplifié aux soins psychiques et renforcement massif de la pédopsychiatrie.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Proposer des incitations fiscales aux entreprises qui investissent dans la santé de leurs salariés.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Instaurer des bilans de santé obligatoires à des âges clés pour favoriser la détection précoce.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Prévenir les chutes chez les plus de 65 ans par l'activité physique adaptée, l'aménagement des domiciles et l'adaptation de l'espace public.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Conditionner le financement de chaque programme de prévention à des résultats mesurables, sans lesquels il n'est pas reconduit.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  // Rubrique « Simplifier l'organisation et décentraliser », page 9.
  {
    text: "Simplifier les process de la tarification à l'activité afin de réduire les tâches administratives inutiles.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Rendre intégralement numériques les certificats médicaux à faible valeur ajoutée, arrêts courts et certificats sportifs ou scolaires, avec génération automatique via le Dossier Médical Partagé.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Organiser le suivi coordonné des malades chroniques par des équipes de proximité associant médecin, infirmier, diététicien et coach en activité physique.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Donner aux directions d'hôpitaux une plus grande souplesse juridique et administrative, avec des contrats locaux permettant de moduler financement et organisation.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  // Rubrique « Moderniser le financement », page 10.
  {
    text: "Instaurer une loi pluriannuelle de santé sur le modèle des lois de programmation militaire, fixant une vision stratégique à 3-5 ans, des priorités sanitaires et les moyens correspondants.",
    theme: "SANTE",
    precision: "CHIFFREE",
    page: "10",
  },
  {
    text: "Mener une convergence tarifaire entre l'hôpital public et le privé pour supprimer les distorsions.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Renforcer la lutte contre la fraude aux prestations de santé avec la Carte Vitale biométrique et un contrôle automatisé ciblé.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Digitaliser l'intégralité des flux entre professionnels et établissements de santé, en confier le contrôle de cohérence à l'intelligence artificielle et rétablir l'entente préalable pour les prothèses dentaires.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Renforcer la formation médicale continue et la rendre effective pour tous les praticiens afin de réduire les prescriptions de routine non fondées sur l'état de l'art.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Construire une offre territoriale de soins graduée de premier recours mobilisant infirmiers, pharmaciens et kinésithérapeutes, pour éviter le recours inutile aux urgences.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Encourager l'investissement dans l'innovation médicale et numérique : intelligence artificielle diagnostique, robotique chirurgicale, télésurveillance des maladies chroniques et partage sécurisé des données.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Rendre obligatoires l'alimentation du Dossier Médical Partagé par tous les professionnels de santé et l'utilisation systématique de la prescription électronique, afin qu'aucun examen déjà réalisé ne soit prescrit une seconde fois.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  // Rubrique « Souveraineté sanitaire, innovation et recherche », page 10.
  {
    text: "Instaurer une programmation pluriannuelle de la recherche en santé fixant des priorités scientifiques, des financements dédiés et une trajectoire d'investissement stable.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Créer un consortium national de recherche et d'innovation en santé associant CHU, universités, laboratoires et industriels, avec un financement mixte public-privé de plateformes technologiques partagées.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Relocaliser les productions critiques de médicaments et de dispositifs médicaux par un allégement fiscal et administratif et une simplification réglementaire.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Protéger les données de santé par un cadre souverain d'hébergement, de cybersécurité et de gouvernance.",
    theme: "SANTE",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
];

const AGRICULTURE_MEASURES: ProgramMeasureSeed[] = [
  // Essai introductif, page 3 : le seul engagement chiffré d'installation du carnet.
  {
    text: "Se fixer un cap de 10 000 installations d'agriculteurs par an, avec un accompagnement technique, humain et bancaire et un guichet unique pour simplifier les démarches.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "CHIFFREE",
    page: "3",
  },
  // Objectif 1 : replacer la production agricole au cœur des politiques publiques, page 8.
  {
    text: "Réorienter la politique agricole commune vers le soutien à la production et à l'investissement, sur la base de contrats d'objectifs partagés laissant aux territoires la liberté des moyens.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Autoriser sans délai les nouvelles techniques de sélection végétale (NBT) et promouvoir les biotechnologies utiles.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Recentrer l'INRAE et les instituts techniques sur la recherche appliquée au service des agriculteurs.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    // Constitutional revision: classified INSTITUTIONS, like any other change to the Constitution,
    // even though the booklet argues it from agriculture.
    text: "Supprimer le principe de précaution de la Constitution et lui substituer un principe de responsabilité.",
    theme: "INSTITUTIONS",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Permettre l'innovation et l'expérimentation au sein des appellations d'origine contrôlée, notamment en libérant l'usage des cépages résistants en viticulture.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  // Objectif 2 : sécuriser les intrants, l'accès à l'eau et aux ressources stratégiques, page 8.
  {
    text: "Rendre possible une filière française d'engrais azotés décarbonés alimentée par l'électricité nucléaire et renouvelable.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Promouvoir et développer l'élevage, producteur de protéines et gisement d'engrais organiques.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Réformer et simplifier la loi sur l'eau pour permettre le stockage hivernal et l'irrigation estivale.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Simplifier et valoriser l'usage des lisiers et des fumiers en levant les obligations excessives qui l'entravent.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  {
    text: "Garantir la souveraineté nationale sur les semences, l'énergie, l'eau et les fertilisants.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "8",
  },
  // Objectif 3 : restaurer la compétitivité des exploitations françaises, page 9.
  {
    text: "Supprimer les impôts de production agricoles.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Transférer les charges fiscales et sociales non contributives de l'agriculture vers l'assiette de la valeur ajoutée.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Libérer l'amortissement comptable agricole pour tenir compte des variations de production.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Créer un statut unique d'entreprise rurale agricole intégrée accueillant la production, la transformation, la vente, l'énergie, le foncier, la forêt, l'immobilier et le tourisme.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Mettre en place dans chaque exploitation un compte épargne aléas climatiques et économiques mobilisable en cas de crise, sur le principe d'une assurance par capitalisation.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  // Objectif 4 : reconquérir la valeur ajoutée agricole sur le sol français, page 9.
  {
    text: "Développer un maillage territorial d'industries de première et deuxième transformation : meuneries, conserveries, laiteries et scieries.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Faciliter les filières d'avenir que sont les protéines végétales, le bois et la chimie verte.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Permettre aux agriculteurs et aux forestiers de vendre le carbone économisé, substitué ou stocké au titre des services écosystémiques.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  {
    text: "Accélérer le programme « 4 pour 1000 » et l'agriculture de conservation des sols en rémunérant le carbone capté et stocké plutôt qu'en sanctionnant l'usage des engrais.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "9",
  },
  // Objectif 5 : libérer les agriculteurs par la simplification, page 10.
  {
    text: "Supprimer les formulaires inutiles et les déclarations redondantes et simplifier les dossiers de la politique agricole commune.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Inverser la charge de la preuve dans les contrôles agricoles, la confiance redevenant le principe et l'obligation administrative l'exception.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Décentraliser le pouvoir réglementaire agricole vers les préfets et les collectivités locales pour adapter les règles aux spécificités des territoires.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Supprimer les surtranspositions françaises des normes européennes en matière agricole.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  // Objectif 6 : faire de l'agriculture un levier géopolitique et stratégique, page 10.
  {
    text: "Instaurer la réciprocité des normes dans les accords commerciaux.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Appliquer unilatéralement des clauses de sauvegarde sur les importations agricoles si nécessaire.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Relancer une diplomatie agricole offensive fondée sur des transferts de technologie et des accords mutuellement bénéfiques.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Engager l'harmonisation des règles fiscales et sociales agricoles en Europe.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
  {
    text: "Affirmer une préférence communautaire assumée en matière agricole et alimentaire.",
    theme: "AGRICULTURE_ALIMENTATION",
    precision: "OBJECTIF_SANS_CHIFFRE",
    page: "10",
  },
];

export const LISNARD_CARNETS_SEED: ProgramSeed = {
  electionSlug: "presidentielle-2027",
  politicianSlug: "david-lisnard",
  // The booklets are signed by David Lisnard as président de Nouvelle Énergie and published for
  // his candidacy, so the propositions are his own, not inherited from a party programme he did
  // not write.
  attribution: "PERSONAL",
  validFrom: COLLECTED_AT,
  editions: [
    {
      label: "Carnet Santé de Nouvelle Énergie, version relevée le 21 août 2026",
      documentUrl: "https://www.unenouvelleenergie.fr/notre-programme/sante/",
      publishedAt: COLLECTED_AT,
      sourceKind: "PROPOSITIONS_CANDIDAT",
      sourceUrl: "https://www.unenouvelleenergie.fr/notre-programme/sante/",
      measures: SANTE_MEASURES,
    },
    {
      label: "Carnet Agriculture de Nouvelle Énergie, version relevée le 21 août 2026",
      documentUrl: "https://www.unenouvelleenergie.fr/notre-programme/agriculture/",
      publishedAt: COLLECTED_AT,
      sourceKind: "PROPOSITIONS_CANDIDAT",
      sourceUrl: "https://www.unenouvelleenergie.fr/notre-programme/agriculture/",
      measures: AGRICULTURE_MEASURES,
    },
  ],
};

/**
 * Idempotency key of a proposition.
 *
 * Compared against the text of every revision the candidacy already carries, so a second run adds
 * nothing and a proposition already entered by hand in the admin is not duplicated. Accents,
 * case, apostrophes and punctuation are removed because those are exactly what differs between
 * two transcriptions of the same sentence.
 */
export function normalizeMeasureText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’«»"“”]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
