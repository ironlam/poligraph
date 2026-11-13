import { describe, expect, it, vi } from "vitest";
import { READ_PAGE_SIZE, readInPages } from "./paged-read";

/** PostgreSQL's bind-parameter ceiling per statement. */
const POSTGRES_MAX_BIND_PARAMETERS = 32_767;

/** A table of `total` numbered rows, read like a Prisma `findMany` with skip and take. */
function tableOf(total: number) {
  return vi.fn(async ({ skip, take }: { skip: number; take: number }) =>
    Array.from({ length: Math.max(0, Math.min(take, total - skip)) }, (_, i) => skip + i)
  );
}

describe("readInPages", () => {
  it("garde chaque page loin sous la limite de paramètres de PostgreSQL", () => {
    expect(READ_PAGE_SIZE).toBeLessThan(POSTGRES_MAX_BIND_PARAMETERS / 2);
  });

  it("lit 36 650 fiches sans jamais demander plus d'une page à la fois", async () => {
    // The number of published profiles when the export and the compare index failed with P2029.
    const readPage = tableOf(36_650);

    const rows = await readInPages(readPage);

    expect(rows).toHaveLength(36_650);
    expect(rows[0]).toBe(0);
    expect(rows.at(-1)).toBe(36_649);
    expect(new Set(rows).size).toBe(36_650);
    for (const [page] of readPage.mock.calls) {
      expect(page.take).toBeLessThanOrEqual(READ_PAGE_SIZE);
    }
  });

  it("s'arrête à la limite demandée, sans lire au-delà", async () => {
    const readPage = tableOf(36_650);

    const rows = await readInPages(readPage, READ_PAGE_SIZE + 10);

    expect(rows).toHaveLength(READ_PAGE_SIZE + 10);
    expect(readPage.mock.calls.map(([page]) => page)).toEqual([
      { skip: 0, take: READ_PAGE_SIZE },
      { skip: READ_PAGE_SIZE, take: 10 },
    ]);
  });

  it("ne relance pas de lecture après une page incomplète", async () => {
    const readPage = tableOf(12);

    expect(await readInPages(readPage)).toHaveLength(12);
    expect(readPage).toHaveBeenCalledTimes(1);
  });

  it("rend une liste vide sans boucler sur une table vide", async () => {
    const readPage = tableOf(0);

    expect(await readInPages(readPage)).toEqual([]);
    expect(readPage).toHaveBeenCalledTimes(1);
  });
});
