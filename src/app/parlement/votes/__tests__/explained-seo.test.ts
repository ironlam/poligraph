import { describe, it, expect, vi } from "vitest";

// page.tsx's default export renders <ScrutinsListing>, whose data-layer import
// chain (src/lib/data/scrutins.ts -> src/lib/db.ts) constructs a real Prisma
// client at module load, throwing when DATABASE_URL is unset. generateMetadata
// itself never touches the database, so stub db here to import the module
// safely with no DB available (e.g. in CI).
vi.mock("@/lib/db", () => ({ db: {} }));

import { generateMetadata } from "@/app/parlement/votes/page";

describe("votes page metadata — explained view", () => {
  it("bare filter=expliques is indexable with its own canonical + title", async () => {
    const m = await generateMetadata({
      searchParams: Promise.resolve({ filter: "expliques" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(m.title).toBe("Votes expliqués");
    expect(m.alternates?.canonical).toBe("/parlement/votes?filter=expliques");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((m.robots as any)?.index).not.toBe(false);
  });
  it("faceted explained view is noindex", async () => {
    const m = await generateMetadata({
      searchParams: Promise.resolve({ filter: "expliques", chamber: "AN" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((m.robots as any)?.index).toBe(false);
  });
});
