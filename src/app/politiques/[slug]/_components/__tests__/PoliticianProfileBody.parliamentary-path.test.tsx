import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=carriere"),
  usePathname: () => "/politiques/alice-publique",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { PoliticianProfileBody } from "../PoliticianProfileBody";
import type { ParliamentaryPathRow } from "@/lib/politicians/parliamentary-path";

const IDENTITY = {
  id: "p1",
  slug: "alice-publique",
  fullName: "Alice Publique",
  firstName: "Alice",
  lastName: "Publique",
  civility: "Mme",
  birthDate: null,
  deathDate: null,
  mandates: [],
  declarations: [],
  externalIds: [],
  partyHistory: [],
  updatedAt: new Date("2026-01-01"),
} as never;

const ROW: ParliamentaryPathRow = {
  legislature: 16,
  period: "2022-2024",
  mandates: [],
  votes: { total: 12 },
  votesImported: true,
  datesStatus: { kind: "unverified", reason: "NO_MANDATE" },
};

function renderBody(parliamentaryPath?: ParliamentaryPathRow[]) {
  return render(
    <PoliticianProfileBody
      politician={IDENTITY}
      dossier={{ affairs: [], factCheckMentions: [], dossierAuthors: [] } as never}
      voteStats={null}
      currentParliamentaryMandate={null}
      currentGroup={null}
      isActiveParliamentarian={false}
      isChamberPresident={false}
      parliamentaryPath={parliamentaryPath}
    />
  );
}

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

describe("PoliticianProfileBody, parcours parlementaire", () => {
  it("affiche la section dans l'onglet Carrière quand un parcours est fourni", () => {
    renderBody([ROW]);

    expect(
      screen.getByRole("heading", { level: 2, name: "Parcours parlementaire" })
    ).toBeInTheDocument();
  });

  it("n'affiche rien sans parcours", () => {
    renderBody([]);

    expect(
      screen.queryByRole("heading", { name: "Parcours parlementaire" })
    ).not.toBeInTheDocument();
  });

  it("n'affiche rien quand la page ne fournit pas de parcours", () => {
    renderBody(undefined);

    expect(
      screen.queryByRole("heading", { name: "Parcours parlementaire" })
    ).not.toBeInTheDocument();
  });
});
