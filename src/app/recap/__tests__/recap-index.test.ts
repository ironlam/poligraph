import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`PERMANENT ${url}`);
  }),
}));
vi.mock("next/navigation", () => nav);
vi.mock("@/lib/data/recap", () => ({
  getWeekStart: (date: Date) => date,
  getISOWeekString: () => "2026-W40",
}));

import RecapIndexPage from "../page";
import { metadata as bienvenueMetadata } from "../bienvenue/layout";

describe("/recap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirige l'ancien ?week= de façon permanente vers l'archive", async () => {
    await expect(
      RecapIndexPage({ searchParams: Promise.resolve({ week: "2026-09-28" }) })
    ).rejects.toThrow("PERMANENT /recap/2026-W40");
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("garde une redirection temporaire vers la dernière semaine, qui change chaque lundi", async () => {
    await expect(RecapIndexPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT /recap/2026-W40"
    );
    expect(nav.permanentRedirect).not.toHaveBeenCalled();
  });

  it("retombe sur la dernière semaine quand ?week= est illisible", async () => {
    await expect(
      RecapIndexPage({ searchParams: Promise.resolve({ week: "pas-une-date" }) })
    ).rejects.toThrow("REDIRECT /recap/2026-W40");
  });
});

describe("/recap/bienvenue", () => {
  it("reste hors de l'index : une confirmation d'inscription n'est pas un contenu", () => {
    expect(bienvenueMetadata.robots).toEqual({ index: false, follow: true });
  });
});
