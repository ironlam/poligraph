import { describe, it, expect } from "vitest";
import { resolveElectionStatus } from "../status";

const AOUT_2026 = new Date("2026-08-07T10:00:00Z");

describe("resolveElectionStatus", () => {
  it("marque terminée une élection à deux tours dont les deux tours sont passés", () => {
    // Cas réel : municipales 2026, restées bloquées sur CANDIDACIES en base
    // parce que le sync candidatures a écrit ce statut la nuit du 1er tour.
    expect(
      resolveElectionStatus(
        {
          status: "CANDIDACIES",
          round1Date: new Date("2026-03-15T00:00:00Z"),
          round2Date: new Date("2026-03-22T00:00:00Z"),
        },
        AOUT_2026
      )
    ).toBe("COMPLETED");
  });

  it("marque terminée une élection à un seul tour une fois le jour du scrutin écoulé", () => {
    expect(
      resolveElectionStatus(
        {
          status: "CAMPAIGN",
          round1Date: new Date("2026-09-28T00:00:00Z"),
          round2Date: null,
        },
        new Date("2026-09-29T08:00:00Z")
      )
    ).toBe("COMPLETED");
  });

  it("laisse intact le statut stocké tant que le 1er tour n'a pas eu lieu", () => {
    expect(
      resolveElectionStatus(
        {
          status: "UPCOMING",
          round1Date: new Date("2026-09-28T00:00:00Z"),
          round2Date: null,
        },
        AOUT_2026
      )
    ).toBe("UPCOMING");
  });

  it("ne devine pas les phases de pré-campagne stockées manuellement", () => {
    expect(
      resolveElectionStatus(
        {
          status: "CAMPAIGN",
          round1Date: new Date("2027-04-11T00:00:00Z"),
          round2Date: new Date("2027-04-25T00:00:00Z"),
        },
        AOUT_2026
      )
    ).toBe("CAMPAIGN");
  });

  it("renvoie ROUND_1 le jour du premier tour", () => {
    expect(
      resolveElectionStatus(
        {
          status: "CAMPAIGN",
          round1Date: new Date("2026-03-15T00:00:00Z"),
          round2Date: new Date("2026-03-22T00:00:00Z"),
        },
        new Date("2026-03-15T18:00:00Z")
      )
    ).toBe("ROUND_1");
  });

  it("renvoie BETWEEN_ROUNDS entre les deux tours", () => {
    expect(
      resolveElectionStatus(
        {
          status: "CANDIDACIES",
          round1Date: new Date("2026-03-15T00:00:00Z"),
          round2Date: new Date("2026-03-22T00:00:00Z"),
        },
        new Date("2026-03-18T12:00:00Z")
      )
    ).toBe("BETWEEN_ROUNDS");
  });

  it("renvoie ROUND_2 le jour du second tour", () => {
    expect(
      resolveElectionStatus(
        {
          status: "CANDIDACIES",
          round1Date: new Date("2026-03-15T00:00:00Z"),
          round2Date: new Date("2026-03-22T00:00:00Z"),
        },
        new Date("2026-03-22T09:00:00Z")
      )
    ).toBe("ROUND_2");
  });

  it("ne rétrograde jamais un statut stocké plus avancé que la date", () => {
    // Un scrutin joué en un seul tour alors qu'un 2nd tour était programmé :
    // la rédaction a saisi COMPLETED, les dates diraient BETWEEN_ROUNDS.
    expect(
      resolveElectionStatus(
        {
          status: "COMPLETED",
          round1Date: new Date("2026-03-15T00:00:00Z"),
          round2Date: new Date("2026-03-22T00:00:00Z"),
        },
        new Date("2026-03-18T12:00:00Z")
      )
    ).toBe("COMPLETED");
  });

  it("laisse intact le statut d'une élection sans date connue", () => {
    expect(
      resolveElectionStatus({ status: "UPCOMING", round1Date: null, round2Date: null }, AOUT_2026)
    ).toBe("UPCOMING");
  });

  it("gère un 2nd tour renseigné sans 1er tour sans planter", () => {
    expect(
      resolveElectionStatus(
        { status: "UPCOMING", round1Date: null, round2Date: new Date("2026-03-22T00:00:00Z") },
        AOUT_2026
      )
    ).toBe("COMPLETED");
  });
});
