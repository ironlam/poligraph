import { describe, it, expect } from "vitest";
import { mandateAffiliation, mergePartyStints } from "../utils";
import type { CareerTimelineProps } from "../types";
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

type Stint = CareerTimelineProps["partyHistory"][number];

const PS = { name: "Parti socialiste", shortName: "PS", slug: "parti-socialiste", color: "#f00" };
const RE = { name: "Renaissance", shortName: "RE", slug: "renaissance", color: "#fc0" };

function stint(id: string, party: Stint["party"], start: string | null, end: string | null): Stint {
  return {
    id,
    party,
    role: "MEMBRE",
    startDate: start ? new Date(start) : null,
    endDate: end ? new Date(end) : null,
  };
}

describe("mergePartyStints", () => {
  it("collapses the memberships a sync reopened into one stint", () => {
    // Shape of florence-blatrix-contat in production: one real membership, then four
    // rows opened by syncs between February and March 2026.
    const result = mergePartyStints([
      stint("e", PS, "2026-03-29", null),
      stint("a", PS, "2020-01-01", "2026-02-13T20:16:49Z"),
      stint("b", PS, "2026-02-13T20:16:49Z", "2026-02-13T20:28:29Z"),
      stint("c", PS, "2026-02-18", "2026-02-22"),
      stint("d", PS, "2026-02-26", "2026-03-01"),
    ]);

    expect(result).toEqual([stint("a", PS, "2020-01-01", null)]);
  });

  it("keeps a real departure and return as two stints", () => {
    const result = mergePartyStints([
      stint("a", PS, "2010-01-01", "2015-06-01"),
      stint("b", PS, "2019-01-01", null),
    ]);

    expect(result.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("absorbs duplicate open rows for the same party", () => {
    const result = mergePartyStints([
      stint("a", RE, "2026-02-13", null),
      stint("b", RE, "2026-02-22", null),
      stint("c", RE, "2026-03-08", null),
    ]);

    expect(result).toEqual([stint("a", RE, "2026-02-13", null)]);
  });

  it("keeps different parties apart", () => {
    const result = mergePartyStints([
      stint("a", PS, "2012-01-01", "2016-04-06"),
      stint("b", RE, "2016-04-06", null),
    ]);

    expect(result.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const input = [stint("a", PS, "2020-01-01", "2026-02-13"), stint("b", PS, "2026-02-18", null)];
    mergePartyStints(input);

    expect(input[0]!.endDate).toEqual(new Date("2026-02-13"));
  });
});
