import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The write paths, exercised.
 *
 * Every other test in this folder judges a decision. None of them had ever run a write: the
 * mayor sync refused to write at all, so `politician.create`, the succession transaction and
 * the civil-status update existed without a single execution behind them. This file is the
 * first coverage of what actually happens to the database, written the day those writes were
 * unlocked.
 *
 * The client records instead of refusing, which is the opposite of `rne-write-lock.test.ts`.
 * That file proves a dry run writes nothing; this one proves a real run writes the right thing.
 */
const h = vi.hoisted(() => {
  const calls = new Map<string, ReturnType<typeof vi.fn>>();
  const op = (key: string): ReturnType<typeof vi.fn> => {
    const existing = calls.get(key);
    if (existing) return existing;
    const fn = vi.fn().mockResolvedValue(key.endsWith("findMany") ? [] : { id: `${key}-id` });
    calls.set(key, fn);
    return fn;
  };
  return { calls, op, resolveBatch: vi.fn(), getText: vi.fn(), resolveUrl: vi.fn() };
});

vi.mock("@/lib/db", () => {
  const client: unknown = new Proxy(
    {},
    {
      get: (_t, model: string) => {
        if (model === "$transaction") {
          return h
            .op("$transaction")
            .mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(client));
        }
        if (model === "$queryRaw") return h.op("$queryRaw");
        return new Proxy({}, { get: (_m, operation: string) => h.op(`${model}.${operation}`) });
      },
    }
  );
  return { db: client };
});
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getText = h.getText;
  },
}));
vi.mock("../rne-resource", () => ({
  resolveRneResourceUrl: h.resolveUrl,
  RNE_MAIRES_FRAGMENTS: ["maires"],
}));
vi.mock("@/lib/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/identity")>()),
  resolveBatch: h.resolveBatch,
}));

import { syncRNEMaires } from "../rne";

const HEADER =
  "Code du département;Code de la commune;Libellé de la commune;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;Date de début du mandat;Date de début de la fonction";

function csv(
  row = "01;01001;Commune test;MARTIN;Alice;F;1970-04-02;2026-03-22;2026-04-05"
): string {
  return [HEADER, row].join("\n");
}

/** A MandateLocal row as `loadByInsee` selects it. */
function localRow(over: {
  isCurrent: boolean;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  startDate?: Date;
}) {
  return {
    id: "local-1",
    rneExternalId: "01001",
    communeId: "01001",
    mandate: {
      id: "mandate-1",
      politicianId: "holder-1",
      startDate: over.startDate ?? new Date("2020-05-24"),
      politician: {
        firstName: over.firstName,
        lastName: over.lastName,
        birthDate: over.birthDate,
      },
    },
  };
}

