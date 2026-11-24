import { describe, expect, it } from "vitest";
import { buildClaimDaySegments } from "../claim-day-text";

const text = (segments: { text: string }[]) => segments.map((s) => s.text).join("");

describe("buildClaimDaySegments", () => {
  it("produit la phrase du 9 octobre 2026, textes liés", () => {
    const segments = buildClaimDaySegments(
      [
        {
          chamber: "AN",
          scrutinCount: 51,
          dossiers: [
            { slug: "violences", title: "Apporter une réponse intégrale", scrutinCount: 47 },
            { slug: "autorite", title: "Adapter l'autorité judiciaire", scrutinCount: 4 },
          ],
          otherCount: 0,
        },
      ],
      "Mathilde Panot",
      19
    );
    expect(text(segments)).toBe(
      "Ce jour-là, l'Assemblée nationale a tenu 51 scrutins publics : 47 sur le texte « Apporter une réponse intégrale », 4 sur le texte « Adapter l'autorité judiciaire ». Mathilde Panot a pris part à 19 d'entre eux."
    );
    expect(segments.filter((s) => s.href).map((s) => s.href)).toEqual([
      "/parlement/dossiers/violences",
      "/parlement/dossiers/autorite",
    ]);
  });

  it("accorde au singulier et enchaîne une seconde chambre", () => {
    const segments = buildClaimDaySegments(
      [
        { chamber: "AN", scrutinCount: 1, dossiers: [], otherCount: 1 },
        {
          chamber: "SENAT",
          scrutinCount: 3,
          dossiers: [{ slug: null, title: "Texte sans page", scrutinCount: 2 }],
          otherCount: 1,
        },
      ],
      "Jean Dupont",
      1
    );
    expect(text(segments)).toBe(
      "Ce jour-là, l'Assemblée nationale a tenu 1 scrutin public. Le Sénat a tenu 3 scrutins publics : 2 sur le texte « Texte sans page », et 1 sur d'autres textes ou sans texte rattaché. Jean Dupont a pris part à l'un d'entre eux."
    );
    expect(segments.some((s) => s.href)).toBe(false);
  });
});
