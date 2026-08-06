import { describe, it, expect } from "vitest";
import { mandateAffiliation } from "../utils";
import { mandate } from "./factories";

describe("mandateAffiliation", () => {
  it("names the party behind a party leadership", () => {
    const result = mandateAffiliation(
      mandate({
        type: "PRESIDENT_PARTI",
        title: "Dirigeant(e) - La France insoumise",
        party: { name: "La France insoumise" },
      })
    );

    expect(result).toBe("La France insoumise");
  });

  it("names the parliamentary group of a deputy, flagged as a group", () => {
    const result = mandateAffiliation(
      mandate({
        type: "DEPUTE",
        parliamentaryData: { parliamentaryGroup: { name: "Ensemble pour la République" } },
      })
    );

    // "Ensemble pour la République" is a group, not a party. Saying so keeps
    // the two apart for the reader.
    expect(result).toBe("Groupe Ensemble pour la République");
  });

  it("names the parliamentary group of a senator", () => {
    const result = mandateAffiliation(
      mandate({
        type: "SENATEUR",
        parliamentaryData: {
          parliamentaryGroup: { name: "Socialiste, Écologiste et Républicain" },
        },
      })
    );

    expect(result).toBe("Groupe Socialiste, Écologiste et Républicain");
  });

  it("names the european group of an MEP", () => {
    const result = mandateAffiliation(
      mandate({
        type: "DEPUTE_EUROPEEN",
        europeanData: { europeanGroup: { name: "Renew Europe" } },
      })
    );

    expect(result).toBe("Groupe Renew Europe");
  });

  it("gives the actual portfolio of a minister", () => {
    const result = mandateAffiliation(
      mandate({ type: "MINISTRE", title: "Garde des sceaux, ministre de la justice" })
    );

    expect(result).toBe("Garde des sceaux, ministre de la justice");
  });

  it("stays silent when a minister's title only repeats the generic label", () => {
    const result = mandateAffiliation(
      mandate({ type: "PREMIER_MINISTRE", title: "Premier ministre" })
    );

    expect(result).toBeNull();
  });

  it("stays silent when a deputy has no recorded group", () => {
    const result = mandateAffiliation(mandate({ type: "DEPUTE", title: "Député de l'Essonne" }));

    expect(result).toBeNull();
  });

  it("stays silent for a mayor, whose commune is already displayed", () => {
    const result = mandateAffiliation(
      mandate({ type: "MAIRE", title: "Maire d'Agen", constituency: "Agen" })
    );

    expect(result).toBeNull();
  });
});
