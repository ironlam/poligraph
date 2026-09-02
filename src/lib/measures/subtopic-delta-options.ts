import { parseCLIOptions } from "@/lib/cli/parse-options";

type SharedOptions = {
  electionSlug?: string;
  subtopicSlug?: string;
  limit?: number;
  after?: string;
};

export type SubtopicDeltaCLIOptions =
  | (SharedOptions & { mode: "dry-run"; electionSlug: string; subtopicSlug: string; limit: number })
  | (SharedOptions & { mode: "apply"; reportPath: string });

const OPTION_DEFINITIONS = [
  { name: "--subtopic", type: "string" },
  { name: "--election", type: "string" },
  { name: "--limit", type: "number" },
  { name: "--after", type: "string" },
  { name: "--report", type: "string" },
  { name: "--dry-run", type: "boolean" },
  { name: "--apply", type: "boolean" },
] as const;

export function parseSubtopicDeltaCLIOptions(args: string[]): SubtopicDeltaCLIOptions {
  const parsed = parseCLIOptions(args, OPTION_DEFINITIONS);
  const dryRun = parsed.dryRun === true;
  const apply = parsed.apply === true;
  if (dryRun === apply) {
    throw new Error("Choisir exactement un mode parmi --dry-run et --apply");
  }

  const limit = parsed.limit ?? 500;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("--limit doit être un entier compris entre 1 et 500");
  }
  const shared: SharedOptions = {
    ...(typeof parsed.election === "string" ? { electionSlug: parsed.election } : {}),
    ...(typeof parsed.subtopic === "string" ? { subtopicSlug: parsed.subtopic } : {}),
    ...(typeof parsed.limit === "number" ? { limit } : {}),
    ...(typeof parsed.after === "string" ? { after: parsed.after } : {}),
  };

  if (dryRun) {
    if (typeof parsed.subtopic !== "string") throw new Error("--subtopic est requis en dry-run");
    if (parsed.report !== undefined) throw new Error("--report est réservé au mode --apply");
    return {
      ...shared,
      mode: "dry-run",
      subtopicSlug: parsed.subtopic,
      electionSlug: typeof parsed.election === "string" ? parsed.election : "presidentielle-2027",
      limit,
    };
  }

  if (typeof parsed.report !== "string") throw new Error("--report est requis avec --apply");
  return { ...shared, mode: "apply", reportPath: parsed.report };
}
