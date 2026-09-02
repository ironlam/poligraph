import { describe, expect, it } from "vitest";
import { toPresidentialLexicalQuery } from "../natural-query";

describe("toPresidentialLexicalQuery", () => {
  it("conserve une recherche courte déjà utile", () => {
    expect(toPresidentialLexicalQuery("loge")).toBe("loge");
    expect(toPresidentialLexicalQuery("Marine Le Pen")).toBe("Marine Pen");
  });

  it("retire la formulation d’une question sans inventer de synonymes", () => {
    expect(
      toPresidentialLexicalQuery("Que proposent les candidats pour réduire le coût du logement ?")
    ).toBe("réduire coût logement");
  });

  it("normalise la ponctuation et borne la requête", () => {
    expect(toPresidentialLexicalQuery("  santé, hôpital !  ")).toBe("santé hôpital");
    expect(toPresidentialLexicalQuery("x".repeat(250))).toHaveLength(200);
  });
});
