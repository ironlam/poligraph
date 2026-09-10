import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MandateTimeline } from "@/components/politicians/MandateTimeline";
import type { MandateType } from "@/types";

/**
 * Past mandates are grouped by MANDATE_CATEGORIES; a type listed in no category falls back to an
 * "Autres mandats" block, so a missing entry costs the right heading, not the mandate itself.
 * MAIRE_ARRONDISSEMENT is a municipal executive and belongs with the other local mandates.
 */

function makePastMandate(type: MandateType) {
  return {
    id: `m-${type}`,
    type,
    isCurrent: false,
    startDate: new Date("2014-04-01"),
    endDate: new Date("2020-06-30"),
    role: null,
    title: null,
    constituency: "Paris 12e (75112)",
    institution: null,
    officialUrl: null,
    parliamentaryData: null,
  };
}

function renderTimeline(type: MandateType) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<MandateTimeline mandates={[makePastMandate(type)] as any} />).container;
}

describe("MandateTimeline : mandats d'arrondissement", () => {
  it("affiche un mandat passé de maire d'arrondissement", () => {
    expect(renderTimeline("MAIRE_ARRONDISSEMENT").textContent).toContain("Maire d'arrondissement");
  });

  it("le classe dans les mandats locaux, pas dans « Autres mandats »", () => {
    const text = renderTimeline("MAIRE_ARRONDISSEMENT").textContent ?? "";
    expect(text).toContain("Mandats locaux");
    expect(text).not.toContain("Autres mandats");
  });

  it("laisse un maire ordinaire dans les mandats locaux", () => {
    // Guards the assertion above: if the local heading disappeared entirely, the test would pass
    // for the wrong reason.
    expect(renderTimeline("MAIRE").textContent).toContain("Mandats locaux");
  });
});
