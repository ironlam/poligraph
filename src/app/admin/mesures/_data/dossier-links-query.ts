import { db } from "@/lib/db";

const MAX_ROWS = 500;

/**
 * The reviewed measure-dossier links, for the admin view. Carries `rationale` and `reviewedBy`
 * on purpose: this is the internal view of what was recorded and by whom. `isCurrent` says whether
 * the link still applies to the revision the public sees; a reworded measure leaves it behind.
 */
export async function queryDossierLinksForModeration() {
  const rows = await db.measureDossierLink.findMany({
    orderBy: [{ dossier: { title: "asc" } }, { createdAt: "desc" }],
    take: MAX_ROWS + 1,
    select: {
      id: true,
      linkKind: true,
      measureQuote: true,
      textQuote: true,
      rationale: true,
      searchMethod: true,
      reviewedBy: true,
      checkedAt: true,
      applicableRevisionId: true,
      measure: {
        select: {
          id: true,
          publishedRevisionId: true,
          publishedRevision: { select: { text: true } },
        },
      },
      dossier: { select: { id: true, title: true, slug: true } },
    },
  });
  const capped = rows.length > MAX_ROWS;
  const links = rows.slice(0, MAX_ROWS).map((r) => ({
    id: r.id,
    linkKind: r.linkKind,
    measureQuote: r.measureQuote,
    textQuote: r.textQuote,
    rationale: r.rationale,
    searchMethod: r.searchMethod,
    reviewedBy: r.reviewedBy,
    checkedAt: r.checkedAt,
    measureId: r.measure.id,
    measureText: r.measure.publishedRevision?.text ?? null,
    isCurrent: r.measure.publishedRevisionId === r.applicableRevisionId,
    dossierId: r.dossier.id,
    dossierTitle: r.dossier.title,
    dossierSlug: r.dossier.slug,
  }));
  return { links, capped };
}

export type ModerationDossierLink = Awaited<
  ReturnType<typeof queryDossierLinksForModeration>
>["links"][number];
