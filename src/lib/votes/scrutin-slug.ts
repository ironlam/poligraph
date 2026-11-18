import { generateDateSlug } from "@/lib/utils";

const MAX_LENGTH = 80;

/**
 * Base slug for a newly imported scrutin: date, official number, then the title
 * cut at a word boundary. The number keeps two same-day scrutins with near-identical
 * titles apart, so the uniqueness counter is a last resort. Existing slugs are
 * never rewritten.
 */
export function buildScrutinSlugBase(args: {
  chamber: "AN" | "SENAT";
  date: Date;
  number: string | null;
  title: string;
}): string {
  const prefix = args.chamber === "SENAT" ? "senat-" : "";
  const label = args.number ? `scrutin ${args.number} ${args.title}` : args.title;
  return prefix + generateDateSlug(args.date, label, MAX_LENGTH - prefix.length);
}
