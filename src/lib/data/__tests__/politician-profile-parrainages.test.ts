import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { parrainage: { findMany } } }));

import { readProfileParrainages } from "../politician-profile-reads";

beforeEach(() => findMany.mockReset());

describe("readProfileParrainages", () => {
  it("ne lit que les présentations reliées à la personne, bornées, la plus ancienne d'abord", async () => {
    findMany.mockResolvedValue([
      {
        candidateName: "HIDALGO Anne",
        mandateLabel: "Maire",
        constituencyLabel: "Quimper",
        publishedOn: new Date("2022-02-15T00:00:00Z"),
        election: { slug: "presidentielle-2022" },
      },
    ]);
    expect(await readProfileParrainages("pol_1")).toEqual([
      {
        electionSlug: "presidentielle-2022",
        candidateName: "HIDALGO Anne",
        mandateLabel: "Maire",
        constituencyLabel: "Quimper",
        publishedOn: "2022-02-15",
      },
    ]);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { politicianId: "pol_1" },
      take: 20,
      orderBy: [{ publishedOn: "asc" }, { candidateName: "asc" }],
    });
  });

  it("rend une liste vide tant que la table n'existe pas, et relance toute autre erreur", async () => {
    findMany.mockRejectedValueOnce({
      meta: { driverAdapterError: { cause: { kind: "TableDoesNotExist" } } },
    });
    expect(await readProfileParrainages("pol_1")).toEqual([]);
    findMany.mockRejectedValueOnce(new Error("connexion perdue"));
    await expect(readProfileParrainages("pol_1")).rejects.toThrow("connexion perdue");
  });
});
