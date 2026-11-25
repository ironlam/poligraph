/**
 * Class strings shared by the blocks of the Territoires reading pages (commune, department,
 * region). No directive: imported by server components and by their tests.
 *
 * One border per section: on a phone the section runs edge to edge (its page container has
 * `px-4`, hence `-mx-4`), from `md` it is a card. A block inside a section is tinted, never
 * framed a second time.
 */
export const SECTION =
  "scroll-mt-32 -mx-4 border-y bg-card px-4 py-6 md:mx-0 md:rounded-2xl md:border md:p-6";

/** Section title: the navy rule is the only colour mark a section carries. */
export const SECTION_TITRE =
  "border-l-4 border-primary pl-3 font-display text-xl font-bold text-primary md:text-2xl";

export const SOUS_BLOC = "rounded-xl bg-primary/5 p-4";

/** Link inside a sentence: link colour and a thin underline. */
export const LIEN =
  "text-link underline decoration-link/40 decoration-1 underline-offset-2 hover:decoration-link";

/** Link alone on its line (« Tous les votes »): no underline at rest, an arrow after it. */
export const LIEN_BLOC =
  "inline-flex min-h-11 items-center gap-1.5 font-semibold text-link hover:underline";
