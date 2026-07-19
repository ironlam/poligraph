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
  ferme:
    "Peine de prison effectivement exécutée (le condamné est incarcéré), par opposition au sursis.",
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
    "Parlementaire présent en séance mais qui ne prend pas part au vote (souvent le président de séance, qui ne vote qu'en cas d'égalité).",
  absent: "Parlementaire qui n'était pas présent lors du vote et n'a pas donné de procuration.",
  abstention:
    "Vote exprimé mais ni pour ni contre. L'abstention est comptabilisée dans les suffrages exprimés.",
  scrutin: "Vote formel des parlementaires sur un texte de loi, un amendement ou une motion.",
  dossierLegislatif:
    "Ensemble des textes et débats liés à un projet ou une proposition de loi, de son dépôt à son adoption.",
  suffrageDirecte:
    "Les électeurs votent directement pour élire leurs représentants (ex : présidentielle, législatives).",
  suffrageIndirect:
    "Les représentants sont élus par des grands électeurs, eux-mêmes élus (ex : sénatoriales).",
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
// HATVP — Déclarations de patrimoine & intérêts
// ============================================

export const HATVP_TERMS = {
  portefeuilleTotal:
    "Valeur totale estimée des participations financières déclarées (actions, obligations, assurance-vie…).",
  participationsHatvp:
    "Nombre d'entreprises ou organismes dans lesquels le déclarant détient des parts ou actions.",
  revenusAnnuels:
    "Montant brut des revenus perçus sur la dernière année déclarée (traitements, honoraires, dividendes…).",
  mandatsDirections:
    "Nombre de fonctions de direction ou mandats exercés dans des entreprises, associations ou organismes publics.",
} as const;

// ============================================
// MÉTRIQUES & DONNÉES
// ============================================

export const METRIC_TERMS = {
  prominence:
    "Score de notoriété calculé à partir de l'activité parlementaire, de la couverture médiatique et du rôle institutionnel.",
  participationRate:
    "Pourcentage de parlementaires ayant voté (pour, contre ou abstention) par rapport au nombre total de membres.",
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
  ...HATVP_TERMS,
  ...METRIC_TERMS,
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
