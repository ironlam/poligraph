/**
 * The share image of every commune page: the one of the Territoires section, built once.
 *
 * A commune used to have its own image, rendered on request. With 35,000 communes, crawlers
 * fetched them all and each fetch ran a function, for a handful of human shares a day. The title
 * and description of the link preview still name the commune.
 *
 * Declared explicitly on each page: a page that sets its own `openGraph` does not inherit the
 * image file of a parent segment. Width, height and text mirror
 * `src/app/territoires/opengraph-image.tsx` (a test holds them together).
 */
export const TERRITOIRES_OG_IMAGE = {
  url: "/territoires/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Territoires sur Poligraph : les élus et les décisions de votre territoire",
} as const;
