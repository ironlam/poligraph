import { ADMIN_COOKIE_NAME } from "@/lib/auth-token";

/** Le mot de passe admin ne part que vers ces hôtes, jamais vers une URL passée en argument. */
const ALLOWED_HOSTS = new Set(["poligraph.fr", "www.poligraph.fr"]);

export function assertAllowedBase(base: string): string {
  const url = new URL(base);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname) || url.port) {
    throw new Error(`Hôte non autorisé pour l'envoi du mot de passe admin : ${url.host}`);
  }
  return url.origin;
}

export function extractSessionCookie(setCookies: string[]): string | null {
  for (const line of setCookies) {
    const pair = line.split(";")[0]?.trim() ?? "";
    if (pair.startsWith(`${ADMIN_COOKIE_NAME}=`) && pair.length > ADMIN_COOKIE_NAME.length + 1) {
      return pair;
    }
  }
  return null;
}

export interface RevalidateResult {
  revalidated: string[];
  skipped: Array<{ id: string; reason: string }>;
  scope?: string;
}

/**
 * Ouvre une vraie session par la route de connexion, puis revalide la page de chaque scrutin
 * (scope "page"). Le mot de passe et le cookie ne sont jamais écrits dans la sortie.
 */
export async function revalidateVotePagesAsAdmin(
  base: string,
  password: string,
  scrutinIds: string[]
): Promise<RevalidateResult> {
  const origin = assertAllowedBase(base);
  const login = await fetch(`${origin}/api/admin/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
    redirect: "manual",
  });
  if (!login.ok) throw new Error(`Connexion admin refusée (HTTP ${login.status})`);
  const cookie = extractSessionCookie(login.headers.getSetCookie());
  if (!cookie) throw new Error("Connexion admin sans cookie de session");

  const res = await fetch(`${origin}/api/admin/votes/revalidate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ scrutinIds, scope: "page" }),
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`Revalidation refusée (HTTP ${res.status})`);
  return (await res.json()) as RevalidateResult;
}
