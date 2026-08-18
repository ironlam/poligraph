/**
 * Glossaire des termes politiques, juridiques et institutionnels français.
 * Utilisé par les composants InfoTooltip pour expliquer le jargon aux citoyens.
 */

// ============================================
// TERMES JURIDIQUES (peines & procédures)
// ============================================

export const LEGAL_TERMS = {
  sursis:
    "Peine prononcée mais non exécutée, sauf en cas de nouvelle infraction dans un délai fixé par le tribunal.",
  // Source: code pénal, art. 132-25. An aménagement is mandatory below six months
  // and available up to one year, so "ferme" does not imply incarceration.
  ferme:
    "Part de la peine qui doit être exécutée, par opposition au sursis. Elle n'implique pas nécessairement l'incarcération : une peine courte peut être aménagée en détention à domicile sous surveillance électronique, en semi-liberté ou en placement extérieur.",
  repartitionNonEtablie:
    "La durée totale de la peine est attestée, mais aucune source ne dit quelle part est ferme et quelle part est assortie du sursis.",
  ineligibilite:
    "Interdiction temporaire de se présenter à une élection. Prononcée par un tribunal comme peine complémentaire.",
  tig: "Travail d'Intérêt Général : travail non rémunéré au profit de la collectivité, prononcé comme alternative à la prison.",
  ecli: "European Case Law Identifier : identifiant unique européen des décisions de justice, permettant de retrouver le jugement exact.",
  presomptionInnocence:
    "Toute personne est considérée innocente tant qu'elle n'a pas été déclarée coupable par un jugement définitif.",
  miseEnExamen:
    "Décision du juge d'instruction de considérer une personne comme suspecte. Ce n'est pas une condamnation.",
  nonLieu: "Décision mettant fin aux poursuites quand les charges sont insuffisantes.",
  relaxe: "Décision d'un tribunal correctionnel de déclarer le prévenu non coupable.",
  classementSansSuite: "Décision du procureur de ne pas engager de poursuites pénales.",
} as const;

// ============================================
// TERMES PARLEMENTAIRES (votes & institutions)
// ============================================

export const PARLIAMENTARY_TERMS = {
  nonVotant:
    "Code de vote indiquant que le parlementaire ne prend pas part au scrutin. Ce code ne suffit pas à établir sa présence physique.",
  absent:
    "Code fourni par une source pour un scrutin donné. Il n'est jamais déduit de la seule absence d'une ligne de vote.",
  // Source: règlement du Sénat, art. 52 — "conformément au droit commun en matière
  // électorale, les abstentions n'entrent pas en compte dans le dénombrement des
  // suffrages exprimés".
  abstention:
    "Position de vote distincte du pour et du contre. Les abstentions n'entrent pas dans le décompte des suffrages exprimés, qui ne retient que les voix pour et les voix contre.",
  scrutin: "Vote formel des parlementaires sur un texte de loi, un amendement ou une motion.",
  dossierLegislatif:
    "Ensemble des textes et débats liés à un projet ou une proposition de loi, de son dépôt à son adoption.",
  suffrageDirecte:
    "Les électeurs votent directement pour élire leurs représentants (ex : présidentielle, législatives).",
  suffrageIndirect:
    "Les représentants sont élus par des grands électeurs, eux-mêmes élus (ex : sénatoriales).",
  serieSenatoriale:
    "Le Sénat se renouvelle par moitié tous les trois ans. Chaque département appartient à une série et à une seule : la série 2 est renouvelée en septembre 2026, la série 1 l'a été en 2023 et le sera en 2029. La série d'un siège ne dépend donc pas du sénateur qui l'occupe.",
  concordance:
    "Pourcentage de votes identiques entre deux parlementaires sur les scrutins auxquels ils ont tous les deux participé.",
  concordanceVotesGroupes:
    "Pourcentage de scrutins où la position majoritaire du groupe correspond à celle du groupe de référence de sa chambre. Tous les types de scrutins sont inclus. Le groupe de référence sert d'indicateur de la position gouvernementale, sans constituer une position officielle du gouvernement.",
  concordanceTextesLoi:
    "Pourcentage de votes finaux sur les projets et propositions de loi où la position majoritaire du groupe correspond à celle du groupe de référence de sa chambre. Les amendements, les votes par article et les motions sont exclus. Le groupe de référence sert d'indicateur de la position gouvernementale, sans constituer une position officielle du gouvernement.",
} as const;

// ============================================
// INSTITUTIONS & SIGLES
// ============================================

export const INSTITUTION_TERMS = {
  hatvp:
    "Haute Autorité pour la Transparence de la Vie Publique : organisme indépendant qui contrôle les déclarations de patrimoine et d'intérêts des élus.",
  an: "Assemblée nationale : chambre basse du Parlement français, composée de 577 députés élus au suffrage universel direct.",
  senat:
    "Sénat : chambre haute du Parlement français, composée de 348 sénateurs élus au suffrage indirect.",
  parlementEuropeen:
    "Institution de l'Union européenne composée de 720 eurodéputés, dont 81 représentent la France.",
} as const;

// ============================================
// MÉTRIQUES & DONNÉES
// ============================================
// The four HATVP keys below used to be declared twice, in a separate HATVP_TERMS
// block spread before this one. Every duplicate was therefore unreachable through
// GLOSSARY, and the two `revenusAnnuels` texts disagreed ("brut" against "net avant
// impôt"). The dead block is gone; the wording kept here is the one visitors were
// already being served.

export const METRIC_TERMS = {
  prominence:
    "Score de notoriété calculé à partir de l'activité parlementaire, de la couverture médiatique et du rôle institutionnel.",
  participationRate:
    "Pour l'Assemblée nationale, part des scrutins éligibles du mandat avec un vote pour, contre ou une abstention enregistré. Cet indicateur est indisponible sans périmètre applicable.",
  portefeuilleTotal:
    "Valeur totale des participations financières déclarées à la HATVP : actions, parts de sociétés (SCI, SARL…). Ce montant est une photographie à la date de déclaration, il ne comprend pas l'immobilier ni les comptes bancaires.",
  participationsHatvp:
    "Nombre de sociétés dans lesquelles l'élu détient des parts ou actions (SCI, SARL, SA…). Chaque participation est déclarée séparément avec sa valorisation.",
  revenusAnnuels:
    "Total des revenus déclarés sur la dernière année : indemnités parlementaires, salaires, revenus fonciers, dividendes, pensions. Montant net avant impôt sur le revenu.",
  mandatsDirections:
    "Nombre de mandats électifs et postes de direction (conseil d'administration, gérance…) déclarés, rémunérés ou non.",
} as const;

// Unified lookup for any term
export const GLOSSARY = {
  ...LEGAL_TERMS,
  ...PARLIAMENTARY_TERMS,
  ...INSTITUTION_TERMS,
  ...METRIC_TERMS,
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
