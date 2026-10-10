import { describe, expect, it } from "vitest";
import type { AffairStatus } from "@/generated/prisma";
import { AFFAIR_STATUS_LABELS, LEGACY_EVENT_TYPES } from "@/config/labels";
import { ALLOWED_OUTCOMES, DECISION_EVENT_TYPES } from "../guard";
import { suggestEventForStatus } from "../status-event";

const STATUSES = Object.keys(AFFAIR_STATUS_LABELS) as AffairStatus[];

describe("suggestEventForStatus", () => {
  it("propose l'étape qui correspond au nouveau statut", () => {
    expect(suggestEventForStatus("PLAINTE_DEPOSEE", null)).toEqual({
      type: "PLAINTE",
      outcome: null,
    });
    expect(suggestEventForStatus("INSTRUCTION", "ENQUETE_PRELIMINAIRE")).toEqual({
      type: "INFORMATION_JUDICIAIRE",
      outcome: null,
    });
    expect(suggestEventForStatus("CONDAMNATION_PREMIERE_INSTANCE", "PROCES_EN_COURS")).toEqual({
      type: "JUGEMENT",
      outcome: "CONDAMNATION",
    });
  });

  it("tient compte de l'appel en cours pour un procès ou une relaxe", () => {
    expect(suggestEventForStatus("PROCES_EN_COURS", "APPEL_EN_COURS")?.type).toBe("PROCES_APPEL");
    expect(suggestEventForStatus("PROCES_EN_COURS", "RENVOI_TRIBUNAL")?.type).toBe("PROCES");
    expect(suggestEventForStatus("RELAXE", "APPEL_EN_COURS")).toEqual({
      type: "ARRET_APPEL",
      outcome: "RELAXE",
    });
    expect(suggestEventForStatus("RELAXE", "PROCES_EN_COURS")).toEqual({
      type: "JUGEMENT",
      outcome: "RELAXE",
    });
  });

  it("ne devine pas un acte ambigu", () => {
    expect(suggestEventForStatus("CONDAMNATION_DEFINITIVE", "APPEL_EN_COURS")).toBeNull();
    expect(suggestEventForStatus("RELAXE", "POURVOI_EN_CASSATION")).toBeNull();
    expect(
      suggestEventForStatus("INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN", "INSTRUCTION")
    ).toBeNull();
  });

  it("ne propose que des types saisissables et des issues admises", () => {
    for (const to of STATUSES) {
      for (const from of [null, ...STATUSES]) {
        const suggestion = suggestEventForStatus(to, from);
        if (!suggestion) continue;
        expect(LEGACY_EVENT_TYPES).not.toContain(suggestion.type);
        if (DECISION_EVENT_TYPES.has(suggestion.type)) {
          const allowed = ALLOWED_OUTCOMES[suggestion.type as keyof typeof ALLOWED_OUTCOMES];
          expect(allowed).toContain(suggestion.outcome);
        } else {
          expect(suggestion.outcome).toBeNull();
        }
      }
    }
  });
});
