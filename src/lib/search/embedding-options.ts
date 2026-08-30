import type { SearchEntityType } from "@/generated/prisma";
import { parseCLIOptions } from "@/lib/cli/parse-options";

export type SearchEmbeddingCLIOptions = {
  electionSlug: string;
  entityType: Extract<SearchEntityType, "MEASURE" | "CANDIDACY">;
  after?: string;
  limit: number;
  batchSize: number;
  staleOnly: boolean;
  dryRun: boolean;
};

export function parseSearchEmbeddingCLIOptions(args: string[]): SearchEmbeddingCLIOptions {
  const parsed = parseCLIOptions(args, [
    { name: "--election", type: "string" },
    { name: "--entity-type", type: "string" },
    { name: "--after", type: "string" },
    { name: "--limit", type: "number" },
    { name: "--batch-size", type: "number" },
    { name: "--stale-only", type: "boolean" },
    { name: "--dry-run", type: "boolean" },
  ]);

  if (typeof parsed.election !== "string" || parsed.election.trim() === "") {
    throw new Error("--election est obligatoire pour borner l’indexation");
  }
  const rawEntityType =
    typeof parsed.entityType === "string" ? parsed.entityType.toUpperCase() : "MEASURE";
  if (rawEntityType !== "MEASURE" && rawEntityType !== "CANDIDACY") {
    throw new Error("--entity-type doit valoir MEASURE ou CANDIDACY");
  }
  const limit = typeof parsed.limit === "number" ? parsed.limit : 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
    throw new Error("--limit doit être un entier compris entre 1 et 5000");
  }
  const batchSize = typeof parsed.batchSize === "number" ? parsed.batchSize : 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("--batch-size doit être un entier compris entre 1 et 500");
  }

  return {
    electionSlug: parsed.election,
    entityType: rawEntityType,
    ...(typeof parsed.after === "string" ? { after: parsed.after } : {}),
    limit,
    batchSize,
    staleOnly: parsed.staleOnly === undefined ? true : parsed.staleOnly === true,
    dryRun: parsed.dryRun === true,
  };
}
