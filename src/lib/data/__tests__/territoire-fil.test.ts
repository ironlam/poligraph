import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ findMany: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

vi.mock("next/cache", () => ({ cacheTag: h.cacheTag, cacheLife: h.cacheLife }));
vi.mock("@/lib/db", () => ({ db: { territoireEvenement: { findMany: h.findMany } } }));

import {
  FIL_LIMIT,
  getFilTerritoire,
  getRapportsCrcTerritoire,
  RAPPORTS_CRC_LIMIT,
} from "@/lib/data/territoire-fil";
import { parseEvenementPayload } from "@/lib/territoires/evenements";

const row = (over: Record<string, unknown> = {}) => ({
  id: "ev-1",
  type: "CHANGEMENT_MAIRE",
  occurredOn: new Date("2026-10-03T00:00:00Z"),
  payload: { nom: "Claire Martin", predecesseur: "Paul Durand" },
  sourceLabel: "Répertoire national des élus",
  sourceUrl: "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("getFilTerritoire", () => {
  it("lit les seuls événements publiés d'un territoire, les plus récents d'abord", async () => {
    h.findMany.mockResolvedValueOnce([row()]);
    const fil = await getFilTerritoire("COM", "29019");

    expect(h.findMany).toHaveBeenCalledTimes(1);
    const args = h.findMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({
      territoryType: "COM",
      territoryCode: "29019",
      status: "PUBLISHED",
    });
    expect(args.orderBy[0]).toEqual({ occurredOn: "desc" });
    expect(fil).toEqual([
      {
        id: "ev-1",
        date: "2026-10-03",
        evenement: { type: "CHANGEMENT_MAIRE", nom: "Claire Martin", predecesseur: "Paul Durand" },
        source: {
          label: "Répertoire national des élus",
          url: "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1",
        },
      },
    ]);
  });

  it("pose le profil synced et le tag du territoire, région comprise", async () => {
    h.findMany.mockResolvedValue([]);
    await getFilTerritoire("DEP", "29");
    expect(h.cacheLife).toHaveBeenCalledWith("synced");
    expect(h.cacheTag).toHaveBeenLastCalledWith("territoires", "territoire:29");
    await getFilTerritoire("REG", "53");
    expect(h.cacheTag).toHaveBeenLastCalledWith("territoires", "territoire:region-53");
  });

  it("garde trois lignes au plus", async () => {
    h.findMany.mockResolvedValueOnce([1, 2, 3, 4, 5].map((n) => row({ id: `ev-${n}` })));
    const fil = await getFilTerritoire("COM", "29019");
    expect(FIL_LIMIT).toBe(3);
    expect(fil.map((e) => e.id)).toEqual(["ev-1", "ev-2", "ev-3"]);
  });

  it("écarte un événement au contenu invalide ou à la source non https", async () => {
    h.findMany.mockResolvedValueOnce([
      row({ id: "inconnu", type: "RUMEUR" }),
      row({ id: "champ-en-trop", payload: { nom: "A B", predecesseur: null, phrase: "libre" } }),
      row({ id: "source", sourceUrl: "javascript:alert(1)" }),
      row({ id: "bon" }),
    ]);
    const fil = await getFilTerritoire("COM", "29019");
    expect(fil.map((e) => e.id)).toEqual(["bon"]);
  });

  it("rend un fil vide tant que la table n'existe pas, et propage toute autre erreur", async () => {
    h.findMany.mockRejectedValueOnce({
      meta: { driverAdapterError: { cause: { kind: "TableDoesNotExist" } } },
    });
    expect(await getFilTerritoire("COM", "29019")).toEqual([]);
    h.findMany.mockRejectedValueOnce(new Error("connexion perdue"));
    await expect(getFilTerritoire("COM", "29019")).rejects.toThrow("connexion perdue");
  });
});

