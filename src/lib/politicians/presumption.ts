// Builds a presumption-of-innocence note strictly from counts, localized to
// the concerned facts. Never asserts a global absence of conviction (the
// person may have a definitive conviction on another affair).
export function buildPresumptionNote(input: {
  proceduresEnCours: number;
  condamnationsNonDefinitives: number;
}): string | null {
  const { proceduresEnCours: n, condamnationsNonDefinitives: m } = input;
  if (n <= 0 && m <= 0) return null;

  const parts: string[] = [];
  if (n > 0) parts.push(`${n} procédure${n > 1 ? "s" : ""} en cours`);
  if (m > 0) parts.push(`${m} condamnation${m > 1 ? "s" : ""} non définitive${m > 1 ? "s" : ""}`);

  const total = n + m;
  const closing =
    total === 1
      ? "Cette situation ne constitue pas une condamnation définitive pour les faits concernés."
      : "Ces situations ne constituent pas des condamnations définitives pour les faits concernés.";

  return `Présomption d'innocence. Cette fiche recense ${parts.join(" et ")}. ${closing}`;
}
