import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findScrutin: vi.fn(),
  getPositions: vi.fn(),
  getOfficialGroups: vi.fn(),
}));

// These cases cover the page as it stands with the dated group counts off (provenance of the
// result, order of the blocks, masking of the computed positions). The switch is pinned so they do
// not depend on the editorial decision: the switched-on page has its own file,
// historical-groups-section.test.tsx.
vi.mock("@/config/historical-positions", () => ({
  HISTORICAL_GROUP_POSITIONS_PUBLIC: false,
  HISTORICAL_POSITIONS_LEGISLATURES: [15, 16, 17],
}));
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findUnique: (...args: unknown[]) => mocks.findScrutin(...args), findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/data/groupes", () => ({
  getScrutinGroupPositions: (...args: unknown[]) => mocks.getPositions(...args),
  getScrutinAnalysis: vi.fn(async () => null),
}));
vi.mock("@/lib/data/scrutin-official-groups", () => ({
  getScrutinOfficialGroups: (...args: unknown[]) => mocks.getOfficialGroups(...args),
}));
vi.mock("@/components/ui/ShareBar", () => ({ ShareBar: () => null }));
vi.mock("@/components/votes/DailyVotesPage", () => ({ DailyVotesPage: () => null }));
vi.mock("@/components/politicians/PoliticianAvatar", () => ({ PoliticianAvatar: () => null }));
vi.mock("@/components/votes", () => ({
  VotePositionBadge: ({ position }: { position: string }) => <span>{position}</span>,
  VotingResultBadge: () => null,
}));
// Radix tabs only mount the active panel: render every panel so the individual votes are visible.
vi.mock("@/components/votes/ScrutinContext", () => ({
  ScrutinContext: ({ votesDetailSlot }: { votesDetailSlot?: ReactNode }) => (
    <div data-testid="context">{votesDetailSlot}</div>
  ),
}));

import ScrutinPage from "@/app/parlement/votes/[slug]/page";

const AN_SOURCE = "https://www.assemblee-nationale.fr/dyn/17/scrutins/12";

function scrutin(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    slug: "scrutin-test",
    externalId: "VTANR5L17V12",
    title: "l'ensemble du projet de loi",
    chamber: "AN",
    legislature: 17,
    type: "ORDINAIRE",
    theme: null,
    result: "ADOPTED",
    votingDate: new Date("2025-03-01T00:00:00Z"),
    votesFor: 3,
    votesAgainst: 2,
    votesAbstain: 1,
    sourceUrl: AN_SOURCE,
    summary: null,
    citizenImpact: null,
    policyTitle: null,
    importance: null,
    dossierLegislatif: null,
    votes: [],
    ...overrides,
  };
}

function vote(id: string, position: string, publicationStatus = "PUBLISHED") {
  return {
    id,
    position,
    politician: {
      slug: `elu-${id}`,
      publicationStatus,
      fullName: `Élu ${id}`,
      firstName: "Élu",
      lastName: id,
      photoUrl: null,
      blobPhotoUrl: null,
      currentParty: null,
      mandates: [],
    },
  };
}

const ORGANES = [
  {
    organeRef: "PO2",
    label: "Rassemblement National",
    abbreviation: "RN",
    startDate: new Date("2024-07-18T00:00:00Z"),
    endDate: null,
  },
];

function officialGroups(
  rows: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {}
) {
  return {
    snapshot: { imported: true, issues: [], rows },
    organes: ORGANES,
    fetchedAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

const GOOD_ROW = {
  organeRef: "PO2",
  memberCount: 6,
  forCount: 3,
  againstCount: 2,
  abstainCount: 1,
  nonVoterCount: 0,
  majorityPosition: "POUR",
  issues: [],
};

async function renderPage() {
  const ui = await ScrutinPage({ params: Promise.resolve({ slug: "scrutin-test" }) });
  return render(ui);
}

const text = (container: HTMLElement) => container.textContent ?? "";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPositions.mockResolvedValue([]);
  mocks.getOfficialGroups.mockResolvedValue(officialGroups([GOOD_ROW]));
});

