/**
 * Word lists used by the affair resolver's context-plausibility signal to
 * determine whether a text is plausibly about French politics or about
 * foreign affairs.
 *
 * Curated manually. Keep the lists short; the goal is high-precision hints,
 * not exhaustive coverage.
 */

/**
 * French institutions, courts, and political keywords that indicate the
 * context is French.
 */
export const FRENCH_ANCHORS = [
  "assemblée nationale",
  "sénat",
  "élysée",
  "matignon",
  "conseil constitutionnel",
  "conseil d'état",
  "cour de cassation",
  "cour d'appel",
  "tribunal judiciaire",
  "tribunal correctionnel",
  "pnf",
  "parquet national financier",
  "hatvp",
  "république française",
];

/** French party acronyms commonly used as context anchors. */
export const FRENCH_PARTY_ANCHORS = [
  "LR",
  "PS",
  "RN",
  "LFI",
  "EELV",
  "LREM",
  "MODEM",
  "UMP",
  "UDI",
  "RENAISSANCE",
];

/**
 * Foreign country / capital / institution keywords that drag the plausibility
 * score down when no French anchor is present.
 */
export const FOREIGN_INDICATORS = [
  "espagne",
  "espagnole",
  "madrid",
  "barcelone",
  "italie",
  "italienne",
  "rome",
  "milan",
  "allemagne",
  "allemande",
  "berlin",
  "bundestag",
  "belgique",
  "belge",
  "bruxelles",
  "royaume-uni",
  "londres",
  "westminster",
  "downing street",
  "états-unis",
  "washington",
  "white house",
  "portugal",
  "portugaise",
  "lisbonne",
  "suisse",
  "berne",
  "parlement européen",
  "commission européenne",
  "ceta",
  "eu commission",
];
