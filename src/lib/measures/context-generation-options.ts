import { parseCLIOptions } from "@/lib/cli/parse-options";

export type MeasureContextGenerationOptions = {
  all: boolean;
  apply: boolean;
  electionSlug: string;
  limit: number;
};

const OPTION_DEFINITIONS = [
  { name: "--election", type: "string" },
  { name: "--limit", type: "number" },
  { name: "--all", type: "boolean" },
  { name: "--apply", type: "boolean" },
] as const;

export function parseMeasureContextGenerationOptions(
  args: string[]
): MeasureContextGenerationOptions {
  const parsed = parseCLIOptions(args, OPTION_DEFINITIONS);
  const all = parsed.all === true;
  if (all && parsed.limit !== undefined) {
    throw new Error("--all et --limit ne peuvent pas être utilisés simultanément");
  }

  const limit = parsed.limit ?? 30;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("--limit doit être un entier compris entre 1 et 100");
  }

  return {
    all,
    apply: parsed.apply === true,
    electionSlug: typeof parsed.election === "string" ? parsed.election : "presidentielle-2027",
    limit,
  };
}
