import { parseCLIOptions } from "@/lib/cli/parse-options";

export type ReaderGuideFinalizationOptions = {
  electionSlug: string;
  limit?: number;
  after?: string;
  all: boolean;
  apply: boolean;
  dryRun: boolean;
  confirmReviewed: boolean;
  report?: string;
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
    { name: "--report", type: "string" },
  ]);
  const apply = parsed.apply === true;
  const dryRun = parsed.dryRun === true;
  const all = parsed.all === true;
  const confirmReviewed = parsed.confirmReviewed === true;
  const report = typeof parsed.report === "string" ? parsed.report : undefined;
  if (apply === dryRun) throw new Error("Choisir exactement une option parmi --dry-run et --apply");
  if (all && parsed.limit !== undefined) {
    throw new Error("--all et --limit ne peuvent pas être utilisés ensemble");
  }
  if (all && parsed.after !== undefined) {
    throw new Error("--all et --after ne peuvent pas être utilisés ensemble");
  }
  if (dryRun && !all && parsed.limit === undefined) {
    throw new Error("Choisir --all ou fournir --limit");
  }
  if (apply && !confirmReviewed) {
    throw new Error("--apply exige --confirm-reviewed après la lecture humaine du lot");
  }
  if (dryRun && confirmReviewed) {
    throw new Error("--confirm-reviewed est réservé au mode --apply");
  }
  if (apply && !report) {
    throw new Error("--apply exige --report avec le rapport de dry-run relu");
  }
  if (dryRun && report) {
    throw new Error("--report est réservé au mode --apply");
  }
  if (
    apply &&
    (parsed.election !== undefined ||
      parsed.limit !== undefined ||
      parsed.after !== undefined ||
      parsed.all !== undefined)
  ) {
    throw new Error("Avec --apply, le périmètre provient uniquement de --report");
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
    ...(report ? { report } : {}),
  };
}
