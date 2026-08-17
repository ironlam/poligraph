export type SafeJsonParseResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; data?: never };

/**
 * Parse untrusted JSON without allowing SyntaxError to escape the trust boundary.
 * Public API routes use this helper instead of direct JSON.parse so CI can enforce
 * one structural rule rather than guessing whether a nearby `try` protects a parse.
 */
export function safeJsonParse<T = unknown>(raw: string): SafeJsonParseResult<T> {
  try {
    return { success: true, data: JSON.parse(raw) as T };
  } catch {
    return { success: false };
  }
}

/**
 * Parse internal JSON through the same canonical boundary while preserving the throwing contract
 * expected by import files, checkpoints, and AI response parsers.
 */
export function safeJsonParseOrThrow<T = unknown>(raw: string): T {
  const result = safeJsonParse<T>(raw);
  if (!result.success) throw new SyntaxError("Invalid JSON");
  return result.data;
}
