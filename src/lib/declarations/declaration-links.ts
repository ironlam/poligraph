export type DeclarationInput = {
  id: string;
  type: string;
  year: number;
  hatvpUrl: string;
  pdfUrl: string | null;
};
export type DeclarationLink = {
  id: string;
  url: string;
  label: string;
  year: number;
  isMostRecentYear: boolean;
};

// Explicit, deterministic order for same-year documents (the model has no
// sub-year date). Mandate life-cycle order.
const TYPE_RANK: Record<string, number> = {
  INTERETS: 0,
  PATRIMOINE_DEBUT_MANDAT: 0,
  PATRIMOINE_MODIFICATION: 1,
  PATRIMOINE_FIN_MANDAT: 2,
};
const PATRIMOINE_LABEL: Record<string, string> = {
  PATRIMOINE_DEBUT_MANDAT: "Début mandat",
  PATRIMOINE_MODIFICATION: "Modification",
  PATRIMOINE_FIN_MANDAT: "Fin mandat",
};

function sortGroup(arr: DeclarationInput[]): DeclarationInput[] {
  return [...arr].sort(
    (a, b) => b.year - a.year || (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9)
  );
}
function maxYear(arr: DeclarationInput[]): number | null {
  return arr.length ? Math.max(...arr.map((d) => d.year)) : null;
}

export function groupDeclarationLinks(declarations: DeclarationInput[]): {
  interets: DeclarationLink[];
  patrimoine: DeclarationLink[];
} {
  const interetsRaw = declarations.filter((d) => d.type === "INTERETS");
  const patrimoineRaw = declarations.filter((d) => d.type.startsWith("PATRIMOINE_"));
  const iMax = maxYear(interetsRaw);
  const pMax = maxYear(patrimoineRaw);
  const interets = sortGroup(interetsRaw).map((d) => ({
    id: d.id,
    url: d.pdfUrl ?? d.hatvpUrl,
    label: `Intérêts ${d.year}`,
    year: d.year,
    isMostRecentYear: d.year === iMax,
  }));
  const patrimoine = sortGroup(patrimoineRaw).map((d) => ({
    id: d.id,
    url: d.pdfUrl ?? d.hatvpUrl,
    label: `${PATRIMOINE_LABEL[d.type] ?? d.type} ${d.year}`,
    year: d.year,
    isMostRecentYear: d.year === pMax,
  }));
  return { interets, patrimoine };
}
