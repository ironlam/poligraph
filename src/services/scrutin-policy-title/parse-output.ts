import { PolicyTitleOutputSchema } from "./output-schema";
import { parseMistralJSON } from "@/lib/api/mistral";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";
import type { PolicyTitleOutput } from "./types";

export type ParseResult =
  | { ok: true; data: PolicyTitleOutput }
  | { ok: false; reason: "LLM_OUTPUT_INVALID"; diagnostic: string };

function extractFirstJsonObject(raw: string): unknown | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return safeJsonParseOrThrow(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parsePolicyTitleOutput(raw: string): ParseResult {
  // 1. strict
  try {
    const direct = safeJsonParseOrThrow(raw);
    const v = PolicyTitleOutputSchema.safeParse(direct);
    if (v.success) return { ok: true, data: v.data as PolicyTitleOutput };
  } catch {
    /* fall through */
  }
  // 2. bounded repair: fence-strip (parseMistralJSON) then first-object extraction
  try {
    const fenced = parseMistralJSON<unknown>(raw);
    const v = PolicyTitleOutputSchema.safeParse(fenced);
    if (v.success) return { ok: true, data: v.data as PolicyTitleOutput };
  } catch {
    /* fall through */
  }
  const obj = extractFirstJsonObject(raw);
  if (obj) {
    const v = PolicyTitleOutputSchema.safeParse(obj);
    if (v.success) return { ok: true, data: v.data as PolicyTitleOutput };
  }
  // 3. give up — never throw, never retry the LLM here
  return { ok: false, reason: "LLM_OUTPUT_INVALID", diagnostic: raw.slice(0, 500) };
}
