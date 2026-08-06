import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MobileTimeline } from "../MobileTimeline";
import { mandate } from "./factories";

/** Text a sighted visitor actually reads, with the screen-reader summary out. */
function visibleText(container: HTMLElement) {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".sr-only").forEach((el) => el.remove());
  return clone.textContent ?? "";
}

function renderTimeline(mandates: ReturnType<typeof mandate>[]) {
  return render(
    <MobileTimeline mandates={mandates} partyHistory={[]} timelineAffairs={[]} deathDate={null} />
  );
}

describe("MobileTimeline", () => {
  it("says which party a party leader ran", () => {
    const { container } = renderTimeline([
      mandate({
        type: "PRESIDENT_PARTI",
        title: "Dirigeant(e) - En marche",
        party: { name: "En marche" },
      }),
    ]);

    expect(visibleText(container)).toContain("En marche");
  });

  it("says which group a deputy sat with", () => {
    const { container } = renderTimeline([
      mandate({
        type: "DEPUTE",
        constituency: "Essonne (1ère)",
        parliamentaryData: { parliamentaryGroup: { name: "Ensemble pour la République" } },
      }),
    ]);

    const text = visibleText(container);
    expect(text).toContain("Groupe Ensemble pour la République");
    expect(text).toContain("Essonne (1ère)");
  });

  it("repeats the affiliation on the end of a mandate", () => {
    const { container } = renderTimeline([
      mandate({
        type: "DEPUTE",
        isCurrent: false,
        endDate: new Date("2024-06-09"),
        parliamentaryData: { parliamentaryGroup: { name: "Les Démocrates" } },
      }),
    ]);

    const text = visibleText(container);
    expect(text).toContain("Fin : Député");
    expect(text.match(/Groupe Les Démocrates/g)).toHaveLength(2);
  });

  it("adds nothing when the group is unknown", () => {
    const { container } = renderTimeline([
      mandate({ type: "DEPUTE", title: "Député de l'Essonne", constituency: "Essonne (1ère)" }),
    ]);

    expect(visibleText(container)).not.toContain("Groupe");
  });
});
