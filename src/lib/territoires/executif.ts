/**
 * Reading of the function labels of the RNE council files. Pure. Labels seen in production on
 * 2026-11-15: "Maire", "Maire délégué", "1er adjoint au Maire", "12ème adjoint au Maire",
 * "Président du conseil départemental", "3ème Vice-président du conseil régional", "Président de
 * commission du conseil départemental". The register writes every label in the masculine.
 */

const HEAD_RANK = 0;
const OTHER_FUNCTION_RANK = 500;
const NO_FUNCTION_RANK = 1000;

/**
 * 0 for the head of the council, the number for a ranked deputy ("1er", "2ème"...), then any
 * other function, then plain members. Only "Maire" and "Président du conseil ..." are the head:
 * a commission president or a delegated mayor is another function, never the head.
 */
export function functionRank(label: string | null): number {
  if (!label) return NO_FUNCTION_RANK;
  if (/^présidente? du conseil\b/i.test(label) || /^maire$/i.test(label)) return HEAD_RANK;
  const m = label.match(/^(\d+)(?:er|ère|ème|e)\b/i);
  if (m) return Number(m[1]);
  return OTHER_FUNCTION_RANK;
}

export interface ExecutifRang {
  rang: number;
  nom: string;
}

/**
 * Ranked deputies of an executive (adjoints, vice-présidents), in rank order. The rank is the
 * only thing kept from the label: the register gives no delegation, and its masculine wording is
 * not repeated beside a name. Two members recorded with the same rank are both listed.
 */
export function rangsExecutif(
  membres: { firstName: string; lastName: string; functionLabel: string | null }[]
): ExecutifRang[] {
  return membres
    .map((m) => ({ rang: functionRank(m.functionLabel), nom: `${m.firstName} ${m.lastName}` }))
    .filter((m) => m.rang > HEAD_RANK && m.rang < OTHER_FUNCTION_RANK)
    .sort((a, b) => a.rang - b.rang || a.nom.localeCompare(b.nom, "fr"));
}
