import { describe, it, expect } from "vitest";
import type { AffairEventType, EventOccurrence } from "@/generated/prisma";
import { buildPhaseTrail, PHASE_LABELS } from "../phases";

type Ev = { type: AffairEventType; occurrence: EventOccurrence; incidental: boolean };
const held = (...types: AffairEventType[]): Ev[] =>
  types.map((type) => ({ type, occurrence: "HELD", incidental: false }));

describe("PHASE_LABELS", () => {
  it("porte les cinq libellés", () => {
    expect(PHASE_LABELS).toEqual({
      ENQUETE: "Enquête",
      INSTRUCTION: "Instruction",
      JUGEMENT: "Jugement",
      APPEL: "Appel",
      CASSATION: "Cassation",
    });
  });
});

describe("buildPhaseTrail", () => {
  it("citation directe : pas d'instruction affichée", () => {
    expect(
      buildPhaseTrail(
        held("PLAINTE", "CONVOCATION_TRIBUNAL", "JUGEMENT"),
        "CONDAMNATION_PREMIERE_INSTANCE"
      )
    ).toEqual([
      { phase: "ENQUETE", current: false },
      { phase: "JUGEMENT", current: true },
    ]);
  });

  it("cassation avec renvoi : retour en appel", () => {
    expect(
      buildPhaseTrail(
        held(
          "JUGEMENT",
          "APPEL",
          "ARRET_APPEL",
          "POURVOI_CASSATION",
          "ARRET_CASSATION",
          "PROCES_APPEL"
        ),
        "APPEL_EN_COURS"
      )
    ).toEqual([
      { phase: "JUGEMENT", current: false },
      { phase: "APPEL", current: false },
      { phase: "CASSATION", current: false },
      { phase: "APPEL", current: true },
    ]);
  });

  it("ignore une étape annoncée", () => {
    const events: Ev[] = [
      ...held("ENQUETE_PRELIMINAIRE", "MISE_EN_EXAMEN"),
      { type: "PROCES", occurrence: "SCHEDULED", incidental: false },
    ];
    expect(buildPhaseTrail(events, "MISE_EN_EXAMEN")).toEqual([
      { phase: "ENQUETE", current: false },
      { phase: "INSTRUCTION", current: true },
    ]);
  });

  it("un recours incident pendant l'instruction n'ouvre pas la cassation", () => {
    const events: Ev[] = [
      ...held("ENQUETE_PRELIMINAIRE", "MISE_EN_EXAMEN"),
      { type: "POURVOI_CASSATION", occurrence: "HELD", incidental: true },
      { type: "ARRET_CASSATION", occurrence: "HELD", incidental: true },
    ];
    expect(buildPhaseTrail(events, "MISE_EN_EXAMEN")).toEqual([
      { phase: "ENQUETE", current: false },
      { phase: "INSTRUCTION", current: true },
    ]);
  });

  it("ajoute la phase courante du statut quand aucune étape ne la porte", () => {
    expect(buildPhaseTrail(held("PERQUISITION"), "MISE_EN_EXAMEN")).toEqual([
      { phase: "ENQUETE", current: false },
      { phase: "INSTRUCTION", current: true },
    ]);
  });

  it("renvoie une liste vide pour une seule phase", () => {
    expect(
      buildPhaseTrail(held("ENQUETE_PRELIMINAIRE", "PERQUISITION"), "ENQUETE_PRELIMINAIRE")
    ).toEqual([]);
  });

  it("une étape héritière sans prédécesseur ne compte pas", () => {
    expect(buildPhaseTrail(held("AUTRE", "FAITS", "REVELATION"), "PROCES_EN_COURS")).toEqual([]);
  });

  it("une étape héritière prend la phase précédente", () => {
    expect(
      buildPhaseTrail(held("MISE_EN_EXAMEN", "RENVOI_TRIBUNAL", "REQUISITOIRE"), "MISE_EN_EXAMEN")
    ).toEqual([]);
  });

  it("aucune phase courante pour une condamnation définitive", () => {
    const trail = buildPhaseTrail(
      held("ENQUETE_PRELIMINAIRE", "PROCES", "JUGEMENT", "DECISION_DEFINITIVE"),
      "CONDAMNATION_DEFINITIVE"
    );
    expect(trail).toEqual([
      { phase: "ENQUETE", current: false },
      { phase: "JUGEMENT", current: false },
    ]);
  });
});
