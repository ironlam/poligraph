import type { MunicipalesListe } from "@/lib/data/territoires";

/** One share of the council: a list, or the remaining lists taken together. */
export interface PartConseil {
  label: string;
  sieges: number;
  /** 0 to 2 for the three largest lists, from the darkest; "autres" for the rest. */
  ton: 0 | 1 | 2 | "autres";
}

export interface Composition {
  total: number;
  parts: PartConseil[];
}

const LISTES_NOMMEES = 3;

/**
 * Seats per list at the 2026 election, largest first; beyond three lists the rest is gathered.
 * Null when no seats are known. No party is deduced from a list: it is named as it stood, or by
 * the person who led it in a commune decided at the second round, where a list merged between
 * the rounds may be recorded under its first-round name.
 */
export function compositionConseil(listes: MunicipalesListe[]): Composition | null {
  const elues = listes.filter((l) => (l.sieges ?? 0) > 0).sort((a, b) => b.sieges! - a.sieges!);
  if (elues.length === 0) return null;

  const secondTour = listes.some((l) => l.round2Pct != null);
  const parts: PartConseil[] = elues.slice(0, LISTES_NOMMEES).map((l, i) => ({
    label: secondTour || !l.listName ? `Liste conduite par ${l.teteDeListe.name}` : l.listName,
    sieges: l.sieges!,
    ton: i as 0 | 1 | 2,
  }));
  const autres = elues.slice(LISTES_NOMMEES);
  if (autres.length > 0) {
    parts.push({
      label: autres.length === 1 ? "1 autre liste" : `${autres.length} autres listes`,
      sieges: autres.reduce((sum, l) => sum + l.sieges!, 0),
      ton: "autres",
    });
  }
  return { total: parts.reduce((sum, p) => sum + p.sieges, 0), parts };
}

export function siegesEnMots(n: number): string {
  return n === 1 ? "1 siège" : `${n} sièges`;
}
