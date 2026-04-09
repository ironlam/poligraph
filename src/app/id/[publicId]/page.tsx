import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { resolvePublicId } from "@/lib/public-ids";

/**
 * Stable poligraphId resolver.
 *
 * Accepts any valid poligraphId (PG-000542, AF-004217, FC-002891, etc.) and
 * 308-redirects to the canonical application URL. Research papers, Wikipedia,
 * and Wikidata can cite the identifier URL and it will keep resolving even if
 * the target slug is corrected, the entity is merged, or the taxonomy is
 * reorganised — because the poligraphId itself is immutable once assigned.
 *
 * SEO: this route is `noindex, follow`. A permanent redirect already tells
 * search engines to index only the canonical slug, but the explicit robots
 * directive is belt-and-braces against any crawler that mishandles 308s.
 */

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
    },
  },
};

export const dynamic = "force-dynamic"; // Lookup must run on every request

interface PageProps {
  params: Promise<{ publicId: string }>;
}

export default async function PublicIdResolverPage({ params }: PageProps) {
  const { publicId } = await params;
  const normalised = decodeURIComponent(publicId).trim().toUpperCase();

  const resolved = await resolvePublicId(normalised);

  if (!resolved) {
    notFound();
  }

  // 308 Permanent Redirect. Google follows the redirect and indexes only the
  // destination; link equity from external citations flows through to the
  // canonical page. This is how DOI, ORCID, and Wikidata resolvers behave.
  permanentRedirect(resolved.canonicalPath);
}
