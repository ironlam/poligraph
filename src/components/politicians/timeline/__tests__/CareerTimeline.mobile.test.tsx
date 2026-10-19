import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("CareerTimeline (mobile)", () => {
  it("garde le mandat en cours et signale la période terminée qui le chevauche", () => {
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

    const { container } = render(
      <CareerTimeline
        mandates={[olderSenateTerm, currentSenateTerm]}
        partyHistory={[]}
        affairs={[]}
        deathDate={null}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Périodes de mandat à vérifier");

    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".sr-only, [role='status']").forEach((el) => el.remove());
    const text = clone.textContent ?? "";
    expect(text).toContain("Sénateur");
    expect(text).toContain("2023");
    expect(text).not.toContain("2020");
  });
});
