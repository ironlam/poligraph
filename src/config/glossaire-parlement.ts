/**
 * Plain-language definitions shown on /parlement/glossaire. Simplified for civic education, not
 * legal sources: the page says so. Keep each entry short and free of figures that go stale.
 */
export interface GlossaireTerme {
  id: string;
  terme: string;
  definition: string;
  /** Ids of related terms, rendered as "Voir aussi". */
  voirAussi?: string[];
}

export const GLOSSAIRE_PARLEMENT: GlossaireTerme[] = [
  {
    id: "amendement",
    terme: "Amendement",
    definition:
      "Modification proposée à un texte de loi. Les élus la votent avant de voter le texte lui-même.",
  },
  {
    id: "commission",
    terme: "Commission",
    definition: "Groupe restreint d'élus qui étudie un texte et l'amende avant le débat en séance.",
    voirAussi: ["seance-publique"],
  },
  {
    id: "cmp",
    terme: "Commission mixte paritaire (CMP)",
    definition:
      "Réunion de 7 députés et 7 sénateurs chargés de proposer un texte commun quand les deux chambres ne s'accordent pas.",
    voirAussi: ["navette"],
  },
  {
    id: "conseil-constitutionnel",
    terme: "Conseil constitutionnel",
    definition:
      "Institution qui vérifie, lorsqu'elle est saisie, qu'une loi respecte la Constitution avant sa promulgation.",
    voirAussi: ["promulgation"],
  },
  {
    id: "dissolution",
    terme: "Dissolution",
    definition:
      "Décision du Président de la République de mettre fin au mandat des députés avant son terme, ce qui provoque de nouvelles élections. Elle ne concerne pas le Sénat.",
    voirAussi: ["legislature"],
  },
  {
    id: "groupe-parlementaire",
    terme: "Groupe parlementaire",
    definition: "Regroupement d'élus d'une même famille politique au sein d'une chambre.",
  },
  {
    id: "hemicycle",
    terme: "Hémicycle",
    definition: "Salle en demi-cercle où siègent les élus et où se tiennent les débats publics.",
    voirAussi: ["seance-publique"],
  },
  {
    id: "legislature",
    terme: "Législature",
    definition:
      "Période qui court de l'élection des députés à la fin de leur mandat, par expiration ou par dissolution.",
    voirAussi: ["dissolution"],
  },
  {
    id: "motion-de-censure",
    terme: "Motion de censure",
    definition:
      "Vote par lequel l'Assemblée nationale peut renverser le Gouvernement. Le Sénat ne peut pas en voter.",
  },
  {
    id: "navette",
    terme: "Navette",
    definition:
      "Allers-retours d'un texte entre l'Assemblée et le Sénat, jusqu'à ce que les deux votent la même version.",
    voirAussi: ["cmp"],
  },
  {
    id: "procedure-acceleree",
    terme: "Procédure accélérée",
    definition:
      "Procédure demandée par le Gouvernement qui limite l'examen à une lecture par chambre avant la CMP.",
    voirAussi: ["cmp"],
  },
  {
    id: "projet-de-loi",
    terme: "Projet de loi",
    definition: "Texte de loi proposé par le Gouvernement.",
    voirAussi: ["proposition-de-loi"],
  },
  {
    id: "promulgation",
    terme: "Promulgation",
    definition:
      "Acte du Président de la République qui rend la loi exécutoire, suivi de sa publication au Journal officiel.",
    voirAussi: ["conseil-constitutionnel"],
  },
  {
    id: "proposition-de-loi",
    terme: "Proposition de loi",
    definition: "Texte de loi proposé par des députés ou des sénateurs.",
    voirAussi: ["projet-de-loi"],
  },
  {
    id: "scrutin",
    terme: "Scrutin",
    definition:
      "Vote dont le résultat est enregistré. Poligraph suit les scrutins publics, où chaque vote individuel est connu.",
  },
  {
    id: "seance-publique",
    terme: "Séance publique",
    definition:
      "Moment où le texte est débattu et voté par tous les élus de la chambre, dans l'hémicycle.",
    voirAussi: ["hemicycle"],
  },
];

/** First letter without accent, uppercase: "Hémicycle" sorts under H. */
export function glossaireLettre(terme: string): string {
  return terme.normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
}

export function glossaireParLettre(
  termes: GlossaireTerme[] = GLOSSAIRE_PARLEMENT
): { lettre: string; termes: GlossaireTerme[] }[] {
  const groupes = new Map<string, GlossaireTerme[]>();
  for (const t of termes) {
    const lettre = glossaireLettre(t.terme);
    groupes.set(lettre, [...(groupes.get(lettre) ?? []), t]);
  }
  return [...groupes.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "fr"))
    .map(([lettre, items]) => ({
      lettre,
      termes: [...items].sort((a, b) => a.terme.localeCompare(b.terme, "fr")),
    }));
}
