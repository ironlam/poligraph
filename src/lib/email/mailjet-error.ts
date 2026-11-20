/**
 * What may be logged about a Mailjet failure: HTTP status and message, with
 * email addresses masked. Never log the error object itself: it carries the
 * Axios config, hence the Authorization header and the request body.
 */
export function describeMailjetError(e: unknown): string {
  const err = (e ?? {}) as { statusCode?: unknown; originalMessage?: unknown; message?: unknown };
  const status = typeof err.statusCode === "number" ? err.statusCode : "?";
  const message =
    typeof err.originalMessage === "string"
      ? err.originalMessage
      : typeof err.message === "string"
        ? err.message
        : "unknown error";
  return `status=${status} ${message.replace(/[^\s"'<>]+@[^\s"'<>]+/g, "[email]")}`;
}
