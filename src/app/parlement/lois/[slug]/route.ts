import { getDossierAliasMatches } from "@/lib/data/dossier-aliases";
import { SITE_URL } from "@/config/site";

// A Route Handler sends a real HTTP redirect even when the parent UI streams.
// No persistent redirect cache: moderation can revoke or make an alias ambiguous.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const matches = await getDossierAliasMatches(slug);
  if (matches.length === 0)
    return new Response("Nom d’usage introuvable", {
      status: 404,
      headers: { "X-Robots-Tag": "noindex, follow", "Cache-Control": "no-store" },
    });
  const single = matches.length === 1 ? matches[0] : undefined;
  const path = single
    ? `/parlement/dossiers/${single.slug || single.id}`
    : `/parlement/lois/${encodeURIComponent(slug)}/dossiers`;
  return new Response(null, {
    status: single ? 308 : 307,
    headers: { Location: new URL(path, SITE_URL).href, "Cache-Control": "no-store" },
  });
}
