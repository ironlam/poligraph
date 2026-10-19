import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CareerTimeline } from "../CareerTimeline";
import { mandate } from "./factories";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  // The desktop chart only renders above 1024px.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width: 1024px"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

const deputy = mandate({
  type: "DEPUTE",
  constituency: "Essonne (1ère)",
  parliamentaryData: { parliamentaryGroup: { name: "Les Démocrates" } },
});

function renderDesktop() {
  return render(
    <CareerTimeline mandates={[deputy]} partyHistory={[]} affairs={[]} deathDate={null} />
  );
}

describe("CareerTimeline (desktop)", () => {
  it("signale les périodes parlementaires qui se chevauchent", () => {
    const olderSenateTerm = mandate({
      id: "jadot-2020",
      type: "SENATEUR",
      externalId: "senat-21093M",
      startDate: new Date("2020-10-01T00:00:00.000Z"),
      endDate: new Date("2026-02-15T00:00:00.000Z"),
      isCurrent: false,
    });
    const currentSenateTerm = mandate({
      id: "jadot-2023",
      type: "SENATEUR",
      externalId: "senat-21093M",
      startDate: new Date("2023-10-01T00:00:00.000Z"),
      isCurrent: true,
    });

    render(
      <CareerTimeline
        mandates={[olderSenateTerm, currentSenateTerm]}
        partyHistory={[]}
        affairs={[]}
        deathDate={null}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Périodes de mandat à vérifier");
    expect(screen.getByRole("status")).toHaveTextContent("2020");
    expect(screen.getByRole("status")).toHaveTextContent("2023");
    expect(screen.getByRole("button", { name: /Sénateur.*2023 - présent/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sénateur.*2020 - 2026/ })).not.toBeInTheDocument();
  });

  it("ne signale pas des mandats successifs qui partagent le même identifiant", () => {
    const previousSenateTerm = mandate({
      id: "senate-previous",
      type: "SENATEUR",
      externalId: "senat-21093M",
      startDate: new Date("2020-10-01T00:00:00.000Z"),
      endDate: new Date("2026-10-01T00:00:00.000Z"),
      isCurrent: false,
    });
    const nextSenateTerm = mandate({
      id: "senate-next",
      type: "SENATEUR",
      externalId: "senat-21093M",
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      isCurrent: true,
    });

    render(
      <CareerTimeline
        mandates={[previousSenateTerm, nextSenateTerm]}
        partyHistory={[]}
        affairs={[]}
        deathDate={null}
      />
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("names the group in the accessible label of a mandate bar", () => {
    renderDesktop();

    expect(screen.getByRole("button", { name: /Groupe Les Démocrates/ })).toBeInTheDocument();
  });

  it("names the group in the hover tooltip", () => {
    renderDesktop();

    fireEvent.mouseEnter(screen.getByRole("button", { name: /Député/ }));

    expect(screen.getByText("Groupe Les Démocrates")).toBeInTheDocument();
  });
});
