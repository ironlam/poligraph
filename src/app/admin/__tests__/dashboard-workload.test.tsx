import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import AdminDashboard from "../page";

const mocks = vi.hoisted(() => ({ counts: vi.fn(), secondary: vi.fn() }));
vi.mock("@/lib/admin/dashboard", () => ({
  getDashboardCounts: mocks.counts,
  getDashboardSecondaryData: mocks.secondary,
}));

// Resolve async server components before rendering their DOM, without a Next request runtime.
async function resolve(node: ReactNode): Promise<ReactNode> {
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "function" && element.type.constructor.name === "AsyncFunction") {
    const component = element.type as (props: unknown) => Promise<ReactNode>;
    return resolve(await component(element.props));
  }
  if (!element.props.children) return element;
  const children = await Promise.all(Children.toArray(element.props.children).map(resolve));
  return cloneElement(element, undefined, ...children);
}

async function dashboard() {
  const markup = renderToStaticMarkup(await resolve(await AdminDashboard()));
  const container = document.createElement("div");
  container.innerHTML = markup;
  return container;
}

beforeEach(() => {
  mocks.counts.mockResolvedValue({
    totalPoliticians: 50000,
    totalAffairs: 592,
    politiciansDraft: 13024,
    politiciansWithoutPhoto: 34690,
    biographiesMissing: 34915,
    affairsWithoutEcli: 315,
    completeness: 5,
    affairsDraft: 55,
    queues: {
      proposalsPending: 1,
      proposalsConflict: 0,
      reviewsPending: 6,
      monitoringToHandle: 97,
    },
  });
  mocks.secondary.mockResolvedValue({
    duplicates: 0,
    failedPipelines: 0,
    failedSyncs: 0,
    articlesPending: 2059,
    decisionsPending: 680,
    policyTitlesPending: 533,
    rejectionsPending: 64,
    recentActivity: [],
    syncHistory: [],
  });
});

describe("pilotage éditorial", () => {
  it("garde les échéances visibles et les stocks consultables dans des volets fermés", async () => {
    const page = await dashboard();
    const deadline = Array.from(page.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("Échéances à traiter")
    )!;
    expect(deadline.textContent).toContain("97");
    expect(deadline.closest("details")).toBeNull();
    for (const label of [
      "Personnalités non publiées",
      "Articles sans liaison",
      "Titres de scrutin",
      "Rapprochements indécis",
    ]) {
      const link = Array.from(page.querySelectorAll("a")).find((a) =>
        a.textContent?.includes(label)
      )!;
      expect(link).toBeDefined();
      expect(link.closest("details")?.open).toBe(false);
    }
    expect(page.textContent).not.toContain("5% complet");
  });

  it("conserve le filtre de tous les titres à reprendre, y compris les titres devenus obsolètes", async () => {
    const page = await dashboard();
    const titles = Array.from(page.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("Titres de scrutin")
    )!;
    const url = new URL(titles.getAttribute("href")!, "https://poligraph.test");
    expect(url.searchParams.getAll("status")).toEqual(["DRAFT", "NEEDS_REVIEW", "STALE"]);
    expect(titles.textContent).toContain("533");
  });

  it("ne présente pas des files vides comme des cartes de travail", async () => {
    const current = await mocks.counts();
    mocks.counts.mockResolvedValue({
      ...current,
      affairsDraft: 0,
      queues: {
        proposalsPending: 0,
        proposalsConflict: 0,
        reviewsPending: 0,
        monitoringToHandle: 0,
      },
    });
    const page = await dashboard();
    expect(page.textContent).toContain("Aucune décision en attente dans ces files.");
    expect(page.textContent).not.toContain("Propositions en conflit");
    expect(page.textContent).toContain("Chantiers à reprendre par lots");
  });
});
