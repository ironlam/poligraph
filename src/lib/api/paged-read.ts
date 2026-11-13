/**
 * Rows read per page by `readInPages`.
 *
 * Prisma loads a nested relation with one `WHERE parentId IN (...)` holding every parent id of the
 * page, and PostgreSQL accepts at most 32 767 bind parameters per statement. Past that the whole
 * read fails with P2029, which is how the public politician export and the compare search index
 * went down once the published profiles outgrew that number. The page size leaves a wide margin.
 */
export const READ_PAGE_SIZE = 5000;

/**
 * Read a long list page by page, so that no single query carries more parent ids than a statement
 * can bind. `readPage` must apply `skip` and `take` under a total order (end the `orderBy` on a
 * unique column), or rows may repeat or go missing across pages.
 */
export async function readInPages<T>(
  readPage: (page: { skip: number; take: number }) => Promise<T[]>,
  limit: number = Number.POSITIVE_INFINITY
): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < limit) {
    const take = Math.min(READ_PAGE_SIZE, limit - rows.length);
    const page = await readPage({ skip: rows.length, take });
    for (const row of page) rows.push(row);
    if (page.length < take) break;
  }
  return rows;
}
