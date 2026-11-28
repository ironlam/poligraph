import type { CensureMotion, MotionsDeCensureData } from "@/lib/data/motions-de-censure";

/** Title, description and fixed labels of /parlement/motions-de-censure: counts and dates only. */

const ROMAN: Record<number, string> = { 15: "XVe", 16: "XVIe", 17: "XVIIe", 18: "XVIIIe" };

export function legislatureLabel(n: number): string {
  return `${ROMAN[n] ?? `${n}e`} législature`;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;
}

export function allMotions(data: MotionsDeCensureData): CensureMotion[] {
  return data.legislatures.flatMap((l) => l.motions);
}

/** Year of the oldest motion the base holds, UTC. */
export function firstYear(data: MotionsDeCensureData): number | null {
  const dates = allMotions(data).map((m) => m.votingDate.getTime());
  return dates.length ? new Date(Math.min(...dates)).getUTCFullYear() : null;
}

export function pageTitle(data: MotionsDeCensureData): string {
  const since = firstYear(data);
  const adopted = `${data.adopted.toLocaleString("fr-FR")} ${data.adopted > 1 ? "adoptées" : "adoptée"}`;
  const head = `Motions de censure : ${plural(data.total, "vote", "votes")} à l'Assemblée`;
  return since ? `${head} depuis ${since}, ${adopted}` : `${head}, ${adopted}`;
}

export function pageDescription(data: MotionsDeCensureData): string {
  return `Les ${plural(data.total, "motion de censure votée", "motions de censure votées")} à l'Assemblée nationale${firstYear(data) ? ` depuis ${firstYear(data)}` : ""} : voix pour, majorité requise, gouvernement visé et résultat, puis le détail par groupe et par député. Chiffres de l'Assemblée nationale.`;
}

export function votesForLabel(m: Pick<CensureMotion, "votesFor" | "requiredMajority">): string {
  const votes = plural(m.votesFor, "voix pour", "voix pour");
  if (m.requiredMajority == null) return votes;
  return `${votes} sur ${m.requiredMajority.toLocaleString("fr-FR")} requises`;
}

/** The AN's own wording: "l'Assemblée nationale a adopté" / "n'a pas adopté". */
export function resultLabel(adopted: boolean): string {
  return adopted ? "Adoptée" : "Non adoptée";
}

/** Deputies grouped by number of motions voted, highest count first, the data order kept within. */
export function groupDeputiesByCount<T extends { count: number }>(
  deputies: T[]
): Array<{ count: number; deputies: T[] }> {
  const groups = new Map<number, T[]>();
  for (const d of deputies) groups.set(d.count, [...(groups.get(d.count) ?? []), d]);
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([count, list]) => ({ count, deputies: list }));
}
