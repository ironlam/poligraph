import { parseCLIOptions } from "@/lib/cli/parse-options";
import { MEASURE_CONTEXT_PROMPT_VERSION } from "./context-provenance";

export type MeasureContextRegenerationScope = "drafts" | "published" | "all";

export type MeasureContextRegenerationOptions = {
  all: boolean;
  apply: boolean;
  dryRun: boolean;
  electionSlug: string;
  fromPromptVersion: string;
  limit: number;
  scope: MeasureContextRegenerationScope;
};

const OPTION_DEFINITIONS = [
  { name: "--from-prompt", type: "string" },
  { name: "--election", type: "string" },
  { name: "--scope", type: "string" },
  { name: "--limit", type: "number" },
  { name: "--all", type: "boolean" },
  { name: "--dry-run", type: "boolean" },
  { name: "--apply", type: "boolean" },
] as const;

export function parseMeasureContextRegenerationOptions(
  args: string[]
): MeasureContextRegenerationOptions {
  const parsed = parseCLIOptions(args, OPTION_DEFINITIONS);
  const fromPromptVersion = typeof parsed.fromPrompt === "string" ? parsed.fromPrompt.trim() : "";
  if (!fromPromptVersion) throw new Error("--from-prompt est obligatoire");
  if (fromPromptVersion === MEASURE_CONTEXT_PROMPT_VERSION) {
    throw new Error("--from-prompt doit désigner une version antérieure à la version courante");
  }

  const all = parsed.all === true;
  if (all && parsed.limit !== undefined) {
    throw new Error("--all et --limit ne peuvent pas être utilisés simultanément");
  }

  const limit = parsed.limit ?? 30;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("--limit doit être un entier compris entre 1 et 100");
  }

  const scope = parsed.scope ?? "all";
  if (scope !== "drafts" && scope !== "published" && scope !== "all") {
    throw new Error("--scope doit valoir drafts, published ou all");
  }

  const apply = parsed.apply === true;
  const explicitDryRun = parsed.dryRun === true;
  if (apply && explicitDryRun) {
    throw new Error("--dry-run et --apply ne peuvent pas être utilisés simultanément");
  }

  return {
    all,
    apply,
    dryRun: !apply,
    electionSlug: typeof parsed.election === "string" ? parsed.election : "presidentielle-2027",
    fromPromptVersion,
    limit,
    scope,
  };
}
