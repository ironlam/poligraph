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
