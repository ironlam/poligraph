import { describe, it, expect, vi } from "vitest";

// The ISO-week parsing is pure: generateMetadata touches no database.
vi.mock("@/lib/db", () => ({ db: {} }));

import { generateMetadata } from "@/app/recap/[week]/page";

const metadataFor = (week: string) => generateMetadata({ params: Promise.resolve({ week }) });

describe("/recap/[week] metadata", () => {
  it("noindex une semaine illisible au lieu de l'offrir à l'indexation", async () => {
    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Recap introuvable");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("noindex une semaine future, que la page renvoie en notFound", async () => {
    const m = await metadataFor("2099-W01");

    expect(m.title).toBe("Recap introuvable");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'une semaine passée", async () => {
    const m = await metadataFor("2026-W10");

    expect(m.title).toContain("Semaine 10");
    expect(m.alternates?.canonical).toBe("/recap/2026-W10");
    expect(m.robots).toBeUndefined();
  });
});
