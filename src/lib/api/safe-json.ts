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
