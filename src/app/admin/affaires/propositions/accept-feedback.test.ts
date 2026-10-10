import { describe, expect, it } from "vitest";
import { acceptFeedback } from "./accept-feedback";

describe("acceptFeedback", () => {
  it("propose d'ajouter l'étape après un changement de statut", () => {
    const feedback = acceptFeedback({
      affairId: "aff_1",
      statusChange: {
        from: "PROCES_EN_COURS",
        to: "CONDAMNATION_PREMIERE_INSTANCE",
        prefill: {
          type: "JUGEMENT",
          outcome: "CONDAMNATION",
          sourceUrl: "https://www.lemonde.fr/a",
          sourceKind: "PRESS",
        },
      },
      event: null,
    });
    expect(feedback.kind).toBe("success");
    expect(feedback.message).toContain("n'ajoute pas d'étape");
    expect(feedback.link?.label).toBe("Ajouter l'étape correspondante");
    expect(feedback.link?.href).toContain("etape=JUGEMENT");
    expect(feedback.link?.href).toContain("issue=CONDAMNATION");
  });

  it("signale une révélation restée en brouillon avec les raisons du garde", () => {
    const feedback = acceptFeedback({
      affairId: "aff_1",
      statusChange: null,
      event: { id: "ev_1", status: "DRAFT", reasons: ["Le titre contient un tiret long."] },
    });
    expect(feedback.kind).toBe("warning");
    expect(feedback.message).toContain("brouillon");
    expect(feedback.reasons).toEqual(["Le titre contient un tiret long."]);
    expect(feedback.link?.href).toBe("/admin/affaires/aff_1#etapes");
  });

  it("confirme une révélation publiée", () => {
    const feedback = acceptFeedback({
      affairId: "aff_1",
      statusChange: null,
      event: { id: "ev_1", status: "PUBLISHED", reasons: [] },
    });
    expect(feedback.kind).toBe("success");
    expect(feedback.message).toContain("publiée");
  });

  it("reste sobre pour un correctif sans statut ni étape", () => {
    expect(acceptFeedback({ affairId: "aff_1", statusChange: null, event: null })).toEqual({
      kind: "success",
      message: "Proposition appliquée.",
    });
  });
});