describe("parseEvenementPayload", () => {
  it("valide les trois types et leurs champs", () => {
    expect(
      parseEvenementPayload("CHANGEMENT_PRESIDENT", {
        conseil: "REGIONAL",
        nom: "Anne Morel",
        predecesseur: null,
      })
    ).toMatchObject({ type: "CHANGEMENT_PRESIDENT", conseil: "REGIONAL" });
    expect(
      parseEvenementPayload("RESULTAT_ELECTION", {
        electionSlug: "municipales-2026",
        electionLabel: "Municipales 2026",
        tour: 2,
      })
    ).toMatchObject({ type: "RESULTAT_ELECTION", tour: 2 });
  });

  it("refuse un champ manquant, un tour inconnu, un slug qui n'en est pas un", () => {
    expect(parseEvenementPayload("CHANGEMENT_MAIRE", { nom: "" })).toBeNull();
    expect(parseEvenementPayload("CHANGEMENT_MAIRE", null)).toBeNull();
    const base = { electionSlug: "municipales-2026", electionLabel: "Municipales 2026", tour: 1 };
    expect(parseEvenementPayload("RESULTAT_ELECTION", { ...base, tour: 3 })).toBeNull();
    expect(
      parseEvenementPayload("RESULTAT_ELECTION", { ...base, electionSlug: "../x" })
    ).toBeNull();
  });
});

describe("SQL manuel du fil", () => {
  const sql = readFileSync(
    join(process.cwd(), "prisma/migrations/manual/2026-11-15-territoire-evenements.sql"),
    "utf8"
  );

  it("active la RLS et n'ouvre à anon que les lignes publiées", () => {
    expect(sql).toContain('ALTER TABLE "TerritoireEvenement" ENABLE ROW LEVEL SECURITY');
    expect(sql).toMatch(/FOR SELECT TO anon\s+USING \("status" = 'PUBLISHED'\)/);
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it("déclare les colonnes du modèle Prisma", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const model = schema.match(/model TerritoireEvenement \{[\s\S]*?\n\}/)?.[0] ?? "";
    const fields = [...model.matchAll(/^\s{2}([a-zA-Z]+)\s+\S/gm)].map((m) => m[1]!);
    expect(fields.length).toBeGreaterThanOrEqual(11);
    for (const field of fields) expect(sql).toContain(`"${field}"`);
  });
});

describe("getRapportsCrcTerritoire", () => {
  const rapport = (id: string) =>
    row({
      id,
      type: "RAPPORT_CRC",
      payload: {
        juridictionId: 143,
        document: "RAPPORT_OBSERVATIONS_DEFINITIVES",
        collectivite: "Département de la Meuse",
        cahier: null,
        titre: "Département de la Meuse",
      },
      sourceLabel: "Chambre régionale des comptes Grand Est",
      sourceUrl: "https://www.ccomptes.fr/fr/publications/departement-de-la-meuse-5",
    });

  it("lit les seuls rapports publiés du territoire, bornés, sous le cache du fil", async () => {
    h.findMany.mockResolvedValueOnce([rapport("r1"), rapport("r2")]);
    const rapports = await getRapportsCrcTerritoire("DEP", "55");
    const args = h.findMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({
      type: "RAPPORT_CRC",
      territoryType: "DEP",
      territoryCode: "55",
      status: "PUBLISHED",
    });
    expect(args.take).toBe(RAPPORTS_CRC_LIMIT);
    expect(h.cacheLife).toHaveBeenCalledWith("synced");
    expect(h.cacheTag).toHaveBeenLastCalledWith("territoires", "territoire:55");
    expect(rapports.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(rapports[0]?.evenement.type).toBe("RAPPORT_CRC");
  });

  it("écarte un contenu qui ne passe plus son schéma", async () => {
    h.findMany.mockResolvedValueOnce([
      rapport("r1"),
      row({ id: "r2", type: "RAPPORT_CRC", payload: {} }),
    ]);
    expect((await getRapportsCrcTerritoire("DEP", "55")).map((r) => r.id)).toEqual(["r1"]);
  });
});
