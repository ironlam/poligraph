import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  AffairStatusNotice,
  getAffairNoticeVariant,
} from "@/components/affairs/AffairStatusNotice";
import { isAccusedInvolvement } from "@/config/certainty";

describe("getAffairNoticeVariant — sélection par statut et involvement", () => {
  it("PRESCRIPTION a sa variante propre, jamais assimilée à une relaxe", () => {
    expect(getAffairNoticeVariant("PRESCRIPTION", "DIRECT")).toBe("prescription");
  });

  it("les 4 issues favorables partagent la variante favorable", () => {
    for (const s of ["RELAXE", "ACQUITTEMENT", "NON_LIEU", "CLASSEMENT_SANS_SUITE"] as const) {
      expect(getAffairNoticeVariant(s, "DIRECT")).toBe("favorable");
    }
  });

  it("condamnations : définitive vs non définitive", () => {
    expect(getAffairNoticeVariant("CONDAMNATION_DEFINITIVE", "DIRECT")).toBe("definitive");
    expect(getAffairNoticeVariant("CONDAMNATION_PREMIERE_INSTANCE", "INDIRECT")).toBe(
      "non_definitive"
    );
    expect(getAffairNoticeVariant("APPEL_EN_COURS", "DIRECT")).toBe("non_definitive");
  });

  it("procédures en cours : présomption d'innocence", () => {
    for (const s of [
      "ENQUETE_PRELIMINAIRE",
      "INSTRUCTION",
      "MISE_EN_EXAMEN",
      "RENVOI_TRIBUNAL",
      "PROCES_EN_COURS",
    ] as const) {
      expect(getAffairNoticeVariant(s, "DIRECT")).toBe("presumption");
    }
  });

  it("non mis en cause : encart de rôle, jamais un encart à charge (I5)", () => {
    for (const inv of ["VICTIM", "PLAINTIFF", "MENTIONED_ONLY"] as const) {
      // Procédure en cours ou issue favorable : la personne n'est pas poursuivie,
      // mais un encart doit le dire — le silence laissait le statut se lire comme
      // le sien (I5, #511).
      expect(getAffairNoticeVariant("RELAXE", inv)).toBe("not_accused");
      expect(getAffairNoticeVariant("INSTRUCTION", inv)).toBe("not_accused");
      // Affaire conclue par une condamnation : celle d'un tiers.
      expect(getAffairNoticeVariant("CONDAMNATION_DEFINITIVE", inv)).toBe("third_party");
    }
  });
});

describe("AffairStatusNotice — wordings validés (RGPD art. 10)", () => {
  it("issue favorable : jamais lue comme une condamnation", () => {
    const { getByRole } = render(<AffairStatusNotice status="RELAXE" involvement="DIRECT" />);
    const note = getByRole("note");
    expect(note.textContent).toContain("Procédure close sans condamnation");
    expect(note.textContent).toContain("ne doit pas être lue comme une condamnation");
  });

  it("prescription : wording distinct, pas de décision sur le fond", () => {
    const { getByRole } = render(<AffairStatusNotice status="PRESCRIPTION" involvement="DIRECT" />);
    const note = getByRole("note");
    expect(note.textContent).toContain("Action publique éteinte par prescription");
    expect(note.textContent).toContain("ne constitue pas une décision sur le fond");
    expect(note.textContent).not.toContain("favorable");
  });

  it("présomption d'innocence sur les procédures en cours", () => {
    const { getByRole } = render(
      <AffairStatusNotice status="MISE_EN_EXAMEN" involvement="DIRECT" />
    );
    expect(getByRole("note").textContent).toContain("présumée innocente");
  });

  it("condamnation non définitive : mention du recours", () => {
    const { getByRole } = render(
      <AffairStatusNotice status="APPEL_EN_COURS" involvement="DIRECT" />
    );
    expect(getByRole("note").textContent).toContain("Décision non définitive");
  });

  it("non mis en cause : encart « personne non mise en cause » (I5)", () => {
    const { getByRole } = render(<AffairStatusNotice status="INSTRUCTION" involvement="VICTIM" />);
    const note = getByRole("note");
    expect(note.getAttribute("data-variant")).toBe("not_accused");
    expect(note.textContent).toContain("ni mise en cause, ni poursuivie");
  });
});

describe("instruction close sans mise en examen", () => {
  it("rend une variante dédiée pour une personne mise en cause", () => {
    expect(getAffairNoticeVariant("INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN", "DIRECT")).toBe(
      "instruction_close"
    );
  });

  it("mentionné : encart de rôle, pas la variante à charge instruction_close", () => {
    expect(
      getAffairNoticeVariant("INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN", "MENTIONED_ONLY")
    ).toBe("not_accused");
  });
});

describe("régression #383 — plaignant/victime dans une affaire de condamnation", () => {
  // Affaire « Plainte de X contre Y » : c'est Y qui est jugé. Ni le badge de
  // certitude (piloté par isAccusedInvolvement) ni l'encart de prudence
  // (getAffairNoticeVariant) ne doivent présenter X comme condamné.
  /** Variantes qui qualifient la personne elle-même comme mise en cause. */
  const CHARGING_VARIANTS = ["presumption", "non_definitive", "pourvoi", "definitive"];

  it("un plaignant n'est pas considéré comme mis en cause", () => {
    expect(isAccusedInvolvement("PLAINTIFF")).toBe(false);
    const variant = getAffairNoticeVariant("CONDAMNATION_DEFINITIVE", "PLAINTIFF");
    expect(CHARGING_VARIANTS).not.toContain(variant);
    expect(variant).toBe("third_party");
  });

  it("une victime n'est pas considérée comme mise en cause", () => {
    expect(isAccusedInvolvement("VICTIM")).toBe(false);
    const variant = getAffairNoticeVariant("CONDAMNATION_DEFINITIVE", "VICTIM");
    expect(CHARGING_VARIANTS).not.toContain(variant);
    expect(variant).toBe("third_party");
  });

  it("un mis en cause direct conserve son badge de certitude", () => {
    expect(isAccusedInvolvement("DIRECT")).toBe(true);
    expect(getAffairNoticeVariant("CONDAMNATION_DEFINITIVE", "DIRECT")).toBe("definitive");
  });
});
