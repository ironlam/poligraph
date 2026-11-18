import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, queryRaw } = vi.hoisted(() => ({ findMany: vi.fn(), queryRaw: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { parrainage: { findMany }, $queryRaw: queryRaw } }));

import { readProfileParrainages, readProfileParrainagesRecus } from "../politician-profile-reads";

beforeEach(() => {
  findMany.mockReset();
  queryRaw.mockReset();
});

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

describe("readProfileParrainagesRecus", () => {
  const sqlOf = () => queryRaw.mock.calls[0]![0] as { sql: string; values: unknown[] };
  const recu = {
    electionSlug: "presidentielle-2022",
    candidateName: "PÉCRESSE Valérie",
    total: 2636,
    departements: 107,
  };

  it("compte par la candidature reliée, sans chercher par le nom", async () => {
    queryRaw.mockResolvedValue([recu]);
    expect(await readProfileParrainagesRecus({ id: "pol_1", slug: "valerie-pecresse" })).toEqual([
      recu,
    ]);
    const { sql, values } = sqlOf();
    expect(sql).toContain('c."politicianId" =');
    expect(sql).toContain('count(DISTINCT p."departmentLabel")');
    expect(values).toEqual(["pol_1"]);
  });

  it("ajoute la ligne de la table validée à la main pour la fiche concernée seulement", async () => {
    queryRaw.mockResolvedValue([]);
    await readProfileParrainagesRecus({ id: "pol_2", slug: "christiane-taubira" });
    expect(sqlOf().values).toEqual(["pol_2", "presidentielle-2022", "TAUBIRA Christiane"]);
  });

  it("rend une liste vide tant que la table n'existe pas, et relance toute autre erreur", async () => {
    queryRaw.mockRejectedValueOnce({
      meta: { driverAdapterError: { cause: { kind: "TableDoesNotExist" } } },
    });
    expect(await readProfileParrainagesRecus({ id: "pol_1", slug: "x" })).toEqual([]);
    queryRaw.mockRejectedValueOnce(new Error("connexion perdue"));
    await expect(readProfileParrainagesRecus({ id: "pol_1", slug: "x" })).rejects.toThrow(
      "connexion perdue"
    );
  });
});
