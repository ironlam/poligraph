import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findExternalIds: vi.fn(),
  findCandidacies: vi.fn(),
  getElectionIdBySlug: vi.fn(),
  upsertPoliticianExternalId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    externalId: { findMany: h.findExternalIds },
    candidacy: { findMany: h.findCandidacies },
  },
}));
vi.mock("@/lib/elections/election-id", () => ({ getElectionIdBySlug: h.getElectionIdBySlug }));
vi.mock("@/lib/prisma-helpers", () => ({
  upsertPoliticianExternalId: h.upsertPoliticianExternalId,
}));
vi.mock("@/services/politician", () => ({ politicianService: {} }));

import { mapUnknownSenators } from "../senateurs";
import type { SenateurAPI } from "../types";

const senator = {
  matricule: "26001X",
  prenom: "Jeanne",
  nom: "Exemple",
  circonscription: { libelle: "Ain" },
} as unknown as SenateurAPI;

describe("mapUnknownSenators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.findExternalIds.mockResolvedValue([]);
    h.findCandidacies.mockResolvedValue([]);
  });

  it("rend les matricules inconnus comme non résolus quand l'élection est absente", async () => {
    h.getElectionIdBySlug.mockResolvedValue(null);

    const unresolved = await mapUnknownSenators([senator]);

    expect(unresolved.map((u) => u.matricule)).toEqual(["26001X"]);
    expect(h.findCandidacies).not.toHaveBeenCalled();
    expect(h.upsertPoliticianExternalId).not.toHaveBeenCalled();
  });

  it("lit les élus par l'identifiant de l'élection quand elle existe", async () => {
    h.getElectionIdBySlug.mockResolvedValue("election-senat-2026");

    await mapUnknownSenators([senator]);

    expect(h.getElectionIdBySlug).toHaveBeenCalledExactlyOnceWith("senatoriales-2026");
    expect(h.findCandidacies.mock.calls[0]![0].where).toEqual({
      electionId: "election-senat-2026",
      isElected: true,
    });
  });
});