beforeEach(() => {
  h.calls.clear();
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  h.resolveUrl.mockResolvedValue("https://example.test/maires.csv");
  h.getText.mockResolvedValue({ data: csv() });
  h.resolveBatch.mockResolvedValue({
    results: [],
    stats: { total: 0, matched: 0, review: 0, notFound: 0, blocked: 0 },
  });
  h.op("mandate.findMany").mockResolvedValue([]);
  h.op("commune.findMany").mockResolvedValue([{ id: "01001" }]);
  h.op("mandateLocal.findMany").mockResolvedValue([]);
  h.op("politician.findMany").mockResolvedValue([]);
  h.op("politician.findUnique").mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("écritures du sync RNE", () => {
  it("publie une fiche pour une commune dont nous ne détenons rien", async () => {
    const result = await syncRNEMaires();

    expect(result.errors).toEqual([]);
    expect(h.op("politician.create")).toHaveBeenCalledOnce();
    const data = h.op("politician.create").mock.calls[0]![0].data;
    expect(data.lastName).toBe("Martin");
    expect(data.publicationStatus).toBe("PUBLISHED");
    expect(data.mandates.create.localData.create.rneExternalId).toBe("01001");
  });

  it("n'écrit l'état civil que sur le titulaire reconnu", async () => {
    // Le bug d'origine : le mandat était retrouvé par code INSEE seul, et l'état civil de la
    // ligne du registre était écrit sur le politicien de ce mandat, quel qu'il soit.
    h.op("mandateLocal.findMany").mockImplementation(
      async (args: { where: { mandate: { isCurrent?: boolean } } }) =>
        args.where.mandate.isCurrent
          ? [
              localRow({
                isCurrent: true,
                firstName: "Alice",
                lastName: "MARTIN",
                birthDate: new Date("1970-04-02"),
              }),
            ]
          : []
    );

    await syncRNEMaires();

    expect(h.op("politician.create")).not.toHaveBeenCalled();
    expect(h.op("politician.update")).toHaveBeenCalledWith({
      where: { id: "holder-1" },
      // `parseFrenchDate` construit midi UTC, pour que le jour calendaire à Paris soit
      // celui qu'on a lu quel que soit le fuseau du process.
      data: { civility: "Mme", birthDate: new Date("1970-04-02T12:00:00Z") },
    });
  });

  it("n'écrit rien sur le prédécesseur lors d'une succession", async () => {
    // Même commune, autre personne, autre naissance. L'ancien mandat se ferme, et sa fiche
    // ne reçoit RIEN : c'est tout l'objet du correctif.
    h.op("mandateLocal.findMany").mockImplementation(
      async (args: { where: { mandate: { isCurrent?: boolean } } }) =>
        args.where.mandate.isCurrent
          ? [
              localRow({
                isCurrent: true,
                firstName: "Bob",
                lastName: "DURAND",
                birthDate: new Date("1955-01-01"),
              }),
            ]
          : []
    );

    await syncRNEMaires();

    expect(h.op("politician.update")).not.toHaveBeenCalled();
    expect(h.op("mandate.update")).toHaveBeenCalledWith({
      where: { id: "mandate-1" },
      data: { isCurrent: false, endDate: new Date("2026-04-05T12:00:00Z") },
    });
    expect(h.op("politician.create")).toHaveBeenCalledOnce();
  });

  it("ferme et crée dans une seule transaction", async () => {
    // Une création qui échoue après la fermeture laisserait la commune sans maire.
    h.op("mandateLocal.findMany").mockImplementation(
      async (args: { where: { mandate: { isCurrent?: boolean } } }) =>
        args.where.mandate.isCurrent
          ? [
              localRow({
                isCurrent: true,
                firstName: "Bob",
                lastName: "DURAND",
                birthDate: new Date("1955-01-01"),
              }),
            ]
          : []
    );

    await syncRNEMaires();

    expect(h.op("$transaction")).toHaveBeenCalledOnce();
  });

  it("ouvre un mandat sur une fiche connue sans la republier", async () => {
    h.op("mandateLocal.findMany").mockImplementation(
      async (args: { where: { mandate: { isCurrent?: boolean } } }) =>
        args.where.mandate.isCurrent
          ? []
          : [
              localRow({
                isCurrent: false,
                firstName: "Alice",
                lastName: "MARTIN",
                birthDate: new Date("1970-04-02"),
              }),
            ]
    );

    await syncRNEMaires();

    expect(h.op("politician.create")).not.toHaveBeenCalled();
    expect(h.op("mandate.create")).toHaveBeenCalledOnce();
    expect(h.op("mandate.create").mock.calls[0]![0].data.politicianId).toBe("holder-1");
  });

  it("exclut les fiches qu'il vient de créer des candidats de la Phase 2", async () => {
    // Sans ça, chaque fiche neuve est son propre meilleur candidat et la Phase 2 ne fusionne
    // ni ne met en brouillon quoi que ce soit.
    h.op("politician.findMany").mockResolvedValue([
      {
        id: "stub-1",
        firstName: "Alice",
        lastName: "Martin",
        birthDate: new Date("1970-04-02"),
        mandates: [
          {
            id: "m1",
            departmentCode: "01",
            localData: { rneExternalId: "01001", communeId: "01001" },
          },
        ],
      },
    ]);

    await syncRNEMaires();

    expect(h.resolveBatch).toHaveBeenCalledOnce();
    const passed = h.resolveBatch.mock.calls[0]![0].excludePoliticianIds;
    expect([...passed]).toEqual(["stub-1"]);
  });

  it("n'écrit rien du tout sur un doute", async () => {
    // "Martinez" contre "Martin" : ni la même personne, ni deux personnes. Rien ne bouge.
    h.op("mandateLocal.findMany").mockImplementation(
      async (args: { where: { mandate: { isCurrent?: boolean } } }) =>
        args.where.mandate.isCurrent
          ? [
              localRow({
                isCurrent: true,
                firstName: "Alice",
                lastName: "MARTINEZ",
                birthDate: new Date("1970-04-02"),
              }),
            ]
          : []
    );

    await syncRNEMaires();

    for (const key of ["politician.create", "politician.update", "mandate.update"]) {
      expect(h.op(key), key).not.toHaveBeenCalled();
    }
  });
});
