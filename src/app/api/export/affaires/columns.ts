/**
 * Column contract of the affairs CSV export.
 *
 * Lifted out of the route handler so the header set and its order can be asserted: the
 * file is consumed by scripts, so dropping or reordering a column is a breaking change
 * and deserves a test rather than a line in a PR description (#576).
 */
export const AFFAIR_EXPORT_COLUMNS = [
  { key: "poligraphId" as const, header: "poligraphId" },
  { key: "affairSlug" as const, header: "Slug affaire" },
  { key: "title" as const, header: "Titre" },
  { key: "politicianPoligraphId" as const, header: "poligraphId politique" },
  { key: "politicianSlug" as const, header: "Slug politique" },
  { key: "politicianName" as const, header: "Politique" },
  { key: "partyCurrentShort" as const, header: "Parti actuel (abrégé)" },
  { key: "partyCurrentLong" as const, header: "Parti actuel" },
  { key: "partyCurrentPosition" as const, header: "Position politique" },
  { key: "partyAtTimeShort" as const, header: "Parti au moment (abrégé)" },
  { key: "partyAtTimeLong" as const, header: "Parti au moment" },
  { key: "status" as const, header: "Statut" },
  { key: "statusCode" as const, header: "Statut (code)" },
  { key: "category" as const, header: "Catégorie" },
  { key: "categoryCode" as const, header: "Catégorie (code)" },
  { key: "severity" as const, header: "Gravité" },
  { key: "severityCode" as const, header: "Gravité (code)" },
  { key: "involvement" as const, header: "Implication" },
  { key: "involvementCode" as const, header: "Implication (code)" },
  { key: "isRelatedToMandate" as const, header: "Liée au mandat" },
  { key: "factsDate" as const, header: "Date des faits" },
  { key: "startDate" as const, header: "Date de début" },
  { key: "verdictDate" as const, header: "Date du verdict" },
  { key: "fineAmount" as const, header: "Amende (EUR)" },
  { key: "prisonMonths" as const, header: "Prison (mois)" },
  // Replaces the former "Prison avec sursis" oui/non column. Empty means the split is
  // not established; 0 means the whole term is suspended, and is a value, not an absence.
  { key: "prisonFirmMonths" as const, header: "Prison, part non assortie du sursis (mois)" },
  { key: "ineligibilityMonths" as const, header: "Inéligibilité (mois)" },
  {
    key: "ineligibilityFirmMonths" as const,
    header: "Inéligibilité, part non assortie du sursis (mois)",
  },
  { key: "communityService" as const, header: "TIG (heures)" },
  { key: "appeal" as const, header: "Appel" },
  { key: "sentence" as const, header: "Peine (texte libre)" },
  { key: "otherSentence" as const, header: "Autres peines" },
  { key: "court" as const, header: "Juridiction" },
  { key: "ecli" as const, header: "ECLI" },
  { key: "descriptionPlain" as const, header: "Description" },
  { key: "sourceCount" as const, header: "Nombre de sources" },
  { key: "sourceUrl" as const, header: "Première source (URL)" },
  { key: "sourceTitle" as const, header: "Première source (titre)" },
  { key: "pageUrl" as const, header: "Page Poligraph" },
  { key: "createdAt" as const, header: "Créée le" },
  { key: "updatedAt" as const, header: "Mise à jour le" },
];
