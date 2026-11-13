import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The week helpers are the real ones, so the Location header is checked end to end. Their module
// also holds the recap queries, and the database client is built on import.
vi.mock("@/lib/db", () => ({ db: {} }));

import { GET } from "../route";
import { metadata as bienvenueMetadata } from "../bienvenue/layout";

const get = (url: string) => GET(new NextRequest(url));

describe("GET /recap", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("répond 308 à l'ancien ?week=, vers la semaine ISO de cette date", () => {
    // Wednesday 30 September 2026 belongs to ISO week 40.
    const response = get("https://poligraph.fr/recap?week=2026-09-30");

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://poligraph.fr/recap/2026-W40");
  });

  it("répond 307 par défaut, vers la dernière semaine terminée", () => {
    // Thursday 12 November 2026 is in week 46: the last completed week is 45.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));

    const response = get("https://poligraph.fr/recap");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://poligraph.fr/recap/2026-W45");
  });

  it("répond 307 vers la dernière semaine quand ?week= est illisible", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));

    const response = get("https://poligraph.fr/recap?week=pas-une-date");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://poligraph.fr/recap/2026-W45");
  });
});

describe("/recap/bienvenue", () => {
  it("reste hors de l'index : une confirmation d'inscription n'est pas un contenu", () => {
    expect(bienvenueMetadata.robots).toEqual({ index: false, follow: true });
  });
});
