// Catalogue des 48 gouvernements de la Ve République (Debré à Lecornu II), dans l'ordre chronologique.
// Aucune date ici : elles viennent des fonctions (DERIVED) puis des actes saisis à la main.
// `legacyNames` liste les libellés exacts de MandateGovernment.governmentName en production
// (audit du 2026-10-09), y compris « Edouard » sans accent. Égalité exacte après trim.

export type CatalogEntry = {
  slug: string;
  name: string;
  sequence: number;
  legacyNames: readonly string[];
};

// Libellé fusionné Lecornu I et II : la scission est manuelle, jamais automatique.
export const LECORNU_MERGED_LEGACY_NAME = "Gouvernement Sébastien Lecornu";

export const GOVERNMENT_CATALOG: readonly CatalogEntry[] = [
  {
    slug: "debre",
    name: "Gouvernement Michel Debré",
    sequence: 1,
    legacyNames: ["Gouvernement Michel Debré"],
  },
  {
    slug: "pompidou-1",
    name: "Gouvernement Georges Pompidou I",
    sequence: 2,
    legacyNames: ["Gouvernement Georges Pompidou n°1"],
  },
  {
    slug: "pompidou-2",
    name: "Gouvernement Georges Pompidou II",
    sequence: 3,
    legacyNames: ["Gouvernement Georges Pompidou n°2"],
  },
  {
    slug: "pompidou-3",
    name: "Gouvernement Georges Pompidou III",
    sequence: 4,
    legacyNames: ["Gouvernement Georges Pompidou n°3"],
  },
  {
    slug: "pompidou-4",
    name: "Gouvernement Georges Pompidou IV",
    sequence: 5,
    legacyNames: ["Gouvernement Georges Pompidou n°4"],
  },
  {
    slug: "couve-de-murville",
    name: "Gouvernement Maurice Couve de Murville",
    sequence: 6,
    legacyNames: ["Gouvernement Maurice Couve de Murville"],
  },
  {
    slug: "chaban-delmas",
    name: "Gouvernement Jacques Chaban-Delmas",
    sequence: 7,
    legacyNames: ["Gouvernement Jacques Chaban-Delmas"],
  },
  {
    slug: "messmer-1",
    name: "Gouvernement Pierre Messmer I",
    sequence: 8,
    legacyNames: ["Gouvernement Pierre Messmer n°1"],
  },
  {
    slug: "messmer-2",
    name: "Gouvernement Pierre Messmer II",
    sequence: 9,
    legacyNames: ["Gouvernement Pierre Messmer n°2"],
  },
  {
    slug: "messmer-3",
    name: "Gouvernement Pierre Messmer III",
    sequence: 10,
    legacyNames: ["Gouvernement Pierre Messmer n°3"],
  },
  {
    slug: "chirac-1",
    name: "Gouvernement Jacques Chirac I",
    sequence: 11,
    legacyNames: ["Gouvernement Jacques Chirac n°1"],
  },
  {
    slug: "barre-1",
    name: "Gouvernement Raymond Barre I",
    sequence: 12,
    legacyNames: ["Gouvernement Raymond Barre n°1"],
  },
  {
    slug: "barre-2",
    name: "Gouvernement Raymond Barre II",
    sequence: 13,
    legacyNames: ["Gouvernement Raymond Barre n°2"],
  },
  {
    slug: "barre-3",
    name: "Gouvernement Raymond Barre III",
    sequence: 14,
    legacyNames: ["Gouvernement Raymond Barre n°3"],
  },
  {
    slug: "mauroy-1",
    name: "Gouvernement Pierre Mauroy I",
    sequence: 15,
    legacyNames: ["Gouvernement Pierre Mauroy n°1"],
  },
  {
    slug: "mauroy-2",
    name: "Gouvernement Pierre Mauroy II",
    sequence: 16,
    legacyNames: ["Gouvernement Pierre Mauroy n°2"],
  },
  {
    slug: "mauroy-3",
    name: "Gouvernement Pierre Mauroy III",
    sequence: 17,
    legacyNames: ["Gouvernement Pierre Mauroy n°3"],
  },
  {
    slug: "fabius",
    name: "Gouvernement Laurent Fabius",
    sequence: 18,
    legacyNames: ["Gouvernement Laurent Fabius"],
  },
  {
    slug: "chirac-2",
    name: "Gouvernement Jacques Chirac II",
    sequence: 19,
    legacyNames: ["Gouvernement Jacques Chirac n°2"],
  },
  {
    slug: "rocard-1",
    name: "Gouvernement Michel Rocard I",
    sequence: 20,
    legacyNames: ["Gouvernement Michel Rocard n°1"],
  },
  {
    slug: "rocard-2",
    name: "Gouvernement Michel Rocard II",
    sequence: 21,
    legacyNames: ["Gouvernement Michel Rocard n°2"],
  },
  {
    slug: "cresson",
    name: "Gouvernement Édith Cresson",
    sequence: 22,
    legacyNames: ["Gouvernement Édith Cresson"],
  },
  {
    slug: "beregovoy",
    name: "Gouvernement Pierre Bérégovoy",
    sequence: 23,
    legacyNames: ["Gouvernement Pierre Bérégovoy"],
  },
  {
    slug: "balladur",
    name: "Gouvernement Édouard Balladur",
    sequence: 24,
    legacyNames: ["Gouvernement Édouard Balladur"],
  },
  {
    slug: "juppe-1",
    name: "Gouvernement Alain Juppé I",
    sequence: 25,
    legacyNames: ["Gouvernement Alain Juppé n°1"],
  },
  {
    slug: "juppe-2",
    name: "Gouvernement Alain Juppé II",
    sequence: 26,
    legacyNames: ["Gouvernement Alain Juppé n°2"],
  },
  {
    slug: "jospin",
    name: "Gouvernement Lionel Jospin",
    sequence: 27,
    legacyNames: ["Gouvernement Lionel Jospin"],
  },
  {
    slug: "raffarin-1",
    name: "Gouvernement Jean-Pierre Raffarin I",
    sequence: 28,
    legacyNames: ["Gouvernement Jean-Pierre Raffarin n°1"],
  },
  {
    slug: "raffarin-2",
    name: "Gouvernement Jean-Pierre Raffarin II",
    sequence: 29,
    legacyNames: ["Gouvernement Jean-Pierre Raffarin n°2"],
  },
  {
    slug: "raffarin-3",
    name: "Gouvernement Jean-Pierre Raffarin III",
    sequence: 30,
    legacyNames: ["Gouvernement Jean-Pierre Raffarin n°3"],
  },
  {
    slug: "villepin",
    name: "Gouvernement Dominique de Villepin",
    sequence: 31,
    legacyNames: ["Gouvernement Dominique de Villepin"],
  },
  {
    slug: "fillon-1",
    name: "Gouvernement François Fillon I",
    sequence: 32,
    legacyNames: ["Gouvernement François Fillon n°1"],
  },
  {
    slug: "fillon-2",
    name: "Gouvernement François Fillon II",
    sequence: 33,
    legacyNames: ["Gouvernement François Fillon n°2"],
  },
  {
    slug: "fillon-3",
    name: "Gouvernement François Fillon III",
    sequence: 34,
    legacyNames: ["Gouvernement François Fillon n°3"],
  },
  {
    slug: "ayrault-1",
    name: "Gouvernement Jean-Marc Ayrault I",
    sequence: 35,
    legacyNames: ["Gouvernement Jean-Marc Ayrault n°1"],
  },
  {
    slug: "ayrault-2",
    name: "Gouvernement Jean-Marc Ayrault II",
    sequence: 36,
    legacyNames: ["Gouvernement Jean-Marc Ayrault n°2"],
  },
  {
    slug: "valls-1",
    name: "Gouvernement Manuel Valls I",
    sequence: 37,
    legacyNames: ["Gouvernement Manuel Valls", "Gouvernement Manuel Valls n°1"],
  },
  {
    slug: "valls-2",
    name: "Gouvernement Manuel Valls II",
    sequence: 38,
    legacyNames: ["Gouvernement Manuel Valls n°2"],
  },
  {
    slug: "cazeneuve",
    name: "Gouvernement Bernard Cazeneuve",
    sequence: 39,
    legacyNames: ["Gouvernement Bernard Cazeneuve"],
  },
  {
    slug: "philippe-1",
    name: "Gouvernement Édouard Philippe I",
    sequence: 40,
    legacyNames: ["Gouvernement Edouard Philippe n°1"],
  },
  {
    slug: "philippe-2",
    name: "Gouvernement Édouard Philippe II",
    sequence: 41,
    legacyNames: ["Gouvernement Edouard Philippe n°2"],
  },
  {
    slug: "castex",
    name: "Gouvernement Jean Castex",
    sequence: 42,
    legacyNames: ["Gouvernement Jean Castex"],
  },
  {
    slug: "borne",
    name: "Gouvernement Élisabeth Borne",
    sequence: 43,
    legacyNames: ["Gouvernement Élisabeth Borne"],
  },
  {
    slug: "attal",
    name: "Gouvernement Gabriel Attal",
    sequence: 44,
    legacyNames: ["Gouvernement Gabriel Attal"],
  },
  {
    slug: "barnier",
    name: "Gouvernement Michel Barnier",
    sequence: 45,
    legacyNames: ["Gouvernement Michel Barnier"],
  },
  {
    slug: "bayrou",
    name: "Gouvernement François Bayrou",
    sequence: 46,
    legacyNames: ["Gouvernement François Bayrou"],
  },
  {
    slug: "lecornu-1",
    name: "Gouvernement Sébastien Lecornu I",
    sequence: 47,
    legacyNames: [],
  },
  {
    slug: "lecornu-2",
    name: "Gouvernement Sébastien Lecornu II",
    sequence: 48,
    legacyNames: [],
  },
];

const SLUG_BY_LEGACY_NAME = new Map<string, string>(
  GOVERNMENT_CATALOG.flatMap((entry) =>
    entry.legacyNames.map((name) => [name, entry.slug] as const)
  )
);

/** Slug du gouvernement pour un libellé legacy, ou null. Aucune normalisation floue. */
export function governmentSlugForLegacyName(name: string): string | null {
  return SLUG_BY_LEGACY_NAME.get(name.trim()) ?? null;
}
