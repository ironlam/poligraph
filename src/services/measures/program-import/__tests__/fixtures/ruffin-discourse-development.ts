import type { DiscourseRole, DiscourseSpeaker } from "../../discourse";
import type { DocumentUnit } from "../../types";

export type RuffinDiscourseDevelopmentEntry = {
  id: string;
  text: string;
  kind: DocumentUnit["kind"];
  expectedSpeaker: DiscourseSpeaker;
  expectedRole: DiscourseRole;
  previousHumanReviewError: boolean;
};

/** Consumed Ruffin examples, annotated for development only. This is not a blind set. */
export const RUFFIN_DISCOURSE_DEVELOPMENT: RuffinDiscourseDevelopmentEntry[] = [
  {
    id: "travail-temoignage-reconnaissance",
    text: "On n’est pas des bêtes. On n’est pas des boniches. On veut juste être reconnues pour ce qu’on fait.",
    kind: "QUOTATION",
    expectedSpeaker: "QUOTED_THIRD_PARTY",
    expectedRole: "TESTIMONY",
    previousHumanReviewError: true,
  },
  {
    id: "travail-temoignage-amplitude",
    text: "C’est ça, il faudrait une prise en compte de l’amplitude horaire. Si je pars pendant huit heures, je suis payée huit heures.",
    kind: "QUOTATION",
    expectedSpeaker: "QUOTED_THIRD_PARTY",
    expectedRole: "TESTIMONY",
    previousHumanReviewError: true,
  },
  {
    id: "travail-metiers-centraux",
    text: "C’est pour cette raison que ces métiers sont centraux dans le projet de société que nous défendons.",
    kind: "SENTENCE",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "GENERAL_INTENT",
    previousHumanReviewError: true,
  },
  {
    id: "probite-cabinets-depossession",
    text: "On ferme des guichets, mais on ouvre des marchés de conseil. On supprime des postes, puis on rachète au prix fort des compétences que l’État a lui-même affaiblies. Ce n’est pas seulement du gaspillage. C’est une dépossession.",
    kind: "SENTENCE",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "DIAGNOSIS",
    previousHumanReviewError: true,
  },
  {
    id: "probite-cabinets-decision",
    text: "À force de sous-traiter son expertise, l’État sous-traite sa décision. Un État qui ne sait plus faire par lui-même finit par ne plus décider pour lui-même.",
    kind: "SENTENCE",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "DIAGNOSIS",
    previousHumanReviewError: true,
  },
  {
    id: "probite-investissements-outils-existants",
    text: "Et pourtant, les outils existent sur le papier. Depuis le décret Montebourg de 2014, certains investissements étrangers dans des secteurs sensibles doivent être soumis à autorisation préalable.",
    kind: "SENTENCE",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "EXISTING_POLICY",
    previousHumanReviewError: true,
  },
  {
    id: "probite-souverainete-questions",
    text: "Qui décide qu’un morceau du pays peut être vendu ? Selon quels critères ? Avec quelle transparence ? La souveraineté ne se proclame pas : elle se protège.",
    kind: "SENTENCE",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "DIAGNOSIS",
    previousHumanReviewError: true,
  },
  {
    id: "probite-premier-constat",
    text: "Voilà notre premier constat : la République ne peut pas vivre avec deux morales, l’une inflexible pour les citoyens sans privilèges, l’autre accommodante pour les puissants.",
    kind: "SENTENCE",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "DIAGNOSIS",
    previousHumanReviewError: true,
  },
  {
    id: "loisirs-preambule-1946",
    text: "Le préambule de 1946 dispose que la Nation garantit à tous le repos et les loisirs ainsi que l’égal accès à la culture.",
    kind: "QUOTATION",
    expectedSpeaker: "LEGAL_OR_INSTITUTIONAL_SOURCE",
    expectedRole: "LEGAL_REFERENCE",
    previousHumanReviewError: true,
  },
  {
    id: "travail-proposition-2-heading",
    text: "Proposition 2. Comptabiliser les heures de travail invisibles et réduire l’amplitude horaire des journées.",
    kind: "HEADING",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "COMMITMENT",
    previousHumanReviewError: true,
  },
  {
    id: "probite-cjip",
    text: "Supprimer l’actuelle convention judiciaire d’intérêt public (CJIP).",
    kind: "LIST_ITEM",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "COMMITMENT",
    previousHumanReviewError: false,
  },
  {
    id: "probite-haute-autorite",
    text: "Créer la Haute Autorité à la probité, fusion de l’ensemble des organes existants de l’éthique de la vie publique.",
    kind: "HEADING",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "COMMITMENT",
    previousHumanReviewError: false,
  },
  {
    id: "loisirs-objectif-vacanciers",
    text: "Objectif : 67 millions de vacanciers.",
    kind: "HEADING",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "OBJECTIVE",
    previousHumanReviewError: false,
  },
  {
    id: "travail-heading-journees",
    text: "Mettre fin aux journées hachées et aux horaires impossibles.",
    kind: "HEADING",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "COMMITMENT",
    previousHumanReviewError: false,
  },
  {
    id: "loisirs-pratique-existante",
    text: "La ville applique déjà un tarif social pour les loisirs.",
    kind: "SENTENCE",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "EXISTING_POLICY",
    previousHumanReviewError: false,
  },
  {
    id: "loisirs-endossement-explicite",
    text: "Nous étendrons ce dispositif à l’ensemble du pays.",
    kind: "SENTENCE",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "EXPLICIT_ENDORSEMENT",
    previousHumanReviewError: false,
  },
  {
    id: "probite-empreinte-decision",
    text: "Conformément aux recommandations de l’OCDE, nous rendrons obligatoire une empreinte de décision sur chaque texte important.",
    kind: "SENTENCE",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "COMMITMENT",
    previousHumanReviewError: false,
  },
  {
    id: "travail-objectif-remuneration",
    text: "Mieux payer celles et ceux qui prennent soin, qui accompagnent, qui nettoient, qui nourrissent.",
    kind: "HEADING",
    expectedSpeaker: "DOCUMENT_AUTHOR",
    expectedRole: "OBJECTIVE",
    previousHumanReviewError: false,
  },
];

export function getRuffinDiscourseDevelopmentUnits(): DocumentUnit[] {
  return RUFFIN_DISCOURSE_DEVELOPMENT.map((entry, order) => ({
    id: `dev-b${String(order + 1).padStart(3, "0")}-u001`,
    blockId: `dev-b${String(order + 1).padStart(3, "0")}`,
    page: order + 1,
    order,
    blockOrder: order,
    text: entry.text,
    kind: entry.kind,
    numbers: [],
    provenance: { status: "TEXT_LAYER_TRUSTED", reason: null, extractionAllowed: true },
  }));
}
