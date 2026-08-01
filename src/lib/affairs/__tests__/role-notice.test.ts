import { describe, it, expect } from "vitest";
import { getRoleNoticeCopy } from "@/lib/affairs/role-notice";

describe("getRoleNoticeCopy", () => {
  it("mentionné : rôle nommé, négation explicite", () => {
    const c = getRoleNoticeCopy("MENTIONED_ONLY");
    expect(c.roleLabel).toBe("Mentionné");
    expect(c.position).toContain("ni mise en cause, ni poursuivie");
  });

  it("victime : nommée victime, pas mise en cause", () => {
    const c = getRoleNoticeCopy("VICTIM");
    expect(c.roleLabel).toBe("Victime");
    expect(c.position).toContain("victime");
    expect(c.position).toContain("pas mise en cause");
  });

  it("plaignant : à l'origine d'une plainte", () => {
    const c = getRoleNoticeCopy("PLAINTIFF");
    expect(c.roleLabel).toBe("Plaignant");
    expect(c.position).toContain("plainte");
  });

  it("le rappel dit que les qualifications ne visent pas la personne", () => {
    expect(getRoleNoticeCopy("MENTIONED_ONLY").reminder).toContain("ne la visent pas");
  });
});
