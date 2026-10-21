import { describe, expect, it } from "vitest";
import { feedbackSchema } from "../feedback";

const valid = { category: "FACTUAL_ERROR", message: "Le mandat indiqué est daté de travers." };

describe("feedbackSchema", () => {
  it("accepte un retour minimal et normalise les champs absents", () => {
    const parsed = feedbackSchema.parse(valid);
    expect(parsed.pagePath).toBeNull();
    expect(parsed.contactEmail).toBeNull();
  });

  it("met l'adresse e-mail en minuscules et traite la chaîne vide comme absente", () => {
    expect(feedbackSchema.parse({ ...valid, contactEmail: "Marie@Example.org" }).contactEmail).toBe(
      "marie@example.org"
    );
    expect(feedbackSchema.parse({ ...valid, contactEmail: "" }).contactEmail).toBeNull();
  });

  it("ignore un chemin de page invalide au lieu de refuser le retour", () => {
    expect(feedbackSchema.parse({ ...valid, pagePath: "https://example.com" }).pagePath).toBeNull();
    expect(feedbackSchema.parse({ ...valid, pagePath: "/affaires?q=x" }).pagePath).toBe(
      "/affaires"
    );
  });

  it("refuse une catégorie inconnue, un message trop court ou trop long, un e-mail invalide", () => {
    expect(feedbackSchema.safeParse({ ...valid, category: "SPAM" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...valid, message: "court" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...valid, message: "a".repeat(2001) }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...valid, contactEmail: "pas-un-email" }).success).toBe(
      false
    );
  });

  it("ne laisse pas passer un champ inconnu (statut, identifiant)", () => {
    const parsed = feedbackSchema.parse({ ...valid, status: "DONE", id: "x" });
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("id");
  });
});
