import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ createMany: vi.fn(), mandates: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    territoireEvenement: { createMany: h.createMany },
    mandate: { findMany: h.mandates },
  },
}));

import { parseEvenementPayload, phraseEvenement } from "@/lib/territoires/evenements";
import {
  maireChangeDrafts,
  maireChangeEvenement,
  presidentChangeDrafts,
  presidentChangeEvenement,
  recordEvenements,
  resultatElectionEvenement,
} from "@/services/sync/territoire-evenements";

const date = new Date("2026-10-03T12:00:00Z");
const maire = (over: Partial<Parameters<typeof maireChangeEvenement>[0]> = {}) =>
  maireChangeEvenement({
    inseeCode: "29019",
    nom: "Claire Martin",
    predecesseur: "Paul Durand",
    functionStart: date,
    shownOnSite: true,
    ...over,
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));
});

describe("phraseEvenement", () => {
  it("changement de maire, avec et sans prédécesseur", () => {
    expect(phraseEvenement(maire().payload)).toBe(
      "Claire Martin succède à Paul Durand comme maire."
    );
    expect(phraseEvenement(maire({ predecesseur: null }).payload)).toBe(
      "Claire Martin devient maire."
    );
  });

  it("changement de président, département et région", () => {
    const base = { territoryCode: "29", nom: "Marc Leroy", functionStart: date };
    expect(
      phraseEvenement(
        presidentChangeEvenement({ ...base, niveau: "DEPARTEMENTAL", predecesseur: "Anne Morel" })
          .payload
      )
    ).toBe("Marc Leroy succède à Anne Morel à la présidence du conseil départemental.");
    expect(
      phraseEvenement(
        presidentChangeEvenement({ ...base, niveau: "REGIONAL", predecesseur: null }).payload
      )
    ).toBe("Marc Leroy prend la présidence du conseil régional.");
  });

  it("résultat d'élection, 1er et 2d tour", () => {
    const base = {
      inseeCode: "29019",
      electionSlug: "presidentielle-2027",
      electionLabel: "Présidentielle 2027",
      roundDate: date,
      sourceLabel: "Ministère de l'Intérieur",
      sourceUrl: "https://www.data.gouv.fr/x",
    };
    expect(phraseEvenement(resultatElectionEvenement({ ...base, tour: 1 }).payload)).toBe(
      "Présidentielle 2027 : résultats du 1er tour."
    );
    expect(phraseEvenement(resultatElectionEvenement({ ...base, tour: 2 }).payload)).toBe(
      "Présidentielle 2027 : résultats du 2d tour."
    );
  });

  it("aucun gabarit ne contient de tiret long", () => {
    for (const draft of [maire(), maire({ predecesseur: null })]) {
      expect(phraseEvenement(draft.payload)).not.toMatch(/[—–]/);
    }
  });
});

describe("producteurs", () => {
  it("un changement de maire n'est publié que si le site nomme déjà cette personne", () => {
    expect(maire().status).toBe("PUBLISHED");
    expect(maire({ shownOnSite: false }).status).toBe("DRAFT");
  });

  it("la clé d'idempotence tient au territoire et à la date du fait", () => {
    expect(maire().dedupeKey).toBe("maire:29019:2026-10-03");
    expect(maire({ nom: "Autre Nom" }).dedupeKey).toBe(maire().dedupeKey);
    expect(maire({ inseeCode: "29020" }).dedupeKey).not.toBe(maire().dedupeKey);
  });

  it("un président de région est rangé sous le type de territoire REG", () => {
    const draft = presidentChangeEvenement({
      niveau: "REGIONAL",
      territoryCode: "53",
      nom: "Anne Morel",
      predecesseur: null,
      functionStart: date,
    });
    expect(draft).toMatchObject({ territoryType: "REG", territoryCode: "53", status: "PUBLISHED" });
  });
});

