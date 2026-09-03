import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Same family as the public-listing incident guarded by
 * src/app/__tests__/listing-malformed-params.test.ts: a non-numeric `?page=`
 * reaches Prisma as a NaN `skip`, which it refuses.
 *
 * The db and loader mocks below refuse exactly what Prisma refuses, so a page
 * that lets NaN through fails here instead of in production. A mock that simply
 * swallowed `page: NaN` would go green on the broken code.
 */

/** Reproduces `Argument \`skip\` is missing.`: Prisma drops a NaN argument. */
function assertUsableSkip(args: unknown): void {
  const query = (args ?? {}) as { skip?: unknown; take?: unknown };
  for (const [name, value] of [
    ["skip", query.skip],
    ["take", query.take],
  ] as const) {
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new Error(`PrismaClientValidationError: Argument \`${name}\` is missing.`);
    }
  }
}

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getPromisesForModeration: vi.fn(),
  getPromiseStats: vi.fn(),
}));

/**
 * Every model answers through one proxy, so a page's local loader hits the same
 * skip assertion whatever table it reads.
 */
vi.mock("@/lib/db", () => {
  const model = {
    findMany: mocks.findMany,
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    aggregate: vi.fn().mockResolvedValue({}),
  };
  return {
    db: new Proxy({} as Record<string, unknown>, {
      get: (_target, prop) => (prop === "$queryRaw" ? vi.fn().mockResolvedValue([]) : model),
    }),
  };
});
vi.mock("@/lib/data/promises", () => ({
  getPromisesForModeration: mocks.getPromisesForModeration,
  getPromiseStats: mocks.getPromiseStats,
}));
// The auth wrapper reads cookies(), unavailable outside a request scope. Passing
// it through keeps the subject of this suite the parameter parsing.
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (handler: unknown) => handler,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn(), revalidateTag: vi.fn() }));

import AdminDossiersPage from "../dossiers/page";
import AdminFactchecksPage from "../factchecks/page";
import AdminPolitiquesPage from "../politiques/page";
import AdminPressePage from "../presse/page";
import AdminPartisPage from "../partis/page";
import AdminPromisesPage from "../promises/page";

type Params = Record<string, string>;
const render = (page: unknown, searchParams: Params) =>
  (page as (p: { searchParams: Promise<Params> }) => Promise<unknown>)({
    searchParams: Promise.resolve(searchParams),
  });

const PAGES = [
  ["dossiers", AdminDossiersPage],
  ["factchecks", AdminFactchecksPage],
  ["politiques", AdminPolitiquesPage],
  ["presse", AdminPressePage],
  ["partis", AdminPartisPage],
  ["promises", AdminPromisesPage],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockImplementation(async (args: unknown) => {
    assertUsableSkip(args);
    return [];
  });
  // The loader does `filters.page ?? 1`, which only catches null and undefined,
  // never NaN, so it must see a usable page or refuse like Prisma would.
  mocks.getPromisesForModeration.mockImplementation(
    async (filters: { page?: unknown; pageSize?: unknown }) => {
      const page = filters?.page ?? 1;
      const size = filters?.pageSize ?? 25;
      assertUsableSkip({ skip: ((page as number) - 1) * (size as number), take: size });
      return { items: [], total: 0, page: 1, pageSize: 25 };
    }
  );
  mocks.getPromiseStats.mockResolvedValue({ total: 0, byStatus: [], byTheme: [] });
});

describe("pages admin : un ?page= non numérique", () => {
  for (const [name, Page] of PAGES) {
    it(`/admin/${name} rend la page au lieu de faire lever Prisma`, async () => {
      await expect(render(Page, { page: "abc" })).resolves.toBeDefined();
    });
  }

  for (const [name, Page] of PAGES) {
    it(`/admin/${name} conserve une page valide`, async () => {
      await expect(render(Page, { page: "3" })).resolves.toBeDefined();
    });
  }

  it("écarte aussi les valeurs nulles, négatives et absurdes", async () => {
    for (const page of ["0", "-4", "1e999", "", "9007199254740993"]) {
      await expect(render(AdminDossiersPage, { page }), `page=${page}`).resolves.toBeDefined();
    }
  });
});

describe("/api/admin/promises : page et pageSize non numériques", () => {
  const call = async (query: string) => {
    const { GET } = await import("../../api/admin/promises/route");
    // withAdminAuth is stubbed to a passthrough above, so GET is the raw
    // handler and still expects the route context alongside the request.
    const handler = GET as unknown as (r: Request, ctx: unknown) => Promise<Response>;
    return handler(new Request(`https://poligraph.fr/api/admin/promises?${query}`), {
      params: Promise.resolve({}),
    });
  };

  it("un page= illisible ne fait pas lever Prisma", async () => {
    await expect(call("page=abc")).resolves.toBeDefined();
  });

  it("un pageSize= illisible ne fait pas lever Prisma non plus", async () => {
    // Math.min(NaN, 100) is NaN, so this one reaches Prisma as `take: NaN`.
    await expect(call("pageSize=abc")).resolves.toBeDefined();
  });

  it("un pageSize= negatif non plus", async () => {
    // A negative is a safe integer, so only a floor keeps `take` usable.
    await expect(call("pageSize=-5")).resolves.toBeDefined();
  });
});
