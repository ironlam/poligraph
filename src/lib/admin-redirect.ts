/**
 * Where the admin login sends the browser after success. Only same-origin admin paths pass:
 * `//evil.example` and `/\evil.example` are protocol-relative in browsers and would leave the site.
 */
export function safeAdminRedirect(next: string | null | undefined): string {
  if (!next || !next.startsWith("/admin/") || next.startsWith("//") || next.includes("\\")) {
    return "/admin";
  }
  if (next.startsWith("/admin/login")) return "/admin";
  return next;
}
