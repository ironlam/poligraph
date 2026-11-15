import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/og-utils", () => ({ truncateOg: (text: string) => text }));

import { phraseTexte } from "../og";

describe("phrase d'une image Open Graph", () => {
  it("garde la première phrase et laisse à la page le renvoi vers une note", () => {
    expect(
      phraseTexte([
        { text: "Anne Exemple", href: "/politiques/anne-exemple" },
        { text: " préside la collectivité." },
        { text: " Collectivité compétente : Collectivité de Corse. " },
        { text: "Voir la note", href: "#collectivite" },
        { text: "." },
      ])
    ).toBe("Anne Exemple préside la collectivité.");
  });

  it("rend une phrase d'un seul segment sans l'espace qui précède un lien", () => {
    expect(
      phraseTexte([
        { text: "Collectivité compétente : Ville de Paris. " },
        { text: "Voir la note", href: "#collectivite" },
        { text: "." },
      ])
    ).toBe("Collectivité compétente : Ville de Paris.");
  });

  it("ne coupe rien quand aucun segment ne termine une phrase", () => {
    expect(phraseTexte([{ text: "Sans point final" }])).toBe("Sans point final");
  });
});
