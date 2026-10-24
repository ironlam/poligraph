import type { Prisma } from "@/generated/prisma";

/**
 * `Scrutin.votingDate` ne porte que le jour (minuit UTC) : tous les scrutins d'une même séance
 * sont à égalité. `sequence` est le numéro final de l'externalId (VTANR5L17V9097 → 9097,
 * SENAT-2024-330 → 330), qui croît dans l'ordre chronologique du scrutin.
 */
export function scrutinSequence(externalId: string): number {
  const digits = /(\d+)$/.exec(externalId)?.[1];
  return digits ? parseInt(digits, 10) : 0;
}

/** Du plus récent au plus ancien, y compris au sein d'une même journée. */
export const SCRUTIN_RECENT_FIRST: Prisma.ScrutinOrderByWithRelationInput[] = [
  { votingDate: "desc" },
  { sequence: "desc" },
];

/** Même ordre pour les lignes `Vote`, qui recopient `votingDate` mais pas `sequence`. */
export const VOTE_RECENT_FIRST: Prisma.VoteOrderByWithRelationInput[] = [
  { votingDate: "desc" },
  { scrutin: { sequence: "desc" } },
];

interface Chronological {
  votingDate: Date | string;
  sequence: number;
}

/** Équivalent en mémoire de SCRUTIN_RECENT_FIRST, pour trier des lignes déjà chargées. */
export function compareScrutinsRecentFirst(a: Chronological, b: Chronological): number {
  const byDate = new Date(b.votingDate).getTime() - new Date(a.votingDate).getTime();
  return byDate !== 0 ? byDate : b.sequence - a.sequence;
}
