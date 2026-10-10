import { describe, expect, it } from "vitest";
import { episodeDates } from "@/components/governments/format";

const episode = {
  start: "2024-09-21",
  end: "2024-12-05",
  endKind: "COLLECTIVE_RESIGNATION" as const,
  currentAffairsEndedAt: "2024-12-10",
  lastConfirmedAt: null,
};

describe("episodeDates : affaires courantes", () => {
  it("n'en parle pas quand le régime n'est pas attesté par un acte", () => {
    const text = episodeDates(episode, "F", {
      currentAffairsAttested: false,
      resignedEvidence: "ACT",
    });
    expect(text).not.toContain("affaires courantes");
  });

  it("n'en parle pas quand la démission n'est pas prouvée par un acte", () => {
    const text = episodeDates(episode, "F", {
      currentAffairsAttested: true,
      resignedEvidence: "DATASET",
    });
    expect(text).not.toContain("affaires courantes");
  });

  it("n'en parle pas pour une fin individuelle, ni sans gouvernement", () => {
    const attested = { currentAffairsAttested: true, resignedEvidence: "ACT" as const };
    expect(episodeDates({ ...episode, endKind: "INDIVIDUAL" }, "F", attested)).not.toContain(
      "affaires courantes"
    );
    expect(episodeDates(episode, "F", undefined)).not.toContain("affaires courantes");
  });

  it("l'écrit quand tout est attesté", () => {
    const text = episodeDates(episode, "F", {
      currentAffairsAttested: true,
      resignedEvidence: "ACT",
    });
    expect(text).toContain("puis affaires courantes jusqu'au 10 décembre 2024");
  });
});
