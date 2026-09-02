import { parseCLIOptions } from "@/lib/cli/parse-options";

export type MeasureSubtopicClassificationOptions = {
  electionSlug: string;
  candidateSlug?: string;
  limit: number;
  dryRun: boolean;
  force: boolean;
};

const OPTION_DEFINITIONS = [
  { name: "--election", type: "string" },
  { name: "--candidate", type: "string" },
  { name: "--limit", type: "number" },
  { name: "--dry-run", type: "boolean" },
  { name: "--force", type: "boolean" },
] as const;

export function parseMeasureSubtopicClassificationOptions(
  args: string[]
): MeasureSubtopicClassificationOptions {
  const parsed = parseCLIOptions(args, OPTION_DEFINITIONS);
  const limit = parsed.limit ?? 50;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("--limit doit être un entier compris entre 1 et 500");
  }

  return {
    electionSlug: typeof parsed.election === "string" ? parsed.election : "presidentielle-2027",
    ...(typeof parsed.candidate === "string" ? { candidateSlug: parsed.candidate } : {}),
    limit,
    dryRun: parsed.dryRun === true,
    force: parsed.force === true,
  };
}
