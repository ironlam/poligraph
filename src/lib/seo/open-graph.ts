import type { Metadata } from "next";

type OpenGraph = NonNullable<Metadata["openGraph"]>;
type OpenGraphImages = NonNullable<OpenGraph["images"]>;
/** `Omit` on a union keeps only the shared keys: distribute it so `type: "article"` still types. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * The fields every page of the site shares.
 *
 * Next merges metadata shallowly: a page that sets `openGraph` replaces the layout's block as a
 * whole, so `og:type`, `og:site_name` and `og:locale` vanished from every page that only meant to
 * set a title. Title and description are left out on purpose: Next fills them from the page's own
 * `title` and `description` when the block has none, whereas a value set here was inherited
 * verbatim and every page without its own block was shared as "Poligraph".
 *
 * `url: "./"` is resolved against the pathname of the page being rendered, not against the segment
 * that declares it. A literal site URL here made every inheriting page claim the home page as its
 * `og:url`.
 */
export const OPEN_GRAPH_BASE = {
  type: "website",
  siteName: "Poligraph",
  locale: "fr_FR",
  url: "./",
} as const;

/** Mirrors `src/app/opengraph-image.tsx` (a test holds them together). */
export const SITE_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Poligraph - Observatoire citoyen de la vie politique",
} as const;

/**
 * For a page whose own folder holds an `opengraph-image.tsx`. Next attaches that file only when
 * the page's block has no `images` key at all, so the key is left out rather than set.
 */
export const SEGMENT_IMAGE_FILE = Symbol("segment-image-file");

type OpenGraphOverrides = DistributiveOmit<OpenGraph, "images"> & {
  images?: OpenGraphImages | typeof SEGMENT_IMAGE_FILE;
};

/**
 * The `openGraph` block of a page: the shared base, then the page's own fields.
 *
 * A page that sets `openGraph` also loses the image file of its parent segments, hence the site
 * image by default. Pass `SEGMENT_IMAGE_FILE` when the page has its own image file next to it.
 */
export function openGraph({ images, ...fields }: OpenGraphOverrides = {}): OpenGraph {
  const block = { ...OPEN_GRAPH_BASE, ...fields } as OpenGraph;
  if (images === SEGMENT_IMAGE_FILE) return block;
  return { ...block, images: images ?? [SITE_OG_IMAGE] };
}
