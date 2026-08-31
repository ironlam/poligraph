import { parseCLIOptions } from "@/lib/cli/parse-options";

export type ReaderGuideFinalizationOptions = {
  electionSlug: string;
  limit?: number;
  after?: string;
  all: boolean;
  apply: boolean;
  dryRun: boolean;
  confirmReviewed: boolean;
};

export function parseReaderGuideFinalizationOptions(
  args: string[]
): ReaderGuideFinalizationOptions {
  const parsed = parseCLIOptions(args, [
    { name: "--election", type: "string" },
    { name: "--limit", type: "number" },
    { name: "--after", type: "string" },
    { name: "--all", type: "boolean" },
    { name: "--dry-run", type: "boolean" },
    { name: "--apply", type: "boolean" },
    { name: "--confirm-reviewed", type: "boolean" },
  ]);
  const apply = parsed.apply === true;
  const dryRun = parsed.dryRun === true;
  const all = parsed.all === true;
  const confirmReviewed = parsed.confirmReviewed === true;
  if (apply === dryRun) throw new Error("Choisir exactement une option parmi --dry-run et --apply");
  if (all && parsed.limit !== undefined) {
    throw new Error("--all et --limit ne peuvent pas être utilisés ensemble");
  }
  if (!all && parsed.limit === undefined) {
    throw new Error("Choisir --all ou fournir --limit");
  }
  if (apply && !confirmReviewed) {
    throw new Error("--apply exige --confirm-reviewed après la lecture humaine du lot");
  }
  if (dryRun && confirmReviewed) {
    throw new Error("--confirm-reviewed est réservé au mode --apply");
  }
  const limit = parsed.limit;
  if (
    limit !== undefined &&
    (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 10_000)
  ) {
    throw new Error("--limit doit être un entier compris entre 1 et 10000");
  }
  return {
    electionSlug: typeof parsed.election === "string" ? parsed.election : "presidentielle-2027",
    ...(typeof limit === "number" ? { limit } : {}),
    ...(typeof parsed.after === "string" ? { after: parsed.after } : {}),
    all,
    apply,
    dryRun,
    confirmReviewed,
  };
}
