/**
 * Deterministic JSON and content hashing.
 *
 * Extracted from `services/affairs/proposals.ts` so callers that must stay free of
 * database access can hash a payload: that module imports the Prisma client at load
 * time, which would drag a `DATABASE_URL` requirement into pure mapping code.
 */

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma";

/** Deterministic JSON: keys sorted at every depth, so hashing is stable. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Prisma.Decimal.isDecimal(value)) return JSON.stringify(value.toString());
  if (typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Stable hash of a raw source payload, for sourceContentHash. */
export function hashSourceContent(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
