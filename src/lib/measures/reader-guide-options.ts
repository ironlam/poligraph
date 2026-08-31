import { parseCLIOptions } from "@/lib/cli/parse-options";

export type ReaderGuideDetectionOptions = {
  electionSlug: string;
  limit: number;
  after?: string;
  apply: boolean;
  dryRun: boolean;
};

export function parseReaderGuideDetectionOptions(args: string[]): ReaderGuideDetectionOptions {
  const parsed = parseCLIOptions(args, [
    { name: "--election", type: "string" },
    { name: "--limit", type: "number" },
    { name: "--after", type: "string" },
    { name: "--dry-run", type: "boolean" },
    { name: "--apply", type: "boolean" },
  ]);
  const apply = parsed.apply === true;
  const dryRun = parsed.dryRun === true;
  if (apply === dryRun) throw new Error("Choisir exactement une option parmi --dry-run et --apply");
  const limit = parsed.limit ?? 50;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("--limit doit être un entier compris entre 1 et 500");
  }
  return {
    electionSlug: typeof parsed.election === "string" ? parsed.election : "presidentielle-2027",
    limit,
    ...(typeof parsed.after === "string" ? { after: parsed.after } : {}),
    apply,
    dryRun,
  };
}
