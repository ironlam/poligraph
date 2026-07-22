export const EXPLAINED_TITLE_SIMILARITY_THRESHOLD = 0.8;

const KEY_VOTE_BOOST = 50;
const HIGH_CONFIDENCE_BOOST = 15;
const RECENCY_MAX = 30; // points at day 0
const RECENCY_HALFLIFE_DAYS = 120;

export interface ExplainedCandidate {
  id: string;
  policyTitle: string;
  votingDate: Date;
  dossierLegislatifId: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  importance: { score: number; isKeyVote: boolean } | null;
}

export function scoreExplainedVote(c: ExplainedCandidate, now: Date): number {
  const base = c.importance?.score ?? 0;
  const keyBoost = c.importance?.isKeyVote ? KEY_VOTE_BOOST : 0;
  const confBoost = c.confidence === "HIGH" ? HIGH_CONFIDENCE_BOOST : 0;
  const ageDays = Math.max(0, (now.getTime() - c.votingDate.getTime()) / 86_400_000);
  const recency = RECENCY_MAX * Math.pow(0.5, ageDays / RECENCY_HALFLIFE_DAYS);
  return base + keyBoost + confBoost + recency;
}

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / new Set([...ta, ...tb]).size; // Jaccard
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export function isNearDuplicate(a: ExplainedCandidate, b: ExplainedCandidate): boolean {
  if (!a.dossierLegislatifId || !b.dossierLegislatifId) return false;
  if (a.dossierLegislatifId !== b.dossierLegislatifId) return false;
  if (!isSameCalendarDay(a.votingDate, b.votingDate)) return false;
  return (
    titleSimilarity(normalizeTitle(a.policyTitle), normalizeTitle(b.policyTitle)) >=
    EXPLAINED_TITLE_SIMILARITY_THRESHOLD
  );
}

export function diversify<T extends ExplainedCandidate>(
  sorted: T[],
  opts: { count: number; maxPerDossier: number; excludeScrutinIds?: string[] }
): T[] {
  const excluded = new Set(opts.excludeScrutinIds ?? []);
  const perDossier = new Map<string, number>();
  const picked: T[] = [];
  for (const c of sorted) {
    if (picked.length >= opts.count) break;
    if (excluded.has(c.id)) continue;
    if (c.dossierLegislatifId) {
      const n = perDossier.get(c.dossierLegislatifId) ?? 0;
      if (n >= opts.maxPerDossier) continue;
    }
    if (picked.some((p) => isNearDuplicate(p, c))) continue;
    picked.push(c);
    if (c.dossierLegislatifId)
      perDossier.set(c.dossierLegislatifId, (perDossier.get(c.dossierLegislatifId) ?? 0) + 1);
  }
  return picked;
}
