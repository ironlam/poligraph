import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  identity: vi.fn(),
  dossier: vi.fn(),
  voteStats: vi.fn(),
  parrainages: vi.fn(),
  recus: vi.fn(),
}));

vi.mock("@/lib/data/politician-profile-reads", () => ({
  readPoliticianIdentity: h.identity,
  readPoliticianDossier: h.dossier,
  readProfileVoteStats: h.voteStats,
  readProfileParrainages: h.parrainages,
  readProfileParrainagesRecus: h.recus,
}));

import { buildPoliticianProfileDocument } from "../build";

const parrainage = {
  electionSlug: "presidentielle-2022",
  candidateName: "HIDALGO Anne",
  mandateLabel: "Maire",
  constituencyLabel: "Quimper",
  publishedOn: "2022-02-15",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.identity.mockResolvedValue({ id: "pol_1", mandates: [] });
  h.dossier.mockResolvedValue({ affairs: [] });
  h.parrainages.mockResolvedValue([]);
  h.recus.mockResolvedValue([]);
});

describe("buildPoliticianProfileDocument, présentations", () => {
  it("n'ajoute aucune clé à la fiche d'une personne sans présentation", async () => {
    const document = await buildPoliticianProfileDocument({ slug: "jeanne-exemple" });
    expect(h.parrainages).toHaveBeenCalledWith("pol_1");
    expect(document).not.toBeNull();
    expect(document).not.toHaveProperty("parrainages");
    expect(document).not.toHaveProperty("parrainagesRecus");
  });

  it("porte le compte des présentations reçues par un candidat, lu par son identité", async () => {
    const recu = {
      electionSlug: "presidentielle-2022",
      candidateName: "PÉCRESSE Valérie",
      total: 2636,
      departements: 107,
    };
    h.identity.mockResolvedValue({ id: "pol_1", slug: "valerie-pecresse", mandates: [] });
    h.recus.mockResolvedValue([recu]);
    const document = await buildPoliticianProfileDocument({ slug: "valerie-pecresse" });
    expect(h.recus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pol_1", slug: "valerie-pecresse" })
    );
    expect(document?.parrainagesRecus).toEqual([recu]);
    expect(document).not.toHaveProperty("parrainages");
  });

  it("porte les présentations reliées à la personne", async () => {
    h.parrainages.mockResolvedValue([parrainage]);
    const document = await buildPoliticianProfileDocument({ slug: "jeanne-exemple" });
    expect(document?.parrainages).toEqual([parrainage]);
  });

  it("ne lit pas les présentations d'une fiche absente ou non publique", async () => {
    h.identity.mockResolvedValue(null);
    expect(await buildPoliticianProfileDocument({ slug: "inconnu" })).toBeNull();
    expect(h.parrainages).not.toHaveBeenCalled();
  });
});