describe("page de scrutin : provenance", () => {
  it("place le résultat officiel avant la synthèse, puis les groupes officiels avant les positions calculées", async () => {
    mocks.findScrutin.mockResolvedValue(scrutin({ votes: [vote("a", "POUR")] }));
    mocks.getPositions.mockResolvedValue([
      {
        id: "p1",
        position: "POUR",
        forCount: 3,
        againstCount: 0,
        abstainCount: 0,
        cohesionPct: 100,
        group: {
          id: "g",
          code: "RN",
          name: "Rassemblement National",
          shortName: null,
          color: null,
          slug: null,
        },
      },
    ]);

    const { container } = await renderPage();
    const html = container.innerHTML;

    const order = [
      "Résultat officiel",
      'data-testid="context"',
      "Décompte officiel par groupe",
      "Positions calculées par PoliGraph",
    ].map((marker) => html.indexOf(marker));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text(container)).toContain("Rassemblement National");
    expect(text(container)).toContain("groupe actuel de chaque député");
  });

  it("distingue les décomptes importés de la somme calculée par PoliGraph", async () => {
    mocks.findScrutin.mockResolvedValue(scrutin());

    const { container } = await renderPage();

    expect(text(container)).toContain("sont importés depuis la source indiquée");
    expect(text(container)).toContain(
      "somme, calculée par PoliGraph, des pour, des contre et des abstentions"
    );
    expect(text(container)).not.toContain("C'est le total que publie");
  });

  it("ne nomme ni ne lie un votant dont la fiche est en brouillon, mais compte son vote", async () => {
    mocks.findScrutin.mockResolvedValue(
      scrutin({
        votes: [
          vote("a", "POUR"),
          vote("b", "POUR"),
          vote("c", "POUR"),
          vote("d", "CONTRE"),
          vote("e", "CONTRE"),
          vote("f", "ABSTENTION", "DRAFT"),
        ],
      })
    );

    const { container } = await renderPage();

    expect(text(container)).not.toContain("Élu f");
    expect(container.innerHTML).not.toContain("/politiques/elu-f");
    expect(text(container)).toContain("Élu a");
    expect(text(container)).toContain("Compteurs concordants");
  });

  it("ne déclare jamais les votes individuels complets, même avec des compteurs égaux", async () => {
    mocks.findScrutin.mockResolvedValue(
      scrutin({
        votes: [
          vote("a", "POUR"),
          vote("b", "POUR"),
          vote("c", "POUR"),
          vote("d", "CONTRE"),
          vote("e", "CONTRE"),
          vote("f", "ABSTENTION"),
        ],
      })
    );

    const { container } = await renderPage();

    expect(text(container)).toContain("Compteurs concordants");
    expect(text(container)).not.toMatch(/\bComplet\b/);
  });

  it("n'affiche ni colonne « Absent » ni « Aucun député » : une absence de ligne ne se traduit pas", async () => {
    mocks.findScrutin.mockResolvedValue(scrutin({ votes: [vote("a", "POUR")] }));

    const { container } = await renderPage();

    expect(text(container)).not.toContain("ABSENT");
    expect(text(container)).not.toContain("Aucun député");
    expect(text(container)).toContain("Aucun vote enregistré");
    expect(text(container)).toContain("n'indique ni une abstention ni une absence");
  });

  it("dit « pas encore importé » pour un scrutin sans vote individuel, sans faire disparaître la section", async () => {
    mocks.findScrutin.mockResolvedValue(scrutin({ votes: [] }));

    const { container } = await renderPage();

    expect(text(container)).toContain("Pas encore importé");
    expect(text(container)).toContain("pas une absence de votants");
  });

  it("masque un décompte douteux, explique pourquoi sans accuser la source et garde le lien", async () => {
    mocks.findScrutin.mockResolvedValue(scrutin());
    mocks.getOfficialGroups.mockResolvedValue(
      officialGroups([
        GOOD_ROW,
        { ...GOOD_ROW, organeRef: "PO0", forCount: 0, againstCount: 0, abstainCount: 0 },
      ])
    );

    const { container } = await renderPage();

    expect(text(container)).toContain("Décompte officiel par groupe non affiché");
    expect(text(container)).toContain("ne peut pas être affiché de manière fiable");
    expect(text(container)).toContain("La référence PO0 ne figure pas");
    expect(text(container)).not.toMatch(/anomalie dans la source/);
    expect(text(container)).not.toContain(
      "Pour, contre, abstentions et non-votants de chaque groupe"
    );
    expect(container.querySelector(`a[href="${AN_SOURCE}"]`)).not.toBeNull();
  });

  it("distingue un référentiel pas encore importé d'un décompte non fiable", async () => {
    mocks.findScrutin.mockResolvedValue(scrutin());
    mocks.getOfficialGroups.mockResolvedValue(officialGroups([GOOD_ROW], { organes: [] }));

    const { container } = await renderPage();

    expect(text(container)).toContain("pas encore disponible");
    expect(text(container)).toContain("noms des groupes ne sont pas encore importés");
  });

  it("conserve le masquage des positions calculées de la 16e et annonce le décompte non importé", async () => {
    mocks.findScrutin.mockResolvedValue(scrutin({ legislature: 16 }));
    mocks.getOfficialGroups.mockResolvedValue({
      snapshot: { imported: false, issues: null, rows: [] },
      organes: ORGANES,
      fetchedAt: null,
    });

    const { container } = await renderPage();

    expect(text(container)).toContain("Positions calculées non affichées");
    expect(text(container)).toContain("pas encore importé");
    expect(text(container)).not.toContain("Positions calculées par PoliGraph");
  });

  it("ne présente pas comme officiel un résultat dont le lien n'est pas institutionnel", async () => {
    mocks.findScrutin.mockResolvedValue(
      scrutin({ sourceUrl: "https://www.nosdeputes.fr/scrutin/12" })
    );

    const { container } = await renderPage();

    expect(text(container)).not.toContain("Résultat officiel");
    expect(text(container)).toContain("ne mène pas à un site institutionnel");
  });

  it("n'affiche pas de décompte officiel par groupe pour le Sénat et identifie les positions calculées", async () => {
    mocks.findScrutin.mockResolvedValue(
      scrutin({
        chamber: "SENAT",
        legislature: 2023,
        externalId: "2023-63",
        sourceUrl: "https://www.senat.fr/scrutin-public/2023/scr2023-63.html",
      })
    );
    mocks.getPositions.mockResolvedValue([
      {
        id: "p1",
        position: "CONTRE",
        forCount: 0,
        againstCount: 5,
        abstainCount: 0,
        cohesionPct: 100,
        group: {
          id: "g",
          code: "LR",
          name: "Les Républicains",
          shortName: null,
          color: null,
          slug: null,
        },
      },
    ]);

    const { container } = await renderPage();

    expect(mocks.getOfficialGroups).not.toHaveBeenCalled();
    expect(text(container)).not.toContain("Décompte officiel par groupe");
    expect(text(container)).toContain("Positions calculées par PoliGraph");
    expect(text(container)).toContain("groupe actuel de chaque sénateur");
  });
});