describe("recordEvenements", () => {
  it("écrit le type à part et un contenu que le lecteur sait relire", async () => {
    const result = await recordEvenements([maire()]);
    expect(result).toEqual({ written: 1, rejected: 0 });
    const call = h.createMany.mock.calls[0]?.[0];
    expect(call.skipDuplicates).toBe(true);
    const row = call.data[0];
    expect(row).toMatchObject({
      type: "CHANGEMENT_MAIRE",
      territoryType: "COM",
      status: "PUBLISHED",
    });
    expect(row.payload).toEqual({ nom: "Claire Martin", predecesseur: "Paul Durand" });
    expect(parseEvenementPayload(row.type, row.payload)).toEqual(maire().payload);
  });

  it("écarte un contenu invalide ou une source non https, sans rien écrire pour eux", async () => {
    const result = await recordEvenements([
      maire({ nom: " " }),
      { ...maire(), sourceUrl: "http://exemple.test" },
    ]);
    expect(result).toEqual({ written: 0, rejected: 2 });
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("ne lève jamais : la synchro appelante continue si la table manque", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.createMany.mockRejectedValueOnce(new Error("TableDoesNotExist"));
    await expect(recordEvenements([maire()])).resolves.toEqual({ written: 0, rejected: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("presidentChangeDrafts", () => {
  const line = (over: Record<string, unknown> = {}) => ({
    territoryCode: "29",
    firstName: "Marc",
    lastName: "Leroy",
    rowKey: "k1",
    functionLabel: "Président du conseil départemental",
    functionStart: date,
    ...over,
  });
  const successor = line({ firstName: "Anne", lastName: "Morel", rowKey: "k2" });

  it("un nouveau président donne un événement publié, avec son prédécesseur", () => {
    const [draft, ...rest] = presidentChangeDrafts("DEPARTEMENTAL", [line()], [successor]);
    expect(rest).toHaveLength(0);
    expect(draft).toMatchObject({
      territoryType: "DEP",
      territoryCode: "29",
      status: "PUBLISHED",
      payload: { nom: "Anne Morel", predecesseur: "Marc Leroy" },
    });
  });

  it("rien si le président est le même, au premier import, ou sans date de fonction", () => {
    expect(presidentChangeDrafts("DEPARTEMENTAL", [line()], [line()])).toEqual([]);
    expect(presidentChangeDrafts("DEPARTEMENTAL", [], [successor])).toEqual([]);
    expect(
      presidentChangeDrafts("DEPARTEMENTAL", [line()], [{ ...successor, functionStart: null }])
    ).toEqual([]);
  });

  it("rien si seule la graphie du nom a changé, ni pour une autre fonction", () => {
    const respelled = line({ firstName: "MARC", lastName: "LE ROY", rowKey: "k3" });
    expect(presidentChangeDrafts("DEPARTEMENTAL", [line()], [respelled])).toEqual([]);
    const commission = line({
      ...successor,
      functionLabel: "Président de commission du conseil départemental",
    });
    expect(presidentChangeDrafts("DEPARTEMENTAL", [line()], [line(), commission])).toEqual([]);
  });
});

describe("maireChangeDrafts", () => {
  const change = {
    communeId: "29019",
    nom: "Claire Martin",
    predecesseur: null,
    functionStart: date,
  };
  const holder = (status: string) => ({
    localData: { communeId: "29019" },
    politician: { publicationStatus: status },
  });

  it("publie quand la commune a un seul maire courant, à la fiche publique", async () => {
    h.mandates.mockResolvedValueOnce([holder("PUBLISHED")]);
    expect((await maireChangeDrafts([change]))[0]?.status).toBe("PUBLISHED");
  });

  it("laisse en brouillon : fiche non publique, deux maires courants, ou aucun", async () => {
    for (const holders of [[holder("DRAFT")], [holder("PUBLISHED"), holder("PUBLISHED")], []]) {
      h.mandates.mockResolvedValueOnce(holders);
      expect((await maireChangeDrafts([change]))[0]?.status).toBe("DRAFT");
    }
  });

  it("laisse en brouillon, sans lever, si la lecture des maires échoue", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.mandates.mockRejectedValueOnce(new Error("connexion perdue"));
    expect((await maireChangeDrafts([change]))[0]?.status).toBe("DRAFT");
    warn.mockRestore();
  });

  it("ne lit rien sans changement", async () => {
    expect(await maireChangeDrafts([])).toEqual([]);
    expect(h.mandates).not.toHaveBeenCalled();
  });
});
